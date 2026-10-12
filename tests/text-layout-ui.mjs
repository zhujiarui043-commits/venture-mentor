import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';

const root=fileURLToPath(new URL('../',import.meta.url));
const dir=await mkdtemp(join(root,'.ui-text-layout-check-'));
const output=join(root,'.qa-results',process.env.TEXT_LAYOUT_QA_URL?'text-layout-online':'text-layout');
let server,browser;
try {
  const compiled=ts.transpileModule(await readFile(join(root,'lib/types.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const {emptyProject,diagnosisNames,canvasNames,sections,sectionLabels}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
  const at='2026-10-11T04:00:00Z';
  const prose='对于缺少明确 dress code 的正式场合，用户需要同时判断场景要求、已有衣物和自己的表达意图。先记录近期真实经历，再判断这是否是重复发生的问题。';
  const state={...emptyProject('text-layout-qa'),title:'校园穿搭与正式场景决策助手',fields:Object.fromEntries(['audience','scene','problem','alternative','solution','technicalAssumption','revenue','channel','progress','resources','constraints'].map(key=>[key,prose])),materials:[{id:'M01',name:'正式场景穿搭的探索性访谈记录与反向证据.txt',kind:'访谈记录',content:prose,at}],hypotheses:[{id:'H01',version:2,text:prose,category:'用户',priority:'高',stage:'待验证',evidenceStatus:'证据不一致',support:[],opposition:[],nextStep:'招募 3–5 位核心对象，记录判断困难发生在哪一步。',history:[]}]};
  const markdown='## 正式场景中的选择困难\n\n'+prose+'\n\n'+prose+'\n\n| 判断条件 | 现状与证据 |\n| --- | --- |\n| 场景标准 | M01 已记录，仍需核实 |\n\n[查看完整来源](https://example.com/'+ 'long-source-name-'.repeat(12)+')';
  state.artifacts=sections.map(section=>({id:'layout-'+section,section,title:section==='research'?'用户访谈提纲与正式场景判断问题':'正式场景判断依据与下一步验证计划',version:1,createdAt:at,content:markdown,sources:[],limitations:prose,nextStep:prose}));
  state.artifacts.find(a=>a.section==='diagnosis').diagnosis={summary:prose,keyRisk:prose,firstQuestion:prose,dimensions:diagnosisNames.map((name,i)=>({name,attention:'优先验证',priority:'高',judgment:prose,score:i%5,sourceRefs:['M01'],hypothesisRefs:['H01'],limitations:prose,riskImpact:prose,nextStep:prose}))};
  state.artifacts.find(a=>a.section==='canvas').canvas={modules:canvasNames.map(name=>({name,content:prose,sourceRefs:['M01'],hypothesisRefs:['H01'],status:'待验证',limitations:prose,nextStep:prose})),conflicts:[]};
  state.messages=[{role:'assistant',content:markdown,at}];
  await writeFile(join(dir,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
  await writeFile(join(dir,'main.tsx'),"import React from 'react';import {createRoot} from 'react-dom/client';import Studio from '@/app/studio';import {ThemeProvider} from '@/components/theme-provider';import '@/app/globals.css';createRoot(document.getElementById('root')!).render(<ThemeProvider><Studio/></ThemeProvider>);");
  server=await createServer({configFile:false,root:dir,publicDir:join(root,'public'),cacheDir:join(dir,'.vite-cache'),plugins:[react()],resolve:{alias:{'@':root}},server:{host:'127.0.0.1',port:0,fs:{allow:[root]}}});await server.listen();
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  let loggedIn=false;
  await page.route('**/api/project',route=>route.fulfill(loggedIn?{json:{state,revision:1}}:{status:401,json:{error:'请登录'}}));
  await page.route('**/api/login',route=>{loggedIn=true;return route.fulfill({json:{ok:true}})});
  const url=process.env.TEXT_LAYOUT_QA_URL||'http://127.0.0.1:'+server.httpServer.address().port;
  await mkdir(output,{recursive:true});
  // The previous two-column login minimums overflowed just above the tablet breakpoint.
  for(const width of [1920,1280,1121,1024,921,780,390,320]){
    await page.setViewportSize({width,height:1000});await page.goto(url);
    await page.getByRole('heading',{name:'进入你的工作空间',exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'登录页溢出：'+width);
    assert.ok(await page.locator('.team-login-card').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),'登录卡超出屏幕：'+width);
  }
  await page.getByPlaceholder('邮箱或测试码').fill('layout-qa');await page.getByRole('button',{name:'进入工作空间',exact:true}).click();
  const results=[];
  for(const width of [1920,1440,1280,1024,820,780,390,320]){
    await page.setViewportSize({width,height:1000});
    for(const chat of width>780?[true,false]:[false]){
      if((await page.locator('#mentor-toggle').getAttribute('aria-expanded')==='true')!==chat)await page.locator('#mentor-toggle').click();
      for(const section of sections){
        const label=sectionLabels[section];
        if(width<=780){await page.getByRole('button',{name:'切换导航',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:label,exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});}
        else await page.locator('.mentor-nav').getByRole('button',{name:label,exact:true}).click();
        await page.locator('.main-panel h1').filter({hasText:label}).waitFor();
        await page.evaluate(()=>document.fonts.ready);
        const metrics=await page.locator('.main-panel').evaluate(main=>{
          const style=getComputedStyle(main),contentWidth=main.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
          const overflows=[...main.querySelectorAll('h1,h2,h3,h4,h5,p,button,input,summary,.field-content,.empty-inline,.hyp-meta')].filter(e=>e.getClientRects().length&&!e.closest('.markdown-table-scroll,.comparison-scroll,.diagnosis-score-table,.structured-table-scroll')).filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>({tag:e.tagName,text:e.textContent?.slice(0,60),width:e.clientWidth,scroll:e.scrollWidth}));
          const card=main.querySelector('.research-card>div');
          const columns=selector=>{const e=main.querySelector(selector);return e?getComputedStyle(e).gridTemplateColumns.split(' ').length:null};
          return {contentWidth,cardWidth:card?.getBoundingClientRect().width,numbered:!!main.querySelector('.research-step'),overflows,dimensionColumns:columns('.dimension-grid'),canvasColumns:columns('.canvas-grid'),fieldColumns:columns('.field-grid')};
        });
        assert.deepEqual(metrics.overflows,[],`${width}px ${label} chat=${chat} 内容溢出`);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        assert.ok(await page.evaluate(()=>{const left=document.querySelector('.top-left').getBoundingClientRect(),actions=document.querySelector('.top-actions').getBoundingClientRect();return left.right<=actions.left+1}),'顶部导航与操作重叠：'+width+' '+label);
        if(metrics.cardWidth&&!metrics.numbered)assert.ok(metrics.cardWidth>=Math.min(metrics.contentWidth,760)-2,`${label} 正文错误落入编号列`);
        if(metrics.contentWidth<=640){if(metrics.dimensionColumns)assert.equal(metrics.dimensionColumns,1);if(metrics.canvasColumns)assert.equal(metrics.canvasColumns,1);}
        results.push({width,chat,section,...metrics});
        if(chat&&width===1440&&['hypotheses','competitors','diagnosis','canvas'].includes(section)||width===390&&['hypotheses','research'].includes(section)){
          await page.locator('.main-panel').evaluate(e=>e.scrollTop=0);await page.screenshot({animations:'disabled',path:join(output,`${section}-${width}.png`),fullPage:true});
        }
        if(section==='research')for(const mode of ['用户访谈','问卷调查','MVP 测试']){
          await page.getByRole('button',{name:mode,exact:true}).click();
          assert.ok(await page.locator('.research-switch').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'模式切换文字溢出');
          assert.ok(await page.locator('.research-card').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'调研入口溢出');
        }
      }
    }
  }
  // Resizing must reflow cards even while the window width stays constant.
  await page.setViewportSize({width:1440,height:1000});
  if(await page.locator('#mentor-toggle').getAttribute('aria-expanded')==='false')await page.locator('#mentor-toggle').click();
  await page.locator('.mentor-nav').getByRole('button',{name:'创意诊断',exact:true}).click();
  await page.locator('.mentor-resize-handle').focus();await page.keyboard.press('End');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.dimension-grid')).gridTemplateColumns.split(' ').length===1);
  await page.locator('.main-panel').evaluate(e=>e.scrollTop=0);await page.screenshot({animations:'disabled',path:join(output,'diagnosis-panel-widest.png')});
  await page.locator('.mentor-nav').getByRole('button',{name:'假设与证据',exact:true}).click();
  await page.getByRole('button',{name:'切换到深色模式',exact:true}).click();
  await page.locator('.main-panel').evaluate(e=>e.scrollTop=0);await page.screenshot({animations:'disabled',path:join(output,'hypotheses-dark-panel-widest.png')});
  await page.getByRole('button',{name:'全屏显示导师对话',exact:true}).click();
  assert.ok(await page.locator('.conversation').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.getByRole('button',{name:'退出导师全屏',exact:true}).click();
  await page.setViewportSize({width:320,height:844});
  assert.ok(await page.locator('.composer-options').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.screenshot({animations:'disabled',path:join(output,'mentor-320-dark.png')});
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'layout-metrics.json'),JSON.stringify(results,null,2));
  console.log(`文字布局验收通过：${results.length} 个页面/宽度/侧栏组合，登录断点、调研模式、拖宽导师、深色/全屏/手机，无正文和控件横向溢出。`);
}finally{if(browser)await browser.close();if(server)await server.close();await rm(dir,{recursive:true,force:true});}
