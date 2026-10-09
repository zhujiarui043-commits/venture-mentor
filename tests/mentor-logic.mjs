import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "mentor-logic-"));
try {
  await writeFile(join(temp, "knowledge-rules.mjs"), `export default ${await readFile(join(root, "knowledge/rules.json"), "utf8")};`);
  for (const name of ["types", "structured", "hypothesis", "memory", "proposal-changes", "workflow", "knowledge"]) {
    const source = await readFile(join(root, "lib", `${name}.ts`), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
      .replace(/from "\.\/([a-z-]+)"/gu, 'from "./$1.mjs"')
      .replaceAll('from "@/knowledge/rules.json"', 'from "./knowledge-rules.mjs"');
    await writeFile(join(temp, `${name}.mjs`), compiled);
  }
  const { diagnosisNames, canvasNames, emptyProject } = await import(pathToFileURL(join(temp, "types.mjs")));
  const { missingRequiredStructure } = await import(pathToFileURL(join(temp, "structured.mjs")));
  const { isSubstantiveRevision, evidenceVersionTarget, attachEvidenceToVersion } = await import(pathToFileURL(join(temp, "hypothesis.mjs")));
  const { selectRelevantMemory } = await import(pathToFileURL(join(temp, "memory.mjs")));
  const { proposalChanges, hasProposalChanges } = await import(pathToFileURL(join(temp, "proposal-changes.mjs")));
  const { planConversation, cleanSuggestedQuestions } = await import(pathToFileURL(join(temp, "workflow.mjs")));
  const { selectKnowledge, resolveKnowledgeTask } = await import(pathToFileURL(join(temp, "knowledge.mjs")));

  for (const question of ["画布是什么意思？", "请解释八维诊断", "如何生成商业画布？", "不用生成画布，解释一下作用"]){
    assert.equal(planConversation("canvas", question).createArtifact, false);
    assert.equal(missingRequiredStructure("canvas", "canvas", question, null), null);
  }
  assert.equal(missingRequiredStructure("diagnosis", "diagnosis", "请解释八维诊断", null), null);
  for (const [request,section] of [["帮我生成商业画布","canvas"],["生成八维创意诊断","diagnosis"],["分析真实竞品","competitors"],["设计访谈提纲","research"],["拆出一条可证伪假设","hypotheses"]]){
    const plan=planConversation("overview",request);
    assert.equal(plan.section,section);assert.equal(plan.createArtifact,true);
    assert.ok(selectKnowledge(plan.section,request,emptyProject("kb")).text.includes("KB"));
  }
  assert.equal(resolveKnowledgeTask(planConversation("overview","设计问卷题目").section,"设计问卷题目"),"surveyDesign");
  assert.equal(resolveKnowledgeTask(planConversation("overview","分析测试数据漏斗").section,"分析测试数据漏斗"),"mvpAnalysis");
  assert.equal(planConversation("overview","目标用户改成学生可以吗").kind,"discussion");
  assert.equal(planConversation("overview","我想做一个穿搭助手，你有什么建议吗").kind,"discussion");
  assert.equal(planConversation("overview","附上材料供参考","正文").createArtifact,false);
  assert.equal(planConversation("overview","分析这份材料","正文").createArtifact,true);
  assert.deepEqual(cleanSuggestedQuestions([" 下一步做什么？ ","下一步做什么？","","字".repeat(91),"设计访谈提纲","生成商业画布","第四项"]),["下一步做什么？","设计访谈提纲","生成商业画布"]);

  const savedProject = emptyProject("changes");
  savedProject.title = "AI 穿搭助手";
  savedProject.fields = {solution:"AI 穿搭助手", audience:"年轻人", problem:"不知道怎么搭配", progress:"尚未开发"};
  const proposal = {id:"P1",reply:"本轮补充场景",createdAt:"2026-10-09",fields:{...savedProject.fields,solution:"  ＡＩ\n穿搭助手  ",scene:"上班前挑选衣物"},fieldStatuses:{solution:"初步设想",scene:"用户陈述"},fieldMeta:{solution:{origin:"AI归纳"},scene:{origin:"用户原话"}},projectTitle:"AI  穿搭助手",fieldRemovals:["progress","missing"],artifact:null,hypothesis:null,evidence:[]};
  const changes = proposalChanges(savedProject,proposal);
  assert.deepEqual(changes.fields,{scene:"上班前挑选衣物"});
  assert.deepEqual(Object.keys(changes.fieldMeta),["scene"]);
  assert.deepEqual(changes.fieldStatuses,{scene:"用户陈述"});
  assert.deepEqual(changes.fieldRemovals,[]); // A supplied replacement takes precedence over removal.
  assert.equal(changes.projectTitle,undefined);
  assert.equal(hasProposalChanges(changes),true);
  assert.deepEqual(proposalChanges(savedProject,{...proposal,fields:{},fieldRemovals:["progress","missing","progress"]}).fieldRemovals,["progress"]);
  assert.equal(hasProposalChanges(proposalChanges(savedProject,{...proposal,fields:savedProject.fields})),false);
  assert.equal(proposalChanges(savedProject,{...proposal,fields:{problem:"知道怎么搭配"}}).fields.problem,"知道怎么搭配");
  assert.equal(hasProposalChanges(proposalChanges(savedProject,{...proposal,fields:savedProject.fields,artifact:{title:"本轮分析"}})),true);
  assert.equal(savedProject.fields.solution,"AI 穿搭助手");

  assert.equal(missingRequiredStructure("diagnosis", "diagnosis", "生成八维诊断", null), "完整的八维诊断");
  assert.equal(missingRequiredStructure("diagnosis", "diagnosis", "这是什么意思？", null), null);
  assert.equal(missingRequiredStructure("diagnosis", "diagnosis", "生成八维诊断", { diagnosis:{dimensions:diagnosisNames.map(name=>({name}))} }), null);
  assert.equal(missingRequiredStructure("canvas", "canvas", "整理画布", { canvas:{modules:canvasNames.slice(0,8).map(name=>({name}))} }), "完整的九格商业画布");
  assert.equal(missingRequiredStructure("research", "mvpDesign", "生成MVP验证任务卡", {mvp:{goal:"目标",method:"方法",target:"对象",steps:["执行"],metrics:[],threshold:"待确认",stopCondition:"待确认"}}), "含指标口径的 MVP 验证任务卡");

  const h={id:"H01",version:1,text:"旧假设",category:"用户",stage:"待探索",evidenceStatus:"未进入验证",priority:"高",nextStep:"访谈",support:[],opposition:[],evidenceRecords:[],history:[]};
  const change={text:"新假设",category:"用户",priority:"高",nextStep:"访谈",targetId:"H01",changeKind:"实质修订"};
  assert.equal(isSubstantiveRevision(h,change),true);
  assert.equal(evidenceVersionTarget(h,change,"revised"),"revised");
  h.history.push({version:1,text:h.text,reason:"修订",at:"2026-10-04",evidenceRecords:[]});h.version=2;h.text=change.text;
  const material={id:"M01",content:"旧版反向记录。新版支持记录。",at:"2026-10-04"};
  assert.equal(attachEvidenceToVersion(h,{hypothesisId:"H01",hypothesisVersion:1,versionTarget:"current",direction:"opposition",quote:"旧版反向记录",source:"M01"},material,"2026-10-04",1),true);
  assert.equal(attachEvidenceToVersion(h,{hypothesisId:"H01",hypothesisVersion:1,versionTarget:"revised",direction:"support",quote:"新版支持记录",source:"M01"},material,"2026-10-04",1),true);
  assert.equal(h.history[0].evidenceRecords[0].hypothesisVersion,1);
  assert.equal(h.evidenceRecords[0].hypothesisVersion,2);
  assert.equal(attachEvidenceToVersion(h,{hypothesisId:"H01",hypothesisVersion:1,versionTarget:"revised",direction:"support",quote:"材料中不存在",source:"M01"},material,"2026-10-04",1),false);

  const state=emptyProject("team-test");
  for(const [i,content] of ["早期关于问卷样本的结果", "旧竞品分析", "最新访谈", "新的MVP", "当前画布"].entries())state.artifacts.push({id:`A${i}`,section:i===0?"research":"canvas",title:`成果${i}`,content,sources:[],limitations:"",nextStep:"",version:1,createdAt:"2026-10-04"});
  state.materials.push({id:"M04",content:"此前问卷收集了学生的回答",kind:"问卷数据",at:"2026-10-04"});
  state.messages.push({role:"user",content:"我想了解此前的问卷样本",at:"2026-10-04"},...Array.from({length:16},()=>({role:"assistant",content:"其他信息",at:"2026-10-04"})));
  const memory=selectRelevantMemory(state,"research","查看之前问卷样本和 M04");
  assert.equal(memory.archivedArtifacts[0].id,"A0");
  assert.equal(memory.materials[0].id,"M04");
  assert.equal(memory.userMessages[0].content,"我想了解此前的问卷样本");
  console.log("结构化成果、证据版本与历史检索检查通过");
} finally { await rm(temp,{recursive:true,force:true}); }
