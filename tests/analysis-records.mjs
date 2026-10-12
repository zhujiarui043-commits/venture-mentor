import assert from "node:assert/strict";
import {mkdtemp, readFile, writeFile, rm, mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, isAbsolute} from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {unzipSync, strFromU8} from "fflate";
import mammoth from "mammoth";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const temp = await mkdtemp(join(tmpdir(), "analysis-records-"));
let preview, browser, uiDir;
try {
  for (const name of ["types", "competition-workspace", "interview-word", "source-links", "competition-view", "analysis-record", "word-export-button"]) {
    const path = ["types", "competition-workspace", "interview-word"].includes(name) ? `lib/${name}.ts` : `components/${name}.tsx`;
    let code = ts.transpileModule(await readFile(join(root, path), "utf8"), {compilerOptions:{module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.ReactJSX}}).outputText
      .replace(/(?:@\/components\/|@\/lib\/|\.\/)([a-z-]+)(?=")/gu, "./$1.mjs");
    for (const dependency of ["react/jsx-runtime", "react", "fflate", "lucide-react"]) code = code.replaceAll(`from "${dependency}"`, `from ${JSON.stringify(pathToFileURL(require.resolve(dependency)).href)}`);
    await writeFile(join(temp, `${name}.mjs`), code);
  }
  const {createAnalysisWord, analysisWordFilename} = await import(pathToFileURL(join(temp, "interview-word.mjs")));
  const {AnalysisRecord} = await import(pathToFileURL(join(temp, "analysis-record.mjs")));
  const {CompetitionTable, CompetitionDetails} = await import(pathToFileURL(join(temp, "competition-view.mjs")));
  const questions = Array.from({length:32}, (_, i) => `${i + 1}. 请回忆第${i + 1}次出门前挑选衣服的实际经历，发生了什么？`);
  const artifact = {id:"A01", section:"research", title:"校园场景访谈提纲", version:3, createdAt:"2026-10-09T02:00:00Z",
    content:["## 招募条件", "- 过去一个月有相关实际经历的大学生", "## 开场与经历追问", "说明：**取得录音同意**；不暗示产品价值。", "特殊文本：<用户 & 队友> 中文 English 😀", ...questions, "## 收尾", "最后请问：还有什么容易被忽略的情况？"].join("\n"),
    limitations:"本提纲用于探索，不能直接验证付费意愿。", nextStep:"先完成两次试访谈，再调整问题。",
    sources:[{label:"用户提供的招募要求", detail:"仅访谈近期有真实经历的同学。", url:"https://example.com/research?a=1&b=2", date:"2026-10-01"}]};
  const bytes = createAnalysisWord(artifact);
  const zip = unzipSync(bytes);
  for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/numbering.xml", "word/_rels/document.xml.rels"]) assert.ok(zip[part], `Missing DOCX part ${part}`);
  const extracted = (await mammoth.extractRawText({buffer:Buffer.from(bytes)})).value;
  for (const text of [artifact.title, ...questions, "最后请问：还有什么容易被忽略的情况？", "取得录音同意", "特殊文本：<用户 & 队友> 中文 English 😀", artifact.limitations, artifact.nextStep, artifact.sources[0].detail, artifact.sources[0].url]) assert.ok(extracted.includes(text), `Word lost content: ${text}`);
  assert.ok(!extracted.includes("**取得录音同意**"));
  const xml = strFromU8(zip["word/document.xml"]);
  assert.match(xml, /w:pgSz w:w="11906" w:h="16838"/u);
  assert.match(xml, /w:pStyle w:val="Heading1"/u);
  assert.match(xml, /w:numPr/u);
  assert.match(xml, /&lt;用户 &amp; 队友&gt;/u);
  assert.ok(!strFromU8(zip["word/styles.xml"]).includes("w:pageBreakBefore"));
  assert.equal(analysisWordFilename(artifact), "访谈提纲-校园场景访谈提纲.docx");
  const filename = analysisWordFilename({...artifact, title:'../CON: A\\B<>"|?* ' + "字".repeat(150)});
  assert.ok(filename.endsWith(".docx") && !/[<>:"/\\|?*]/u.test(filename) && filename.length < 95);
  assert.equal(analysisWordFilename({...artifact, title:"   "}), "调研分析-未命名.docx");
  assert.equal(analysisWordFilename({...artifact,title:"M05 · 校园访谈提纲"}),"访谈提纲-校园访谈提纲.docx");
  assert.equal(analysisWordFilename({...artifact,title:"M05类校园访谈提纲"}),"访谈提纲-校园访谈提纲.docx");
  const cleanedWord=(await mammoth.extractRawText({buffer:Buffer.from(createAnalysisWord({...artifact,title:"Mxx类校园访谈提纲 · V3"}))})).value;
  assert.ok(cleanedWord.includes("校园访谈提纲") && !cleanedWord.includes("Mxx类") && !cleanedWord.includes("· V3"));
  const draftWord=(await mammoth.extractRawText({buffer:Buffer.from(createAnalysisWord({...artifact,title:"M07 · 校园访谈提纲"},true))})).value;
  assert.ok(draftWord.includes("待确认分析记录") && !draftWord.includes("M07 · 校园访谈提纲"));
  const quotes = {...artifact, interview:{sourceId:"M01", quotes:[{quote:"我出门前总是犹豫很久。", direction:"背景", sourceId:"M01", hypothesisId:"H01"}], limitations:"只访谈了一人"}};
  assert.match((await mammoth.extractRawText({buffer:Buffer.from(createAnalysisWord(quotes))})).value, /来源 M01[\s\S]*我出门前总是犹豫很久。/u);

  for (const [extra,prefix,id] of [
    [{title:"问卷调查结果分析",survey:{totalRows:2,columns:[],warnings:[]}},"问卷调查","Q01"],
    [{title:"MVP 测试结果",funnel:{stages:[],warnings:[]}},"MVP测试","T01"],
    [{title:"调研准备事项"},"调研分析","U01"],
  ]) {
    const researchArtifact={...artifact,...extra,recordId:id};
    const exportedName=analysisWordFilename(researchArtifact);
    assert.equal(exportedName,`${prefix}-${extra.title}-${id}.docx`);
    assert.ok(!exportedName.includes("访谈"));
    const text=(await mammoth.extractRawText({buffer:Buffer.from(createAnalysisWord(researchArtifact,true))})).value;
    assert.ok(text.includes("待确认分析记录") && text.includes(id));
    const markup=renderToStaticMarkup(createElement(AnalysisRecord,{artifact:researchArtifact},"完整调研结果"));
    assert.ok(markup.includes("导出 Word"));
  }
  const record = renderToStaticMarkup(createElement(AnalysisRecord, {artifact}, createElement("div", {className:"artifact-content"}, artifact.content)));
  assert.match(record, /<details class="analysis-record">/u);
  assert.ok(!/<details[^>]*\bopen[=> ]/u.test(record));
  assert.ok(record.includes(questions.at(-1)) && record.includes("导出 Word"));
  const chatRecord = renderToStaticMarkup(createElement(AnalysisRecord, {artifact,expanded:true}, artifact.content));
  assert.match(chatRecord, /<details class="analysis-record" open="">/u);
  assert.ok(chatRecord.includes(questions.at(-1)) && !chatRecord.includes("待确认"));
  const numberedRecord = renderToStaticMarkup(createElement(AnalysisRecord, {artifact:{...artifact,recordId:"A09"}}, "完整提纲"));
  assert.ok(numberedRecord.includes("分析记录 A09") && !numberedRecord.includes("· V3"));
  assert.equal(analysisWordFilename({...artifact,recordId:"A09"}),"访谈提纲-校园场景访谈提纲-A09.docx");
  assert.ok((await mammoth.extractRawText({buffer:Buffer.from(createAnalysisWord({...artifact,recordId:"A09"}))})).value.includes("分析记录 A09"));
  // Export must stay outside the toggle, available even when the record is closed.
  assert.ok(record.indexOf("record-actions") > record.indexOf("</details>"));
  for (const section of ["overview", "diagnosis", "competitors", "hypotheses", "research", "canvas"]) {
    const html = renderToStaticMarkup(createElement(AnalysisRecord, {artifact:{...artifact, section}}, "完整分析"));
    assert.ok(!/<details[^>]*\bopen[=> ]/u.test(html));
  }
  const competition = {scope:"AI 穿搭辅助", competitors:[{name:"Wardrobe Assistant Professional", kind:"直接竞品", audience:"出门前需要搭配建议的年轻上班族", task:"根据已有衣物安排每日穿搭", feature:"管理衣物、生成搭配并保存每日计划", price:"官网未披露价格，待核实", limitation:"离线识别与本地隐私能力待核实", sourceId:"W01", sourceQuote:"Manage your wardrobe and plan outfits.", sourceDate:"2026-10-01", sourceRetrievedAt:"2026-10-09T02:00:00Z", sourceUrl:"https://example.com/product", verification:"网页资料待核", citations:[{field:"feature", sourceId:"W01", quote:"Manage your wardrobe and plan outfits.", url:"https://example.com/product"}]}],
    gap:"校园场景是否需要更轻量的录入流程，待验证", counterExplanation:"用户也可能直接使用现有工具", unknowns:["仍需核对价格"], webSearch:{query:"AI wardrobe", searchedAt:"2026-10-09T02:00:00Z", results:[{id:"W01", title:"Wardrobe Assistant", url:"https://example.com/product", content:"Manage your wardrobe and plan outfits."}]}};
  const table = renderToStaticMarkup(createElement(CompetitionTable, {competition}));
  assert.equal((table.match(/scope="col"/gu) || []).length, 3);
  assert.ok(!table.includes("来源与状态") && !table.includes("sourceQuote") && !table.includes("example.com"));
  const details = renderToStaticMarkup(createElement(CompetitionDetails, {competition}));
  assert.ok(!details.includes("<table") && !/<details[^>]*\bopen[=> ]/u.test(details));
  for (const field of ["name", "audience", "task", "feature", "price", "limitation", "sourceQuote", "verification", "sourceUrl"]) assert.ok(details.includes(competition.competitors[0][field]));
  assert.ok(details.includes(competition.gap) && details.includes(competition.unknowns[0]) && details.includes("查看本轮网页来源"));
  const userChecked={...competition,competitors:[{...competition.competitors[0],price:"99元",verification:"部分字段已核实",userVerifications:{price:{quote:"价格我已经核实了，99元",confirmedAt:"2026-10-12T02:00:00Z"}}}]};
  assert.ok(renderToStaticMarkup(createElement(CompetitionTable,{competition:userChecked})).includes("99元（用户已核实）"));
  const checkedDetails=renderToStaticMarkup(createElement(CompetitionDetails,{competition:userChecked}));
  assert.ok(checkedDetails.includes("用户核实记录") && checkedDetails.includes("价格我已经核实了，99元") && checkedDetails.includes("部分字段已核实"));
  const empty = renderToStaticMarkup(createElement(CompetitionDetails, {competition:{...competition, competitors:[]}}));
  assert.ok(empty.includes("网页摘录") && empty.includes("https://example.com/product"));
  const unsafe = renderToStaticMarkup(createElement(CompetitionDetails, {competition:{...competition, competitors:[{...competition.competitors[0], sourceUrl:"javascript:alert(1)", citations:[]}]}}));
  assert.ok(!unsafe.includes("href=\"javascript:"));
  const userCorrection={...competition,competitors:[{...competition.competitors[0],price:"99元",unverifiedFields:["price"],verification:"待核实"}]};
  assert.ok(renderToStaticMarkup(createElement(CompetitionTable,{competition:userCorrection})).includes("99元（用户补充，待核实）"));
  assert.ok(renderToStaticMarkup(createElement(CompetitionDetails,{competition:userCorrection})).includes("99元（用户补充，待核实）"));
  console.log("分析记录与 Word 检查通过：默认折叠、完整正文、各模块记录、导出按钮位置、DOCX格式与中文、三列对照、非表格产品详情、来源保留。");

  if (process.argv.includes("--browser")) {
    const {createServer} = await import("vite");
    const {default:react} = await import("@vitejs/plugin-react");
    const {chromium} = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : "playwright");
    uiDir = await mkdtemp(join(root, ".ui-record-check-"));
    await writeFile(join(uiDir, "index.html"), '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
    await writeFile(join(uiDir, "main.tsx"), `import React from 'react';import {createRoot} from 'react-dom/client';import {AnalysisRecord} from '@/components/analysis-record';import {CompetitionTable,CompetitionDetails} from '@/components/competition-view';import '@/app/globals.css';const artifact=${JSON.stringify(artifact)};const competition=${JSON.stringify(competition)};createRoot(document.getElementById('root')!).render(<main style={{maxWidth:1050,margin:'30px auto',padding:'0 18px'}}><h1>用户访谈</h1>{[1,2,3].map(i=><AnalysisRecord key={i} artifact={{...artifact,id:'A'+i,title:['校园场景访谈提纲','通勤场景访谈提纲','远程访谈提纲'][i-1]}}><div className="artifact-content">{artifact.content}</div></AnalysisRecord>)}<h1>竞品与替代</h1><CompetitionTable competition={competition}/><h2>分析记录与来源</h2><AnalysisRecord artifact={{...artifact,id:'C01',section:'competitors',title:'联网竞品比较',content:'本轮比较范围与网页来源'}}><CompetitionDetails competition={competition}/></AnalysisRecord></main>);`);
    preview = await createServer({configFile:false, root:uiDir, plugins:[react()], resolve:{alias:{"@":root}}, server:{host:"127.0.0.1", port:0, fs:{allow:[root]}}});
    await preview.listen();
    const port = preview.httpServer.address().port;
    browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH} : {})});
    const page = await browser.newPage({viewport:{width:1200,height:1000}, acceptDownloads:true});
    const errors=[];page.on("pageerror", e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.locator(".analysis-record").first().waitFor();
    assert.equal(await page.locator("details[open]").count(), 0);
    assert.equal(await page.locator(".word-export-button:visible").count(), 3);
    const first = page.locator(".analysis-record").first();
    const closedHeight = await first.evaluate(e => e.getBoundingClientRect().height);
    await first.locator("summary").focus();await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector(".analysis-record").open);
    assert.ok(await first.evaluate(e => e.getBoundingClientRect().height) > closedHeight * 3);
    assert.ok(await first.locator(".artifact-content").textContent().then(text => text.includes(questions.at(-1))));
    await first.locator("summary").click();
    const downloaded = page.waitForEvent("download");
    await page.locator(".word-export-button").first().click();
    const download = await downloaded;
    assert.equal(download.suggestedFilename(), analysisWordFilename(artifact));
    const stream = await download.createReadStream();const chunks=[];for await (const chunk of stream) chunks.push(chunk);
    assert.ok((await mammoth.extractRawText({buffer:Buffer.concat(chunks)})).value.includes(questions.at(-1)));
    const competitorRecord = page.locator(".analysis-record").last();
    await competitorRecord.locator("summary").first().click();
    assert.equal(await page.locator(".competitor-detail[open]").count(), 0);
    await page.locator(".competitor-detail>summary").click();
    assert.ok(await page.locator(".competitor-source").isVisible());
    assert.equal(await competitorRecord.locator("table").count(), 0);
    assert.ok(await page.locator(".competitor-detail dl>div").evaluateAll(nodes => nodes.every(e => !["grid", "table-row"].includes(getComputedStyle(e).display))));
    const screenshots = join(root, ".qa-results", "analysis-records");await mkdir(screenshots, {recursive:true});
    await page.screenshot({path:join(screenshots, "expanded.png"), fullPage:true});
    await competitorRecord.locator("summary").first().click();
    await page.screenshot({path:join(screenshots, "desktop.png"), fullPage:true});
    for (const width of [780,390]) {
      await page.setViewportSize({width,height:1000});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.ok(await page.locator(".competition-table thead th").evaluateAll(nodes => nodes.every(e => getComputedStyle(e).whiteSpace === "nowrap")));
      const scroll = await page.locator(".comparison-scroll").evaluate(e => ({width:e.clientWidth, content:e.scrollWidth}));
      if (width === 390) assert.ok(scroll.content > scroll.width);
    }
    await page.screenshot({path:join(screenshots, "mobile.png"), fullPage:true});
    assert.deepEqual(errors, []);
    // Check the actual workspace, including legacy records without analysis numbers.
    await writeFile(join(uiDir,"studio.html"), '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/studio.tsx"></script></body></html>');
    await writeFile(join(uiDir,"studio.tsx"), "import React from 'react';import {createRoot} from 'react-dom/client';import Studio from '@/app/studio';import {ThemeProvider} from '@/components/theme-provider';import '@/app/globals.css';createRoot(document.getElementById('root')!).render(<ThemeProvider><Studio/></ThemeProvider>);");
    const studioPage=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
    const studioErrors=[];studioPage.on("pageerror",error=>studioErrors.push(error.message));
    const revisedContent=artifact.content+"\n新版追加追问：当时还有哪些替代选择？";
    const studioState={id:"team-owner",title:"穿搭助手",rawIdea:"",fields:{solution:"校园穿搭助手"},fieldStatuses:{},fieldMeta:{},hypotheses:[],pending:null,updatedAt:"2026-10-10",messages:[],materials:[{id:"M01",name:"第一份访谈.docx",content:"第一份真实访谈原文。",at:"2026-10-09"},{id:"M02",name:"补充访谈.docx",content:"第二份真实访谈原文。",at:"2026-10-10"}],artifacts:[{...artifact,id:"old-outline-uuid",version:1},{...artifact,id:"new-outline-uuid",version:2,title:"新版校园访谈提纲",content:revisedContent,sources:[{label:"用户材料 M02 · 补充访谈.docx"}]}]};
    await studioPage.route("**/api/project",route=>route.fulfill({json:{state:studioState,revision:3}}));
    await studioPage.goto(`http://127.0.0.1:${port}/studio.html`);
    await studioPage.getByRole("button",{name:"调研验证",exact:true}).click();
    await studioPage.getByRole("heading",{name:"分析记录",exact:true}).waitFor();
    const materialSummaries=await studioPage.locator(".material-card>summary").allTextContents();
    assert.ok(materialSummaries[0].startsWith("M01 · 第一份访谈.docx"));
    assert.ok(materialSummaries[1].startsWith("M02 · 补充访谈.docx"));
    const records=studioPage.locator(".analysis-record");
    assert.equal(await records.count(),2);
    assert.deepEqual(await records.evaluateAll(nodes=>nodes.map(node=>node.open)),[false,false]);
    assert.equal(await records.first().locator(".artifact-top span").textContent(),"分析记录 A02");
    assert.equal(await records.nth(1).locator(".artifact-top span").textContent(),"分析记录 A01");
    assert.equal(await records.first().locator(".artifact-content").isVisible(),false);
    await records.first().locator("summary").first().click();
    assert.ok(await records.first().locator(".artifact-content").isVisible());
    assert.ok((await records.first().locator(".artifact-content").textContent()).includes("新版追加追问"));
    await records.first().locator("summary").first().click();
    const studioDownloadPromise=studioPage.waitForEvent("download");
    await studioPage.locator(".word-export-button").first().click();
    const studioDownload=await studioDownloadPromise;
    const studioStream=await studioDownload.createReadStream(), studioChunks=[];
    for await (const chunk of studioStream) studioChunks.push(chunk);
    const studioWord=(await mammoth.extractRawText({buffer:Buffer.concat(studioChunks)})).value;
    assert.ok(studioWord.includes("分析记录 A02") && studioWord.includes("新版追加追问"));
    assert.ok(studioWord.includes("用户材料 M02 · 补充访谈.docx"));
    await studioPage.screenshot({path:join(screenshots,"research-workspace.png"),fullPage:true});
    assert.deepEqual(studioErrors,[]);
    await studioPage.close();

    // A long, restored pending suggestion must never lock chat or bury its controls.
    const pendingPage=await browser.newPage({viewport:{width:1440,height:720},acceptDownloads:true});
    const pendingErrors=[];pendingPage.on("pageerror",error=>pendingErrors.push(error.message));
    const pendingContent=revisedContent+"\n待确认的最新追问：为什么选择这种方式？";
    let pendingState={...studioState,messages:Array.from({length:12},(_,i)=>({role:i%2?"assistant":"user",content:"历史讨论。".repeat(80),at:"2026-10-10"})),pending:{id:"restored-outline",fields:{audience:"大学生"},fieldRemovals:[],evidence:[],hypothesis:null,createdAt:"2026-10-10",reply:"请确认提纲",artifact:{...studioState.artifacts[1],title:"M07 · 新版校园访谈提纲",content:pendingContent}}};
    let pendingRequests=0,conflictOnce=true;
    await pendingPage.route("**/api/project",route=>route.fulfill({json:{state:pendingState,revision:4}}));
    await pendingPage.route("**/api/agent",route=>{
      pendingRequests++;
      const body=route.request().postDataJSON();assert.equal(body.webSearch,false);
      pendingState={...pendingState,messages:[...pendingState.messages,{role:"user",content:body.message,at:"2026-10-10"},{role:"assistant",content:pendingRequests===1?"用来了解实际经历。":"已更新追问。",at:"2026-10-10"}]};
      if(pendingRequests===2)pendingState={...pendingState,pending:{...pendingState.pending,id:"revised-draft",artifact:{...pendingState.pending.artifact,content:pendingContent+"\n本轮修改：请回忆具体选择过程。"}}};
      return route.fulfill({json:{state:pendingState,revision:4+pendingRequests}});
    });
    await pendingPage.route("**/api/confirm",route=>{
      if(conflictOnce){conflictOnce=false;pendingState={...pendingState,pending:{...pendingState.pending,id:"other-tab-draft"}};return route.fulfill({status:409,json:{error:"待确认内容已更新，请刷新"}})}
      assert.equal(route.request().postDataJSON().proposalId,"other-tab-draft");
      pendingState={...pendingState,artifacts:[...pendingState.artifacts,{...pendingState.pending.artifact,id:"confirmed-outline",recordId:"A03",title:"新版校园访谈提纲",version:3,createdAt:"2026-10-10"}],pending:null};
      return route.fulfill({json:{state:pendingState,revision:8}});
    });
    await pendingPage.goto(`http://127.0.0.1:${port}/studio.html`);
    const pendingToolbar=pendingPage.getByRole("region",{name:"待确认建议",exact:true});
    const pendingInput=pendingPage.getByPlaceholder("描述想法、提出问题或说明要分析什么…");
    await pendingToolbar.waitFor();
    assert.ok(await pendingInput.isEnabled());
    assert.equal(await pendingPage.locator(".pending-record").count(),1);
    assert.equal(await pendingPage.locator(".pending-record h3").textContent(),"新版校园访谈提纲");
    assert.equal(await pendingPage.locator(".pending-record .analysis-record").evaluate(node=>node.open),false);
    await pendingPage.locator(".pending-record summary").first().click();
    assert.ok((await pendingPage.locator(".pending-record .artifact-content").textContent()).includes("待确认的最新追问"));
    const draftDownloadPromise=pendingPage.waitForEvent("download");
    await pendingPage.locator(".pending-record .word-export-button").click();
    const draftDownload=await draftDownloadPromise;
    const draftStream=await draftDownload.createReadStream(),draftChunks=[];for await(const chunk of draftStream)draftChunks.push(chunk);
    assert.ok((await mammoth.extractRawText({buffer:Buffer.concat(draftChunks)})).value.includes("待确认分析记录"));
    await pendingToolbar.getByRole("button",{name:"修改建议",exact:true}).click();
    assert.ok(await pendingInput.evaluate(node=>node===document.activeElement));
    await pendingInput.fill("为什么要问这个问题？");await pendingPage.getByRole("button",{name:"发送",exact:true}).click();
    await pendingPage.waitForFunction(()=>document.querySelector(".message.assistant:last-of-type")?.textContent?.includes("用来了解实际经历") || [...document.querySelectorAll(".message.assistant")].some(node=>node.textContent.includes("用来了解实际经历")));
    assert.equal(pendingState.pending.id,"restored-outline");assert.ok(await pendingInput.isEnabled());
    await pendingInput.fill("修改第三个问题，增加具体过程追问");await pendingPage.getByRole("button",{name:"发送",exact:true}).click();
    await pendingPage.waitForFunction(()=>document.querySelector(".pending-record .artifact-content")?.textContent?.includes("本轮修改"));
    await pendingPage.setViewportSize({width:390,height:844});
    for(const button of await pendingToolbar.getByRole("button").all()) {
      const box=await button.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=844&&box.x>=0&&box.x+box.width<=390);
    }
    assert.ok(await pendingInput.isEnabled());
    await pendingPage.screenshot({path:join(screenshots,"pending-chat-mobile.png"),fullPage:true});
    await pendingPage.setViewportSize({width:1440,height:720});
    await pendingToolbar.getByRole("button",{name:"确认保存",exact:true}).click();
    await pendingPage.getByRole("alert").filter({hasText:"待确认内容已更新"}).waitFor();
    assert.ok(await pendingInput.isEnabled());
    await pendingToolbar.getByRole("button",{name:"确认保存",exact:true}).click();
    await pendingToolbar.waitFor({state:"detached"});
    assert.equal(await pendingPage.locator(".pending-record").count(),0);
    assert.equal(await pendingPage.locator(".analysis-record").count(),3);
    assert.equal(await pendingPage.locator(".analysis-record").first().locator(".artifact-top span").textContent(),"分析记录 A03");
    assert.ok((await pendingPage.locator(".analysis-record").first().locator(".artifact-content").textContent()).includes("本轮修改"));
    assert.deepEqual(pendingErrors,[]);await pendingPage.close();

    const competitionPage=await browser.newPage({viewport:{width:1440,height:1000}});
    const competitionErrors=[];competitionPage.on("pageerror",error=>competitionErrors.push(error.message));
    const oldCompetitionRecord={...artifact,id:"competition-original",section:"competitors",title:"竞品比较",version:1,competition};
    const newComparison={...competition,competitors:[{...competition.competitors[0],kind:"替代方式",price:"99元",unverifiedFields:["price"],verification:"待核实",citations:competition.competitors[0].citations.filter(citation=>citation.field !== "price")}]};
    const editedArtifact={...oldCompetitionRecord,id:"competition-edited",version:2,competition:newComparison};
    let competitionState={...studioState,messages:[],artifacts:[oldCompetitionRecord],pending:null};
    await competitionPage.route("**/api/project",route=>route.fulfill({json:{state:competitionState,revision:1}}));
    await competitionPage.route("**/api/agent",route=>{
      const request=route.request().postDataJSON();
      assert.equal(request.section,"competitors");assert.equal(request.webSearch,false);
      competitionState={...competitionState,pending:{id:"competition-edit-proposal",fields:{},fieldRemovals:[],evidence:[],hypothesis:null,reply:"已整理本次竞品修改。",createdAt:"2026-10-10",artifact:editedArtifact}};
      return route.fulfill({json:{state:competitionState,revision:2}});
    });
    await competitionPage.route("**/api/confirm",route=>{
      assert.equal(route.request().postDataJSON().accept,true);
      competitionState={...competitionState,artifacts:[oldCompetitionRecord,editedArtifact],pending:null};
      return route.fulfill({json:{state:competitionState,revision:3}});
    });
    await competitionPage.goto(`http://127.0.0.1:${port}/studio.html`);
    await competitionPage.getByRole("button",{name:"竞品洞察",exact:true}).click();
    await competitionPage.locator(".competition-table").waitFor();
    await competitionPage.getByPlaceholder("描述想法、提出问题或说明要分析什么…").fill(`把${competition.competitors[0].name}的类别改成替代方式，价格改成99元`);
    await competitionPage.getByRole("button",{name:"发送",exact:true}).click();
    await competitionPage.getByRole("button",{name:"确认保存",exact:true}).waitFor();
    assert.ok((await competitionPage.locator(".competition-table").textContent()).includes(competition.competitors[0].price));
    await competitionPage.getByRole("button",{name:"确认保存",exact:true}).click();
    await competitionPage.waitForFunction(()=>document.querySelector(".competition-table")?.textContent?.includes("99元（用户补充，待核实）"));
    assert.equal(await competitionPage.locator(".analysis-record").count(),2);
    assert.equal(await competitionPage.locator(".analysis-record").first().locator(".artifact-top span").textContent(),"分析记录 C02");
    assert.deepEqual(await competitionPage.locator(".analysis-record").evaluateAll(nodes=>nodes.map(node=>node.open)),[false,false]);
    assert.deepEqual(competitionState.artifacts[0],oldCompetitionRecord);
    await competitionPage.screenshot({path:join(screenshots,"competition-revision.png"),fullPage:true});
    assert.deepEqual(competitionErrors,[]);
    await competitionPage.close();
    console.log("浏览器验收通过：鼠标和键盘展开/收起、折叠时一键下载完整 Word、产品卡片、桌面/平板/手机排版。");
  }
} finally {
  if (browser) await browser.close();
  if (preview) await preview.close();
  if (uiDir) {assert.ok(isAbsolute(uiDir) && uiDir.startsWith(join(root, ".ui-record-check-")));await rm(uiDir, {recursive:true,force:true});}
  assert.ok(isAbsolute(temp) && temp.startsWith(join(tmpdir(), "analysis-records-")));
  await rm(temp, {recursive:true,force:true});
}
