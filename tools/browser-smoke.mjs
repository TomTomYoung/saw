import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from './serve.mjs';
const out=new URL('../test-results/',import.meta.url);await fs.mkdir(out,{recursive:true});
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.SAW_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  const url=`http://127.0.0.1:${server.address().port}/`;
  await page.goto(url);await page.waitForFunction(()=>window.saw?.engine);await page.waitForLoadState('networkidle');
  await page.screenshot({path:new URL('01-explore.png',out).pathname,fullPage:true});
  const canvas=page.locator('#dungeon');
  const pixels=await canvas.evaluate(c=>{const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data,s=new Set();for(let i=0;i<data.length;i+=128)s.add(`${data[i]},${data[i+1]},${data[i+2]}`);return s.size;});assert.ok(pixels>100,'textured scene');
  await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>saw.engine.state.location.y),8);
  await page.waitForTimeout(130);await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>saw.engine.state.location.facing),'east');
  await page.getByRole('button',{name:/詳細調べる/}).click();
  const origin=await page.evaluate(()=>({...saw.engine.state.location}));
  await page.keyboard.press('ArrowLeft');assert.deepEqual(await page.evaluate(()=>({...saw.engine.state.location})),origin);
  const center=async()=>{const b=await canvas.boundingBox();return {x:b.x+b.width*.5,y:b.y+b.height*.5};};
  let p=await center();await page.mouse.move(p.x,p.y);assert.match(await page.locator('#hint').textContent(),/配電盤/);
  await page.screenshot({path:new URL('02-inspect.png',out).pathname,fullPage:true});
  await page.mouse.click(p.x,p.y);await page.locator('#message').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>saw.engine.state.flags.power),true);
  await page.screenshot({path:new URL('03-event.png',out).pathname,fullPage:true});
  await page.mouse.click(p.x,p.y);assert.equal(await page.evaluate(()=>saw.engine.state.flags.power),true);
  await page.keyboard.press('ArrowUp');assert.deepEqual(await page.evaluate(()=>({...saw.engine.state.location})),origin);
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'advance');
  await page.keyboard.press('Enter');await page.locator('#message').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>saw.engine.state.mode),'inspect');
  await page.mouse.click(p.x,p.y,{button:'right'});assert.match(await page.locator('#messageText').textContent(),/金属の箱/);assert.equal(await page.evaluate(()=>saw.engine.state.flags.power),true);await page.keyboard.press('Escape');
  await page.reload();await page.waitForFunction(()=>window.saw?.engine);assert.equal(await page.evaluate(()=>saw.engine.state.flags.power),true);assert.deepEqual(await page.evaluate(()=>({...saw.engine.state.location})),origin);assert.equal(await page.evaluate(()=>saw.engine.state.mode),'explore');
  for(const width of [1440,900,390]){
    await page.setViewportSize({width,height:950});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);
    await page.keyboard.press('i');p=await center();await page.mouse.move(p.x,p.y);assert.equal(await page.evaluate(()=>saw.engine.hover?.id),'power_panel',`pick ${width}`);
    await page.mouse.click(p.x,p.y);await page.locator('#message').waitFor({state:'visible'});await page.getByRole('button',{name:/閉じる/}).click();await page.keyboard.press('Escape');
  }
  await page.screenshot({path:new URL('04-mobile.png',out).pathname,fullPage:true});
  await page.keyboard.press('h');assert.equal(await page.locator('#inspectButton').isVisible(),false);assert.equal(await page.locator('#hideUI').isVisible(),true);await page.locator('#hideUI').click();assert.equal(await page.locator('#inspectButton').isVisible(),true);
  await page.setViewportSize({width:1440,height:1000});
  await page.keyboard.press('i');await page.locator('#targetList summary').click();await page.getByRole('button',{name:'古い配電盤',exact:true}).click();await page.locator('#message').waitFor({state:'visible'});await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{saw.engine.state.location={x:6,y:5,facing:'north'};saw.render();});
  await page.waitForTimeout(130);await page.keyboard.press('Shift+ArrowLeft');assert.equal(await page.evaluate(()=>saw.engine.state.location.x),5);assert.equal(await page.evaluate(()=>saw.engine.state.location.facing),'north');
  await page.waitForTimeout(130);await page.keyboard.press('Shift+ArrowRight');assert.equal(await page.evaluate(()=>saw.engine.state.location.x),6);
  await page.screenshot({path:new URL('05-central-hall.png',out).pathname,fullPage:true});
  await page.evaluate(()=>localStorage.setItem('saw.escape.v1','{"broken":true}'));await page.reload();await page.waitForFunction(()=>window.saw?.engine);assert.equal(await page.evaluate(()=>saw.engine.state.location.y),9);
  // Touch pointer sequences use the same hit testing and events.
  const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const tp=await touch.newPage();tp.on('pageerror',e=>errors.push(e.message));await tp.goto(url);await tp.waitForFunction(()=>window.saw?.engine);await tp.evaluate(()=>{saw.engine.state.location={x:6,y:8,facing:'east'};saw.render();});await tp.getByRole('button',{name:/詳細調べる/}).tap();const box=await tp.locator('#dungeon').boundingBox();await tp.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await tp.locator('#message').waitFor({state:'visible'});assert.equal(await tp.evaluate(()=>saw.engine.state.flags.power),true);await tp.getByRole('button',{name:/閉じる/}).tap();assert.equal(await tp.locator('#message').isVisible(),false);await touch.close();
  assert.deepEqual(errors,[]);console.log('Browser checks passed: rendering, navigation, pointer events, modal guards, save/reload, keyboard targets, strafe, touch and 3 viewport sizes.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
