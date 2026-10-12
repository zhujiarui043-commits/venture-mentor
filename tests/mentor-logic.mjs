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
  for (const name of ["types", "competition-workspace", "structured", "hypothesis", "memory", "proposal-changes", "workflow", "knowledge", "materials"]) {
    const source = await readFile(join(root, "lib", `${name}.ts`), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
      .replace(/from "\.\/([a-z-]+)"/gu, 'from "./$1.mjs"')
      .replaceAll('from "@/knowledge/rules.json"', 'from "./knowledge-rules.mjs"');
    await writeFile(join(temp, `${name}.mjs`), compiled);
  }
  const { diagnosisNames, canvasNames, emptyProject, numberAnalysisRecords, normalizeProjectNumbers } = await import(pathToFileURL(join(temp, "types.mjs")));
  const { prepareMaterials, materialContext } = await import(pathToFileURL(join(temp, "materials.mjs")));
  const { missingRequiredStructure } = await import(pathToFileURL(join(temp, "structured.mjs")));
  const { isSubstantiveRevision, evidenceVersionTarget, attachEvidenceToVersion } = await import(pathToFileURL(join(temp, "hypothesis.mjs")));
  const { selectRelevantMemory } = await import(pathToFileURL(join(temp, "memory.mjs")));
  const { proposalChanges, hasProposalChanges, activeProposal, mergePendingProposal } = await import(pathToFileURL(join(temp, "proposal-changes.mjs")));
  const { planConversation, cleanSuggestedQuestions } = await import(pathToFileURL(join(temp, "workflow.mjs")));
  const { selectKnowledge, resolveKnowledgeTask } = await import(pathToFileURL(join(temp, "knowledge.mjs")));

  for (const question of ["画布是什么意思？", "请解释八维诊断", "如何生成商业画布？", "不用生成画布，解释一下作用", "现在有哪些访谈分析技术？"]){
    assert.equal(planConversation("canvas", question).createArtifact, false);
    assert.equal(missingRequiredStructure("canvas", "canvas", question, null), null);
  }
  assert.equal(missingRequiredStructure("diagnosis", "diagnosis", "请解释八维诊断", null), null);
  for (const question of ["八维图评分标准是什么？", "如何给八维图评分？", "不用评分，解释一下规则"]) assert.equal(planConversation("diagnosis",question).createArtifact,false);
  for (const request of ["给八维图打分", "按新标准重新评分"]) assert.equal(planConversation("diagnosis",request).createArtifact,true);
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
  for (const request of ["修改访谈提纲", "优化新版访谈提纲", "请帮我调整访谈提纲"])
    assert.equal(planConversation("overview",request).createArtifact,true);
  for (const request of ["为什么要修改访谈提纲？", "不要修改访谈提纲", "访谈提纲怎么优化？"])
    assert.equal(planConversation("research",request).createArtifact,false);
  const outline = {id:"original-uuid",section:"research",title:"校园访谈提纲",content:"第一题：上一次怎样挑选衣服？",version:1,sources:[],limitations:"",nextStep:"",createdAt:"2026-10-10"};
  const numbered = numberAnalysisRecords([outline,{...outline,id:"second-uuid",version:2}]);
  assert.deepEqual(numbered.map(item=>item.recordId),["A01","A02"]);
  assert.deepEqual(numbered.map(item=>item.id),["original-uuid","second-uuid"]);
  assert.equal(outline.recordId,undefined);
  assert.deepEqual(numberAnalysisRecords(numbered),numbered);
  assert.deepEqual(numberAnalysisRecords([...numbered,{...outline,id:"third-uuid"}]).map(item=>item.recordId),["A01","A02","A03"]);
  assert.equal(numberAnalysisRecords([{...outline,title:"M05 · 校园访谈提纲"}])[0].title,"校园访谈提纲");
  assert.equal(numberAnalysisRecords([{...outline,title:"材料 M07：校园访谈提纲"}])[0].title,"校园访谈提纲");
  for (const title of ["M05类校园访谈提纲", "【M05类】校园访谈提纲", "材料 MX 类：校园访谈提纲", "Mxx · 类校园访谈提纲", "类校园访谈提纲", "分析记录 A09-V3 · 校园访谈提纲", "校园访谈提纲 · V3", "校园访谈提纲（V3）"])
    assert.equal(numberAnalysisRecords([{...outline,title}])[0].title,"校园访谈提纲");
  for (const [section,title,expected] of [["competitors","C05类 · 竞品比较","竞品比较"],["diagnosis","D09 · 八维诊断","八维诊断"],["canvas","B07类商业画布","商业画布"],["research","M01类似产品分析","类似产品分析"],["research","M01类比分析","类比分析"],["research","类型对照表","类型对照表"],["research","MXNet 技术调研","MXNet 技术调研"],["research","访谈对象 M07 的经历","访谈对象 M07 的经历"]])
    assert.equal(numberAnalysisRecords([{...outline,section,title}])[0].title,expected);
  const legacyNumbers={...emptyProject("legacy-numbers"),materials:[{id:"M07",content:"原话 M07 H09 A20 必须保留",at:"2026-10-10"}],
    hypotheses:[{id:"H09",version:4,text:"原话 H09",history:[{version:3,text:"历史原话 H09",evidenceRecords:[{id:"quote-uuid",sourceId:"M07",quote:"原话 M07 H09 A20 必须保留",hypothesisVersion:3}]}]}],
    fieldMeta:{audience:{sourceRef:"M07"}},messages:[{id:"message-uuid",role:"assistant",content:"原回复 A20",artifactId:"competitor-uuid"}],
    artifacts:[{...outline,recordId:"A05"},{...outline,id:"competitor-uuid",section:"competitors",recordId:"A20",version:6,sources:[{label:"材料 M07 · 关联 H09"}]},
      {...outline,id:"diagnosis-uuid",section:"diagnosis",recordId:"A34",diagnosis:{dimensions:[{sourceRefs:["A20","M07"],scoreTriggerRefs:["A20"],hypothesisRefs:["H09"]}]}},
      {...outline,id:"outline-2",recordId:"A62"},{...outline,id:"competitor-2",section:"competitors",recordId:"A99"},
      {...outline,id:"canvas-uuid",section:"canvas",recordId:"A100",canvas:{modules:[{sourceRefs:["A20"],hypothesisRefs:["H09"]}]}}],
    competitionWorkspace:{artifactId:"competitor-2",rows:[{artifactId:"competitor-uuid",competitorIndex:0,retained:true}]},
    pending:{artifact:{diagnosis:{dimensions:[{sourceRefs:["A20"],hypothesisRefs:["H09"]}]}},hypothesis:{targetId:"H09"},evidence:[{hypothesisId:"H09",source:"M07"}]}};
  const migratedNumbers=normalizeProjectNumbers(legacyNumbers);
  assert.deepEqual(migratedNumbers.artifacts.map(a=>a.recordId),["A01","C01","D01","A02","C02","B01"]);
  assert.equal(migratedNumbers.hypotheses[0].id,"H01");
  assert.equal(migratedNumbers.materials[0].id,"M01");
  assert.equal(migratedNumbers.materials[0].content,legacyNumbers.materials[0].content);
  assert.equal(migratedNumbers.hypotheses[0].history[0].evidenceRecords[0].sourceId,"M01");
  assert.equal(migratedNumbers.hypotheses[0].history[0].evidenceRecords[0].quote,legacyNumbers.materials[0].content);
  assert.deepEqual(migratedNumbers.artifacts[2].diagnosis.dimensions[0].sourceRefs,["competitor-uuid","M01"]);
  assert.deepEqual(migratedNumbers.artifacts[2].diagnosis.dimensions[0].hypothesisRefs,["H01"]);
  assert.equal(migratedNumbers.artifacts[1].sources[0].label,"材料 M01 · 关联 H01");
  assert.equal(migratedNumbers.pending.hypothesis.targetId,"H01");
  assert.equal(migratedNumbers.pending.evidence[0].source,"M01");
  assert.equal(migratedNumbers.messages[0].artifactId,"competitor-uuid");
  assert.deepEqual(migratedNumbers.competitionWorkspace,legacyNumbers.competitionWorkspace);
  assert.deepEqual(normalizeProjectNumbers(migratedNumbers),migratedNumbers);
  assert.equal(legacyNumbers.materials[0].id,"M07");
  assert.deepEqual(numberAnalysisRecords(migratedNumbers.artifacts.filter(a=>a.id!=="competitor-uuid")).filter(a=>a.section==="competitors").map(a=>a.recordId),["C01"]);
  assert.equal(selectRelevantMemory(migratedNumbers,"research","查看 C01").archivedArtifacts[0].recordId,"C01");
  const draft={id:"pending-outline",fields:{audience:"大学生"},fieldRemovals:[],evidence:[],hypothesis:null,reply:"提纲已生成",createdAt:"2026-10-10",artifact:{...outline,title:"M07 · 校园访谈提纲"}};
  const withPending={...emptyProject("pending"),fields:{audience:"年轻人"},pending:draft};
  assert.equal(activeProposal(withPending).artifact.title,"校园访谈提纲");
  assert.equal(planConversation("overview","修改第三个问题","",false,withPending).createArtifact,true);
  const noChange={...draft,id:"answer-only",fields:{},artifact:null};
  assert.equal(mergePendingProposal(withPending,noChange).id,draft.id);
  const reverted=mergePendingProposal(withPending,{...noChange,fields:{audience:"年轻人"}});
  assert.deepEqual(reverted.fields,{});
  assert.equal(reverted.artifact.title,"校园访谈提纲");
  assert.equal(activeProposal({...withPending,pending:{...draft,fields:{audience:"年轻人"},artifact:null}}),null);
  const interviewState={...emptyProject("interview"),artifacts:numbered,materials:[{id:"M07",content:"真实访谈原文。",at:"2026-10-10"}]};
  const uploaded=prepareMaterials(interviewState,[{name:"补充访谈.docx",text:"新访谈原文。"}],"访谈记录");
  assert.equal(uploaded[0].id,"M08");
  assert.match(materialContext(uploaded),/用户材料 M08：补充访谈.docx/u);
  assert.equal(planConversation("research","调整第三个问题，让提问更开放","",false,interviewState).createArtifact,true);
  assert.equal(planConversation("research","修改目标用户为上班族","",false,interviewState).createArtifact,false);
  assert.equal(missingRequiredStructure("research","interview","生成访谈提纲",null),"可保存的访谈成果（标题和完整正文）");
  assert.equal(missingRequiredStructure("research","interview","更新访谈提纲",{title:"新版提纲",content:"完整问题清单"}),null);
  assert.equal(missingRequiredStructure("research","interview","更新访谈提纲",{title:"新版提纲",content:" "}),"可保存的访谈成果（标题和完整正文）");
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
  assert.equal(missingRequiredStructure("diagnosis", "diagnosis", "生成八维诊断", { diagnosis:{dimensions:diagnosisNames.map(name=>({name,score:0,scoreReason:"信息缺失，暂无法判断。"}))} }), null);
  assert.equal(missingRequiredStructure("diagnosis", "diagnosis", "生成八维诊断", { diagnosis:{dimensions:diagnosisNames.map(name=>({name}))} }), "八个维度的 0–4 分评分及评分依据");
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
  assert.equal(selectRelevantMemory(state,"canvas","查看 Q01").archivedArtifacts[0].recordId,"Q01");
  assert.equal(memory.materials[0].id,"M04");
  assert.equal(memory.userMessages[0].content,"我想了解此前的问卷样本");
  console.log("结构化成果、证据版本与历史检索检查通过");
} finally { await rm(temp,{recursive:true,force:true}); }
