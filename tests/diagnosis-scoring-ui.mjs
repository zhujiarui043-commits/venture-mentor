import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const root=fileURLToPath(new URL('../',import.meta.url)),uiDir=await mkdtemp(join(root,'.ui-radar-check-'));
let server,browser;
try {
  const compiled=ts.transpileModule(await readFile(join(root,'lib/types.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const {emptyProject,diagnosisNames}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
  const now='2026-10-10T14:00:00Z',values=[0,1,2,3,4,2,3,4];
  const legacy=emptyProject('radar-ui');
  legacy.artifacts=[{id:'legacy-diagnosis',section:'diagnosis',title:'八维诊断',version:1,createdAt:now,content:'旧版诊断',limitations:'尚需验证',nextStep:'访谈',sources:[],diagnosis:{summary:'当前阶段的诊断',keyRisk:'证据仍有缺口',firstQuestion:'核对用户行为',dimensions:diagnosisNames.map(name=>({name,attention:'需要关注',priority:'中',judgment:'原有定性判断',sourceRefs:[],hypothesisRefs:[],limitations:'样本有限',riskImpact:'影响决策',nextStep:'补充材料'}))}}];
  legacy.hypotheses=[{id:'H01',version:1,text:'真实使用能减少整理时间',category:'需求',stage:'待探索',evidenceStatus:'证据不足',priority:'高',nextStep:'收集行为数据',support:[],opposition:[],history:[],assessment:{hypothesisId:'H01',hypothesisVersion:1,evidenceStatus:'证据不足',rationale:'当前资料尚不足以确认假设，需要结合样本、用户场景与实际行为继续评估。',limitations:'样本有限',nextStep:'收集证据',sourceIds:['M01'],evidence:[],assessedAt:now}}];
  legacy.messages=[{role:'assistant',content:'已生成诊断。',artifactId:'legacy-diagnosis',at:now}];
  await writeFile(join(uiDir,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
  await writeFile(join(uiDir,'main.tsx'),"import React from 'react';import {createRoot} from 'react-dom/client';import Studio from '@/app/studio';import {ThemeProvider} from '@/components/theme-provider';import '@/app/globals.css';createRoot(document.getElementById('root')!).render(<ThemeProvider><Studio/></ThemeProvider>);");
  server=await createServer({configFile:false,root:uiDir,cacheDir:join(uiDir,'.vite-cache'),plugins:[react()],resolve:{alias:{'@':root}},server:{host:'127.0.0.1',port:5196,fs:{allow:[root]}}});await server.listen();
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[],output=join(root,'.qa-results','diagnosis-scoring');await mkdir(output,{recursive:true});
  for(const mobile of [false,true]) {
    let saved=structuredClone(legacy),requests=0;
    const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,colorScheme:'light'});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/project',route=>route.fulfill({json:{state:saved,revision:2}}));
    await page.route('**/api/agent',route=>{
      const request=route.request().postDataJSON();assert.equal(request.section,'diagnosis');assert.match(request.message,/诊断/u);requests++;
      const artifact={...structuredClone(saved.artifacts[0]),id:'scored-diagnosis',version:2};
      artifact.diagnosis.scoringVersion='kb04-radar-v1';
      artifact.diagnosis.dimensions.forEach((d,i)=>Object.assign(d,{score:values[i],scoreReason:`第 ${values[i]} 档的具体评分依据`,scoreConfidence:'中',scoreUpdatedAt:now,scoreTriggerRefs:['M01']}));
      saved.materials=[{id:'M01',name:'验证材料',content:'目标用户与行为验证记录',at:now}];
      saved.artifacts.push(artifact);saved.messages.push({role:'assistant',content:'按新标准生成诊断。',artifactId:artifact.id,at:now});
      return route.fulfill({json:{state:saved,revision:2}});
    });
    const url=process.env.RADAR_QA_URL||`http://127.0.0.1:${server.httpServer.address().port}/`;
    await page.goto(url);
    await page.getByRole('button',{name:'按新标准生成诊断',exact:true}).waitFor();
    assert.equal(await page.locator('.main-panel .section-head').filter({has:page.getByRole('heading',{name:'八维诊断',exact:true})}).count(),0);
    const summaryStyle=await page.locator('.diagnosis-summary strong').evaluate(node=>({size:getComputedStyle(node).fontSize,leading:getComputedStyle(node).lineHeight}));
    assert.equal(summaryStyle.size,'16px');
    if(mobile)await page.getByRole('button',{name:'切换导航',exact:true}).click();
    await page.getByRole('button',{name:'假设与证据',exact:true}).click();
    await page.getByRole('heading',{name:'根据调研证据评估假设',exact:true}).waitFor();
    assert.match(await page.locator('.research-card').textContent(),/用户访谈、问卷调查与 MVP 测试/u);
    const hypothesisStyle=await page.locator('.hyp-assessment').first().evaluate(node=>({size:getComputedStyle(node).fontSize,leading:getComputedStyle(node).lineHeight}));
    assert.deepEqual(summaryStyle,hypothesisStyle);
    if(mobile)await page.getByRole('button',{name:'切换导航',exact:true}).click();
    await page.getByRole('button',{name:'创意诊断',exact:true}).click();
    await page.getByRole('button',{name:'按新标准生成诊断',exact:true}).waitFor();
    assert.equal(await page.locator('.diagnosis-radar .recharts-radar-polygon').count(),0);
    assert.deepEqual(await page.locator('.dimension-card .diagnosis-score').allTextContents(),Array(8).fill('未评分'));
    if(await page.locator('#mentor-toggle').getAttribute('aria-expanded')==='true')await page.locator('#mentor-toggle').click();
    await page.getByRole('button',{name:'按新标准生成诊断',exact:true}).click();
    const plot=page.locator('.diagnosis-radar-plot');await plot.locator('.recharts-radar-polygon').waitFor();
    await page.locator('#mentor-toggle').click();await plot.scrollIntoViewIfNeeded();
    assert.equal(requests,1);assert.equal(saved.artifacts[0].diagnosis.dimensions[0].score,undefined);
    assert.equal(await plot.locator('.recharts-polar-angle-axis-tick').count(),8);
    assert.deepEqual(await plot.locator('.recharts-polar-radius-axis-tick').allTextContents(),['0','1','2','3','4']);
    assert.equal(await plot.locator('[tabindex]:not([tabindex="-1"])').count(),0);
    assert.match(await plot.getAttribute('aria-label'),/目标用户明确度 0分，暂无法判断/u);
    assert.deepEqual(await page.locator('.dimension-card .diagnosis-score').allTextContents(),values.map(v=>`${v} / 4${v===0?' · 暂无法判断':''}`));
    const points=await plot.locator('.recharts-radar-dot').evaluateAll(nodes=>nodes.map(node=>({x:Number(node.getAttribute('cx')),y:Number(node.getAttribute('cy'))})));
    assert.equal(points.length,8);
    const radius=Math.hypot(points[4].x-points[0].x,points[4].y-points[0].y);
    assert.ok(radius>50,"图形半径坐标无效");
    for(let i=0;i<8;i++)assert.ok(Math.abs(Math.hypot(points[i].x-points[0].x,points[i].y-points[0].y)-radius*values[i]/4)<0.01,'分值未按固定0–4刻度绘制');
    for(const theme of ['light','dark']) {
      await page.evaluate(theme=>document.documentElement.classList.toggle('dark',theme==='dark'),theme);
      const before=await plot.evaluate(node=>node.innerHTML);const box=await plot.boundingBox();
      if(mobile)await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);else await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
      await page.mouse.move(box.x+10,box.y+10);
      assert.equal(await plot.locator('.recharts-active-dot').count(),0);assert.equal(await plot.evaluate(node=>node.contains(document.activeElement)),false);
      assert.equal(await plot.evaluate(node=>node.innerHTML),before);
      await page.locator('.main-panel').screenshot({path:join(output,`${mobile?'mobile':'desktop'}-${theme}-analysis.png`)});
      await plot.screenshot({path:join(output,`${mobile?'mobile':'desktop'}-${theme}.png`)});
    }
    await page.locator('.dimension-details').first().locator('summary').click();
    assert.ok(await page.locator('.dimension-details').first().getByText('第 0 档的具体评分依据',{exact:false}).isVisible());
    assert.match(await page.locator('.dimension-details').first().textContent(),/用户材料 M01/u);
    await page.locator('.diagnosis-score-rules summary').click();
    assert.equal(await page.locator('.diagnosis-score-table tbody tr').count(),8);
    assert.ok(await page.getByText('出现订金、预购、真实付款或其他强付费信号',{exact:true}).isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.reload();await plot.locator('.recharts-radar-polygon').waitFor();
    assert.deepEqual(await page.locator('.dimension-card .diagnosis-score').allTextContents(),values.map(v=>`${v} / 4${v===0?' · 暂无法判断':''}`));
    for(const edge of [0,4]) {
      saved.artifacts.at(-1).diagnosis.dimensions.forEach(d=>d.score=edge);
      await page.reload();await plot.locator('.recharts-radar-polygon').waitFor({state:'attached'});
      await plot.locator('.recharts-polar-radius-axis-tick').last().waitFor();
      assert.deepEqual(await plot.locator('.recharts-polar-radius-axis-tick').allTextContents(),['0','1','2','3','4']);
      assert.equal(await plot.locator('.recharts-radar-dot').count(),8);
      if(edge===0) {
        const dots=await plot.locator('.recharts-radar-dot').evaluateAll(nodes=>nodes.map(n=>`${n.getAttribute('cx')},${n.getAttribute('cy')}`));
        assert.equal(new Set(dots).size,1);
      }
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('八维评分浏览器验收通过：旧记录未评分、生成与刷新恢复、实际0–4半径、全0/全4固定刻度、评分依据与规则、手机布局、深浅色和无选中效果。');
} finally {if(browser)await browser.close();if(server)await server.close();await rm(uiDir,{recursive:true,force:true});}
