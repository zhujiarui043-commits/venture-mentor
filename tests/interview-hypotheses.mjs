import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "interview-hypotheses-"));
const originalFetch = globalThis.fetch;
const require = createRequire(import.meta.url);
let preview,browser,uiDir;
try {
  await writeFile(join(temp, "runtime.mjs"), `
    export const env = {TAVILY_API_KEY:"test-tavily-secret",DEEPSEEK_API_KEY:"test-deepseek-secret",SESSION_SECRET:"test-session-secret-with-at-least-24-characters",TEST_ACCESS_CODES:JSON.stringify({owner:"test-access-code-long-enough",tester2:"second-test-access-code-long-enough"})};
    export const storage = {project:null,saves:0,conflict:false};
  `);
  await writeFile(join(temp, "store.mjs"), `
    import {storage} from "./runtime.mjs";
    export class ProjectConflictError extends Error { constructor(){super("项目已在另一页面更新");} }
    export async function getOrCreateProject(id){return getProject(id);}
    export async function getProject(id){return storage.project?.state.id===id?structuredClone(storage.project):null;}
    export async function saveProject(state,revision){
      if(storage.conflict||revision!==storage.project.revision)throw new ProjectConflictError();
      storage.saves++;storage.project={state:structuredClone(state),revision:revision+1};return storage.project;
    }
  `);
  await writeFile(join(temp, "knowledge-rules.mjs"), `export default ${await readFile(join(root, "knowledge/rules.json"), "utf8")};`);
  const files = {"interview-hypotheses":"lib/interview-hypotheses.ts","hypothesis-assessment":"lib/hypothesis-assessment.ts","diagnosis-scoring":"lib/diagnosis-scoring.ts",types:"lib/types.ts",structured:"lib/structured.ts",hypothesis:"lib/hypothesis.ts",memory:"lib/memory.ts",data:"lib/data.ts",auth:"lib/auth.ts","email-accounts":"lib/email-accounts.ts","login-identifier":"lib/login-identifier.ts",mentor:"lib/mentor.ts","survey-format":"lib/survey-format.ts",knowledge:"lib/knowledge.ts","competitor-search":"lib/competitor-search.ts","competitor-analysis":"lib/competitor-analysis.ts","agent-search":"lib/agent-search.ts","proposal-changes":"lib/proposal-changes.ts",workflow:"lib/workflow.ts",materials:"lib/materials.ts","apply-proposal":"lib/apply-proposal.ts","competition-workspace":"lib/competition-workspace.ts",selection:"app/api/competitors/selection/route.ts",agent:"app/api/agent/route.ts",confirm:"app/api/confirm/route.ts",project:"app/api/project/route.ts"};
  for (const [name, path] of Object.entries(files)) {
    const source = await readFile(join(root, path), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
      .replaceAll('from "cloudflare:workers"', 'from "./runtime.mjs"')
      .replaceAll('from "@/knowledge/rules.json"', 'from "./knowledge-rules.mjs"')
      .replaceAll('from "zod"', `from ${JSON.stringify(pathToFileURL(require.resolve("zod")).href)}`)
      .replace(/from "(?:@\/lib\/|\.\/)([a-z-]+)"/gu, 'from "./$1.mjs"');
    await writeFile(join(temp, `${name}.mjs`), compiled);
  }
  const get = name => import(pathToFileURL(join(temp, `${name}.mjs`)));
  const {storage} = await get("runtime");
  const {emptyProject,normalizeProjectNumbers} = await get("types");
  const {POST} = await get("agent");
  const {GET} = await get("project");
  const {signIn} = await get("auth");
  const {applyProposal} = await get("apply-proposal");
  const {shouldReviewInterviewHypotheses} = await get("interview-hypotheses");
  const {planConversation} = await get("workflow");
  const {hypothesisStatePrompt} = await get("hypothesis");
  const question="根据访谈记录材料，自己总结判断是否有可以支撑假设清单的证据，然后更新假设清单";
  assert.equal(shouldReviewInterviewHypotheses(question,planConversation("overview",question).createArtifact),true);
  for (const text of ["访谈证据怎么判断？","设计访谈提纲","修订假设为每次整理访谈需要两个小时","不要更新假设清单，只分析访谈"])
    assert.equal(shouldReviewInterviewHypotheses(text,planConversation("overview",text).createArtifact),false,text);
  const login=await signIn(new Request("https://example.com/api/login",{method:"POST",body:JSON.stringify({code:"test-access-code-long-enough"})}));
  const cookie=login.headers.get("set-cookie").split(";")[0];
  const request=(changes={})=>new Request("https://example.com/api/agent",{method:"POST",headers:{cookie,"content-type":"application/json"},body:JSON.stringify({projectId:"team-owner",section:"overview",message:question,allowWebSearch:true,...changes})});
  const h=(n,text)=>({id:`H${String(n).padStart(2,"0")}`,version:1,text,category:"用户",stage:"待访谈验证",evidenceStatus:"未进入验证",priority:"高",nextStep:"访谈",support:[],opposition:[],history:[]});
  const seed={...emptyProject("team-owner"),hypotheses:[h(1,"学生备考时每天整理资料超过一小时"),h(2,"学生愿意付费使用整理工具"),h(3,"已有工具不能解决问题"),h(4,"整理困难在所有情境中都发生")],materials:[
    {id:"M01",kind:"访谈记录",name:"甲.docx",content:"甲：昨天备考整理资料花了两小时。我觉得收费十元可以试试。平时课程笔记不用整理。",at:"2026-10-10"},
    {id:"M02",kind:"访谈记录",name:"乙.docx",content:"乙：昨天备考整理资料花了九十分钟。现在用现有工具已经够用了。",at:"2026-10-10"},
  ]};
  const evidence=(source,quote,direction,subject,level="E2")=>({source,quote,direction,subject,level,relevance:"对应假设的具体行为或情境，不能外推总体。"});
  const assessment=(hypothesisId,evidenceStatus,ev=[])=>({hypothesisId,hypothesisVersion:1,evidenceStatus,rationale:"逐条比较用户、情境和预测后判断。",limitations:"两名受访者的自述；样本覆盖范围有限，尚未验证实际付款。",nextStep:"核对备考情境下实际整理流程。",sourceIds:["M01","M02"],evidence:ev});
  const output={assessments:[
    assessment("H01","初步支持",[evidence("M01","昨天备考整理资料花了两小时","support","甲"),evidence("M02","昨天备考整理资料花了九十分钟","support","乙")]),
    assessment("H02","证据不足",[evidence("M01","我觉得收费十元可以试试","support","甲","E1")]),
    assessment("H03","初步不支持",[evidence("M02","现在用现有工具已经够用了","opposition","乙")]),
    assessment("H04","证据不一致",[evidence("M01","昨天备考整理资料花了两小时","support","甲"),evidence("M01","平时课程笔记不用整理","boundary","甲")]),
  ]};
  let responses=[],calls=[];
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,"https://api.deepseek.com/chat/completions");
    const payload=JSON.parse(options.body);calls.push(payload);
    assert.equal(payload.tools,undefined,"Interview evidence must not be sent to search");
    return Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(responses.shift() || {})}}]});
  };
  const reset=()=>{storage.project={state:structuredClone(seed),revision:1};storage.saves=0;responses=[];calls=[];};
  reset();responses=[output];
  const result=await POST(request());assert.equal(result.status,200,JSON.stringify(await result.clone().json()));
  assert.equal(storage.saves,1);assert.equal(calls.length,1);
  assert.ok(calls[0].messages.at(-1).content.includes(seed.materials[1].content));
  assert.deepEqual(storage.project.state.hypotheses.map(h=>h.evidenceStatus),["初步支持","证据不足","初步不支持","证据不一致"]);
  assert.deepEqual(storage.project.state.hypotheses.map(h=>h.text),seed.hypotheses.map(h=>h.text));
  assert.ok(storage.project.state.hypotheses.every(h=>h.version===1&&h.stage==="待访谈验证"&&h.assessment));
  assert.equal(storage.project.state.pending,null);
  assert.equal(storage.project.state.hypotheses[0].evidenceRecords[1].sourceId,"M02");
  assert.match(storage.project.state.hypotheses[0].evidenceRecords[0].sourceLocation,/字符/u);
  const reread=await GET(new Request("https://example.com/api/project",{headers:{cookie}}));
  assert.deepEqual((await reread.json()).state.hypotheses,storage.project.state.hypotheses);
  responses=[output];assert.equal((await POST(request())).status,200);
  assert.equal(storage.project.state.hypotheses[0].evidenceRecords.length,2,"Reassessment must not duplicate quotes");
  assert.equal(storage.project.state.hypotheses[0].assessmentHistory.length,1);

  // Reassess all three methods from saved originals, including questionnaire-only and MVP-only projects.
  for (const mode of ["问卷数据","测试数据","mixed"]) {
    reset();
    const survey={id:"M03",kind:"问卷数据",name:"问卷结果.csv",content:"样本,实际行为\n甲,昨天整理资料花了两小时\n乙,昨天整理资料花了九十分钟",at:"2026-10-10"};
    const mvp={id:"M04",kind:"测试数据",name:"MVP测试记录.csv",content:"测试对象甲完成任务并支付十元，观察周期七天。",at:"2026-10-10"};
    storage.project.state.materials=mode==="mixed"?[...seed.materials,survey,mvp]:mode==="问卷数据"?[survey]:[mvp];
    const ids=storage.project.state.materials.map(m=>m.id);
    const result={assessments:seed.hypotheses.map((h,i)=>({...assessment(h.id,"证据不足"),sourceIds:ids,
      ...(i===0&&mode!=="mixed" ? {evidenceStatus:"初步支持",evidence:[mode==="问卷数据"?evidence("M03","昨天整理资料花了两小时","support","甲"):evidence("M04","完成任务并支付十元","support","甲")]} : {})}))};
    responses=[result];
    assert.equal((await POST(request({section:"hypotheses",message:"根据已保存的调研材料（用户访谈、问卷调查、MVP 测试），逐条评估假设证据并更新假设清单。"}))).status,200);
    assert.equal(calls.length,1);
    const sent=JSON.parse(calls[0].messages.at(-1).content);
    assert.deepEqual(sent.materials.map(m=>m.id),ids);
    assert.match(calls[0].messages[0].content,/问卷须结合样本条件/u);
    assert.match(calls[0].messages[0].content,/实际使用或付费/u);
    assert.match(calls[0].messages[0].content,/不得提及内部知识库/u);
    assert.ok(storage.project.state.hypotheses.every(h=>h.assessment.researchMethods.length));
    assert.equal(storage.project.state.artifacts.at(-1).section,"hypotheses");
    assert.equal(storage.project.state.artifacts.at(-1).interview,undefined);
    assert.ok(!storage.project.state.messages.at(-1).content.includes("访谈判断"));
  }
  reset();
  const leaked=structuredClone(output);leaked.assessments[0].rationale="根据KB05假设知识库判断。";responses=[leaked,output];
  assert.equal((await POST(request())).status,200);assert.equal(calls.length,2);
  assert.ok(!storage.project.state.messages.at(-1).content.includes("知识库"));

  // Imported Word layout can add whitespace; stored quotes must remain exact source slices.
  reset();
  storage.project.state.materials[0].content=seed.materials[0].content.replace("备考整理", "备考\n\u00a0整理");
  responses=[output];
  assert.equal((await POST(request())).status,200);
  const restoredQuote=storage.project.state.hypotheses[0].evidenceRecords[0];
  assert.equal(restoredQuote.quote,"昨天备考\n\u00a0整理资料花了两小时");
  assert.ok(storage.project.state.materials[0].content.includes(restoredQuote.quote));
  assert.equal(calls.length,1);

  // A fabricated respondent description is omitted without discarding real quotes.
  reset();const wrongSubject=structuredClone(output);wrongSubject.assessments[0].evidence[0].subject="麦肯锡管培生";
  wrongSubject.assessments[0].rationale="麦肯锡管培生有具体经历。";
  responses=[wrongSubject,wrongSubject];
  assert.equal((await POST(request())).status,200);
  assert.equal(calls.length,1);
  assert.equal(storage.project.state.hypotheses[0].assessment.evidence[0].subject,"");
  assert.equal(storage.project.state.hypotheses[0].assessment.evidenceStatus,"证据不足");
  assert.ok(storage.project.state.hypotheses[0].assessment.evidence[0].quote.includes("昨天备考整理资料"));
  assert.match(storage.project.state.hypotheses[0].assessment.limitations,/独立样本数量仍待确认/u);
  assert.ok(!storage.project.state.hypotheses[0].assessment.rationale.includes("麦肯锡管培生"));

  // The identifier must occur in the same material as the quote.
  reset();const wrongSourceSubject=structuredClone(output);wrongSourceSubject.assessments[1].evidence[0].subject="乙";
  responses=[wrongSourceSubject];
  assert.equal((await POST(request())).status,200);
  assert.equal(storage.project.state.hypotheses[1].assessment.evidence[0].subject,"");

  // Invalid quotes, omissions and stale versions fail atomically.
  for (const corrupt of [
    o=>{o.assessments[0].hypothesisVersion=2},
    o=>{o.assessments.pop()},
    o=>{o.assessments[1].evidenceStatus="初步支持"},
    o=>{o.assessments[3].evidence=[]},
  ]) {
    reset();const invalid=structuredClone(output);corrupt(invalid);responses=[invalid,invalid];
    const before=structuredClone(storage.project);const failed=await POST(request());assert.equal(failed.status,500);
    const error=(await failed.json()).error;
    assert.match(error,/系统已自动重试/u);
    assert.ok(!error.includes("未修改项目资料"),"Do not repeat the no-save message");
    assert.equal(storage.saves,0);assert.deepEqual(storage.project,before);assert.equal(calls.length,2);
  }
  reset();const paraphrase=structuredClone(output);paraphrase.assessments[0].evidence[0].quote="昨天备考整理资料用了两小时";responses=[paraphrase,paraphrase];
  assert.equal((await POST(request())).status,200);
  assert.equal(calls.length,2);
  assert.equal(storage.saves,1);
  assert.equal(storage.project.state.hypotheses[0].assessment.evidenceStatus,"证据不足");
  assert.equal(storage.project.state.hypotheses[0].assessment.evidence.length,1);
  assert.ok(!storage.project.state.hypotheses[0].evidenceRecords.some(item=>item.quote==="昨天备考整理资料用了两小时"));
  assert.equal(storage.project.state.hypotheses[1].assessment.evidenceStatus,"证据不足");
  assert.match(storage.project.state.messages.at(-1).content,/引用无法逐字核验，已剔除/u);
  reset();const wrongMaterial=structuredClone(output);wrongMaterial.assessments[0].evidence[0].source="M02";responses=[wrongMaterial,wrongMaterial];
  assert.equal((await POST(request())).status,200);
  assert.equal(storage.project.state.hypotheses[0].assessment.evidenceStatus,"证据不足");
  assert.ok(!storage.project.state.hypotheses[0].evidenceRecords.some(item=>item.quote==="昨天备考整理资料花了两小时"));
  reset();const loneBadQuote=structuredClone(output);loneBadQuote.assessments[2].evidence[0].quote="现有工具完全不能解决问题";responses=[loneBadQuote,loneBadQuote];
  assert.equal((await POST(request())).status,200);
  assert.equal(storage.project.state.hypotheses[2].assessment.evidenceStatus,"证据不足");
  assert.deepEqual(storage.project.state.hypotheses[2].assessment.evidence,[]);
  assert.equal(storage.project.state.hypotheses[0].assessment.evidenceStatus,"初步支持");
  assert.match(storage.project.state.hypotheses[2].assessment.limitations,/引用无法逐字核验/u);
  reset();const bad=structuredClone(output);bad.assessments.pop();responses=[bad,output];
  assert.equal((await POST(request())).status,200);assert.equal(calls.length,2);
  reset();storage.project.state.hypotheses.push(h(5,"渠道假设"),h(6,"执行假设"));
  responses=[{assessments:[...output.assessments,assessment("H05","证据不足")]},{assessments:[assessment("H06","证据不足")]}];
  assert.equal((await POST(request())).status,200);assert.equal(calls.length,2);
  assert.ok(storage.project.state.hypotheses.every(h=>h.assessment),"All batches must be saved together");
  reset();storage.project.state.hypotheses.push(h(5,"渠道假设"),h(6,"执行假设"));
  responses=[{assessments:[...output.assessments,assessment("H05","证据不足")]},{},{ }];
  const beforeBatchFailure=structuredClone(storage.project);assert.equal((await POST(request())).status,500);
  assert.deepEqual(storage.project,beforeBatchFailure);assert.equal(storage.saves,0);

  reset();storage.project.state.materials=[];
  assert.equal((await POST(request())).status,200);assert.equal(calls.length,0);
  assert.ok(storage.project.state.hypotheses.every(h=>!h.assessment));
  assert.match(storage.project.state.messages.at(-1).content,/没有可读取的访谈原文/u);
  reset();storage.project.state.materials=[];responses=[output];
  assert.equal((await POST(request({references:seed.materials.map(m=>({name:m.name,text:m.content}))}))).status,200);
  assert.ok(storage.project.state.materials.every(m=>m.kind==="访谈记录"));
  reset();responses=[output];storage.conflict=true;
  const beforeConflict=structuredClone(storage.project);assert.equal((await POST(request())).status,409);
  assert.deepEqual(storage.project,beforeConflict);storage.conflict=false;
  reset();assert.equal((await POST(request({message:"根据 M99 访谈证据更新假设清单"}))).status,500);assert.equal(calls.length,0);
  // Number normalization preserves assessment links without editing exact quotes.
  const numbering=structuredClone(seed);numbering.hypotheses[0].id="H09";numbering.materials[0].id="M07";
  numbering.hypotheses[0].assessment={...assessment("H09","证据不足"),sourceIds:["M07"],evidence:[evidence("M07","原话 M07 H09 不得改写","boundary","甲")],assessedAt:"2026-10-10"};
  const migrated=normalizeProjectNumbers(numbering);
  assert.equal(migrated.hypotheses[0].assessment.hypothesisId,"H01");
  assert.deepEqual(migrated.hypotheses[0].assessment.sourceIds,["M01"]);
  assert.equal(migrated.hypotheses[0].assessment.evidence[0].quote,"原话 M07 H09 不得改写");
  // A substantive revision archives the assessment alongside its old evidence.
  reset();responses=[output];await POST(request());
  const beforeRevision=structuredClone(storage.project.state.hypotheses[0].assessment);
  applyProposal(storage.project.state,{id:"revision",reply:"修订",fields:{},artifact:null,evidence:[],createdAt:"2026-10-10",hypothesis:{targetId:"H01",text:"学生在备考周才需要整理资料",category:"用户",priority:"高",nextStep:"重新核对情境",changeKind:"实质修订"}});
  assert.equal(storage.project.state.hypotheses[0].assessment,undefined);
  assert.deepEqual(storage.project.state.hypotheses[0].history[0].assessment,beforeRevision);

  // The page shortcut reviews existing priorities before considering an addition.
  const stateRequest = {section:"hypotheses",message:hypothesisStatePrompt};
  const updates = seed.hypotheses.map((h,i)=>({hypothesisId:h.id,hypothesisVersion:h.version,
    priority:["中","高","低","中"][i],rationale:"根据当前关键风险与证据缺口确定处理顺序。",nextStep:"验证当前最关键的缺口。"}));
  const stateOutput = {reply:"已更新当前假设与证据状态。",hypothesisUpdates:updates,hypothesis:null};
  reset();responses=[output,stateOutput];
  assert.equal((await POST(request(stateRequest))).status,200);
  assert.deepEqual(storage.project.state.hypotheses.map(h=>h.priority),["中","高","低","中"]);
  assert.deepEqual(storage.project.state.hypotheses.map(h=>h.evidenceStatus),output.assessments.map(a=>a.evidenceStatus));
  assert.equal(storage.project.state.hypotheses.length,seed.hypotheses.length);
  assert.deepEqual(storage.project.state.hypotheses.map(h=>[h.text,h.version]),seed.hypotheses.map(h=>[h.text,h.version]));
  assert.equal(storage.project.state.hypotheses[0].priorityHistory[0].previous,"高");
  assert.equal(storage.project.state.hypotheses[0].priorityHistory[0].current,"中");
  assert.equal(storage.project.state.hypotheses[1].priorityHistory,undefined,"A retained priority has no fabricated change history");
  assert.match(storage.project.state.messages.at(-1).content,/H01：高 → 中/u);
  assert.match(storage.project.state.messages.at(-1).content,/H02：高（保留）/u);
  assert.equal(storage.project.state.hypotheses[0].nextStep,output.assessments[0].nextStep);
  assert.match(calls[1].messages[0].content,/hypothesisUpdates 必须覆盖/u);
  assert.match(calls[1].messages[0].content,/"evidenceStatus":"初步支持"/u);
  assert.match(calls[1].messages[0].content,/hypothesisAdditionReason/u);
  const rereadPriorities=await GET(new Request("https://example.com/api/project",{headers:{cookie}}));
  assert.deepEqual((await rereadPriorities.json()).state.hypotheses,storage.project.state.hypotheses);
  responses=[output,stateOutput];await POST(request(stateRequest));
  assert.equal(storage.project.state.hypotheses[0].priorityHistory.length,1);

  reset();storage.project.state.materials=[];responses=[stateOutput];
  assert.equal((await POST(request(stateRequest))).status,200);
  assert.equal(calls.length,1,"Priorities can update without interview material");
  assert.deepEqual(storage.project.state.hypotheses.map(h=>h.priority),updates.map(u=>u.priority));
  assert.ok(storage.project.state.hypotheses.every(h=>h.evidenceStatus==="未进入验证"&&!h.assessment));
  // Updating the page must include old hypotheses even beyond the old 20-item context.
  reset();storage.project.state.materials=[];
  storage.project.state.hypotheses=Array.from({length:21},(_,i)=>h(i+1,`现有假设 ${i+1}`));
  responses=[{...stateOutput,hypothesisUpdates:storage.project.state.hypotheses.map(h=>({...updates[0],hypothesisId:h.id}))}];
  assert.equal((await POST(request(stateRequest))).status,200);
  assert.match(calls[0].messages[0].content,/"id":"H01"/u);
  assert.match(calls[0].messages[0].content,/"id":"H21"/u);

  const addition={text:"校园社群可持续招募目标用户",category:"渠道",priority:"中",nextStep:"记录陌生用户招募成本"};
  for (const corrupt of [
    o=>{o.hypothesisUpdates.pop()},
    o=>{o.hypothesisUpdates[0].hypothesisVersion=2},
    o=>{o.hypothesisUpdates[1].hypothesisId="H01"},
    o=>{o.hypothesisUpdates[0].priority="已验证"},
    o=>{o.hypothesis=addition},
    o=>{o.hypothesis={...addition,text:seed.hypotheses[0].text};o.hypothesisAdditionReason="需要补充"},
  ]) {
    reset();const invalid=structuredClone(stateOutput);corrupt(invalid);responses=[output,invalid,invalid];
    const before=structuredClone(storage.project);
    assert.equal((await POST(request(stateRequest))).status,500);
    assert.equal(storage.saves,0);assert.deepEqual(storage.project,before);
  }
  reset();storage.project.state.materials=[];
  const partial=structuredClone(stateOutput);partial.hypothesisUpdates.pop();responses=[partial,stateOutput];
  assert.equal((await POST(request(stateRequest))).status,200);assert.equal(calls.length,2);
  reset();responses=[output,{...stateOutput,hypothesis:addition,hypothesisAdditionReason:"现有清单只覆盖需求和付费，缺少渠道可达性这一关键前提。"}];
  assert.equal((await POST(request(stateRequest))).status,200);
  assert.equal(storage.project.state.hypotheses.length,5);
  assert.equal(storage.project.state.hypotheses[4].id,"H05");
  assert.equal(storage.project.state.hypotheses[4].text,addition.text);
  assert.deepEqual(storage.project.state.hypotheses.slice(0,4).map(h=>h.priority),updates.map(u=>u.priority));
  reset();storage.project.state.hypotheses=[];storage.project.state.materials=[];
  responses=[{reply:"已建立首条假设",hypothesis:addition,hypothesisAdditionReason:"当前尚无假设，项目资料需要形成首条可证伪判断。"}];
  assert.equal((await POST(request(stateRequest))).status,200);
  assert.equal(storage.project.state.hypotheses[0].id,"H01");
  if (process.argv.includes("--browser")) {
    reset();responses=[output];
    const {createServer}=await import("vite");
    const {default:react}=await import("@vitejs/plugin-react");
    const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:"playwright");
    uiDir=await mkdtemp(join(root,".ui-interview-check-"));
    await writeFile(join(uiDir,"index.html"),'<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
    await writeFile(join(uiDir,"main.tsx"),"import React from 'react';import {createRoot} from 'react-dom/client';import Studio from '@/app/studio';import {ThemeProvider} from '@/components/theme-provider';import '@/app/globals.css';createRoot(document.getElementById('root')!).render(<ThemeProvider><Studio/></ThemeProvider>);");
    preview=await createServer({configFile:false,root:uiDir,cacheDir:join(uiDir,".vite-cache"),plugins:[react()],resolve:{alias:{"@":root}},server:{host:"127.0.0.1",port:0,fs:{allow:[root]}}});
    await preview.listen();
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1050},colorScheme:"light"});
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.route("**/api/project",route=>route.fulfill({json:storage.project}));
    let fail=false;
    await page.route("**/api/agent",async route=>{
      if(fail){fail=false;return route.fulfill({status:500,json:{error:"模拟评估失败，请重试。"}})}
      const body=route.request().postDataJSON();
      const response=await POST(request(body));
      return route.fulfill({status:response.status,json:await response.json()});
    });
    await page.goto(`http://127.0.0.1:${preview.httpServer.address().port}/`);
    await page.locator(".mentor-nav").getByRole("button",{name:"假设与证据",exact:true}).click();
    await page.getByRole("button",{name:"根据调研证据更新假设"}).click();
    await page.locator(".main-panel .hyp-card").filter({hasText:"H01"}).getByText("初步支持",{exact:true}).first().waitFor();
    const first=page.locator(".main-panel .hyp-card").filter({hasText:"H01"});
    assert.ok(await first.getByText(output.assessments[0].rationale,{exact:false}).isVisible());
    await first.locator(":scope > details > summary").click();
    await first.getByText("甲.docx",{exact:false}).waitFor();
    assert.ok(await first.getByText("具体经历或过去行为",{exact:false}).first().isVisible());
    const qa=join(root,".qa-results","interview-hypotheses");await mkdir(qa,{recursive:true});
    await page.screenshot({path:join(qa,"desktop-light.png"),fullPage:true});
    await page.reload();
    await page.locator(".main-panel .hyp-card").filter({hasText:"H03"}).getByText("初步不支持",{exact:true}).first().waitFor();
    assert.ok(await page.locator(".main-panel .hyp-card").filter({hasText:"H02"}).getByText("证据不足",{exact:true}).first().isVisible());
    fail=true;const beforeFailure=structuredClone(storage.project);
    await page.getByRole("button",{name:"根据调研证据更新假设"}).click();
    await page.getByRole("alert").filter({hasText:"模拟评估失败"}).waitFor();assert.deepEqual(storage.project,beforeFailure);
    responses=[output];await page.getByRole("button",{name:"根据调研证据更新假设"}).click();
    await page.getByRole("button",{name:"根据调研证据更新假设"}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('.research-card button')?.disabled);
    await first.locator(":scope > details > summary").click();
    await page.getByText("历史调研判断：初步支持",{exact:false}).first().waitFor();
    responses=[output,stateOutput];
    await page.getByRole("button",{name:"生成本页建议",exact:true}).click();
    const firstPriority=page.locator(".main-panel .hyp-card").filter({hasText:"H01"}).locator(".hyp-top");
    await firstPriority.getByText("中",{exact:true}).waitFor();
    assert.equal(storage.project.state.messages.at(-2).content,hypothesisStatePrompt);
    assert.equal(storage.project.state.hypotheses.length,4);
    await page.reload();
    await firstPriority.getByText("中",{exact:true}).waitFor();
    await first.locator(":scope > details > summary").click();
    await first.getByText("优先级：高 → 中",{exact:false}).waitFor();
    await page.getByRole("button",{name:"显示或收起导师",exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:join(qa,"mobile-light.png"),fullPage:true});
    await page.getByRole("button",{name:"切换到深色模式"}).click();
    await page.screenshot({path:join(qa,"mobile-dark.png"),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log("浏览器验收通过：本页建议新提示语、已有假设高中低同步与刷新恢复、优先级历史、访谈评估入口、原文文件名、历史判断、失败重试、手机宽度和深浅色。");
  }
  console.log("假设状态更新通过：已有优先级批量调整与保留、证据同步、必要时新增、重复与漏项保护、全清单覆盖、真实原文与版本校验、批量原子保存、重试、历史和刷新恢复。");
} finally {
  globalThis.fetch=originalFetch;
  await browser?.close();await preview?.close();if(uiDir)await rm(uiDir,{recursive:true,force:true});
  assert.ok(isAbsolute(temp)&&temp.startsWith(join(tmpdir(),"interview-hypotheses-")));
  await rm(temp,{recursive:true,force:true});
}
