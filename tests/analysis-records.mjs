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
  for (const name of ["interview-word", "source-links", "competition-view", "analysis-record", "word-export-button"]) {
    const path = name === "interview-word" ? `lib/${name}.ts` : `components/${name}.tsx`;
    let code = ts.transpileModule(await readFile(join(root, path), "utf8"), {compilerOptions:{module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.ReactJSX}}).outputText
      .replace(/(?:@\/components\/|@\/lib\/|\.\/)([a-z-]+)(?=")/gu, "./$1.mjs");
    for (const dependency of ["react/jsx-runtime", "react", "fflate", "lucide-react"]) code = code.replaceAll(`from "${dependency}"`, `from ${JSON.stringify(pathToFileURL(require.resolve(dependency)).href)}`);
    await writeFile(join(temp, `${name}.mjs`), code);
  }
  const {createInterviewWord, interviewWordFilename} = await import(pathToFileURL(join(temp, "interview-word.mjs")));
  const {AnalysisRecord} = await import(pathToFileURL(join(temp, "analysis-record.mjs")));
  const {CompetitionTable, CompetitionDetails} = await import(pathToFileURL(join(temp, "competition-view.mjs")));
  const questions = Array.from({length:32}, (_, i) => `${i + 1}. 请回忆第${i + 1}次出门前挑选衣服的实际经历，发生了什么？`);
  const artifact = {id:"A01", section:"research", title:"校园场景访谈提纲", version:3, createdAt:"2026-10-09T02:00:00Z",
    content:["## 招募条件", "- 过去一个月有相关实际经历的大学生", "## 开场与经历追问", "说明：**取得录音同意**；不暗示产品价值。", "特殊文本：<用户 & 队友> 中文 English 😀", ...questions, "## 收尾", "最后请问：还有什么容易被忽略的情况？"].join("\n"),
    limitations:"本提纲用于探索，不能直接验证付费意愿。", nextStep:"先完成两次试访谈，再调整问题。",
    sources:[{label:"用户提供的招募要求", detail:"仅访谈近期有真实经历的同学。", url:"https://example.com/research?a=1&b=2", date:"2026-10-01"}]};
  const bytes = createInterviewWord(artifact);
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
  assert.equal(interviewWordFilename(artifact), "访谈提纲-校园场景访谈提纲-V3.docx");
  const filename = interviewWordFilename({...artifact, title:'../CON: A\\B<>"|?* ' + "字".repeat(150)});
  assert.ok(filename.endsWith("-V3.docx") && !/[<>:"/\\|?*]/u.test(filename) && filename.length < 95);
  assert.equal(interviewWordFilename({...artifact, title:"   "}), "访谈提纲-未命名-V3.docx");
  const quotes = {...artifact, interview:{sourceId:"M01", quotes:[{quote:"我出门前总是犹豫很久。", direction:"背景", sourceId:"M01", hypothesisId:"H01"}], limitations:"只访谈了一人"}};
  assert.match((await mammoth.extractRawText({buffer:Buffer.from(createInterviewWord(quotes))})).value, /来源 M01[\s\S]*我出门前总是犹豫很久。/u);

  const record = renderToStaticMarkup(createElement(AnalysisRecord, {artifact}, createElement("div", {className:"artifact-content"}, artifact.content)));
  assert.match(record, /<details class="analysis-record">/u);
  assert.ok(!/<details[^>]*\bopen[=> ]/u.test(record));
  assert.ok(record.includes(questions.at(-1)) && record.includes("导出 Word"));
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
  const empty = renderToStaticMarkup(createElement(CompetitionDetails, {competition:{...competition, competitors:[]}}));
  assert.ok(empty.includes("网页摘录") && empty.includes("https://example.com/product"));
  const unsafe = renderToStaticMarkup(createElement(CompetitionDetails, {competition:{...competition, competitors:[{...competition.competitors[0], sourceUrl:"javascript:alert(1)", citations:[]}]}}));
  assert.ok(!unsafe.includes("href=\"javascript:"));
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
    assert.equal(download.suggestedFilename(), interviewWordFilename(artifact));
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
    console.log("浏览器验收通过：鼠标和键盘展开/收起、折叠时一键下载完整 Word、产品卡片、桌面/平板/手机排版。");
  }
} finally {
  if (browser) await browser.close();
  if (preview) await preview.close();
  if (uiDir) {assert.ok(isAbsolute(uiDir) && uiDir.startsWith(join(root, ".ui-record-check-")));await rm(uiDir, {recursive:true,force:true});}
  assert.ok(isAbsolute(temp) && temp.startsWith(join(tmpdir(), "analysis-records-")));
  await rm(temp, {recursive:true,force:true});
}
