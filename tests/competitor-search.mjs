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
  const {env,storage} = await get("runtime");
  const {emptyProject,canvasNames,diagnosisNames} = await get("types");
  const {buildCompetitorQuery,searchCompetitors,groundCompetition,safeWebUrl} = await get("competitor-search");
  const {POST} = await get("agent");
  const {POST:confirm} = await get("confirm");
  const {GET:readProject} = await get("project");
  const {POST:selectCompetitor} = await get("selection");
  const {currentCompetition} = await get("competition-workspace");
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
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"什么是访谈？"}))).status,200);
  assert.equal(tavilyCalls,0);
  assert.equal(storage.project.state.pending,null);

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
  assert.equal(result.state.pending,null);
  assert.deepEqual(result.state.hypotheses,[]);
  assert.equal(result.state.title,state.title);
  assert.deepEqual(result.state.fields,state.fields);
  assert.equal(result.state.artifacts.length,1);
  assert.equal(result.state.artifacts.at(-1).competition.webSearch.results.length,2);
  assert.equal(result.state.artifacts.at(-1).sources[0].url,snapshot.results[0].url);
  assert.ok(!JSON.stringify(result).includes("test-tavily-secret"));
  assert.ok(!JSON.stringify(result).includes("test-deepseek-secret"));
  assert.equal(result.state.messages.at(-1).artifactId,result.state.artifacts[0].id);
  const saved=result;
  assert.equal(saved.state.pending,null);
  assert.equal(saved.state.artifacts[0].competition.webSearch.results[1].url,"https://example.com/pricing");
  assert.equal(saved.state.artifacts[0].competition.competitors[0].price,"$29 per month");
  assert.deepEqual(saved.state.fields,state.fields);

  // Optional nulls and unrelated mentor structures caused valid comparisons to be rejected.
  reset();
  repairResponses=[{...modelOutput,fields:null,fieldStatuses:null,evidence:null,hypothesis:null,artifact:{...modelOutput.artifact,content:null,sourceLabels:null,diagnosis:null,canvas:null,interview:null,competition:{...competition,unknowns:null,competitors:[{...competitor,kind:null,sourceDate:null,verification:"网页",task:null}]}}}];
  assert.equal((await POST(request())).status,200);
  assert.equal(deepseekCalls,1);assert.equal(tavilyCalls,1);
  assert.equal(storage.project.state.artifacts.at(-1).competition.competitors[0].price,"$29 per month");
  assert.equal(storage.project.state.artifacts.at(-1).competition.competitors[0].task,"待核实");
  assert.deepEqual(storage.project.state.fields,state.fields);
  assert.equal(storage.project.state.messages.at(-1).searchWarning,undefined);
  assert.ok(calls[1].payload.max_tokens<=3500);
  assert.ok(!JSON.stringify(calls[1].payload.messages).includes("历史私人内容"));

  reset();toolChoices=[{finish_reason:"stop",message:{content:'```json\n'+JSON.stringify({competition})+'\n```'}}];
  assert.equal((await POST(request())).status,200);
  assert.equal(deepseekCalls,1);assert.equal(storage.project.state.artifacts.at(-1).competition.competitors.length,1);

  reset();toolChoices=[{finish_reason:"stop",message:{content:'{"competition":'}},{finish_reason:"stop",message:{content:'{"competition":'}}];
  assert.equal((await POST(request())).status,200);
  assert.equal(tavilyCalls,1);assert.equal(deepseekCalls,2);
  assert.match(storage.project.state.messages.at(-1).searchWarning,/不是完整JSON/u);
  assert.equal(storage.project.state.artifacts.at(-1).competition.competitors.length,0);
  assert.deepEqual(storage.project.state.artifacts.at(-1).competition.webSearch.results,snapshot.results);
  assert.equal(storage.project.state.artifacts[0].competition.competitors.length,0);
  assert.equal(storage.project.state.artifacts[0].competition.webSearch.results.length,2);
  assert.deepEqual(storage.project.state.fields,state.fields);

  reset();toolChoices=[{finish_reason:"length",message:{content:'{"competition":'}},{finish_reason:"length",message:{content:'{"competition":'}}];
  assert.equal((await POST(request())).status,200);
  assert.match(storage.project.state.messages.at(-1).searchWarning,/被截断/u);
  assert.equal(tavilyCalls,1);

  reset();
  repairResponses=[{reply:"缺少比较表",artifact:null}];
  assert.equal((await POST(request())).status,200);
  assert.equal(tavilyCalls,1);assert.equal(deepseekCalls,2);
  reset();
  repairResponses=[{reply:"缺少比较表",artifact:null},{reply:"仍缺少比较表",artifact:null}];
  assert.equal((await POST(request())).status,200);
  assert.equal(storage.saves,1);
  assert.equal(storage.project.state.artifacts.at(-1).competition.competitors.length,0);
  assert.equal(storage.project.state.messages.at(-1).webSearch.results.length,2);
  assert.match(storage.project.state.messages.at(-1).searchWarning,/自动竞品比较未完成/u);
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
  reset();
  storage.project.state.pending={...plainReply,id:"draft-field",fields:{audience:"年轻上班族"},createdAt:"2026-10-10"};
  repairResponses=[plainReply];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"什么是探索性访谈？"}))).status,200);
  assert.equal(storage.project.state.pending,null);
  assert.deepEqual(storage.project.state.fields,{...state.fields,audience:"年轻上班族"});
  repairResponses=[{...plainReply,fields:{audience:state.fields.audience}}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"目标用户改成大学生"}))).status,200);
  assert.equal(storage.project.state.pending,null);
  assert.deepEqual(storage.project.state.fields,state.fields);
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

  // A small Word upload can need a long analysis response: retry output, not input.
  const interviewUpload=[{name:"最新访谈.docx",text:"受访者甲：我昨天整理访谈花了两个小时。\n受访者乙：已有工具够用。"}];
  const interviewReply={...plainReply,reply:"已整理访谈中的具体经历与分歧。",artifact:{title:"访谈记录分析",content:"甲报告整理时间成本，乙报告现有工具可用；尚不能推断总体需求。",limitations:"仅两名受访者，经历仍需核对。",nextStep:"追问具体整理过程。",sourceLabels:[],interview:{quotes:[{quote:"我昨天整理访谈花了两个小时。",direction:"支持",sourceId:"M08"},{quote:"已有工具够用。",direction:"反向",sourceId:"M08"}],limitations:"个体经历不代表总体。"}}};
  const interviewRequest=()=>request({webSearch:false,allowWebSearch:false,section:"overview",message:"分析这份访谈记录",references:interviewUpload});
  const lengthChoice={finish_reason:"length",message:{content:JSON.stringify({...interviewReply,reply:"不应保存的截断回复",artifact:{...interviewReply.artifact,content:"不应保存的截断分析"}})}};
  const modelCalls=()=>calls.filter(call=>call.url==="https://api.deepseek.com/chat/completions");
  reset();repairResponses=[interviewReply];
  assert.equal((await POST(interviewRequest())).status,200);
  assert.deepEqual(modelCalls().map(call=>call.payload.max_tokens),[8000]);
  assert.equal(tavilyCalls,0);assert.equal(storage.saves,1);
  assert.equal(storage.project.state.artifacts.at(-1).section,"research");
  assert.equal(storage.project.state.artifacts.at(-1).content,interviewReply.artifact.content);

  reset();
  const oldInterviewMaterial={id:"M07",name:"早期访谈.docx",content:"早期访谈原文保持不变。",kind:"访谈记录",at:"2026-10-10"};
  storage.project.state.materials=[structuredClone(oldInterviewMaterial)];
  toolChoices=[lengthChoice];repairResponses=[interviewReply];
  const retriedInterview=await POST(interviewRequest());
  assert.equal(retriedInterview.status,200);
  assert.equal(deepseekCalls,2);assert.equal(tavilyCalls,0);assert.equal(storage.saves,1);
  const interviewModelCalls=modelCalls();
  assert.deepEqual(interviewModelCalls.map(call=>call.payload.max_tokens),[8000,16000]);
  const firstInterviewInput=interviewModelCalls[0].payload.messages.at(-1).content;
  const retriedInterviewInput=interviewModelCalls[1].payload.messages.at(-1).content;
  assert.ok(firstInterviewInput.includes("【用户材料 M08：最新访谈.docx】\n"+interviewUpload[0].text));
  assert.ok(retriedInterviewInput.startsWith(firstInterviewInput),"Retries must keep the complete original material and its ID");
  assert.equal(retriedInterviewInput.split("【用户材料 M08：最新访谈.docx】").length,2);
  assert.match(retriedInterviewInput,/截断/u);
  assert.match(retriedInterviewInput,/精简/u);
  assert.match(retriedInterviewInput,/reply/u);
  assert.match(retriedInterviewInput,/逐字短句/u);
  assert.match(retriedInterviewInput,/完整.*JSON/u);
  assert.deepEqual(storage.project.state.materials.map(material=>material.id),["M07","M08"]);
  assert.deepEqual(storage.project.state.materials[0],oldInterviewMaterial);
  assert.equal(storage.project.state.materials[1].content,interviewUpload[0].text);
  assert.equal(storage.project.state.artifacts.length,1);
  assert.equal(storage.project.state.artifacts[0].recordId,"A01");
  assert.equal(storage.project.state.artifacts[0].content,interviewReply.artifact.content);
  assert.deepEqual(storage.project.state.artifacts[0].interview.quotes.map(quote=>quote.sourceId),["M08","M08"]);
  assert.equal(storage.project.state.messages.at(-1).artifactId,storage.project.state.artifacts[0].id);
  assert.ok(!JSON.stringify(storage.project).includes("不应保存的截断"));

  // The screenshot's attachment-only wording also gets room for a complete reply.
  reset();toolChoices=[lengthChoice];repairResponses=[interviewReply];
  assert.equal((await POST(request({webSearch:false,allowWebSearch:false,section:"research",message:"这是最新访谈记录",references:interviewUpload}))).status,200);
  assert.deepEqual(modelCalls().map(call=>call.payload.max_tokens),[8000,16000]);
  assert.equal(storage.saves,1);assert.equal(storage.project.state.artifacts.length,0);
  assert.deepEqual(storage.project.state.materials.map(material=>material.id),["M01"]);
  assert.equal(storage.project.state.materials[0].content,interviewUpload[0].text);

  // Even parseable JSON marked as truncated must not save a partial result.
  reset();
  storage.project.state.materials=[structuredClone(oldInterviewMaterial)];
  storage.project.state.artifacts=[{...interviewReply.artifact,sourceLabels:undefined,id:"saved-interview",recordId:"A01",section:"research",sources:[],version:1,createdAt:"2026-10-10"}];
  const beforeTruncation=structuredClone(storage.project);
  toolChoices=[lengthChoice,lengthChoice];
  const twiceTruncated=await POST(interviewRequest());
  assert.equal(twiceTruncated.status,500);
  assert.deepEqual(modelCalls().map(call=>call.payload.max_tokens),[8000,16000]);
  assert.equal(deepseekCalls,2);assert.equal(tavilyCalls,0);assert.equal(storage.saves,0);
  assert.deepEqual(storage.project,beforeTruncation);
  const truncationError=(await twiceTruncated.json()).error;
  assert.match(truncationError,/DeepSeek 分析结果超过输出长度限制/u);
  assert.match(truncationError,/当前材料尚未保存.*附件仍保留/u);
  assert.match(truncationError,/未修改任何项目资料/u);
  assert.ok(!JSON.stringify(storage.project).includes("不应保存的截断"));

  reset();toolChoices=[lengthChoice];repairResponses=[plainReply];
  assert.equal((await POST(request({webSearch:false,allowWebSearch:false,section:"overview",message:"什么是探索性访谈？"}))).status,200);
  assert.deepEqual(modelCalls().map(call=>call.payload.max_tokens),[4000,8000]);
  assert.equal(storage.saves,1);assert.equal(storage.project.state.artifacts.length,0);

  // Format repair does not increase the budget unless DeepSeek reports length.
  for(const [formatRequest,reply,expectedBudget] of [
    [()=>request({webSearch:false,allowWebSearch:false,section:"overview",message:"什么是探索性访谈？"}),plainReply,4000],
    [interviewRequest,interviewReply,8000],
  ]){
    reset();toolChoices=[{finish_reason:"stop",message:{content:'{"reply":'}}];repairResponses=[reply];
    assert.equal((await POST(formatRequest())).status,200);
    assert.deepEqual(modelCalls().map(call=>call.payload.max_tokens),[expectedBudget,expectedBudget]);
    assert.equal(deepseekCalls,2);assert.equal(storage.saves,1);assert.equal(tavilyCalls,0);
  }

  reset();
  storage.project.state.hypotheses.push({id:"H01",version:1,text:"整理访谈需要大量时间",category:"用户",stage:"待探索",evidenceStatus:"未进入验证",priority:"高",nextStep:"访谈",support:[],opposition:[],history:[]});
  const references=[{name:"甲.docx",text:"甲的原话：整理资料耗时。"+"背景".repeat(5000)},{name:"乙.docx",text:"背景".repeat(5000)+"乙的原话：已有工具够用。乙给的使用场景"}];
  repairResponses=[{...plainReply,fields:{scene:"乙给的使用场景"},evidence:[{hypothesisId:"H01",quote:"整理资料耗时",direction:"support",source:"当前材料"},{hypothesisId:"H01",quote:"已有工具够用",direction:"opposition",source:"当前材料"},{hypothesisId:"H01",quote:"【用户材料 M02：乙.docx】",direction:"support",source:"当前材料"}],artifact:{title:"访谈分析",content:"受访者有不同经历",limitations:"两份记录不代表总体",nextStep:"继续访谈",sourceLabels:[],interview:{quotes:[{quote:"整理资料耗时",direction:"支持",sourceId:"M01"},{quote:"已有工具够用",direction:"反向",sourceId:"M02"}],limitations:"个体原话"}}}, {assessments:[{hypothesisId:"H01",hypothesisVersion:1,evidenceStatus:"证据不一致",rationale:"甲描述耗时，乙报告已有替代办法。",limitations:"访谈对象与记录质量需核对。",nextStep:"追问具体整理经历。",sourceIds:["M01","M02"],evidence:[{source:"M01",quote:"整理资料耗时",direction:"support",level:"E2",relevance:"描述过去整理的时间成本，缺少具体数值。",subject:"甲"},{source:"M02",quote:"已有工具够用",direction:"opposition",level:"E2",relevance:"现有办法可能减轻问题。",subject:"乙"}]}]}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"分析这两份访谈",references}))).status,200);
  assert.equal(storage.project.state.materials.length,2);
  assert.deepEqual(storage.project.state.materials.map(item=>item.name),["甲.docx","乙.docx"]);
  assert.equal(storage.project.state.materials[1].content,references[1].text);
  assert.ok(calls[0].payload.messages.at(-1).content.includes("乙的原话：已有工具够用"));
  assert.deepEqual(storage.project.state.hypotheses[0].evidenceRecords.map(item=>item.sourceId),["M01","M02"]);
  assert.deepEqual(storage.project.state.artifacts.at(-1).interview.quotes.map(item=>item.sourceId),["M01","M02"]);
  assert.equal(storage.project.state.fieldMeta.scene.sourceRef,"M02");
  assert.deepEqual(storage.project.state.hypotheses[0].evidenceRecords.map(item=>item.sourceId),["M01","M02"]);
  assert.equal(storage.project.state.artifacts[0].recordId,"A01");
  assert.deepEqual(storage.project.state.materials.map(item=>item.id),["M01","M02"]);

  for(const [changes,status] of [[{references:null},400],[{references:[{name:"空.docx",text:""}]},400],[{references:Array.from({length:6},()=>({name:"访谈.docx",text:"内容"}))},400],[{references:[{name:"长.docx",text:"字".repeat(12001)}]},413],[{references:Array.from({length:4},()=>({name:"满.docx",text:"字".repeat(12000)}))},413],[{references,referenceText:"重复提交"},400]]){
    reset();assert.equal((await POST(request({webSearch:false,...changes}))).status,status);assert.equal(storage.saves,0);assert.equal(deepseekCalls,0);
  }
  reset();
  assert.equal((await POST(request({webSearch:false,section:"research",message:"分析这两份问卷结果",references:[{name:"甲.xlsx",text:"题目,答案\nA,1"},{name:"乙.xlsx",text:"题目,答案\nB,2"}]}))).status,400);
  assert.equal(storage.saves,0);assert.equal(deepseekCalls,0);

  reset();repairResponses=[{...plainReply,artifact:{title:"答卷分布与限制",content:"大一两人、大二一人；满意两人、一般一人。仅为未清洗频数。",limitations:"样本量小，招募方式待核对",nextStep:"核对筛选与缺失值",sourceLabels:[]}}];
  const surveyResponse=await POST(request({webSearch:false,allowWebSearch:false,section:"research",message:"分析这份问卷结果",references:[{name:"问卷结果.xlsx",text:"年级,满意度\n大一,满意\n大二,一般\n大一,满意"}]}));
  assert.equal(surveyResponse.status,200);
  assert.equal(storage.project.state.materials[0].kind,"问卷数据");
  assert.equal(storage.project.state.artifacts[0].researchMode,"问卷调查");
  assert.match(storage.project.state.artifacts[0].content,/大一两人/u);
  assert.equal(storage.project.state.artifacts[0].survey.totalRows,3);
  assert.deepEqual(storage.project.state.artifacts[0].survey.columns[0].frequencies,[{value:"大一",count:2},{value:"大二",count:1}]);
  assert.match(calls.at(-1).payload.messages.at(-1).content,/程序从上传数据表计算/u);

  reset();repairResponses=[plainReply,{...plainReply,artifact:{title:"启动条件与变量计划",content:"现有证据不足以启动正式调查。先明确目标对象和可测量变量。",limitations:"尚无稳定的问题类别",nextStep:"补充探索性访谈",sourceLabels:[]}}];
  const surveyPlan=await POST(request({webSearch:false,allowWebSearch:false,section:"research",message:"检查当前证据能否启动问卷，并设计问卷方案与题目。"}));
  assert.equal(surveyPlan.status,200);
  assert.equal(deepseekCalls,2);
  assert.equal(storage.project.state.artifacts[0].recordId,"Q01");
  assert.equal(storage.project.state.artifacts[0].researchMode,"问卷调查");
  assert.equal(storage.project.state.messages.at(-1).artifactId,storage.project.state.artifacts[0].id);

  reset();
  storage.project.state.materials.push({id:"M09",name:"既有答卷.csv",kind:"其他",content:"年级,满意度\n大一,满意\n大二,一般\n大一,满意",at:"2026-10-12T00:00:00Z"});
  assert.equal((await POST(request({webSearch:false,section:"research",message:"分析已保存的问卷数据 M99",materialId:"M99"}))).status,404);
  assert.equal((await POST(request({webSearch:false,section:"research",message:"分析已保存的问卷数据 M09",materialId:"M09",references:[{name:"重复.csv",text:"A,B\n1,2"}]}))).status,400);
  assert.equal(storage.saves,0);
  repairResponses=[{...plainReply,artifact:{title:"已保存答卷分析",content:"当前样本为三行答卷；满意两人，一般一人。",limitations:"尚未清洗",nextStep:"核对样本来源",sourceLabels:[]}}];
  const savedSurveyResponse=await POST(request({webSearch:false,allowWebSearch:false,section:"research",message:"分析已保存的问卷数据 M09",materialId:"M09",references:[]}));
  assert.equal(savedSurveyResponse.status,200);
  assert.equal(storage.project.state.materials.length,1);
  assert.equal(storage.project.state.materials[0].kind,"问卷数据");
  assert.equal(storage.project.state.artifacts[0].recordId,"Q01");
  assert.equal(storage.project.state.artifacts[0].survey.sourceId,"M09");
  assert.match(storage.project.state.artifacts[0].content,/满意两人/u);
  assert.equal(storage.project.state.messages.at(-1).artifactId,storage.project.state.artifacts[0].id);
  assert.ok(calls.at(-1).payload.messages.at(-1).content.includes("大一,满意"));

  // Conversation evidence is synchronized without requiring an upload or confirmation.
  reset();
  const statement="我昨天整理访谈花了两个小时。";
  const hypothesis={text:"大学生整理访谈需要大量时间",category:"用户",priority:"高",nextStep:"继续访谈"};
  repairResponses=[{...plainReply,hypothesis,evidence:[{hypothesisId:"H01",quote:"整理访谈花了两个小时",direction:"support",source:"当前对话"},{hypothesisId:"H01",quote:"不存在的证据",direction:"support",source:"当前对话"}]}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:statement,allowWebSearch:false}))).status,200);
  assert.equal(storage.project.state.pending,null);
  assert.equal(storage.project.state.hypotheses.length,1);
  const originalMessage=storage.project.state.messages.at(-2);
  assert.equal(storage.project.state.hypotheses[0].evidenceRecords.length,1);
  assert.equal(storage.project.state.hypotheses[0].evidenceRecords[0].sourceId,originalMessage.id);
  assert.equal(storage.project.state.hypotheses[0].evidenceStatus,"已有材料待评估");
  assert.equal(storage.project.state.materials.length,0);
  const reread=await readProject(new Request("https://example.com/api/project",{headers:{cookie}}));
  assert.equal(reread.status,200);
  assert.deepEqual((await reread.json()).state.hypotheses,storage.project.state.hypotheses);
  // A repeated reference is deduplicated; assistant output is never an evidence source.
  repairResponses=[{...plainReply,evidence:[{hypothesisId:"H01",quote:"整理访谈花了两个小时",direction:"support",source:originalMessage.id},{hypothesisId:"H01",quote:plainReply.reply,direction:"support",source:storage.project.state.messages.at(-1).id}]}];
  assert.equal((await POST(request({webSearch:false,section:"hypotheses",message:"继续记录已有经历",allowWebSearch:false}))).status,200);
  assert.equal(storage.project.state.hypotheses[0].evidenceRecords.length,1);
  // Same-turn substantive revisions keep old-version and revised-version quotes apart.
  repairResponses=[{...plainReply,hypothesis:{...hypothesis,targetId:"H01",text:"大学生每次整理访谈需要两个小时",changeKind:"实质修订"},evidence:[{hypothesisId:"H01",quote:"整理访谈花了两个小时",source:originalMessage.id,direction:"support",versionTarget:"current"},{hypothesisId:"H01",quote:"整理访谈花了两个小时",source:originalMessage.id,direction:"boundary",versionTarget:"revised"}]}];
  assert.equal((await POST(request({webSearch:false,section:"hypotheses",message:"修订假设为每次整理访谈需要两个小时",allowWebSearch:false}))).status,200);
  assert.equal(storage.project.state.hypotheses[0].version,2);
  assert.equal(storage.project.state.hypotheses[0].history[0].evidenceRecords.length,1);
  assert.equal(storage.project.state.hypotheses[0].evidenceRecords[0].hypothesisVersion,2);
  assert.equal(storage.project.state.hypotheses[0].evidenceRecords[0].direction,"boundary");
  // Reading older workspaces saves their pending record exactly once and links it to chat.
  reset();
  storage.project.state.pending={...plainReply,id:"old-pending",artifact:{section:"research",title:"访谈提纲",content:"完整问题：请回忆最近一次经历。",sources:[],limitations:"未试访",nextStep:"试访"},createdAt:"2026-10-10"};
  storage.project.state.messages.push({id:"old-reply",role:"assistant",content:"提纲已生成",at:"2026-10-10"});
  const migrated=await readProject(new Request("https://example.com/api/project",{headers:{cookie}}));
  assert.equal(migrated.status,200);
  assert.equal(storage.project.state.pending,null);
  assert.equal(storage.project.state.artifacts[0].recordId,"A01");
  assert.equal(storage.project.state.messages.at(-1).artifactId,"old-pending");
  const migratedSaves=storage.saves;
  assert.equal((await readProject(new Request("https://example.com/api/project",{headers:{cookie}}))).status,200);
  assert.equal(storage.saves,migratedSaves);
  assert.equal(storage.project.state.artifacts.length,1);
  assert.equal((await readProject(new Request("https://example.com/api/project"))).status,401);

  // Repeated overview fields must not create confirmations or overwrite saved provenance.
  reset();
  const savedMeta={origin:"用户原话",statementKind:"陈述",confirmation:"用户已确认",verification:"已有材料待评估",sourceRef:"M01",updatedAt:"2026-10-01"};
  storage.project.state.fieldMeta={solution:savedMeta};
  repairResponses=[{...plainReply,fields:{...state.fields,scene:"工作日上班前"},projectTitle:state.title,fieldStatuses:{solution:"初步设想",scene:"用户陈述"}}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"补充使用场景：工作日上班前"}))).status,200);
  assert.equal(storage.project.state.pending,null);
  assert.equal(storage.project.state.fieldStatuses.scene,"用户陈述");
  assert.equal(storage.project.state.fieldMeta.scene.confirmation,"自动记录");
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
  assert.equal(storage.project.state.artifacts.at(-1).section,"canvas");
  assert.equal(storage.project.state.artifacts.at(-1).canvas.modules.length,9);
  assert.equal(storage.project.state.messages.at(-1).task.section,"canvas");
  assert.match(calls[0].payload.messages[0].content,/KB10/u);
  assert.equal(storage.project.state.artifacts.at(-1).section,"canvas");

  reset();
  repairResponses=[{...plainReply,artifact:{title:"测试数据复盘",content:"按提供的数据解读",limitations:"口径待核",nextStep:"核对测试对象",sourceLabels:[]}}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"分析这份测试数据漏斗",referenceText:"阶段,人数\n访问,100\n报名,20"}))).status,200);
  assert.equal(storage.project.state.artifacts.at(-1).section,"research");
  assert.equal(storage.project.state.artifacts.at(-1).funnel.stages[1].rate,20);
  assert.equal(storage.project.state.materials[0].kind,"测试数据");
  assert.match(calls[0].payload.messages[0].content,/KB14/u);

  reset();repairResponses=[{...plainReply,artifact:canvasArtifact},{...plainReply,artifact:canvasArtifact}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"生成八维创意诊断"}))).status,500);
  assert.equal(deepseekCalls,2);assert.equal(storage.saves,0);
  assert.equal(storage.project.state.pending,null);

  // The scoring contract rejects missing/out-of-range values before any save.
  const scoreDimensions=diagnosisNames.map((name,i)=>({name,attention:"需要关注",priority:"中",judgment:"有材料支持的阶段判断",sourceRefs:["M02"],hypothesisRefs:[],limitations:"样本范围有限",riskImpact:"仍有待验证条件",nextStep:"补充行为验证",score:i%5,scoreReason:"完整满足当前分档，较高等级仍需材料",scoreConfidence:"中",scoreTriggerRefs:["M02"]}));
  const scoringArtifact={title:"八维评分诊断",content:"模型原始正文",limitations:"材料需核对",nextStep:"继续验证",sourceLabels:[],diagnosis:{summary:"阶段诊断",keyRisk:"样本有限",firstQuestion:"验证行为",dimensions:scoreDimensions}};
  reset();storage.project.state.materials=[{id:"M02",name:"访谈记录",content:"多名目标用户的近期经历和实际行为材料。",at:new Date().toISOString()}];
  repairResponses=[{...plainReply,artifact:scoringArtifact}];
  assert.equal((await POST(request({webSearch:false,section:"diagnosis",message:"生成八维创意诊断",allowWebSearch:false}))).status,200);
  const scored=storage.project.state.artifacts.at(-1);
  assert.equal(scored.diagnosis.scoringVersion,"kb04-radar-v1");
  assert.deepEqual(scored.diagnosis.dimensions.map(d=>d.score),scoreDimensions.map(d=>d.score));
  assert.ok(scored.diagnosis.dimensions.every(d=>d.scoreUpdatedAt && d.scoreReason));
  assert.match(scored.content,/分值：4 \/ 4/u);assert.match(scored.content,/评分依据/u);
  assert.match(calls[0].payload.messages[0].content,/真实付款/u);
  for(const invalid of [undefined,-1,5,1.5]){
    reset();
    const bad=structuredClone(scoringArtifact);bad.diagnosis.dimensions[0].score=invalid;
    repairResponses=[{...plainReply,artifact:bad},{...plainReply,artifact:bad}];
    assert.equal((await POST(request({webSearch:false,section:"diagnosis",message:"生成八维诊断",allowWebSearch:false}))).status,500);
    assert.equal(deepseekCalls,2);assert.equal(storage.saves,0);
  }
  reset();
  const ungrounded=structuredClone(scoringArtifact);ungrounded.diagnosis.dimensions.forEach(d=>{d.score=4;d.sourceRefs=["nonexistent"];d.scoreTriggerRefs=["nonexistent"]});
  repairResponses=[{...plainReply,artifact:ungrounded}];
  assert.equal((await POST(request({webSearch:false,section:"diagnosis",message:"生成八维诊断",allowWebSearch:false}))).status,200);
  assert.ok(storage.project.state.artifacts.at(-1).diagnosis.dimensions.every(d=>d.score===0));
  assert.ok(!storage.project.state.artifacts.at(-1).content.includes("分值：4 / 4"));

  // Revising an outline must save a full analysis record, without consuming material IDs.
  reset();
  const outline={title:"校园访谈提纲",content:"一、招募对象\n近期有挑选衣服经历的大学生。\n二、问题\n请回忆上次挑选衣服的过程。"+"\n其他经历追问。".repeat(180)+"\n末尾问题：还有什么容易被忽略的情况？",limitations:"提纲尚未试访",nextStep:"试访两人",sourceLabels:[]};
  storage.project.state.materials=[{id:"M07",name:"原始访谈.docx",content:"访谈原文：挑选衣服花了二十分钟。",at:"2026-10-10"}];
  storage.project.state.artifacts=[{...outline,sourceLabels:undefined,sources:[],id:"old-outline-uuid",section:"research",version:1,createdAt:"2026-10-09"},{...outline,sourceLabels:undefined,sources:[],id:"old-canvas-uuid",section:"canvas",title:"商业画布",version:1,createdAt:"2026-10-09"}];
  const revised={...outline,content:outline.content+"\n第三题：当时尝试了哪些解决方式？"};
  repairResponses=[{...plainReply,reply:"新版访谈提纲只在聊天里。"},{...plainReply,reply:"已生成新版，请自动同步保存。",artifact:revised}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"优化新版访谈提纲"}))).status,200);
  assert.equal(deepseekCalls,2);
  assert.ok(calls[0].payload.messages[0].content.includes("末尾问题：还有什么容易被忽略的情况？"));
  assert.equal(storage.project.state.artifacts.at(-1).section,"research");
  assert.equal(storage.project.state.artifacts.length,3);
  const firstDraft=structuredClone(storage.project.state.artifacts.at(-1)), confirmedBeforeChat=structuredClone(storage.project.state.artifacts);
  const beforeFailedReply=structuredClone(storage.project),savesBeforeFailedReply=storage.saves;
  toolChoices=[{finish_reason:"stop",message:{content:"not JSON"}},{finish_reason:"stop",message:{content:"still not JSON"}}];
  assert.equal((await POST(request({webSearch:false,section:"research",message:"为什么要问这个问题？"}))).status,500);
  assert.deepEqual(storage.project,beforeFailedReply);assert.equal(storage.saves,savesBeforeFailedReply);
  repairResponses=[{...plainReply,reply:"这道题用来了解受访者的实际经历。"}];
  assert.equal((await POST(request({webSearch:false,section:"research",message:"为什么要问这个问题？"}))).status,200);
  assert.equal(storage.project.state.pending,null);
  assert.deepEqual(storage.project.state.artifacts,confirmedBeforeChat);
  assert.ok(calls.at(-1).payload.messages[0].content.includes("项目修改和成果会随成功对话自动保存"));
  assert.ok(calls.at(-1).payload.messages[0].content.includes("第三题：当时尝试了哪些解决方式？"));
  repairResponses=[{...plainReply,artifact:{...revised,title:"M05 · 校园访谈提纲",content:revised.content+"\n自动保存后追加追问：为什么选择这种方式？"}}];
  assert.equal((await POST(request({webSearch:false,section:"overview",message:"修改第三个问题，增加选择原因的追问"}))).status,200);
  assert.equal(storage.project.state.artifacts.at(-1).title,"校园访谈提纲");
  assert.ok(storage.project.state.artifacts.at(-1).content.includes("自动保存后追加追问"));
  assert.ok(calls.at(-1).payload.messages[0].content.includes('"currentInterviewOutline"'));
  assert.notEqual(storage.project.state.artifacts.at(-1).id,firstDraft.id);
  assert.equal((await confirm(new Request("https://example.com/api/confirm",{method:"POST",headers:{cookie},body:JSON.stringify({projectId:state.id,proposalId:firstDraft.id,accept:true})}))).status,409);
  assert.deepEqual(storage.project.state.artifacts.slice(0,-1),confirmedBeforeChat);
  assert.deepEqual(storage.project.state.artifacts.map(item=>item.recordId),["A01","B01","A02","A03"]);
  assert.equal(storage.project.state.artifacts.at(-1).version,3);
  assert.equal(storage.project.state.artifacts[0].id,"old-outline-uuid");
  assert.equal(storage.project.state.artifacts[0].content,outline.content);
  assert.ok(storage.project.state.artifacts.at(-1).content.includes("自动保存后追加追问"));
  assert.deepEqual(storage.project.state.materials.map(item=>item.id),["M07"]);

  repairResponses=[{...plainReply,artifact:{...revised,content:revised.content+"\n追加追问：还有其他选择吗？"}}];
  assert.equal((await POST(request({webSearch:false,section:"research",message:"调整第三个问题，让提问更开放"}))).status,200);
  assert.equal(storage.project.state.artifacts.at(-1).section,"research");
  assert.equal(storage.project.state.artifacts.at(-1).recordId,"A04");
  assert.equal(storage.project.state.artifacts.at(-1).version,4);

  repairResponses=[{...plainReply,artifact:revised}];
  assert.equal((await POST(request({webSearch:false,section:"research",message:"更新访谈提纲，参考这份访谈记录",references:[{name:"补充访谈.docx",text:"补充原文：还会问同学的意见。"}]}))).status,200);
  assert.equal(storage.project.state.materials.at(-1).id,"M08");
  assert.match(calls.at(-1).payload.messages.at(-1).content,/用户材料 M08：补充访谈.docx/u);
  assert.equal(storage.project.state.artifacts.at(-1).recordId,"A05");
  assert.deepEqual(storage.project.state.materials.map(item=>item.id),["M07","M08"]);
  assert.ok(storage.project.state.artifacts.at(-1).sources.some(source=>source.label.includes("M08")));

  const savedBeforeMissing=structuredClone(storage.project), savesBeforeMissing=storage.saves;
  repairResponses=[plainReply,{...plainReply,artifact:{...outline,content:" "}}];
  assert.equal((await POST(request({webSearch:false,section:"research",message:"重新生成访谈提纲"}))).status,500);
  assert.equal(storage.saves,savesBeforeMissing);
  assert.deepEqual(storage.project,savedBeforeMissing);
  repairResponses=[plainReply];
  assert.equal((await POST(request({webSearch:false,section:"research",message:"访谈提纲怎么优化？"}))).status,200);
  assert.equal(storage.project.state.pending,null);
  assert.equal(storage.project.state.artifacts.length,6);

  // Competition edits use their own small format and the complete saved source set.
  reset();
  const oldComparison={...normalized,competitors:[normalized.competitors[0],{name:"Excel",kind:"替代方式",audience:"待核实",task:"待核实",feature:"待核实",price:"待核实",limitation:"待核实",sourceId:"",sourceQuote:"",sourceDate:"",verification:"待核实"}]};
  const oldCompetitionRecord={id:"old-competition-uuid",recordId:"C01",section:"competitors",title:"联网竞品比较",content:"候选产品与来源见展开内容。",sources:snapshot.results.map(source=>({label:source.id,url:source.url,detail:source.content,retrievedAt:snapshot.searchedAt})),limitations:"网页仍待核对",nextStep:"回查定价",version:1,createdAt:"2026-10-09",competition:oldComparison};
  storage.project.state.artifacts=[structuredClone(oldCompetitionRecord)];
  storage.project.state.materials=[{id:"M07",content:"较早的用户材料。",at:"2026-10-09"}];
  const revisionRequest=message=>request({webSearch:false,section:"competitors",message,allowWebSearch:false});
  repairResponses=[{fields:null,evidence:null,artifact:{diagnosis:null,content:null,sourceLabels:null,competition:{competitors:[{name:"Dovetail",kind:"间接竞品",price:null,citations:null}],gap:"先验证小团队是否需要更轻量的工具",unknowns:null}}}];
  assert.equal((await POST(revisionRequest("把Dovetail的类别改成间接竞品，修改竞品差异分析"))).status,200);
  assert.equal(tavilyCalls,0);
  assert.equal(deepseekCalls,1);
  assert.equal(calls[0].payload.tools,undefined);
  const revisionContext=JSON.parse(calls[0].payload.messages.at(-1).content);
  assert.equal(revisionContext.savedCompetition.competitors[0].price,"$29 per month");
  assert.deepEqual(revisionContext.savedCompetition.webSearch,snapshot);
  assert.equal(storage.project.state.artifacts.at(-1).competition.competitors.length,2);
  assert.equal(storage.project.state.artifacts.at(-1).competition.competitors[0].kind,"间接竞品");
  assert.equal(storage.project.state.artifacts.at(-1).competitors,undefined);
  assert.deepEqual(storage.project.state.artifacts.at(-1).competition.competitors[0].citations,oldComparison.competitors[0].citations);
  assert.deepEqual(storage.project.state.artifacts.at(-1).competition.competitors[1],oldComparison.competitors[1]);
  assert.deepEqual(storage.project.state.artifacts.at(-1).sources,oldCompetitionRecord.sources);
  assert.equal(storage.project.state.artifacts.length,2);
  assert.equal(storage.project.state.artifacts.at(-1).version,2);
  assert.equal(storage.project.state.artifacts.at(-1).recordId,"C02");
  assert.deepEqual(storage.project.state.artifacts[0],oldCompetitionRecord);
  assert.deepEqual(storage.project.state.fields,state.fields);

  const priceEdit={changes:{competitors:[{index:1,price:"99元",citations:null}],unknowns:null}};
  repairResponses=[priceEdit];
  assert.equal((await POST(revisionRequest("把Dovetail的价格改成99元"))).status,200);
  let revisedProduct=storage.project.state.artifacts.at(-1).competition.competitors[0];
  assert.equal(revisedProduct.price,"99元");
  assert.deepEqual(revisedProduct.unverifiedFields,["price"]);
  assert.equal(revisedProduct.verification,"待核实");
  assert.ok(!revisedProduct.citations.some(citation=>citation.field === "price"));
  assert.equal(storage.project.state.artifacts.length,3);
  assert.equal(storage.project.state.artifacts.at(-1).competition.competitors[0].price,"99元");

  repairResponses=[{changes:{competitors:[{index:1,feature:"访谈内容整理",citations:[{field:"feature",sourceId:"W01",quote:"analyze interviews",url:"https://forged.example"}]}]}}];
  assert.equal((await POST(revisionRequest("修改Dovetail功能的表述"))).status,200);
  revisedProduct=storage.project.state.artifacts.at(-1).competition.competitors[0];
  assert.equal(revisedProduct.feature,"访谈内容整理");
  assert.equal(revisedProduct.citations.find(citation=>citation.field === "feature").url,"https://example.com/dovetail");
  assert.equal(revisedProduct.citations.find(citation=>citation.field === "feature").retrievedAt,snapshot.searchedAt);
  assert.equal(revisedProduct.price,"99元");

  repairResponses=[{changes:{removeIndices:[2]}}];
  assert.equal((await POST(revisionRequest("删除Excel"))).status,200);
  assert.equal(storage.project.state.artifacts.at(-1).competition.competitors.length,1);
  assert.equal(storage.project.state.artifacts.at(-2).competition.competitors.length,2);

  repairResponses=[{changes:{add:[{name:"BetaTool",kind:"候选产品",sourceId:"M08",sourceQuote:"BetaTool supports interview summaries.",feature:"访谈总结",price:"捏造价格",citations:[{field:"feature",sourceId:"M08",quote:"interview summaries"}]}]}}];
  assert.equal((await POST(request({webSearch:false,section:"competitors",message:"添加BetaTool到竞品表",references:[{name:"产品资料.docx",text:"BetaTool supports interview summaries."}]}))).status,200);
  const newProduct=storage.project.state.artifacts.at(-1).competition.competitors.at(-1);
  assert.equal(newProduct.name,"BetaTool");
  assert.equal(newProduct.feature,"访谈总结");
  assert.equal(newProduct.price,"待核实");
  assert.equal(newProduct.sourceId,"M08");
  assert.equal(newProduct.citations[0].sourceId,"M08");
  assert.equal(storage.project.state.artifacts.at(-1).version,6);
  assert.deepEqual(storage.project.state.materials.map(material=>material.id),["M07","M08"]);

  const beforeFailedEdit=structuredClone(storage.project), savesBeforeFailedEdit=storage.saves;
  repairResponses=[plainReply,{changes:{competitors:[{index:99,kind:"替代方式"}]}}];
  const failedEdit=await POST(revisionRequest("修改竞品表格中的类别"));
  assert.equal(failedEdit.status,502);
  assert.match((await failedEdit.json()).error,/竞品修改未完成.*原竞品记录和来源未修改/u);
  assert.deepEqual(storage.project,beforeFailedEdit);
  assert.equal(storage.saves,savesBeforeFailedEdit);
  assert.equal(tavilyCalls,0);

  repairResponses=[{changes:{title:"修订后的竞品比较",limitations:"旧网页需要回查",nextStep:"核对官网定价"}}];
  assert.equal((await POST(revisionRequest("修改表格标题和下一步"))).status,200);
  assert.equal(storage.project.state.artifacts.at(-1).title,"修订后的竞品比较");
  assert.equal(storage.project.state.artifacts.at(-1).nextStep,"核对官网定价");
  assert.deepEqual(storage.project.state.artifacts.at(-1).competition,storage.project.state.artifacts.at(-1).competition);

  // Requests for fresh facts still search; ordinary wording edits do not.
  repairResponses=[modelOutput];
  assert.equal((await POST(request({webSearch:false,section:"competitors",message:"联网更新竞品的最新价格"}))).status,200);
  assert.equal(tavilyCalls,1);
  assert.equal(storage.project.state.artifacts.at(-1).competition.webSearch.results.length,2);
  repairResponses=[{changes:{competitors:[{index:1,price:"待核实"}]}}];
  assert.equal((await POST(revisionRequest("不要联网，修改竞品最新价格为待核实"))).status,200);
  assert.equal(tavilyCalls,1);

  const networkMock=globalThis.fetch;
  const originalTimeout=AbortSignal.timeout;
  try {
    reset();AbortSignal.timeout=()=>AbortSignal.abort();
    globalThis.fetch=async(url,options)=>{
      if(url==="https://api.deepseek.com/chat/completions"&&options.signal.aborted)throw new DOMException("timeout","TimeoutError");
      return networkMock(url,options);
    };
    const timedOut=await POST(request());
    assert.equal(timedOut.status,200);const timeoutResult=await timedOut.json();assert.match(timeoutResult.state.messages.at(-1).searchWarning,/整理网页超时/u);
    assert.equal(storage.saves,1);assert.equal(timeoutResult.state.messages.at(-1).webSearch.results.length,2);
    assert.equal(timeoutResult.state.artifacts.at(-1).competition.competitors.length,0);
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
  // Selections survive successive searches without changing original evidence.
  reset();
  let round = 0, candidates = [], revisionOutput;
  globalThis.fetch = async url => {
    if (url === "https://api.tavily.com/search") return Response.json({results:candidates.map((name,index)=>({
      title:name,url:`https://example.com/round-${round}/${index}`,published_date:`2026-10-0${round}`,
      content:`${name} helps research teams analyze interviews. Pro costs $${round * 10} per month.`,
    }))});
    if (url === "https://api.deepseek.com/chat/completions") return Response.json({choices:[{message:{content:JSON.stringify(revisionOutput || {
      competition:{scope:`Round ${round}`,competitors:candidates.map((name,index)=>({
        ...competitor,name,price:`$${round * 10} per month`,sourceId:`W0${index + 1}`,
        sourceQuote:`${name} helps research teams analyze interviews.`,
        citations:[{field:"price",sourceId:`W0${index + 1}`,quote:`$${round * 10} per month`}],
      })),gap:"待验证",counterExplanation:"仍需研究",unknowns:[]},
    })},finish_reason:"stop"}]});
    throw Error("Unexpected retention test request");
  };
  async function nextSearch(names) {
    candidates=names;round++;revisionOutput=undefined;
    const response=await POST(request());
    assert.equal(response.status,200);
    return currentCompetition((await response.json()).state);
  }
  const retentionRequest=(selection,retained,changes={},authenticated=true)=>new Request("https://example.com/api/competitors/selection",{
    method:"POST",headers:{"content-type":"application/json",...(authenticated?{cookie}:{})},
    body:JSON.stringify({projectId:state.id,revision:storage.project.revision,
      artifactId:selection.artifactId,competitorIndex:selection.competitorIndex,retained,...changes}),
  });
  let view=await nextSearch(["Alpha","Beta","Gamma"]);
  assert.deepEqual(view.rows.map(row=>row.retained),[false,false,false]);
  delete storage.project.state.competitionWorkspace; // Legacy projects need no database migration.
  view=currentCompetition(storage.project.state);
  const alpha=structuredClone(view.rows[0]), gamma=structuredClone(view.rows[2]);
  const firstRecord=structuredClone(storage.project.state.artifacts[0]);
  const savesBeforeInvalid=storage.saves;
  assert.equal((await selectCompetitor(retentionRequest(alpha,true,{},false))).status,401);
  assert.equal((await selectCompetitor(retentionRequest(alpha,true,{projectId:"team-tester2"}))).status,403);
  for (const changes of [{retained:"true"},{competitorIndex:-1},{competitorIndex:0.5},{revision:"1"}])
    assert.equal((await selectCompetitor(retentionRequest(alpha,true,changes))).status,400);
  assert.equal((await selectCompetitor(retentionRequest(alpha,true,{revision:0}))).status,409);
  assert.equal((await selectCompetitor(retentionRequest(alpha,true,{competitorIndex:99}))).status,409);
  assert.equal(storage.saves,savesBeforeInvalid);
  assert.equal((await selectCompetitor(retentionRequest(alpha,true))).status,200);
  assert.equal((await selectCompetitor(retentionRequest(gamma,true))).status,200);
  let persisted=(await (await readProject(new Request("https://example.com/api/project",{headers:{cookie}}))).json()).state;
  assert.deepEqual(currentCompetition(persisted).rows.map(row=>row.retained),[true,false,true]);
  assert.deepEqual(storage.project.state.artifacts[0],firstRecord);

  view=await nextSearch([" ALPHA ","Beta","Delta"]);
  assert.deepEqual(view.rows.map(row=>row.competitor.name),["Alpha","Gamma","Beta","Delta"]);
  assert.deepEqual(view.rows[0].competitor,alpha.competitor);
  assert.deepEqual(view.rows[1].competitor,gamma.competitor);
  assert.equal(view.rows[2].competitor.price,"$20 per month");
  assert.equal(view.artifact.competition.webSearch.results[0].url,"https://example.com/round-2/0");
  assert.equal(view.rows[0].competitor.citations[0].url,"https://example.com/round-1/0");
  assert.deepEqual(storage.project.state.artifacts[0],firstRecord);
  assert.ok(view.artifact.sources.some(source=>source.url === "https://example.com/round-1/0"));
  const {applyCompetitionRevision}=await get("competitor-analysis");
  const overlappingSource={...view.artifact.competition,competitors:[alpha.competitor],webSearch:{
    query:"同一摘录的新页面",searchedAt:"2026-10-10T12:00:00Z",results:[{id:"W01",title:"Alpha",url:"https://example.com/new-source",content:"Pro costs $10 per month."}],
  }};
  const sameCitation=applyCompetitionRevision(JSON.stringify({changes:{competitors:[{index:1,price:"每月10美元",citations:[{field:"price",sourceId:"W01",quote:"$10 per month"}]}]}}),overlappingSource,storage.project.state,"修改价格表述");
  assert.equal(sameCitation.competitors[0].citations[0].url,alpha.competitor.citations[0].url);
  assert.equal(sameCitation.competitors[0].citations[0].retrievedAt,alpha.competitor.citations[0].retrievedAt);
  const oldBeta={artifactId:firstRecord.id,competitorIndex:1};
  assert.equal((await selectCompetitor(retentionRequest(oldBeta,true))).status,409);

  view=await nextSearch(["Epsilon"]);
  assert.deepEqual(view.rows.map(row=>row.competitor.name),["Alpha","Gamma","Epsilon"]);
  storage.project.state=JSON.parse(JSON.stringify(storage.project.state));
  persisted=(await (await readProject(new Request("https://example.com/api/project",{headers:{cookie}}))).json()).state;
  assert.deepEqual(currentCompetition(persisted).rows.map(row=>row.retained),[true,true,false]);
  assert.equal((await selectCompetitor(retentionRequest(alpha,false))).status,200);
  assert.deepEqual(currentCompetition(storage.project.state).rows.map(row=>row.competitor.name),["Alpha","Gamma","Epsilon"]);
  view=await nextSearch(["Zeta"]);
  assert.deepEqual(view.rows.map(row=>row.competitor.name),["Gamma","Zeta"]);
  assert.equal((await selectCompetitor(retentionRequest(view.rows[1],true))).status,200);

  // A wording edit still addresses the visible retained row and keeps its selection.
  revisionOutput={changes:{competitors:[{index:1,kind:"替代方式"}]}};
  const retainedRevision=await POST(revisionRequest("修改Gamma的类别为替代方式"));
  assert.equal(retainedRevision.status,200,await retainedRevision.text());
  view=currentCompetition(storage.project.state);
  assert.deepEqual(view.rows.map(row=>row.competitor.name),["Gamma","Zeta"]);
  assert.deepEqual(view.rows.map(row=>row.retained),[true,true]);
  assert.equal(view.rows[0].competitor.kind,"替代方式");
  assert.equal(view.rows[0].competitor.sourceUrl,gamma.competitor.sourceUrl);
  view=await nextSearch(["Eta"]);
  assert.deepEqual(view.rows.map(row=>row.competitor.name),["Gamma","Zeta","Eta"]);
  assert.equal(view.rows[0].competitor.kind,"替代方式");
  // A completed search with no extractable products still keeps selected rows.
  revisionOutput={competition:{scope:"空比较",competitors:[],gap:"待核实",counterExplanation:"",unknowns:[]}};
  assert.equal((await POST(request())).status,200);
  view=currentCompetition(storage.project.state);
  assert.deepEqual(view.rows.map(row=>row.competitor.name),["Gamma","Zeta"]);
  const beforeRetentionFailure=structuredClone(storage.project);
  storage.conflict=true;
  assert.equal((await selectCompetitor(retentionRequest(view.rows[0],false))).status,409);
  assert.deepEqual(storage.project,beforeRetentionFailure);
  storage.conflict=false;
  globalThis.fetch=async()=>Response.json({results:[]});
  assert.equal((await POST(request())).status,422);
  assert.deepEqual(storage.project,beforeRetentionFailure);
  // Completed user checking updates the table, including unchanged values, and survives reload.
  globalThis.fetch=networkMock;
  reset();
  storage.project.state.artifacts=[structuredClone(oldCompetitionRecord)];
  repairResponses=[priceEdit];
  assert.equal((await POST(revisionRequest("把Dovetail的价格改成99元"))).status,200);
  const beforeUserConfirmation=structuredClone(storage.project.state.artifacts.at(-1));
  const confirmationMessage="Dovetail的价格我已经核实过了，就是99元";
  repairResponses=[{changes:{competitors:[{index:1,verifiedFields:["price","audience"],confirmationQuote:confirmationMessage}]}}];
  assert.equal((await POST(revisionRequest(confirmationMessage))).status,200);
  revisedProduct=currentCompetition(storage.project.state).rows[0].competitor;
  assert.equal(revisedProduct.price,"99元");
  assert.equal(revisedProduct.unverifiedFields,undefined);
  assert.equal(revisedProduct.verification,"部分字段已核实");
  assert.equal(revisedProduct.userVerifications.price.quote,confirmationMessage);
  assert.equal(revisedProduct.userVerifications.audience,undefined);
  assert.ok(!revisedProduct.citations.some(citation=>citation.field === "price"));
  assert.deepEqual(currentCompetition(storage.project.state).rows[1].competitor,oldComparison.competitors[1]);
  assert.deepEqual(storage.project.state.artifacts.at(-2),beforeUserConfirmation);
  assert.equal(tavilyCalls,0);
  persisted=(await (await readProject(new Request("https://example.com/api/project",{headers:{cookie}}))).json()).state;
  assert.deepEqual(currentCompetition(persisted).rows[0].competitor.userVerifications,revisedProduct.userVerifications);
  const checkedOnline="我已经联网核实了Dovetail的最新价格，就是99元";
  repairResponses=[{changes:{competitors:[{index:1,verifiedFields:["price"],confirmationQuote:checkedOnline}]}}];
  assert.equal((await POST(request({webSearch:false,section:"competitors",message:checkedOnline,allowWebSearch:true}))).status,200);
  assert.equal(tavilyCalls,0);

  const {planConversation}=await get("workflow");
  for (const message of ["我已经核实了Dovetail的价格", "Dovetail价格核对过了，99元", "Dovetail的功能确认无误"]) {
    assert.equal(planConversation("overview",message,"",false,persisted).section,"competitors");
    assert.equal(planConversation("competitors",message,"",false,persisted).createArtifact,true);
  }
  for (const message of ["我没有核实Dovetail的价格", "Dovetail的价格已经核实了吗？", "如果我已经核实了价格", "我已经核实了价格但不要修改表格"]) {
    const edit={changes:{competitors:[{index:1,verifiedFields:["price"],confirmationQuote:message}]}};
    const pending={...oldComparison,competitors:[beforeUserConfirmation.competition.competitors[0]]};
    const applied=applyCompetitionRevision(JSON.stringify(edit),pending,persisted,message);
    assert.equal(planConversation("competitors",message,"",false,persisted).createArtifact,false);
    assert.equal(applied.competitors[0].userVerifications,undefined);
  }
  const falseClaim=applyCompetitionRevision(JSON.stringify({changes:{competitors:[{index:1,verifiedFields:["price"],confirmationQuote:"价格我已经核实了"}]}}),oldComparison,persisted,"价格还不知道");
  assert.equal(falseClaim.competitors[0].userVerifications,undefined);
  const unknownClaim=applyCompetitionRevision(JSON.stringify({changes:{competitors:[{index:2,verifiedFields:["price"],confirmationQuote:"Excel的价格我已经核实了"}]}}),oldComparison,persisted,"Excel的价格我已经核实了");
  assert.equal(unknownClaim.competitors[1].price,"待核实");
  assert.equal(unknownClaim.competitors[1].userVerifications,undefined);
  const laterCorrection=applyCompetitionRevision(JSON.stringify({changes:{competitors:[{index:1,price:"199元"}]}}),currentCompetition(persisted).artifact.competition,persisted,"把Dovetail价格改成199元");
  assert.equal(laterCorrection.competitors[0].userVerifications,undefined);
  assert.deepEqual(laterCorrection.competitors[0].unverifiedFields,["price"]);
  const sameValueEvidence=applyCompetitionRevision(JSON.stringify({changes:{competitors:[{index:1,price:"$29 per month",citations:[{field:"price",sourceId:"W02",quote:"$29 per month"}]}]}}),{...oldComparison,competitors:[{...oldComparison.competitors[0],citations:[],unverifiedFields:["price"],verification:"待核实"}]},persisted,"补充价格依据");
  assert.equal(sameValueEvidence.competitors[0].unverifiedFields,undefined);
  assert.ok(sameValueEvidence.competitors[0].citations.some(citation=>citation.field === "price"));

  // Acknowledgement-only model output must not prevent the actual status from being saved.
  reset();
  storage.project.state.artifacts=[{...structuredClone(oldCompetitionRecord),competition:{...structuredClone(oldComparison),unknowns:["Dovetail价格需要核实","Excel价格需要核实"]}}];
  storage.project.state.messages=[{role:"user",content:"把Dovetail的价格改成99元",at:"2026-10-12"},
    {role:"assistant",content:"Dovetail的价格已记录为99元，还需要你核实价格。",at:"2026-10-12",task:{section:"competitors",label:"竞品修改"}}];
  storage.project.state.artifacts[0].competition.competitors[0]={...oldComparison.competitors[0],price:"99元（待核实）",unverifiedFields:["price"],verification:"待核实"};
  const ack={reply:"收到，已记录你的核实信息。",changes:{}};
  repairResponses=[ack];
  assert.equal((await POST(revisionRequest("这一项我已经核实过了"))).status,200);
  const realTimeChecked=currentCompetition(storage.project.state);
  assert.equal(realTimeChecked.rows[0].competitor.price,"99元");
  assert.equal(realTimeChecked.rows[0].competitor.userVerifications.price.quote,"这一项我已经核实过了");
  assert.ok(realTimeChecked.rows[0].competitor.userVerifications.price.contextQuote.includes("Dovetail"));
  assert.equal(realTimeChecked.rows[0].competitor.unverifiedFields,undefined);
  assert.deepEqual(realTimeChecked.artifact.competition.unknowns,["Excel价格需要核实"]);
  assert.deepEqual(storage.project.state.artifacts[0].competition.competitors[1],realTimeChecked.rows[1].competitor);
  assert.ok(JSON.parse(calls.at(-1).payload.messages.at(-1).content).recentConversation.some(entry=>entry.content.includes("Dovetail")));
  assert.ok(storage.project.state.messages.at(-1).artifactId);
  const strippedByModel=applyCompetitionRevision(JSON.stringify({changes:{competitors:[{index:1,price:"99元"}]}}),storage.project.state.artifacts[0].competition,{...state,messages:storage.project.state.messages.slice(0,2)},"这一项我已经核实过了");
  assert.equal(strippedByModel.competitors[0].price,"99元");
  assert.ok(strippedByModel.competitors[0].userVerifications.price);
  assert.deepEqual(strippedByModel.unknowns,["Excel价格需要核实"]);

  // Even non-JSON acknowledgement falls back to a grounded confirmation of the visible row.
  repairResponses=[{reply:"收到"},{reply:"收到"}];
  assert.equal((await POST(revisionRequest("Dovetail的价格我核实过了，就是199元"))).status,200);
  assert.equal(currentCompetition(storage.project.state).rows[0].competitor.price,"199元");
  assert.equal(currentCompetition(storage.project.state).rows[0].competitor.userVerifications.price.quote,"Dovetail的价格我核实过了，就是199元");
  repairResponses=[ack];
  assert.equal((await POST(revisionRequest("Excel的功能已经核实过了，功能是整理表格"))).status,200);
  assert.equal(currentCompetition(storage.project.state).rows[1].competitor.feature,"整理表格");
  assert.ok(currentCompetition(storage.project.state).rows[1].competitor.userVerifications.feature);
  assert.equal(currentCompetition(storage.project.state).rows[1].competitor.price,"待核实");

  const {competitionConfirmations}=await get("workflow");
  const ambiguousMessages=[{role:"assistant",content:"Dovetail和Excel的价格都还待核实",at:"2026-10-12",task:{section:"competitors",label:"竞品"}}];
  assert.deepEqual(competitionConfirmations(oldComparison.competitors,ambiguousMessages,"这一项我已经核实过了"),[]);
  const knownContext=[{role:"assistant",content:"Dovetail的价格需要核实",at:"2026-10-12",task:{section:"competitors",label:"竞品"}}];
  assert.equal(planConversation("overview","这一项核实好了","",false,{...state,artifacts:[oldCompetitionRecord],messages:knownContext}).section,"competitors");
  const unknownOnly=applyCompetitionRevision('{"changes":{}}',oldComparison,{...state,messages:[]},"Excel的价格我核实过了");
  assert.equal(unknownOnly.competitors[1].userVerifications,undefined);
  console.log("联网搜索检查通过：搜索、保留与修订、用户逐项核实及刷新恢复、未核实与未知保护、同值补充依据。");
} finally {
  globalThis.fetch=originalFetch;
  assert.ok(isAbsolute(temp) && temp.startsWith(join(tmpdir(), "competitor-search-")), "Temporary cleanup must remain in its test directory");
  await rm(temp,{recursive:true,force:true});
}
