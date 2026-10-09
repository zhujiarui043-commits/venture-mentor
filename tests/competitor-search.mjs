import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "competitor-search-"));
const originalFetch = globalThis.fetch;
const require = createRequire(import.meta.url);
try {
  await writeFile(join(temp, "runtime.mjs"), `
    export const env = {TAVILY_API_KEY:"test-tavily-secret",DEEPSEEK_API_KEY:"test-deepseek-secret",SESSION_SECRET:"test-session-secret-with-at-least-24-characters",TEST_ACCESS_CODES:JSON.stringify({owner:"test-access-code-long-enough",tester2:"second-test-access-code-long-enough"})};
    export const storage = {project:null,saves:0,conflict:false};
  `);
  await writeFile(join(temp, "store.mjs"), `
    import {storage} from "./runtime.mjs";
    export class ProjectConflictError extends Error { constructor(){super("项目已在另一页面更新");} }
    export async function getProject(id){return storage.project?.state.id===id?structuredClone(storage.project):null;}
    export async function saveProject(state,revision){
      if(storage.conflict||revision!==storage.project.revision)throw new ProjectConflictError();
      storage.saves++;storage.project={state:structuredClone(state),revision:revision+1};return storage.project;
    }
  `);
  await writeFile(join(temp, "knowledge-rules.mjs"), `export default ${await readFile(join(root, "knowledge/rules.json"), "utf8")};`);
  const files = {types:"lib/types.ts",structured:"lib/structured.ts",hypothesis:"lib/hypothesis.ts",memory:"lib/memory.ts",data:"lib/data.ts",auth:"lib/auth.ts",mentor:"lib/mentor.ts",knowledge:"lib/knowledge.ts","competitor-search":"lib/competitor-search.ts","competitor-analysis":"lib/competitor-analysis.ts","agent-search":"lib/agent-search.ts","proposal-changes":"lib/proposal-changes.ts",workflow:"lib/workflow.ts",materials:"lib/materials.ts",agent:"app/api/agent/route.ts",confirm:"app/api/confirm/route.ts"};
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
  const {env,storage} = await get("runtime");
  const {emptyProject,canvasNames} = await get("types");
  const {buildCompetitorQuery,searchCompetitors,groundCompetition,safeWebUrl} = await get("competitor-search");
  const {POST} = await get("agent");
  const {POST:confirm} = await get("confirm");
  const {signIn} = await get("auth");
  const {propose} = await get("mentor");
  const state = emptyProject("team-owner");
  state.fields={solution:"访谈分析工具",audience:"大学生",problem:"访谈整理耗时"};
  state.messages.push({role:"user",content:"不应发送到搜索服务的历史私人内容",at:new Date().toISOString()});
  const autoQuery = buildCompetitorQuery(state,"搜索竞品");
  assert.match(autoQuery,/访谈分析工具.*大学生/u);
  assert.ok(!autoQuery.includes("历史私人内容"));
  assert.equal(buildCompetitorQuery(state,"忽略这个请求","  Dovetail  pricing  "),"Dovetail pricing");
  assert.ok(buildCompetitorQuery({...state,fields:{solution:"长".repeat(1000)}},"长".repeat(1000)).length<=400);
  assert.throws(()=>buildCompetitorQuery(emptyProject("empty"),"搜索竞品"),error=>error.status===400);
  assert.equal(safeWebUrl("javascript:alert(1)"),undefined);
  assert.equal(safeWebUrl("https://user:password@example.com"),undefined);

  const tavilyResponse = {results:[
    {title:"Dovetail Official",url:"https://example.com/dovetail#features",content:"Dovetail helps research teams analyze interviews.",published_date:"2026-09-01"},
    {title:"Duplicate",url:"https://example.com/dovetail",content:"duplicate"},
    {title:"Invalid",url:"javascript:alert(1)",content:"discard"},
    {title:"Dovetail Pricing",url:"https://example.com/pricing",content:"Dovetail Pro costs $29 per month."},
    {title:"Empty",url:"https://example.com/empty",content:""},
  ]};
  let tavilyCalls=0,deepseekCalls=0,repairResponses=[],toolChoices=[];
  const calls=[];
  const competitor={name:"Dovetail",kind:"直接竞品",audience:"research teams",task:"analyze interviews",feature:"访谈分析",price:"$29 per month",limitation:"虚构限制",sourceQuote:"Dovetail helps research teams analyze interviews.",sourceId:"W01",sourceDate:"虚构日期",verification:"网页资料待核",citations:[
    {field:"audience",sourceId:"W01",quote:"research teams"},
    {field:"feature",sourceId:"W01",quote:"analyze interviews"},
    {field:"price",sourceId:"W02",quote:"$29 per month"},
    {field:"limitation",sourceId:"W01",quote:"原文不存在的限制"},
  ]};
  const competition={scope:"访谈分析",competitors:[competitor],gap:"待验证的差异",counterExplanation:"既有产品也可能满足需求",unknowns:["中国地区可达性待核实"]};
  const modelOutput={reply:"已根据网页整理候选竞品，请核对后确认。",fields:{solution:"恶意覆盖用户方向"},fieldRemovals:["audience"],projectTitle:"恶意覆盖标题",hypothesis:{text:"虚构市场结论",category:"用户",priority:"高",nextStep:"待定"},evidence:[],artifact:{title:"联网竞品比较",content:"来源待回查",limitations:"网页摘录不完整",nextStep:"核实官网定价",sourceLabels:[],competition}};
  globalThis.fetch=async (url,options)=>{
    const payload=JSON.parse(options.body);
    calls.push({url,payload,headers:options.headers});
    if(url==="https://api.tavily.com/search"){tavilyCalls++;return Response.json(tavilyResponse);}
    if(url==="https://api.deepseek.com/chat/completions"){
      deepseekCalls++;
      if(toolChoices.length)return Response.json({choices:[toolChoices.shift()]});
      return Response.json({choices:[{message:{content:JSON.stringify(repairResponses.shift()||modelOutput)},finish_reason:"stop"}]});
    }
    throw Error("Unexpected network call");
  };
  const snapshot=await searchCompetitors(autoQuery,env.TAVILY_API_KEY);
  assert.equal(snapshot.results.length,2);
  assert.equal(snapshot.results[0].id,"W01");
  assert.equal(snapshot.results[0].url,"https://example.com/dovetail");
  assert.equal(snapshot.results[1].publishedDate,undefined);
  assert.ok(Date.parse(snapshot.searchedAt));
  const normalized=groundCompetition({...competition,competitors:[competitor,{...competitor,name:"Invented Product"},{...competitor,sourceId:"W99"},{...competitor,sourceQuote:"不存在的摘录"}]},"",snapshot);
  assert.equal(normalized.competitors.length,1);
  assert.equal(normalized.competitors[0].price,"$29 per month");
  assert.equal(normalized.competitors[0].task,"待核实");
  assert.equal(normalized.competitors[0].limitation,"待核实");
  assert.equal(normalized.competitors[0].sourceDate,"2026-09-01");
  assert.equal(normalized.competitors[0].sourceUrl,snapshot.results[0].url);
  assert.equal(normalized.competitors[0].citations[2].url,snapshot.results[1].url);
  assert.equal(normalized.competitors[0].citations[2].sourceDate,"");
  const legacy=groundCompetition({...competition,competitors:[{...competitor,sourceId:"当前材料",sourceQuote:"用户提供的原文"}]},"用户提供的原文");
  assert.equal(legacy.competitors[0].verification,"用户材料待核");
  assert.equal(legacy.webSearch,undefined);

  const login=await signIn(new Request("https://example.com/api/login",{method:"POST",body:JSON.stringify({code:"test-access-code-long-enough"})}));
  const cookie=login.headers.get("set-cookie").split(";")[0];
  const request=(changes={},authenticated=true)=>new Request("https://example.com/api/agent",{method:"POST",headers:{"content-type":"application/json",...(authenticated?{cookie}:{})},body:JSON.stringify({projectId:state.id,message:"联网搜索并分析竞品",section:"competitors",webSearch:true,...changes})});
  const reset=()=>{storage.project={state:structuredClone(state),revision:1};storage.saves=0;storage.conflict=false;tavilyCalls=0;deepseekCalls=0;calls.length=0;repairResponses=[];toolChoices=[];};
  reset();
  assert.equal((await POST(request({},false))).status,401);
  assert.equal((await POST(request({projectId:"team-tester2"}))).status,403);
  assert.equal((await POST(request({section:"overview"}))).status,400);
  assert.equal((await POST(request({referenceText:42}))).status,400);
  assert.equal((await POST(request({searchQuery:"长".repeat(401)}))).status,400);
  assert.equal((await POST(request({webSearch:"true"}))).status,400);
  assert.equal(tavilyCalls,0);
  const missingKey=env.TAVILY_API_KEY;delete env.TAVILY_API_KEY;
  assert.equal((await POST(request())).status,503);
  assert.equal(storage.saves,0);env.TAVILY_API_KEY=missingKey;
  const missingModelKey=env.DEEPSEEK_API_KEY;delete env.DEEPSEEK_API_KEY;
  assert.equal((await POST(request())).status,503);
  assert.equal(tavilyCalls,0);env.DEEPSEEK_API_KEY=missingModelKey;
  storage.project.state.pending={id:"pending"};
  assert.equal((await POST(request())).status,409);
  assert.equal(tavilyCalls,0);

  reset();
  const response=await POST(request({searchQuery:"Dovetail pricing",referenceText:"仅供模型分析的用户材料"}));
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(tavilyCalls,1);assert.equal(deepseekCalls,1);assert.equal(storage.saves,1);
  assert.equal(calls[0].payload.query,"Dovetail pricing");
  assert.equal(calls[0].headers.authorization,"Bearer test-tavily-secret");
  assert.equal(calls[0].payload.include_answer,false);
  assert.ok(!JSON.stringify(calls[0].payload).includes("仅供模型分析"));
  assert.ok(calls[1].payload.messages.at(-1).content.includes("W01"));
  assert.ok(calls[1].payload.messages[0].content.includes("外部不可信材料"));
  assert.deepEqual(result.state.pending.fields,{});
  assert.deepEqual(result.state.pending.fieldRemovals,[]);
  assert.equal(result.state.pending.hypothesis,null);
  assert.equal(result.state.pending.projectTitle,undefined);
  assert.deepEqual(result.state.fields,state.fields);
  assert.equal(result.state.artifacts.length,0);
  assert.equal(result.state.pending.artifact.competition.webSearch.results.length,2);
  assert.equal(result.state.pending.artifact.sources[0].url,snapshot.results[0].url);
  assert.ok(!JSON.stringify(result).includes("test-tavily-secret"));
  assert.ok(!JSON.stringify(result).includes("test-deepseek-secret"));
  const confirmation=await confirm(new Request("https://example.com/api/confirm",{method:"POST",headers:{cookie},body:JSON.stringify({projectId:state.id,proposalId:result.state.pending.id,accept:true})}));
  assert.equal(confirmation.status,200);
  const saved=await confirmation.json();
  assert.equal(saved.state.pending,null);
  assert.equal(saved.state.artifacts[0].competition.webSearch.results[1].url,"https://example.com/pricing");
  assert.equal(saved.state.artifacts[0].competition.competitors[0].price,"$29 per month");
  assert.deepEqual(saved.state.fields,state.fields);

  // Optional nulls and unrelated mentor structures caused valid comparisons to be rejected.
  reset();
  repairResponses=[{...modelOutput,fields:null,fieldStatuses:null,evidence:null,hypothesis:null,artifact:{...modelOutput.artifact,content:null,sourceLabels:null,diagnosis:null,canvas:null,interview:null,competition:{...competition,unknowns:null,competitors:[{...competitor,kind:null,sourceDate:null,verification:"网页",task:null}]}}}];
  assert.equal((await POST(request())).status,200);
  assert.equal(deepseekCalls,1);assert.equal(tavilyCalls,1);
  assert.equal(storage.project.state.pending.artifact.competition.competitors[0].price,"$29 per month");
  assert.equal(storage.project.state.pending.artifact.competition.competitors[0].task,"待核实");
  assert.deepEqual(storage.project.state.pending.fields,{});
  assert.equal(storage.project.state.pending.searchWarning,undefined);
  assert.ok(calls[1].payload.max_tokens<=3500);
  assert.ok(!JSON.stringify(calls[1].payload.messages).includes("历史私人内容"));

  reset();toolChoices=[{finish_reason:"stop",message:{content:'```json\n'+JSON.stringify({competition})+'\n```'}}];
  assert.equal((await POST(request())).status,200);
  assert.equal(deepseekCalls,1);assert.equal(storage.project.state.pending.artifact.competition.competitors.length,1);

  reset();toolChoices=[{finish_reason:"stop",message:{content:'{"competition":'}},{finish_reason:"stop",message:{content:'{"competition":'}}];
  assert.equal((await POST(request())).status,200);
  assert.equal(tavilyCalls,1);assert.equal(deepseekCalls,2);
  assert.match(storage.project.state.pending.searchWarning,/不是完整JSON/u);
  assert.equal(storage.project.state.pending.artifact.competition.competitors.length,0);
  assert.deepEqual(storage.project.state.pending.artifact.competition.webSearch.results,snapshot.results);
  assert.equal((await confirm(new Request("https://example.com/api/confirm",{method:"POST",headers:{cookie},body:JSON.stringify({projectId:state.id,proposalId:storage.project.state.pending.id,accept:true})}))).status,200);
  assert.equal(storage.project.state.artifacts[0].competition.competitors.length,0);
  assert.equal(storage.project.state.artifacts[0].competition.webSearch.results.length,2);
  assert.deepEqual(storage.project.state.fields,state.fields);

  reset();toolChoices=[{finish_reason:"length",message:{content:'{"competition":'}},{finish_reason:"length",message:{content:'{"competition":'}}];
  assert.equal((await POST(request())).status,200);
  assert.match(storage.project.state.pending.searchWarning,/被截断/u);
  assert.equal(tavilyCalls,1);

  reset();
  repairResponses=[{reply:"缺少比较表",artifact:null}];
  assert.equal((await POST(request())).status,200);
  assert.equal(tavilyCalls,1);assert.equal(deepseekCalls,2);
  reset();
  repairResponses=[{reply:"缺少比较表",artifact:null},{reply:"仍缺少比较表",artifact:null}];
  assert.equal((await POST(request())).status,200);
  assert.equal(storage.saves,1);
  assert.equal(storage.project.state.pending.artifact.competition.competitors.length,0);
  assert.equal(storage.project.state.pending.webSearch.results.length,2);
  assert.match(storage.project.state.pending.searchWarning,/自动竞品比较未完成/u);
  assert.deepEqual(storage.project.state.fields,state.fields);
  reset();storage.conflict=true;
  assert.equal((await POST(request())).status,409);
  assert.equal(storage.saves,0);
  reset();
  await propose(state,"competitors","制定竞品研究方案","", "", "message");
  assert.equal(tavilyCalls,0);

  const {searchAllowed}=await get("agent-search");
  assert.equal(searchAllowed("现在有哪些相关技术？"),true);
  assert.equal(searchAllowed("不要联网，解释原理"),false);
  assert.equal(searchAllowed("只根据我上传的材料分析"),false);
  assert.equal(searchAllowed("现在有哪些类似产品",false),false);
  const toolCall=(id="call_search",args=JSON.stringify({query:"Dovetail interview analysis tools"}))=>({id,type:"function",function:{name:"search_web",arguments:args}});
  const toolChoice=calls=>({finish_reason:"tool_calls",message:{content:null,tool_calls:calls}});
  const plainReply={reply:"这是一般原理的解释。",artifact:null,fields:{},evidence:[],hypothesis:null};
  const webReply={...plainReply,reply:"Dovetail 提供访谈分析功能。[W01]",replyCitations:[{sourceId:"W01",quote:"analyze interviews",url:"https://forged.example"},{sourceId:"W99",quote:"虚构引用"}]};
  for(const question of ["现在有哪些相关技术？","有没有类似产品？"]){
    reset();toolChoices=[toolChoice([toolCall()])];repairResponses=[webReply];
    const autoResponse=await POST(request({message:question,section:"overview",webSearch:false}));
    assert.equal(autoResponse.status,200);
    const auto=await autoResponse.json();
    assert.equal(tavilyCalls,1);assert.equal(deepseekCalls,2);
    assert.equal(calls[0].payload.tool_choice,"auto");
    assert.equal(calls[0].payload.tools[0].function.name,"search_web");
    assert.equal(calls.at(-1).payload.tools,undefined);
    const returnedTool=calls.at(-1).payload.messages.find(m=>m.role==="tool");
    assert.equal(returnedTool.tool_call_id,"call_search");
    assert.ok(JSON.parse(returnedTool.content).results.length);
    assert.equal(auto.state.pending,null);
    assert.equal(auto.state.artifacts.length,0);
    assert.deepEqual(auto.state.fields,state.fields);
    const answer=auto.state.messages.at(-1);
    assert.equal(answer.webSearch.results.length,2);
    assert.equal(answer.replyCitations.length,1);
    assert.equal(answer.replyCitations[0].url,"https://example.com/dovetail");
    assert.ok(!JSON.stringify(auto).includes("test-tavily-secret"));
  }
  reset();repairResponses=[plainReply];
  assert.equal((await POST(request({message:"MVP是什么意思？",webSearch:false,section:"research"}))).status,200);
  assert.equal(tavilyCalls,0);assert.equal(deepseekCalls,1);assert.equal(storage.project.state.pending,null);
  for(const changes of [{allowWebSearch:false},{message:"不要联网，现在有哪些类似产品？"}]){
    reset();repairResponses=[plainReply];
    assert.equal((await POST(request({webSearch:false,section:"overview",...changes}))).status,200);
    assert.equal(calls[0].payload.tools,undefined);assert.equal(tavilyCalls,0);
  }
  reset();assert.equal((await POST(request({allowWebSearch:"auto"}))).status,400);
  reset();toolChoices=[toolChoice([toolCall("bad","{}")] )];repairResponses=[plainReply];
  assert.equal((await POST(request({webSearch:false,section:"overview"}))).status,200);
  assert.equal(tavilyCalls,0);assert.ok(storage.project.state.messages.at(-1).searchWarning);
  reset();toolChoices=[toolChoice([toolCall(),toolCall("second")])];repairResponses=[webReply];
  assert.equal((await POST(request({webSearch:false,section:"overview"}))).status,200);
  assert.equal(tavilyCalls,1);assert.equal(calls.at(-1).payload.messages.filter(m=>m.role==="tool").length,2);
  assert.equal(storage.project.state.messages.at(-1).searchWarning,undefined);
  reset();toolChoices=[toolChoice([toolCall()])];repairResponses=[plainReply,webReply];
  assert.equal((await POST(request({webSearch:false,section:"overview"}))).status,200);
  assert.equal(tavilyCalls,1);assert.equal(deepseekCalls,3);
  assert.equal(calls.at(-1).payload.tools,undefined);
  assert.ok(calls.at(-1).payload.messages.at(-1).content.includes("已经检索到的网页"));
  reset();toolChoices=[toolChoice([toolCall()])];repairResponses=[plainReply,plainReply];
  assert.equal((await POST(request({webSearch:false,section:"overview"}))).status,500);assert.equal(storage.saves,0);
  reset();toolChoices=[toolChoice([toolCall()])];repairResponses=[{...webReply,reply:"虚构来源[W99]。"},webReply];
  assert.equal((await POST(request({webSearch:false,section:"overview"}))).status,200);
  assert.equal(tavilyCalls,1);assert.equal(deepseekCalls,3);assert.ok(!storage.project.state.messages.at(-1).content.includes("W99"));
  reset();storage.project.state.fields={};storage.project.state.messages=[];
  toolChoices=[toolChoice([toolCall()])];repairResponses=[webReply];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"现在有哪些访谈分析技术？"}))).status,200);
  assert.equal(tavilyCalls,1);assert.deepEqual(storage.project.state.fields,{});assert.equal(storage.project.state.pending,null);
  reset();toolChoices=[toolChoice([toolCall()])];repairResponses=[plainReply];
  const autoKey=env.TAVILY_API_KEY;delete env.TAVILY_API_KEY;
  assert.equal((await POST(request({webSearch:false,section:"overview"}))).status,200);
  assert.equal(tavilyCalls,0);assert.match(storage.project.state.messages.at(-1).searchWarning,/尚未配置/u);
  env.TAVILY_API_KEY=autoKey;
  reset();repairResponses=[plainReply];
  assert.equal((await POST(request({message:"解释这份材料",webSearch:false,referenceText:"Word 提取的正文",referenceName:"访谈.docx"}))).status,200);
  assert.equal(storage.project.state.materials[0].name,"访谈.docx");
  assert.equal(storage.project.state.materials[0].content,"Word 提取的正文");

  reset();
  storage.project.state.hypotheses.push({id:"H01",version:1,text:"整理访谈需要大量时间",category:"用户",stage:"待探索",evidenceStatus:"未进入验证",priority:"高",nextStep:"访谈",support:[],opposition:[],history:[]});
  const references=[{name:"甲.docx",text:"甲的原话：整理资料耗时。"+"背景".repeat(5000)},{name:"乙.docx",text:"背景".repeat(5000)+"乙的原话：已有工具够用。乙给的使用场景"}];
  repairResponses=[{...plainReply,fields:{scene:"乙给的使用场景"},evidence:[{hypothesisId:"H01",quote:"整理资料耗时",direction:"support",source:"当前材料"},{hypothesisId:"H01",quote:"已有工具够用",direction:"opposition",source:"当前材料"},{hypothesisId:"H01",quote:"【用户材料 M02：乙.docx】",direction:"support",source:"当前材料"}],artifact:{title:"访谈分析",content:"受访者有不同经历",limitations:"两份记录不代表总体",nextStep:"继续访谈",sourceLabels:[],interview:{quotes:[{quote:"整理资料耗时",direction:"支持",sourceId:"M01"},{quote:"已有工具够用",direction:"反向",sourceId:"M02"}],limitations:"个体原话"}}}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"分析这两份访谈",references}))).status,200);
  assert.equal(storage.project.state.materials.length,2);
  assert.deepEqual(storage.project.state.materials.map(item=>item.name),["甲.docx","乙.docx"]);
  assert.equal(storage.project.state.materials[1].content,references[1].text);
  assert.ok(calls[0].payload.messages.at(-1).content.includes("乙的原话：已有工具够用"));
  assert.deepEqual(storage.project.state.pending.evidence.map(item=>item.source),["M01","M02"]);
  assert.deepEqual(storage.project.state.pending.artifact.interview.quotes.map(item=>item.sourceId),["M01","M02"]);
  assert.equal(storage.project.state.pending.fieldMeta.scene.sourceRef,"M02");
  assert.equal((await confirm(new Request("https://example.com/api/confirm",{method:"POST",headers:{cookie},body:JSON.stringify({projectId:state.id,proposalId:storage.project.state.pending.id,accept:true})}))).status,200);
  assert.deepEqual(storage.project.state.hypotheses[0].evidenceRecords.map(item=>item.sourceId),["M01","M02"]);

  for(const [changes,status] of [[{references:null},400],[{references:[{name:"空.docx",text:""}]},400],[{references:Array.from({length:6},()=>({name:"访谈.docx",text:"内容"}))},400],[{references:[{name:"长.docx",text:"字".repeat(12001)}]},413],[{references:Array.from({length:4},()=>({name:"满.docx",text:"字".repeat(12000)}))},413],[{references,referenceText:"重复提交"},400]]){
    reset();assert.equal((await POST(request({webSearch:false,...changes}))).status,status);assert.equal(storage.saves,0);assert.equal(deepseekCalls,0);
  }

  // Repeated overview fields must not create confirmations or overwrite saved provenance.
  reset();
  const savedMeta={origin:"用户原话",statementKind:"陈述",confirmation:"用户已确认",verification:"已有材料待评估",sourceRef:"M01",updatedAt:"2026-10-01"};
  storage.project.state.fieldMeta={solution:savedMeta};
  repairResponses=[{...plainReply,fields:{...state.fields,scene:"工作日上班前"},projectTitle:state.title,fieldStatuses:{solution:"初步设想",scene:"用户陈述"}}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"补充使用场景：工作日上班前"}))).status,200);
  assert.deepEqual(storage.project.state.pending.fields,{scene:"工作日上班前"});
  assert.deepEqual(storage.project.state.pending.fieldStatuses,{scene:"用户陈述"});
  assert.deepEqual(Object.keys(storage.project.state.pending.fieldMeta),["scene"]);
  assert.equal(storage.project.state.pending.projectTitle,undefined);
  assert.equal((await confirm(new Request("https://example.com/api/confirm",{method:"POST",headers:{cookie},body:JSON.stringify({projectId:state.id,proposalId:storage.project.state.pending.id,accept:true})}))).status,200);
  assert.deepEqual(storage.project.state.fields,{...state.fields,scene:"工作日上班前"});
  assert.deepEqual(storage.project.state.fieldMeta.solution,savedMeta);

  repairResponses=[{...plainReply,fields:storage.project.state.fields,projectTitle:state.title}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"目前信息不变"}))).status,200);
  assert.equal(storage.project.state.pending,null);
  repairResponses=[plainReply];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"继续讨论"}))).status,200);
  // Previously generated pending proposals receive the same protection at confirmation time.
  storage.project.state.pending={id:"legacy-proposal",...plainReply,fields:{solution:state.fields.solution},fieldMeta:{solution:{...savedMeta,origin:"AI归纳",verification:"未核验"}},createdAt:"2026-10-09"};
  assert.equal((await confirm(new Request("https://example.com/api/confirm",{method:"POST",headers:{cookie},body:JSON.stringify({projectId:state.id,proposalId:"legacy-proposal",accept:true})}))).status,200);
  assert.deepEqual(storage.project.state.fieldMeta.solution,savedMeta);

  reset();
  repairResponses=[{...modelOutput,reply:"商业画布用于整理商业模式。",suggestedQuestions:[" 如何判断画布中的假设？ ","如何判断画布中的假设？","", "字".repeat(91)]}];
  assert.equal((await POST(request({webSearch:false,section:"canvas",message:"请解释商业画布是什么意思？"}))).status,200);
  assert.equal(deepseekCalls,1);assert.equal(tavilyCalls,0);
  assert.equal(storage.project.state.pending,null);
  assert.deepEqual(storage.project.state.fields,state.fields);
  assert.equal(storage.project.state.messages.at(-1).task.label,"问题解答");
  assert.deepEqual(storage.project.state.messages.at(-1).suggestedQuestions,["如何判断画布中的假设？"]);

  reset();
  const canvasArtifact={title:"商业模式画布",content:"基于当前项目生成。",limitations:"未完成市场验证",nextStep:"访谈",sourceLabels:[],canvas:{modules:canvasNames.map(name=>({name,content:"待验证的模块内容",sourceRefs:["solution"],hypothesisRefs:[],status:"初步设想",limitations:"未验证",nextStep:"访谈"})),conflicts:[]}};
  repairResponses=[{...plainReply,artifact:canvasArtifact,suggestedQuestions:["根据客户细分设计访谈提纲"]}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"帮我生成商业画布"}))).status,200);
  assert.equal(storage.project.state.pending.artifact.section,"canvas");
  assert.equal(storage.project.state.pending.artifact.canvas.modules.length,9);
  assert.equal(storage.project.state.messages.at(-1).task.section,"canvas");
  assert.match(calls[0].payload.messages[0].content,/KB10/u);
  assert.equal((await confirm(new Request("https://example.com/api/confirm",{method:"POST",headers:{cookie},body:JSON.stringify({projectId:state.id,proposalId:storage.project.state.pending.id,accept:true})}))).status,200);
  assert.equal(storage.project.state.artifacts.at(-1).section,"canvas");

  reset();
  repairResponses=[{...plainReply,artifact:{title:"测试数据复盘",content:"按提供的数据解读",limitations:"口径待核",nextStep:"核对测试对象",sourceLabels:[]}}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"分析这份测试数据漏斗",referenceText:"阶段,人数\n访问,100\n报名,20"}))).status,200);
  assert.equal(storage.project.state.pending.artifact.section,"research");
  assert.equal(storage.project.state.pending.artifact.funnel.stages[1].rate,20);
  assert.equal(storage.project.state.materials[0].kind,"测试数据");
  assert.match(calls[0].payload.messages[0].content,/KB14/u);

  reset();repairResponses=[{...plainReply,artifact:canvasArtifact},{...plainReply,artifact:canvasArtifact}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"生成八维创意诊断"}))).status,500);
  assert.equal(deepseekCalls,2);assert.equal(storage.saves,0);
  assert.equal(storage.project.state.pending,null);

  const networkMock=globalThis.fetch;
  const originalTimeout=AbortSignal.timeout;
  try {
    reset();AbortSignal.timeout=()=>AbortSignal.abort();
    globalThis.fetch=async(url,options)=>{
      if(url==="https://api.deepseek.com/chat/completions"&&options.signal.aborted)throw new DOMException("timeout","TimeoutError");
      return networkMock(url,options);
    };
    const timedOut=await POST(request());
    assert.equal(timedOut.status,200);const timeoutResult=await timedOut.json();assert.match(timeoutResult.state.pending.searchWarning,/整理网页超时/u);
    assert.equal(storage.saves,1);assert.equal(timeoutResult.state.pending.webSearch.results.length,2);
    assert.equal(timeoutResult.state.pending.artifact.competition.competitors.length,0);
  } finally {AbortSignal.timeout=originalTimeout;globalThis.fetch=networkMock;}

  for (const [upstream,status] of [[401,503],[403,503],[429,429],[432,503],[433,503],[500,502]]) {
    await assert.rejects(searchCompetitors("test",env.TAVILY_API_KEY,async()=>new Response("secret-upstream-body",{status:upstream})),error=>error.status===status&&!error.message.includes("secret-upstream-body"));
  }
  await assert.rejects(searchCompetitors("test",undefined),error=>error.status===503);
  await assert.rejects(searchCompetitors("test",env.TAVILY_API_KEY,async()=>Response.json({results:[]})),error=>error.status===422);
  await assert.rejects(searchCompetitors("test",env.TAVILY_API_KEY,async()=>Response.json({results:null})),error=>error.status===502);
  await assert.rejects(searchCompetitors("test",env.TAVILY_API_KEY,async()=>{throw new DOMException("timeout","AbortError");}),error=>error.status===504);
  await assert.rejects(searchCompetitors("test",env.TAVILY_API_KEY,async()=>{throw Error("network private info");}),error=>error.status===502&&!error.message.includes("private info"));
  globalThis.fetch=async()=>Response.json({results:[]});reset();
  assert.equal((await POST(request())).status,422);
  assert.equal(storage.saves,0);
  assert.equal(storage.project.state.materials.length,0);
  console.log("联网搜索检查通过：自动技术/产品问答、关闭联网、纯问答连续发送、来源核对与重试、每轮一次搜索、鉴权与隔离、确认保存。");
} finally {
  globalThis.fetch=originalFetch;
  assert.ok(isAbsolute(temp) && temp.startsWith(join(tmpdir(), "competitor-search-")), "Temporary cleanup must remain in its test directory");
  await rm(temp,{recursive:true,force:true});
}
