import assert from "node:assert/strict";
import {mkdtemp, readFile, writeFile, mkdir, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import ts from "typescript";
import {createServer} from "vite";
import react from "@vitejs/plugin-react";

const root=fileURLToPath(new URL("../",import.meta.url));
const temp=await mkdtemp(join(tmpdir(),"competitor-retention-ui-"));
const uiDir=await mkdtemp(join(root,".ui-retention-check-"));
let server,browser;
try {
  for(const name of ["types","competition-workspace"]){
    const compiled=ts.transpileModule(await readFile(join(root,`lib/${name}.ts`),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from "\.\/([a-z-]+)"/gu,'from "./$1.mjs"');
    await writeFile(join(temp,`${name}.mjs`),compiled);
  }
  const {emptyProject,numberAnalysisRecords}=await import(pathToFileURL(join(temp,"types.mjs")));
  const {currentCompetition,setCompetitionRetention,syncCompetitionWorkspace}=await import(pathToFileURL(join(temp,"competition-workspace.mjs")));
  let state=emptyProject("team-retention-ui"),revision=1,round=0,failSelection=false,selectionRequests=0;
  function appendSearch(names){
    round++;
    const competitors=names.map((name,index)=>({name,kind:"候选竞品",audience:"大学生",task:"访谈整理",feature:"总结访谈",price:`每月 ${round * 10} 元`,limitation:"待核实",verification:"网页资料待核",sourceId:`W0${index + 1}`,sourceQuote:`${name} supports interview summaries.`,sourceUrl:`https://example.com/round-${round}/${index}`,sourceDate:"2026-10-01",sourceRetrievedAt:"2026-10-10T10:00:00Z",citations:[]}));
    const artifact={id:`search-${round}`,section:"competitors",title:`第 ${round} 轮竞品搜索`,version:round,createdAt:"2026-10-10T10:00:00Z",content:"候选比较",limitations:"网页资料待核",nextStep:"核对来源",sources:[],competition:{scope:"访谈工具",competitors,gap:"待验证",counterExplanation:"现有产品可能满足需要",unknowns:[]}};
    syncCompetitionWorkspace(state,artifact,true);
    state.artifacts=numberAnalysisRecords([...state.artifacts,artifact]);
    state.messages.push({role:"assistant",content:"已更新搜索结果。",at:artifact.createdAt,artifactId:artifact.id});
    revision++;
  }
  appendSearch(["Alpha","Beta"]);
  await writeFile(join(uiDir,"index.html"),'<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
  await writeFile(join(uiDir,"main.tsx"),"import React from 'react';import {createRoot} from 'react-dom/client';import Studio from '@/app/studio';import {ThemeProvider} from '@/components/theme-provider';import '@/app/globals.css';createRoot(document.getElementById('root')!).render(<ThemeProvider><Studio/></ThemeProvider>);");
  server=await createServer({configFile:false,root:uiDir,cacheDir:join(uiDir,".vite-cache"),plugins:[react()],resolve:{alias:{"@":root}},server:{host:"127.0.0.1",port:0,fs:{allow:[root]}}});
  await server.listen();
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:"playwright");
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/api/project",route=>route.fulfill({json:{state,revision}}));
  await page.route("**/api/competitors/selection",async route=>{
    selectionRequests++;
    const body=route.request().postDataJSON();
    assert.deepEqual(Object.keys(body).sort(),["artifactId","competitorIndex","projectId","retained","revision"]);
    assert.equal(body.revision,revision);
    if(failSelection){failSelection=false;return route.fulfill({status:500,json:{error:"保存选择失败，请重试。"}})}
    assert.ok(setCompetitionRetention(state,body,body.retained));revision++;
    return route.fulfill({json:{state,revision}});
  });
  await page.route("**/api/agent",route=>{
    const body=route.request().postDataJSON();
    if(!body.webSearch){
      const current=currentCompetition(state);
      const artifact=structuredClone(current.artifact);
      artifact.id="verified-price";artifact.createdAt="2026-10-12T03:00:00Z";artifact.version++;
      artifact.competition.competitors[0].userVerifications={price:{quote:body.message,confirmedAt:artifact.createdAt}};
      artifact.competition.competitors[0].verification="部分字段已核实";
      syncCompetitionWorkspace(state,artifact,false);
      state.artifacts=numberAnalysisRecords([...state.artifacts,artifact]);
      state.messages.push({role:"user",content:body.message,at:artifact.createdAt},{role:"assistant",content:"已更新并保存竞品核实状态。",at:artifact.createdAt,artifactId:artifact.id,task:{section:"competitors",label:"竞品核实更新"}});
      revision++;
      return route.fulfill({json:{state,revision}});
    }
    appendSearch(round===1?["ALPHA","Gamma"]:["Delta"]);
    return route.fulfill({json:{state,revision}});
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.locator(".competition-table").waitFor();
  const table=page.locator(".competition-table");
  assert.equal(await table.locator("thead th").count(),3);
  await page.getByRole("checkbox",{name:"保留 Alpha",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.competition-selection-note')?.textContent?.includes('已保留 1 项'));
  assert.equal(selectionRequests,1);
  await page.reload();
  await page.getByRole("checkbox",{name:"保留 Alpha",exact:true}).waitFor();
  assert.ok(await page.getByRole("checkbox",{name:"保留 Alpha",exact:true}).isChecked());
  failSelection=true;
  await page.getByRole("checkbox",{name:"保留 Beta",exact:true}).click();
  await page.locator(".error").first().waitFor();
  assert.equal(await page.getByRole("checkbox",{name:"保留 Beta",exact:true}).isChecked(),false);
  await page.getByRole("button",{name:"联网搜索并分析",exact:true}).click();
  await page.getByRole("checkbox",{name:"保留 Gamma",exact:true}).waitFor();
  assert.deepEqual(await table.locator("tbody th strong").allTextContents(),["Alpha","Gamma"]);
  assert.ok((await table.locator("tbody tr").first().textContent()).includes("每月 10 元"));
  assert.ok((await table.locator("tbody tr").first().textContent()).includes("原始来源见 C01"));
  assert.equal(currentCompetition(state).rows[0].competitor.sourceUrl,"https://example.com/round-1/0");
  await page.getByRole("checkbox",{name:"保留 Alpha",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.competition-selection-note')?.textContent?.includes('已保留 0 项'));
  assert.deepEqual(await table.locator("tbody th strong").allTextContents(),["Alpha","Gamma"]);
  await page.getByRole("checkbox",{name:"保留 Gamma",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.competition-selection-note')?.textContent?.includes('已保留 1 项'));
  await page.getByRole("button",{name:"联网搜索并分析",exact:true}).click();
  await page.getByRole("checkbox",{name:"保留 Delta",exact:true}).waitFor();
  assert.deepEqual(await table.locator("tbody th strong").allTextContents(),["Gamma","Delta"]);
  assert.ok(await page.getByRole("checkbox",{name:"保留 Gamma",exact:true}).isChecked());
  assert.deepEqual(await page.locator('.main-panel .artifact-top span').allTextContents(),['分析记录 C03','分析记录 C02','分析记录 C01']);
  assert.ok(!(await page.locator('.conversation .artifact-top span').allTextContents()).some(text=>/V\d/u.test(text)));
  await page.reload();
  await page.locator('.competition-table').waitFor();
  assert.deepEqual(await page.locator('.main-panel .artifact-top span').allTextContents(),['分析记录 C03','分析记录 C02','分析记录 C01']);
  const screenshots=join(root,".qa-results","competitor-retention");await mkdir(screenshots,{recursive:true});
  await page.screenshot({path:join(screenshots,"desktop.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.locator("#mentor-toggle").click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await page.locator(".comparison-scroll").evaluate(node=>node.scrollWidth>node.clientWidth));
  await page.locator(".comparison-scroll").evaluate(node=>{node.scrollLeft=0});
  await page.getByRole("checkbox",{name:"保留 Delta",exact:true}).focus();
  await page.keyboard.press("Space");
  await page.waitForFunction(()=>document.querySelector('.competition-selection-note')?.textContent?.includes('已保留 2 项'));
  await page.screenshot({path:join(screenshots,"mobile.png"),fullPage:true});
  // The chat response updates the visible table immediately, including retained products.
  await page.setViewportSize({width:1440,height:1000});
  await page.locator("#mentor-toggle").click();
  const checkedName=currentCompetition(state).rows[0].competitor.name;
  await page.locator("textarea").fill(`${checkedName}的价格我已经核实过了`);
  await page.getByRole("button",{name:"发送",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.competition-table tbody tr')?.textContent?.includes('用户已核实'));
  assert.ok(await page.getByRole("checkbox",{name:`保留 ${checkedName}`,exact:true}).isChecked());
  assert.ok((await table.locator("tbody tr").first().textContent()).includes("用户已核实"));
  assert.ok(!(await table.locator("tbody tr").nth(1).textContent()).includes("用户已核实"));
  await page.reload();
  await page.locator(".competition-table").waitFor();
  assert.ok((await page.locator(".competition-table tbody tr").first().textContent()).includes("用户已核实"));
  await page.screenshot({path:join(screenshots,"user-verification.png"),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log("竞品浏览器验收通过：勾选与刷新、连续搜索保留、手机操作、核实对话发送后立即更新表格及刷新恢复。");
} finally {
  if(browser)await browser.close();
  if(server)await server.close();
  await rm(uiDir,{recursive:true,force:true});await rm(temp,{recursive:true,force:true});
}
