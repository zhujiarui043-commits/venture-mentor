import { getProject, ProjectConflictError, saveProject } from "@/lib/store";
import { propose, validSection } from "@/lib/mentor";
import { currentTester, projectIdFor, unauthorized } from "@/lib/auth";
import { resolveKnowledgeTask } from "@/lib/knowledge";
import { summarizeCsv, summarizeFunnel } from "@/lib/data";
import { env } from "cloudflare:workers";
import { buildCompetitorQuery, CompetitorSearchError, searchCompetitors } from "@/lib/competitor-search";
import { activeProposal, mergePendingProposal } from "@/lib/proposal-changes";
import { planConversation } from "@/lib/workflow";
import { MAX_ATTACHMENT_CHARS, bindMaterialSources, materialContext, MaterialsInputError, prepareMaterials, validateMaterials } from "@/lib/materials";
import { applyProposal } from "@/lib/apply-proposal";
import { ModelRequestError } from "@/lib/agent-search";

import { shouldReviewInterviewHypotheses, usesAllResearchMethods } from "@/lib/interview-hypotheses";

export async function POST(request: Request) {
  try {
    const tester = await currentTester(request);
    if (!tester) return unauthorized();
    const body = await request.json() as { projectId?: string; message?: string; section?: string; materialId?: string; referenceText?: string; referenceName?: string; references?: unknown; webSearch?: boolean; searchQuery?: string; allowWebSearch?: boolean };
    if (!body || typeof body !== "object" || typeof body.projectId !== "string" || typeof body.message !== "string"
      || (body.referenceText !== undefined && typeof body.referenceText !== "string")
      || (body.webSearch !== undefined && typeof body.webSearch !== "boolean")
      || (body.allowWebSearch !== undefined && typeof body.allowWebSearch !== "boolean")
      || (body.materialId !== undefined && (typeof body.materialId !== "string" || !/^M\d+$/iu.test(body.materialId)))
      || (body.referenceName !== undefined && (typeof body.referenceName !== "string" || body.referenceName.length > 200))
      || (body.searchQuery !== undefined && (typeof body.searchQuery !== "string" || body.searchQuery.length > 400)))
      return Response.json({error:"请求参数不正确"},{status:400});
    if (!body.projectId || !body.message?.trim()) return Response.json({error:"请先输入问题"},{status:400});
    if((body.referenceText||"").length>MAX_ATTACHMENT_CHARS)return Response.json({error:`材料超过 ${MAX_ATTACHMENT_CHARS} 字，请拆分后分次分析；未修改项目资料`},{status:413});
    if (body.references !== undefined && (body.referenceText || body.referenceName))
      return Response.json({error:"不能同时提交两种材料格式"},{status:400});
    const inputs=validateMaterials(body.references !== undefined ? body.references : (body.referenceText?[{name:body.referenceName||"",text:body.referenceText}]:[]));
    if (body.materialId && inputs.length) return Response.json({error:"请选择已保存材料或本轮附件中的一种进行分析"},{status:400});
    if (body.projectId !== projectIdFor(tester)) return Response.json({error:"无权访问该项目"},{status:403});
    const project = await getProject(body.projectId);
    if (!project) return Response.json({error:"项目不存在"},{status:404});
    const savedMaterial=body.materialId ? project.state.materials.find(item=>item.id===body.materialId) : undefined;
    if (body.materialId && !savedMaterial) return Response.json({error:"未找到这份已保存材料"},{status:404});
    if (savedMaterial && savedMaterial.content.length>MAX_ATTACHMENT_CHARS) return Response.json({error:`这份材料超过 ${MAX_ATTACHMENT_CHARS} 字，请拆分后重新上传分析`},{status:413});
    project.state.pending = activeProposal(project.state);
    const message = body.message.slice(0,6000);
    const referenceText=savedMaterial?.content || inputs.map(input=>input.text).join("\n\n");
    const messageId=crypto.randomUUID();
    const requestedSection=validSection(body.section);
    if (body.webSearch && requestedSection !== "competitors") return Response.json({error:"请在竞品洞察中使用联网搜索"},{status:400});
    const plan=planConversation(requestedSection,message,referenceText,!!body.webSearch,project.state);
    const section=plan.section;
    const secrets = env as unknown as Record<string, string>;
    if (body.webSearch && !secrets.DEEPSEEK_API_KEY?.trim())
      return Response.json({error:"请先在服务器配置 DEEPSEEK_API_KEY，以便整理搜索结果。"},{status:503});
    const task=resolveKnowledgeTask(section,message,referenceText);
    if (savedMaterial && (section!=="research" || task!=="surveyAnalysis" || !plan.createArtifact))
      return Response.json({error:"已保存材料只能用于问卷数据分析"},{status:400});
    if (inputs.length > 1 && ["surveyAnalysis","mvpAnalysis"].includes(task) && inputs.some(input=>/\.(?:csv|xlsx?)$/iu.test(input.name)))
      return Response.json({error:"统计 CSV 或 Excel 数据时，请每轮只附一份数据表，以免混淆统计口径。Word 文档可以多份一起分析。"},{status:400});
    const surveySummary=plan.createArtifact&&task==="surveyAnalysis"&&(inputs.length===1||!!savedMaterial)?summarizeCsv(referenceText):null;
    const funnelSummary=plan.createArtifact&&task==="mvpAnalysis"&&inputs.length===1?summarizeFunnel(referenceText):null;
    if(plan.createArtifact&&inputs.length===1&&task==="mvpAnalysis"&&/^(?:阶段,人数|stage,count)\s*\r?\n/iu.test(referenceText.replace(/^\uFEFF/u,""))&&!funnelSummary)
      return Response.json({error:"漏斗数据至少需要两个有效阶段，格式为“阶段,人数”，每行一个阶段；未修改项目资料"},{status:400});
    const webSearch = body.webSearch ? await searchCompetitors(buildCompetitorQuery(project.state, message, body.searchQuery), secrets.TAVILY_API_KEY) : undefined;
    const materials=prepareMaterials(project.state,inputs,task==="surveyAnalysis"?"问卷数据":task==="mvpAnalysis"?"测试数据":task==="interview"||(shouldReviewInterviewHypotheses(message,plan.createArtifact)&&!usesAllResearchMethods(message))?"访谈记录":"其他");
    const analysisMaterials=savedMaterial?[savedMaterial]:materials;
    const contextState={...project.state,materials:[...(project.state.materials||[]),...materials]};
    const proposal = await propose(contextState, section, message, materialContext(analysisMaterials), "", messageId, surveySummary||undefined, webSearch, body.allowWebSearch !== false);
    if(surveySummary){
      proposal.artifact ||= {section:"research",title:"问卷原始数据概览",content:"已计算原始答卷的各列频数；尚未完成筛选、清理和统计推断。",limitations:surveySummary.warnings.join("；"),nextStep:"核对变量编码、筛选条件和无效答卷规则",sources:[]};
      proposal.artifact.researchMode="问卷调查";
      proposal.artifact.survey=surveySummary;
    }
    if(funnelSummary){
      proposal.artifact ||= {section:"research",title:"MVP 测试漏斗",content:"按上传的阶段人数计算相邻环节转化；统计口径和观察周期仍需核对。",limitations:funnelSummary.warnings.join("；"),nextStep:"核对同一批对象、阶段定义和测试周期",sources:[]};
      proposal.artifact.funnel=funnelSummary;
    }
    if(materials.length){
      project.state.materials=[...(project.state.materials||[]),...materials];
    }
    if(savedMaterial) savedMaterial.kind="问卷数据";
    if(analysisMaterials.length) bindMaterialSources(proposal,analysisMaterials,messageId);
    project.state.messages.push({id:messageId,role:"user",content:message,at:new Date().toISOString()},{id:crypto.randomUUID(),role:"assistant",content:proposal.reply,at:new Date().toISOString(),task:{label:plan.label,section},suggestedQuestions:proposal.suggestedQuestions,...(proposal.webSearch?{webSearch:proposal.webSearch,replyCitations:proposal.replyCitations}:{}),...(proposal.searchWarning?{searchWarning:proposal.searchWarning}:{})});
    const changes = mergePendingProposal(project.state, proposal);
    if (changes) {
      const artifact = applyProposal(project.state, changes);
      if (artifact) project.state.messages.at(-1)!.artifactId = artifact.id;
    }
    return Response.json(await saveProject(project.state,project.revision));
  } catch(error) { return Response.json({error:error instanceof Error?error.message:"请求失败"},{status:error instanceof MaterialsInputError||error instanceof ModelRequestError?error.status:error instanceof ProjectConflictError?409:error instanceof CompetitorSearchError?error.status:error instanceof SyntaxError?400:500}); }
}
