import { getProject, ProjectConflictError, saveProject } from "@/lib/store";
import { propose, validSection } from "@/lib/mentor";
import { currentTester, projectIdFor, unauthorized } from "@/lib/auth";
import { resolveKnowledgeTask } from "@/lib/knowledge";
import { summarizeCsv, summarizeFunnel } from "@/lib/data";
import { env } from "cloudflare:workers";
import { buildCompetitorQuery, CompetitorSearchError, searchCompetitors } from "@/lib/competitor-search";
import { hasProposalChanges } from "@/lib/proposal-changes";
import { planConversation } from "@/lib/workflow";
import { bindMaterialSources, materialContext, MaterialsInputError, prepareMaterials, validateMaterials } from "@/lib/materials";
import { ModelRequestError } from "@/lib/agent-search";

export async function POST(request: Request) {
  try {
    const tester = await currentTester(request);
    if (!tester) return unauthorized();
    const body = await request.json() as { projectId?: string; message?: string; section?: string; referenceText?: string; referenceName?: string; references?: unknown; webSearch?: boolean; searchQuery?: string; allowWebSearch?: boolean };
    if (!body || typeof body !== "object" || typeof body.projectId !== "string" || typeof body.message !== "string"
      || (body.referenceText !== undefined && typeof body.referenceText !== "string")
      || (body.webSearch !== undefined && typeof body.webSearch !== "boolean")
      || (body.allowWebSearch !== undefined && typeof body.allowWebSearch !== "boolean")
      || (body.referenceName !== undefined && (typeof body.referenceName !== "string" || body.referenceName.length > 200))
      || (body.searchQuery !== undefined && (typeof body.searchQuery !== "string" || body.searchQuery.length > 400)))
      return Response.json({error:"请求参数不正确"},{status:400});
    if (!body.projectId || !body.message?.trim()) return Response.json({error:"请先输入问题"},{status:400});
    if((body.referenceText||"").length>12000)return Response.json({error:"材料超过 12000 字，请拆分后分次分析；未修改项目资料"},{status:413});
    if (body.references !== undefined && (body.referenceText || body.referenceName))
      return Response.json({error:"不能同时提交两种材料格式"},{status:400});
    const inputs=validateMaterials(body.references !== undefined ? body.references : (body.referenceText?[{name:body.referenceName||"",text:body.referenceText}]:[]));
    if (body.projectId !== projectIdFor(tester)) return Response.json({error:"无权访问该项目"},{status:403});
    const project = await getProject(body.projectId);
    if (!project) return Response.json({error:"项目不存在"},{status:404});
    if (project.state.pending) return Response.json({error:"请先确认或放弃上一条修改建议"},{status:409});
    const message = body.message.slice(0,6000);
    const referenceText=inputs.map(input=>input.text).join("\n\n");
    const messageId=crypto.randomUUID();
    const requestedSection=validSection(body.section);
    if (body.webSearch && requestedSection !== "competitors") return Response.json({error:"请在竞品洞察中使用联网搜索"},{status:400});
    const plan=planConversation(requestedSection,message,referenceText,!!body.webSearch,project.state);
    const section=plan.section;
    const secrets = env as unknown as Record<string, string>;
    if (body.webSearch && !secrets.DEEPSEEK_API_KEY?.trim())
      return Response.json({error:"请先在服务器配置 DEEPSEEK_API_KEY，以便整理搜索结果。"},{status:503});
    const task=resolveKnowledgeTask(section,message,referenceText);
    if (inputs.length > 1 && ["surveyAnalysis","mvpAnalysis"].includes(task) && inputs.some(input=>/\.csv$/iu.test(input.name)))
      return Response.json({error:"统计 CSV 数据时，请每轮只附一份数据表，以免混淆统计口径。Word 文档可以多份一起分析。"},{status:400});
    const surveySummary=plan.createArtifact&&task==="surveyAnalysis"&&inputs.length===1?summarizeCsv(referenceText):null;
    const funnelSummary=plan.createArtifact&&task==="mvpAnalysis"&&inputs.length===1?summarizeFunnel(referenceText):null;
    if(plan.createArtifact&&inputs.length===1&&task==="mvpAnalysis"&&/^(?:阶段,人数|stage,count)\s*\r?\n/iu.test(referenceText.replace(/^\uFEFF/u,""))&&!funnelSummary)
      return Response.json({error:"漏斗数据至少需要两个有效阶段，格式为“阶段,人数”，每行一个阶段；未修改项目资料"},{status:400});
    const webSearch = body.webSearch ? await searchCompetitors(buildCompetitorQuery(project.state, message, body.searchQuery), secrets.TAVILY_API_KEY) : undefined;
    const materials=prepareMaterials(project.state,inputs,task==="interview"?"访谈记录":task==="surveyAnalysis"?"问卷数据":task==="mvpAnalysis"?"测试数据":"其他");
    const contextState={...project.state,materials:[...(project.state.materials||[]),...materials]};
    const proposal = await propose(contextState, section, message, materialContext(materials), "", messageId, surveySummary||undefined, webSearch, body.allowWebSearch !== false);
    if(surveySummary){
      proposal.artifact ||= {section:"research",title:"问卷原始数据概览",content:"已计算原始答卷的各列频数；尚未完成筛选、清理和统计推断。",limitations:surveySummary.warnings.join("；"),nextStep:"核对变量编码、筛选条件和无效答卷规则",sources:[]};
      proposal.artifact.survey=surveySummary;
    }
    if(funnelSummary){
      proposal.artifact ||= {section:"research",title:"MVP 测试漏斗",content:"按上传的阶段人数计算相邻环节转化；统计口径和观察周期仍需核对。",limitations:funnelSummary.warnings.join("；"),nextStep:"核对同一批对象、阶段定义和测试周期",sources:[]};
      proposal.artifact.funnel=funnelSummary;
    }
    if(materials.length){
      project.state.materials=[...(project.state.materials||[]),...materials];
      bindMaterialSources(proposal,materials);
    }
    project.state.messages.push({id:messageId,role:"user",content:message,at:new Date().toISOString()},{id:crypto.randomUUID(),role:"assistant",content:proposal.reply,at:new Date().toISOString(),task:{label:plan.label,section},suggestedQuestions:proposal.suggestedQuestions,...(proposal.webSearch?{webSearch:proposal.webSearch,replyCitations:proposal.replyCitations}:{}),...(proposal.searchWarning?{searchWarning:proposal.searchWarning}:{})});
    project.state.pending = hasProposalChanges(proposal) ? proposal : null;
    return Response.json(await saveProject(project.state,project.revision));
  } catch(error) { return Response.json({error:error instanceof Error?error.message:"请求失败"},{status:error instanceof MaterialsInputError||error instanceof ModelRequestError?error.status:error instanceof ProjectConflictError?409:error instanceof CompetitorSearchError?error.status:error instanceof SyntaxError?400:500}); }
}
