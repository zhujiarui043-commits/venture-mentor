import assert from "node:assert/strict";
import {mkdtemp, readFile, writeFile, mkdir, rm} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import ts from "typescript";
import {createServer} from "vite";
import react from "@vitejs/plugin-react";

const root=fileURLToPath(new URL("../",import.meta.url));
const uiDir=await mkdtemp(join(root,".ui-numbering-check-"));
let server,browser;
try {
  const code=ts.transpileModule(await readFile(join(root,"lib/types.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const {emptyProject,sections,sectionLabels,analysisRecordPrefixes,diagnosisNames,canvasNames}=await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  const state=emptyProject("numbering-qa");
  state.title="编号验收项目";
  state.materials=[{id:"M07",name:"访谈甲.docx",content:"真实引文 H09 M07",at:"2026-10-10"},{id:"M23",name:"MX类访谈乙.docx",content:"另一份材料",at:"2026-10-10"}];
  state.hypotheses=["H09","H27"].map(id=>({id,version:4,text:`假设 ${id}`,category:"用户",stage:"待探索",priority:"高",nextStep:"继续访谈",evidenceStatus:"未进入验证",support:[],opposition:[],history:[],evidenceRecords:[]}));
  for(let round=1;round<=2;round++)for(const section of sections){
    const a={id:`${section}-${round}`,recordId:`A${String(state.artifacts.length*7+13)}`,section,title:`${analysisRecordPrefixes[section]}xx类${sectionLabels[section]}记录 ${round} · V${round}`,version:round,content:`第 ${round} 次完整记录`,sources:[{label:"用户材料 M07"}],limitations:"验收样例",nextStep:"核对",createdAt:"2026-10-10"};
    if(section==="diagnosis")a.diagnosis={summary:`当前诊断 ${round}`,keyRisk:"测试风险",firstQuestion:"测试问题",dimensions:diagnosisNames.map(name=>({name,attention:"需要关注",priority:"中",judgment:`诊断 ${round}`,sourceRefs:["M07"],hypothesisRefs:["H09"],limitations:"样例",riskImpact:"样例",nextStep:"样例",score:round,scoreReason:"测试依据"}))};
    if(section==="canvas")a.canvas={modules:canvasNames.map(name=>({name,content:`最新画布内容 ${round}`,sourceRefs:["M07"],hypothesisRefs:["H09"],status:"待验证",limitations:"样例",nextStep:"样例"})),conflicts:[]};
    if(section==="competitors")a.competition={scope:"测试工具",competitors:[{name:`产品 ${round}`,kind:"候选竞品",audience:"学生",task:"整理",feature:"总结",price:"待核实",limitation:"待核实",sourceId:"M07",sourceQuote:"真实引文 H09 M07",sourceDate:"",verification:"用户材料待核"}],gap:"待验证",counterExplanation:"待验证",unknowns:[]};
    state.artifacts.push(a);
  }
  state.messages=[1,2].map(round=>({role:"assistant",content:"竞品分析已保存",at:"2026-10-10",artifactId:`competitors-${round}`}));
  await writeFile(join(uiDir,"index.html"),'<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
  await writeFile(join(uiDir,"main.tsx"),"import React from 'react';import {createRoot} from 'react-dom/client';import Studio from '@/app/studio';import {ThemeProvider} from '@/components/theme-provider';import '@/app/globals.css';createRoot(document.getElementById('root')!).render(<ThemeProvider><Studio/></ThemeProvider>);");
  server=await createServer({configFile:false,root:uiDir,cacheDir:join(uiDir,".vite-cache"),plugins:[react()],resolve:{alias:{"@":root}},server:{host:"127.0.0.1",port:0,fs:{allow:[root]}}});
  await server.listen();
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:"playwright");
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:"reduce"}),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/api/project",route=>route.fulfill({json:{state,revision:1}}));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.locator(".competition-table").waitFor();
  assert.deepEqual(await page.locator(".conversation .artifact-top span").allTextContents(),["分析记录 C01","分析记录 C02"]);
  for(const section of sections){
    await page.getByRole("button",{name:sectionLabels[section],exact:true}).click();
    const prefix=analysisRecordPrefixes[section];
    assert.deepEqual(await page.locator(".main-panel .artifact-top span").allTextContents(),[`分析记录 ${prefix}02`,`分析记录 ${prefix}01`]);
    assert.deepEqual(await page.locator(".main-panel .record-heading h3").allTextContents(),[`${sectionLabels[section]}记录 2`,`${sectionLabels[section]}记录 1`]);
    if(section==="diagnosis"){
      assert.equal(await page.locator(".diagnosis-summary strong").textContent(),"当前诊断 2");
      assert.ok((await page.locator(".diagnosis-score").allTextContents()).every(text=>text==="2 / 4"));
      await page.locator(".dimension-details").first().locator("summary").click();
      assert.ok((await page.locator(".dimension-details").first().textContent()).includes("H01：假设 H09"));
    }
    if(section==="canvas")assert.ok((await page.locator(".canvas-cell>p").allTextContents()).every(text=>text==="最新画布内容 2"));
    if(section==="research"){
      assert.deepEqual((await page.locator(".material-card>summary").filter({hasText:/^M\d+ ·/u}).allTextContents()).map(text=>text.split(" · ")[0]),["M02","M01"]);
      assert.ok((await page.locator(".material-card>summary").filter({hasText:/^M02 ·/u}).textContent()).includes("M02 · 访谈乙.docx"));
      await page.locator(".material-card>summary").filter({hasText:/^M01 ·/u}).click();
      assert.equal(await page.locator(".material-card").filter({has:page.locator(":scope > summary",{hasText:/^M01 ·/u})}).locator("pre").textContent(),"真实引文 H09 M07");
    }
    if(section==="hypotheses")assert.deepEqual(await page.locator(".hyp-top b").allTextContents(),["H02","H01"]);
  }
  await page.reload();await page.locator(".competition-table").waitFor();
  assert.deepEqual(await page.locator(".main-panel .artifact-top span").allTextContents(),["分析记录 C02","分析记录 C01"]);
  const screenshots=join(root,".qa-results","record-numbering");await mkdir(screenshots,{recursive:true});
  await page.locator(".main-panel .analysis-record").last().scrollIntoViewIfNeeded();
  await page.screenshot({path:join(screenshots,"desktop.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.locator("#mentor-toggle").click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(await page.locator(".main-panel .artifact-top span").allTextContents(),["分析记录 C02","分析记录 C01"]);
  await page.screenshot({path:join(screenshots,"mobile.png"),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log("编号浏览器验收通过：六个模块独立连续降序、旧编号迁移、去除编号版本后缀、对话与左侧同步、最新诊断与画布、材料与假设引用、刷新与手机显示。");
} finally {
  if(browser)await browser.close();if(server)await server.close();
  await rm(uiDir,{recursive:true,force:true});
}
