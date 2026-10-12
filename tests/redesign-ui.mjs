import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';

const root=fileURLToPath(new URL('../',import.meta.url));
const uiDir=await mkdtemp(join(root,'.ui-design-check-'));
const output=join(root,'.qa-results','redesign');
let server,browser;
try {
  const compiled=ts.transpileModule(await readFile(join(root,'lib/types.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const {emptyProject}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
  let state={...emptyProject('design-qa'),title:'校园穿搭助手',fields:{audience:'在意形象、时间有限的大学生。',scene:'上课、社团活动与日常出行前。',problem:'衣物不少，却难以快速决定合适的搭配。',alternative:'参考社交平台，或反复试穿。',solution:'基于已有衣物与日程，为大学生提供日常穿搭建议。',technicalAssumption:'通过衣物照片建立衣橱，推荐适合当天场景的组合。',revenue:'先验证持续使用，再探索订阅与增值服务。',channel:'校园社群与小规模同学推荐。',progress:'已完成初步访谈，准备验证核心使用场景。',resources:'两名产品设计成员、一名技术成员。',constraints:'优先验证需求，控制原型投入。'},materials:[{id:'M01',name:'探索性访谈记录',content:'访谈原话：我每天都要花二十分钟挑衣服。',at:'2026-10-10T10:00:00Z'}],hypotheses:[{id:'H01',version:1,text:'在意形象的大学生愿意每周使用日常穿搭建议，以减少出门前的选择时间。',category:'用户',priority:'高',stage:'待验证',evidenceStatus:'未进入验证',support:[],opposition:[],nextStep:'招募五名同学，记录一周实际选择过程。',history:[]}]};
  let authenticated=false,failNext=false,revision=1;
  const requests=[],errors=[];
  await writeFile(join(uiDir,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
  await writeFile(join(uiDir,'main.tsx'),"import React from 'react';import {createRoot} from 'react-dom/client';import Studio from '@/app/studio';import {ThemeProvider} from '@/components/theme-provider';import '@/app/globals.css';createRoot(document.getElementById('root')!).render(<ThemeProvider><Studio/></ThemeProvider>);");
  server=await createServer({configFile:false,root:uiDir,publicDir:join(root,"public"),cacheDir:join(uiDir,'.vite-cache'),plugins:[react()],resolve:{alias:{'@':root}},server:{host:'127.0.0.1',port:0,fs:{allow:[root]}}});await server.listen();
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/project',route=>route.fulfill(authenticated?{json:{state,revision}}:{status:401,json:{error:'请登录'}}));
  await page.route('**/api/login',route=>{
    const code=route.request().postDataJSON().identifier;
    authenticated=code==='design-qa-code';
    return route.fulfill(authenticated?{json:{ok:true}}:{status:401,json:{error:'测试码不正确'}});
  });
  await page.route('**/api/agent',route=>{
    const request=route.request().postDataJSON();requests.push(request);
    if(failNext){failNext=false;return route.fulfill({status:500,json:{error:'模拟连接失败，请重试'}});}
    const at='2026-10-10T10:00:00Z';
    state=structuredClone(state);revision++;
    for(const ref of request.references||[])state.materials.push({id:'M'+String(state.materials.length+1).padStart(2,'0'),name:ref.name,content:ref.text,at});
    const artifact={id:'qa-'+revision,section:'research',title:'校园穿搭访谈提纲',version:revision-1,createdAt:at,content:'## 访谈目标\n了解出门前挑选衣服的真实经历。\n\n## 访谈问题\n1. 回忆最近一次出门前挑选衣服的过程。\n2. 当时还尝试过哪些解决方式？',sources:[],limitations:'尚未开展正式访谈。',nextStep:'邀请五名同学试访。'};
    state.artifacts.push(artifact);state.messages.push({role:'user',content:request.message,at},{role:'assistant',content:'已整理为访谈提纲，项目记录自动同步。',artifactId:artifact.id,at});
    return route.fulfill({json:{state,revision}});
  });
  const url=`http://127.0.0.1:${server.httpServer.address().port}/`;
  await mkdir(output,{recursive:true});
  await page.goto(url);
  await page.getByRole('heading',{name:'进入你的工作空间',exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>document.fonts.check('16px "Qidian Han Sans"','启点工作空间')),true,'思源黑体未加载');
  assert.ok(await page.evaluate(()=>[...document.fonts].some(font=>font.family==='Qidian Han Sans'&&font.status==='loaded')),'实际字体加载失败');
  await page.waitForFunction(()=>{const intro=document.querySelector('.page-intro');return !intro||Number(getComputedStyle(intro).opacity)===1});await page.screenshot({animations:"disabled",path:join(output,'login-light.png'),fullPage:true});
  await page.getByPlaceholder('邮箱或测试码').fill('incorrect');await page.getByRole('button',{name:'进入工作空间',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'测试码不正确'}).waitFor();
  await page.getByPlaceholder('邮箱或测试码').fill('design-qa-code');await page.getByPlaceholder('邮箱或测试码').press('Enter');
  await page.getByRole('heading',{name:'校园穿搭助手',exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  const fontSession=await page.context().newCDPSession(page);
  await fontSession.send('DOM.enable');await fontSession.send('CSS.enable');
  const fontDocument=await fontSession.send('DOM.getDocument');
  const fontNode=await fontSession.send('DOM.querySelector',{nodeId:fontDocument.root.nodeId,selector:'.field-content'});
  const renderedFonts=await fontSession.send('CSS.getPlatformFontsForNode',{nodeId:fontNode.nodeId});
  assert.ok(renderedFonts.fonts.some(font=>font.isCustomFont&&font.familyName.includes('Qidian')),'中文正文未使用自托管思源黑体');
  await fontSession.detach();
  assert.equal(await page.locator('.field-card').first().evaluate(e=>getComputedStyle(e).borderLeftWidth),'0px');
  assert.ok(await page.locator('.field-content').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
  assert.notEqual(await page.locator('[data-slot=sidebar-inner]').evaluate(e=>getComputedStyle(e).backdropFilter),'none');
  await page.waitForFunction(()=>{const intro=document.querySelector('.page-intro');return !intro||Number(getComputedStyle(intro).opacity)===1});await page.screenshot({animations:"disabled",path:join(output,'overview-light.png'),fullPage:true});
  await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});
  await page.waitForFunction(()=>window.matchMedia('(prefers-contrast: more)').matches);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-slot=sidebar-inner]')).backdropFilter==='none');
  assert.equal(await page.locator('[data-slot=sidebar-inner]').evaluate(e=>getComputedStyle(e).backdropFilter),'none');
  assert.ok(await page.locator('.nav-selection').evaluate(e=>parseFloat(getComputedStyle(e).transitionDuration)<.01));
  await page.emulateMedia({reducedMotion:'no-preference',contrast:'no-preference'});
  const labels=['项目总览','创意诊断','竞品洞察','假设与证据','调研验证','商业画布'];
  for(const label of labels){
    await page.locator('.mentor-nav').getByRole('button',{name:label,exact:true}).click();
    await page.locator('.main-panel h1').filter({hasText:label}).waitFor();
    assert.equal(await page.locator('.mentor-nav').getByRole('button',{name:label,exact:true}).getAttribute('aria-current'),'page');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.locator('.mentor-nav').getByRole('button',{name:'调研验证',exact:true}).click();
  for(const mode of ['用户访谈','问卷调查','MVP 测试']){
    await page.getByRole('button',{name:mode,exact:true}).click();
    assert.equal(await page.getByRole('button',{name:mode,exact:true}).getAttribute('aria-pressed'),'true');
    await page.getByRole('heading',{name:mode,exact:true}).waitFor();
  }
  await page.getByRole('button',{name:'用户访谈',exact:true}).click();
  const draft=page.getByRole('textbox',{name:'与导师对话',exact:true});
  await draft.fill('请根据材料整理访谈提纲');
  await page.locator('input[type="file"]').setInputFiles([
    {name:'访谈.txt',mimeType:'text/plain',buffer:Buffer.from('我每天都要花二十分钟挑衣服。')},
    {name:'场景.md',mimeType:'text/markdown',buffer:Buffer.from('## 场景\n出门上课前选择衣物。')}
  ]);
  await page.getByText('已附 2/5 份材料',{exact:false}).waitFor();
  await draft.evaluate(element=>element.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true,cancelable:true})));
  assert.equal(requests.length,0,'中文输入法选词回车触发发送');
  failNext=true;await page.getByRole('button',{name:'发送',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'模拟连接失败'}).waitFor();
  assert.equal(await draft.inputValue(),'请根据材料整理访谈提纲');
  assert.ok(await page.getByText('已附 2/5 份材料',{exact:false}).isVisible());
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await page.locator('.main-panel .artifact-card').waitFor();
  assert.equal(requests.length,2);assert.equal(requests[1].references.length,2);
  assert.equal(await draft.inputValue(),'');assert.equal(await page.locator('.attachment-list').count(),0);
  await page.reload();await page.locator('.main-panel .artifact-card').waitFor();
  assert.equal(await page.locator('.main-panel .material-card > summary').filter({hasText:/^M\d+ ·/u}).count(),3);
  const download=page.waitForEvent('download');await page.locator('.main-panel').getByRole('button',{name:/导出.*Word/u}).click();
  assert.ok((await download).suggestedFilename().endsWith('.docx'));
  await page.waitForFunction(()=>{const intro=document.querySelector('.page-intro');return !intro||Number(getComputedStyle(intro).opacity)===1});await page.screenshot({animations:"disabled",path:join(output,'research-light.png'),fullPage:true});
  await page.getByRole('button',{name:'切换到深色模式',exact:true}).click();
  await page.waitForFunction(()=>{const intro=document.querySelector('.page-intro');return !intro||Number(getComputedStyle(intro).opacity)===1});await page.screenshot({animations:"disabled",path:join(output,'research-dark.png'),fullPage:true});
  await page.locator('.mentor-nav').getByRole('button',{name:'项目总览',exact:true}).click();
  await page.waitForFunction(()=>{const intro=document.querySelector('.page-intro');return !intro||Number(getComputedStyle(intro).opacity)===1});await page.screenshot({animations:'disabled',path:join(output,'overview-dark.png'),fullPage:true});
  await page.getByRole('button',{name:'切换到浅色模式',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.reload();await page.locator('.main-panel .artifact-card').waitFor();
  assert.equal(await page.locator('#mentor-toggle').getAttribute('aria-expanded'),'false');
  for(const label of labels){
    await page.getByRole('button',{name:'切换导航',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('dialog').getByRole('button',{name:label,exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('.main-panel h1').innerText(),label);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.getByRole('button',{name:'切换导航',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'项目总览',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>{const intro=document.querySelector('.page-intro');return !intro||Number(getComputedStyle(intro).opacity)===1});await page.screenshot({animations:"disabled",path:join(output,'overview-mobile.png'),fullPage:true});
  await page.locator('#mentor-toggle').click();await draft.waitFor();
  await draft.fill('手机端草稿');await page.getByRole('button',{name:'全屏显示导师对话',exact:true}).click();
  await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'退出导师全屏',exact:true}).click();
  assert.equal(await draft.inputValue(),'手机端草稿');
  await page.waitForFunction(()=>{const intro=document.querySelector('.page-intro');return !intro||Number(getComputedStyle(intro).opacity)===1});await page.screenshot({animations:"disabled",path:join(output,'mentor-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('改版浏览器验收通过：登录失败与重试、六个模块、三种调研模式、多材料上传、中文输入法、失败保留草稿与附件、重试保存、刷新恢复、Word下载、深浅色、手机导航收起、默认内容展示和全屏草稿保留。');
} finally {if(browser)await browser.close();if(server)await server.close();await rm(uiDir,{recursive:true,force:true});}
