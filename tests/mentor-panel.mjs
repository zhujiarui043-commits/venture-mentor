import assert from "node:assert/strict";
import {mkdtemp, readFile, writeFile, rm, mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, isAbsolute} from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const temp = await mkdtemp(join(tmpdir(), "mentor-panel-"));
let preview, browser, uiDir;
try {
  for (const [name, path] of Object.entries({"mentor-workspace":"components/mentor-workspace.tsx", "theme-toggle":"components/theme-toggle.tsx", types:"lib/types.ts","hypothesis-assessment":"lib/hypothesis-assessment.ts","apply-proposal":"lib/apply-proposal.ts","proposal-changes":"lib/proposal-changes.ts",hypothesis:"lib/hypothesis.ts","competition-workspace":"lib/competition-workspace.ts"})) {
    let code = ts.transpileModule(await readFile(join(root, path), "utf8"), {compilerOptions:{module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/from "\.\/([a-z-]+)"/gu, 'from "./$1.mjs"');
    for (const dependency of ["react/jsx-runtime", "react", "lucide-react", "next-themes"]) code = code.replaceAll(`from "${dependency}"`, `from ${JSON.stringify(pathToFileURL(require.resolve(dependency)).href)}`);
    await writeFile(join(temp, `${name}.mjs`), code);
  }
  const {mentorPanelBounds, MentorWorkspace} = await import(pathToFileURL(join(temp, "mentor-workspace.mjs")));
  const {emptyProject} = await import(pathToFileURL(join(temp, "types.mjs")));
  assert.deepEqual(mentorPanelBounds(1200), {min:360,max:880});
  assert.deepEqual(mentorPanelBounds(820), {min:360,max:500});
  assert.deepEqual(mentorPanelBounds(550), {min:360,max:360});
  assert.deepEqual(mentorPanelBounds(0), {min:360,max:920});
  const props = {open:true,fullscreen:false,onFullscreenChange:()=>{},onClose:()=>{},chat:createElement("div", {className:"conversation"}, "聊天历史"),children:createElement("main", {className:"main-panel"}, "项目工作区")};
  const normal = renderToStaticMarkup(createElement(MentorWorkspace, props));
  assert.ok(normal.includes('role="separator"') && normal.includes('aria-valuenow="520"') && normal.includes("全屏显示导师对话"));
  const full = renderToStaticMarkup(createElement(MentorWorkspace, {...props, fullscreen:true}));
  assert.ok(full.includes('role="dialog"') && full.includes('aria-modal="true"') && full.includes("退出导师全屏"));
  assert.ok(!full.includes('role="separator"') && full.includes("聊天历史"));
  const closed = renderToStaticMarkup(createElement(MentorWorkspace, {...props, open:false}));
  assert.ok(!closed.includes("<aside") && closed.includes("项目工作区"));
  console.log("导师面板检查通过：宽度边界、拖拽控件、全屏/退出按钮、关闭状态及可访问性。");

  if (process.argv.includes("--browser")) {
    const {createServer} = await import("vite");
    const {default:react} = await import("@vitejs/plugin-react");
    const {chromium} = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : "playwright");
    uiDir = await mkdtemp(join(root, ".ui-panel-check-"));
    await writeFile(join(uiDir, "index.html"), '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
    await writeFile(join(uiDir, "main.tsx"), "import React from 'react';import {createRoot} from 'react-dom/client';import Studio from '@/app/studio';import {ThemeProvider} from '@/components/theme-provider';import '@/app/globals.css';createRoot(document.getElementById('root')!).render(<ThemeProvider><Studio/></ThemeProvider>);");
    preview = await createServer({configFile:false,root:uiDir,plugins:[react()],resolve:{alias:{"@":root}},server:{host:"127.0.0.1",port:0,fs:{allow:[root]}}});
    await preview.listen();
    browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH} : {})});
    const page = await browser.newPage({viewport:{width:1440,height:1000},colorScheme:"dark"});
    const errors=[];page.on("pageerror", error => errors.push(error.message));
    const {applyProposal} = await import(pathToFileURL(join(temp,"apply-proposal.mjs")));
    const state = {...emptyProject("test-panel"),title:"穿搭助手",fields:{solution:"帮助大学生安排每日穿搭"},messages:[{role:"user",content:"准备探索校园穿搭场景",at:"2026-10-09T02:00:00Z"},{role:"assistant",content:"先给结论：**现在还不能启动正式问卷**。\n\n二、启动条件逐条对照（KB08 02.1）\n\n| 条件 | 现状 | 是否满足 |\n| --- | --- | --- |\n| 目标用户明确 | 学生或已工作的年轻人，18—30 岁 | 满足 |\n| 已形成稳定的问题类别 | 仅 M08 一份接近核心对象；M06、M09 均为边界对象 | 不满足 |\n\n1. 补充访谈。\n2. 核对变量。",at:"2026-10-09T02:01:00Z"}]};
    await page.route("**/api/project", route => route.fulfill({json:{state,revision:1}}));
    let agentRequests=0;await page.route("**/api/agent", route => {agentRequests++;return route.fulfill({json:{state,revision:1}});});
    await page.goto(`http://127.0.0.1:${preview.httpServer.address().port}/`);
    const panel = page.locator("#mentor-panel"), handle = page.locator(".mentor-resize-handle"), draft = page.getByPlaceholder("描述想法、提出问题或说明要分析什么…");
    await page.getByRole("heading", {name:"穿搭助手",exact:true}).waitFor();
    const panelWidth = () => panel.evaluate(element => element.getBoundingClientRect().width);
    const approx = (a,b) => assert.ok(Math.abs(a-b)<2, `${a} vs ${b}`);
    const pollWidth = value => page.waitForFunction(width => Math.abs(document.querySelector("#mentor-panel").getBoundingClientRect().width-width)<2, value);
    await pollWidth(520);
    const widestAllowed = Number(await handle.getAttribute('aria-valuemax'));
    const normalBounds = await panel.boundingBox();approx(normalBounds.y,0);approx(normalBounds.height,1000);
    assert.equal(await page.locator('.top-actions .revision').count(),0);
    approx((await page.locator('.topbar').boundingBox()).width,normalBounds.x-232);
    approx(await page.locator('.composer').evaluate(element=>element.getBoundingClientRect().bottom),1000);
    const markdown = page.locator(".message.assistant .markdown-content").first();
    assert.equal(await markdown.locator("strong").textContent(),"现在还不能启动正式问卷");
    assert.equal(await markdown.locator("table tbody tr").count(),2);
    assert.equal(await markdown.locator("ol li").count(),2);
    assert.ok(!(await markdown.textContent()).includes("**"));
    assert.equal(await markdown.locator("p").first().evaluate(element=>getComputedStyle(element).whiteSpace),"pre-line");
    const tableScroll = markdown.locator(".markdown-table-scroll");
    assert.ok(await tableScroll.evaluate(element=>element.scrollWidth>=element.clientWidth));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));

    await page.getByRole("button",{name:"切换到浅色模式"}).waitFor();
    assert.ok(await page.locator("html").evaluate(element => element.classList.contains("dark")));
    assert.equal(await page.locator(".field-card").first().evaluate(element => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0)");
    assert.equal(await page.locator(".field-card").first().evaluate(element => getComputedStyle(element).color), "rgb(232, 237, 245)");
    assert.equal(await page.locator(".mentor-panel").evaluate(element => getComputedStyle(element).backgroundColor), "rgb(29, 34, 43)");
    const screenshots = join(root,".qa-results","mentor-panel");await mkdir(screenshots,{recursive:true});
    await page.screenshot({animations:'disabled',path:join(screenshots,"dark.png"),fullPage:true});
    await page.getByRole("button",{name:"切换到浅色模式"}).click();
    assert.equal(await page.evaluate(() => localStorage.getItem("venture-mentor-theme")),"light");
    await page.reload();
    await page.getByRole("heading",{name:"穿搭助手",exact:true}).waitFor();
    assert.ok(await page.locator("html").evaluate(element => element.classList.contains("light")));
    await page.getByRole("button",{name:"切换到深色模式"}).click();
    await page.reload();
    await page.getByRole("button",{name:"切换到浅色模式"}).waitFor();
    await page.getByRole("button",{name:"切换到浅色模式"}).click();
    await draft.fill("这里是尚未发送的访谈问题，请保留。");
    await page.locator('input[type="file"]').setInputFiles({name:"测试材料.txt",mimeType:"text/plain",buffer:Buffer.from("真实访谈材料：请不要在切换时丢失。")});
    await page.getByText("测试材料.txt ·",{exact:false}).waitFor();
    await page.mouse.move(300,20);
    assert.equal(await page.locator(".mentor-resize-grip").evaluate(element => getComputedStyle(element).opacity), "0");
    const initial = await handle.boundingBox();
    await page.mouse.move(initial.x+initial.width/2, initial.y+initial.height/2);
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".mentor-resize-grip")).opacity === "1");
    await page.mouse.down();await page.mouse.move(initial.x+initial.width/2-160,initial.y+initial.height/2,{steps:8});await page.mouse.up();
    await pollWidth(680);
    assert.ok(!await page.locator(".chat-resizing").count());
    // Pointer capture keeps resizing when the mouse leaves the visible divider.
    const wide = await handle.boundingBox();
    await page.mouse.move(wide.x+8,wide.y+120);await page.mouse.down();await page.mouse.move(1,wide.y+120,{steps:5});await page.mouse.up();
    await pollWidth(widestAllowed);
    assert.ok(await page.locator(".main-panel").evaluate(element => element.getBoundingClientRect().width)>=320);
    const widest = await handle.boundingBox();
    await page.mouse.move(widest.x+8,widest.y+120);await page.mouse.down();await page.mouse.move(1439,widest.y+120,{steps:5});await page.mouse.up();
    await pollWidth(360);
    await handle.focus();await page.keyboard.press("ArrowLeft");await pollWidth(380);await page.keyboard.press("End");await pollWidth(widestAllowed);await page.keyboard.press("Home");await pollWidth(360);
    for(let i=0;i<8;i++) await page.keyboard.press("ArrowLeft");
    await pollWidth(520);const savedWidth = await panelWidth();
    await page.screenshot({path:join(screenshots,"resized.png"),fullPage:true});

    await page.getByRole("button",{name:"全屏显示导师对话"}).click();
    await page.getByRole("dialog").waitFor();
    const fullBounds = await panel.boundingBox();approx(fullBounds.x,0);approx(fullBounds.y,0);approx(fullBounds.width,1440);approx(fullBounds.height,1000);
    approx((await page.locator('.conversation').boundingBox()).width,1440);
    approx((await page.locator('.composer').boundingBox()).width,1440);
    assert.equal(await page.locator(".main-panel").isVisible(),false);
    assert.equal(await handle.count(),0);
    assert.equal(await draft.inputValue(),"这里是尚未发送的访谈问题，请保留。");
    assert.ok(await page.getByText("测试材料.txt ·",{exact:false}).isVisible());
    assert.ok(await page.getByText("现在还不能启动正式问卷",{exact:true}).isVisible());
    await page.getByRole("checkbox",{name:"联网",exact:true}).focus();await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")),"切换到深色模式");
    await page.keyboard.press("Shift+Tab");assert.equal(await page.evaluate(() => document.activeElement.type),"checkbox");
    await page.screenshot({path:join(screenshots,"fullscreen.png"),fullPage:true});
    await panel.getByRole("button",{name:"切换到深色模式"}).click();
    assert.equal(await page.locator(".mentor-panel-fullscreen").evaluate(element => getComputedStyle(element).backgroundColor), "rgb(29, 34, 43)");
    await page.screenshot({path:join(screenshots,"dark-fullscreen.png"),fullPage:true});
    await panel.getByRole("button",{name:"切换到浅色模式"}).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button",{name:"全屏显示导师对话"}).waitFor();await pollWidth(savedWidth);
    assert.ok(await page.locator(".main-panel").isVisible());
    await page.getByRole("button",{name:"全屏显示导师对话"}).click();await page.getByRole("button",{name:"退出导师全屏"}).click();await pollWidth(savedWidth);
    await page.getByRole("button",{name:"显示或收起导师"}).click();assert.equal(await panel.count(),0);
    await page.getByRole("button",{name:"显示或收起导师"}).click();await pollWidth(savedWidth);
    assert.equal(await draft.inputValue(),"这里是尚未发送的访谈问题，请保留。");

    for (const viewportWidth of [1920,1280,1024,900,820,781]) {
      await page.setViewportSize({width:viewportWidth,height:900});
      const available = await page.locator(".body-grid").evaluate(element => element.clientWidth);
      await pollWidth(Math.min(savedWidth,mentorPanelBounds(available).max));
      approx((await panel.boundingBox()).y,0);approx((await panel.boundingBox()).height,900);
      approx(await page.locator('.composer').evaluate(element=>element.getBoundingClientRect().bottom),900);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth+1));
    }
    await page.setViewportSize({width:750,height:900});
    await pollWidth(750);
    approx((await panel.boundingBox()).y,76);approx((await panel.boundingBox()).height,824);
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".mentor-resize-handle")).display === "none");
    approx(await panelWidth(),390);
    await page.getByRole("button",{name:"全屏显示导师对话"}).click();
    const mobile = await panel.boundingBox();approx(mobile.x,0);approx(mobile.y,0);approx(mobile.width,390);approx(mobile.height,844);
    assert.ok(await draft.isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth+1));
    assert.ok(await tableScroll.evaluate(element=>element.scrollWidth>element.clientWidth));
    await tableScroll.evaluate(element=>{element.scrollLeft=element.scrollWidth});
    assert.ok(await tableScroll.evaluate(element=>element.scrollLeft>0));

    await page.screenshot({path:join(screenshots,"mobile-fullscreen.png"),fullPage:true});
    await page.getByRole("button",{name:"收起导师",exact:true}).click();assert.equal(await panel.count(),0);
    await page.getByRole("button",{name:"显示或收起导师"}).click();
    assert.equal(await page.getByRole("dialog").count(),0);
    assert.equal(await draft.inputValue(),"这里是尚未发送的访谈问题，请保留。");
    assert.equal(agentRequests,0);assert.deepEqual(errors,[]);
    // Verify the actual Studio UI follows saved turn results with no confirmation step.
    await page.setViewportSize({width:1440,height:1000});
    await page.reload();
    await page.getByRole("heading",{name:"穿搭助手",exact:true}).waitFor();
    let turn = 0;
    await page.unroute("**/api/agent");
    await page.route("**/api/agent", async route => {
      turn++;
      const request = route.request().postDataJSON();
      const messageId = `ui-user-${turn}`;
      const proposal = {id:`ui-proposal-${turn}`,reply:"已自动同步到项目记录。",createdAt:new Date().toISOString(),fields:{},artifact:null,hypothesis:null,evidence:[]};
      const taskSection = turn <= 2 ? "research" : turn === 3 ? "hypotheses" : "overview";
      if (turn <= 2) proposal.artifact={section:"research",title:"校园访谈提纲",content:"一、访谈目标\n了解最近的穿搭经历。\n二、访谈问题\n请回忆最近一次挑选衣服的过程。\n"+(turn===2?"新版追问：当时还尝试过哪些方式？":"末尾问题：还有什么容易被忽略？"),sources:[],limitations:"尚未试访",nextStep:"邀请两位同学试访"};
      if (turn === 3) {
        proposal.hypothesis={text:"同学挑选衣服需要较长时间",category:"用户",priority:"高",nextStep:"继续访谈核对"};
        proposal.evidence=[{hypothesisId:"H01",hypothesisVersion:1,direction:"support",quote:"挑衣服花了二十分钟",source:messageId}];
      }
      if (turn === 4) {proposal.fields={audience:"每天挑选衣服的大学生"};proposal.fieldMeta={audience:{origin:"用户原话",statementKind:"陈述",verification:"未核验",sourceRef:messageId}};}
      state.messages.push({id:messageId,role:"user",content:request.message,at:new Date().toISOString()},{id:`ui-reply-${turn}`,role:"assistant",content:proposal.reply,at:new Date().toISOString(),task:{label:"项目同步",section:taskSection}});
      const record = applyProposal(state,proposal);
      if(record)state.messages.at(-1).artifactId=record.id;
      await route.fulfill({json:{state,revision:turn+1}});
    });
    await draft.fill("生成校园访谈提纲");await page.getByRole("button",{name:"发送",exact:true}).click();
    await page.locator(".main-panel h1").filter({hasText:"调研验证"}).waitFor();
    await page.locator(".conversation .artifact-content").filter({hasText:"末尾问题：还有什么容易被忽略？"}).waitFor();
    assert.equal(await page.locator(".conversation details.analysis-record[open]").count(),1);
    assert.equal(await page.locator(".main-panel .artifact-card").count(),1);
    assert.equal(await page.getByRole("button",{name:"确认保存",exact:true}).count(),0);
    assert.equal(await page.locator(".pending-review").count(),0);
    await draft.fill("修改访谈提纲，增加其他解决方式的追问");await page.getByRole("button",{name:"发送",exact:true}).click();
    await page.locator(".conversation .artifact-content").filter({hasText:"新版追问：当时还尝试过哪些方式？"}).waitFor();
    assert.equal(await page.locator(".main-panel .artifact-card").count(),2);
    assert.equal(state.artifacts.at(-1).version,2);
    await page.reload();
    await page.locator(".conversation .artifact-content").filter({hasText:"新版追问：当时还尝试过哪些方式？"}).waitFor();
    assert.equal(await page.locator(".conversation .artifact-card").count(),2);
    assert.equal(await page.locator(".main-panel .artifact-card").count(),2);
    await page.screenshot({path:join(screenshots,"auto-saved-outline.png"),fullPage:true});
    await draft.fill("我昨天挑衣服花了二十分钟，记录这个经历和相关假设。");await page.getByRole("button",{name:"发送",exact:true}).click();
    await page.locator(".main-panel .hyp-card h3").filter({hasText:"同学挑选衣服需要较长时间"}).waitFor();
    assert.ok((await page.locator(".hyp-meta").textContent()).includes("支持材料 1"));
    await page.locator(".hyp-card > details > summary").click();
    assert.ok(await page.locator(".hyp-card").getByText("支持：挑衣服花了二十分钟",{exact:false}).isVisible());
    await page.screenshot({path:join(screenshots,"synced-evidence.png"),fullPage:true});
    await draft.fill("目标用户是每天挑选衣服的大学生");await page.getByRole("button",{name:"发送",exact:true}).click();
    await page.locator(".field-card p").filter({hasText:"每天挑选衣服的大学生"}).waitFor();
    await page.locator(".field-card").filter({hasText:"每天挑选衣服的大学生"}).locator(".field-provenance summary").click();
    assert.ok(await page.locator(".field-card").filter({hasText:"每天挑选衣服的大学生"}).getByText("自动记录",{exact:false}).isVisible());
    assert.deepEqual(errors,[]);
    console.log("同步浏览器验收通过：提纲自动保存、对话展开全文、左侧记录、连续修订、刷新保留、假设证据与项目字段同步，无确认按钮。");
    console.log("导师面板浏览器验收通过：悬停拖动、宽度上下限、键盘调宽、全屏/Esc/按钮退出、焦点循环、草稿/材料/历史保留、手机及关闭重开。");
  }
} finally {
  if(browser) await browser.close();
  if(preview) await preview.close();
  if(uiDir) {assert.ok(isAbsolute(uiDir)&&uiDir.startsWith(join(root,".ui-panel-check-")));await rm(uiDir,{recursive:true,force:true});}
  assert.ok(isAbsolute(temp)&&temp.startsWith(join(tmpdir(),"mentor-panel-")));await rm(temp,{recursive:true,force:true});
}
