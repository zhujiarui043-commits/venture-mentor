import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import mammoth from "mammoth";
import {unzipSync} from "fflate";

// Run against an already-built app. All project data below is synthetic, and
// every API request is intercepted before it can reach the server.
const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.env.WORD_EXPORT_QA_URL || "http://127.0.0.1:8787";
const output = join(root, ".qa-results", "word-export-production");
const now = "2026-10-11T02:00:00Z";
const title = "判断困难版访谈提纲（含有标准／无标准三问 · H02-V2／H04-V1）";
const questions = Array.from({length:32}, (_, index) => `${index + 1}. 请回忆第${index + 1}次出门前拿不准穿什么的实际经历，当时发生了什么？`);
const ending = "收尾问题：还有哪些实际经历容易被忽略？";
const limitation = "本提纲用于探索，不能据此推断所有人的付费意愿。";
const nextStep = "先完成两次试访谈，再核对提问顺序。";
const source = {label:"用户材料 M01 · 导出验收样例", detail:"这是合成来源说明，须在完整 Word 中保留。", url:"https://example.com/word-export-qa?a=1&b=2", date:"2026-10-10", retrievedAt:now};
const quote = "我那次出门前反复换了三次衣服。";
const finalArtifact = {
  id:"synthetic-outline-08", recordId:"A08", section:"research", title, version:2, createdAt:now,
  content:["## 招募条件", "- 过去 30 天至少一次出门前拿不准穿什么", "## 访谈问题", ...questions, "## 收尾", ending].join("\n"),
  limitations:limitation, nextStep, sources:[source],
  interview:{sourceId:"M01", quotes:[{quote, direction:"背景", sourceId:"M01", hypothesisId:"H02"}], limitations:"只用于检验结构化引文导出。"},
};
const state = {
  id:"word-export-synthetic-qa", title:"Word 导出合成验收项目", rawIdea:"", fields:{solution:"出门前穿搭助手"},
  fieldStatuses:{}, fieldMeta:{}, hypotheses:[], materials:[], messages:[], pending:null, updatedAt:now,
  artifacts:Array.from({length:8}, (_, index) => index === 7 ? finalArtifact : {
    ...finalArtifact, id:`synthetic-outline-${String(index + 1).padStart(2, "0")}`,
    recordId:`A${String(index + 1).padStart(2, "0")}`, title:`历史访谈提纲 ${index + 1}`,
    content:`第 ${index + 1} 份合成访谈提纲。`, interview:undefined,
  }),
};

const report = {target, data:"synthetic only", startedAt:new Date().toISOString(), results:[]};
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : "playwright");
let browser;
await mkdir(output, {recursive:true});

async function scenario(blockLateChunk, width) {
  const label = `${blockLateChunk ? "blocked-lazy-chunk" : "normal"}-${width}`;
  const result = {scenario:label, width, blockedWordChunks:[], unexpectedApiRequests:[], pageErrors:[], consoleErrors:[]};
  const context = await browser.newContext({viewport:{width:1440, height:1000}, acceptDownloads:true, reducedMotion:"reduce", serviceWorkers:"block"});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => result.pageErrors.push(error.message));
  page.on("console", message => {if (message.type() === "error") result.consoleErrors.push(message.text());});
  await context.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/project") return route.fulfill({json:{state, revision:8}, headers:{"Cache-Control":"no-store"}});
    if (path === "/api/login") return route.fulfill({json:{ok:true}});
    result.unexpectedApiRequests.push({path, method:request.method()});
    return route.abort("blockedbyclient");
  });
  try {
    await page.goto(target, {waitUntil:"networkidle", timeout:30000});
    await page.locator(".mentor-nav").waitFor({state:"attached"});
    // Select the desktop sidebar even at mobile width before taking the mobile
    // viewport, so this test stays focused on the export operation.
    await page.locator(".mentor-nav").getByRole("button", {name:"调研验证", exact:true}).click();
    await page.locator(".main-panel").getByRole("heading", {name:"用户访谈分析记录", exact:true}).waitFor();
    const cards = page.locator(".main-panel > .artifact-card");
    assert.equal(await cards.count(), 8, "The synthetic project must show all eight records");
    const card = cards.filter({has:page.getByRole("heading", {name:title, exact:true})});
    assert.equal(await card.count(), 1, "A08 must be uniquely identifiable");
    assert.equal(await card.locator(".artifact-top > span").textContent(), "分析记录 A08");
    assert.equal(await card.locator("details.analysis-record").evaluate(node => node.open), false);
    if (width === 390) {
      await page.setViewportSize({width, height:844});
      const mentor = page.locator("#mentor-toggle");
      if (await mentor.getAttribute("aria-expanded") === "true") await mentor.click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Mobile page must fit its viewport");
    }
    await card.getByRole("button", {name:/导出为 Word/u}).scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    if (blockLateChunk) {
      // Enable only after hydration and navigation. A click-time lazy import
      // must fail here; a statically loaded export remains available.
      await context.route("**/*", route => {
        if (route.request().url().includes("interview-word")) {
          result.blockedWordChunks.push(new URL(route.request().url()).pathname);
          return route.abort("failed");
        }
        return route.fallback();
      });
    }
    const downloadResult = page.waitForEvent("download", {timeout:5000}).then(download => ({download}), error => ({error}));
    await card.getByRole("button", {name:/导出为 Word/u}).click();
    const downloaded = await downloadResult;
    if (downloaded.error) {
      const alerts = await card.getByRole("alert").allTextContents();
      throw new Error(`No Word download within 5 seconds; alert: ${alerts.join(" | ") || "none"}; blocked chunks: ${result.blockedWordChunks.join(", ") || "none"}`);
    }
    const download = downloaded.download;
    assert.equal(await download.failure(), null, "Browser download must finish");
    assert.equal(download.suggestedFilename(), `访谈提纲-${title}-A08.docx`);
    const stream = await download.createReadStream();
    assert.ok(stream, "Browser must expose the downloaded bytes");
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks), zip = unzipSync(bytes);
    for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/numbering.xml", "word/_rels/document.xml.rels"]) assert.ok(zip[part], `DOCX is missing ${part}`);
    const extracted = (await mammoth.extractRawText({buffer:bytes})).value;
    for (const text of [title, "分析记录 A08", ...questions, ending, limitation, nextStep, source.label, source.detail, source.url, quote, "来源 M01", "关联 H02"]) assert.ok(extracted.includes(text), `Export is missing synthetic text: ${text}`);
    assert.ok(!extracted.includes("待确认提纲"), "Saved records must retain saved-record metadata");
    assert.equal(await card.locator("details.analysis-record").evaluate(node => node.open), false, "Export must not require expanding the record");
    assert.deepEqual(await card.getByRole("alert").allTextContents(), []);
    assert.deepEqual(result.unexpectedApiRequests, [], "No project mutations or other API calls are permitted");
    assert.deepEqual(result.pageErrors, [], "The actual built app must not raise browser errors");
    const docxPath = join(output, `${label}.docx`);
    await writeFile(docxPath, bytes);
    result.status = "passed";
    result.download = {filename:download.suggestedFilename(), bytes:bytes.length, textLength:extracted.length, verifiedQuestions:questions.length};
    console.log(`${label}: downloaded complete A08 Word (${bytes.length} bytes, ${questions.length} questions).`);
  } catch (error) {
    result.status = "failed";
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`${label}: ${result.error}`);
  } finally {
    await page.screenshot({path:join(output, `${label}.png`), fullPage:true}).catch(error => {result.screenshotError = error.message;});
    report.results.push(result);
    await context.close();
  }
}

try {
  browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
  for (const blockLateChunk of [false, true]) for (const width of [1440, 390]) await scenario(blockLateChunk, width);
  report.status = report.results.every(result => result.status === "passed") ? "passed" : "failed";
  if (report.status !== "passed") process.exitCode = 1;
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await browser?.close();
  console.log(`Production Word export report: ${join(output, "report.json")}`);
}
