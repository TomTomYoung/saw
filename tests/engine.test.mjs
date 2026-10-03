import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {EscapeEngine} from '../src/core/engine.js';
import {validateWorld,restoreState} from '../src/core/validation.js';
import {pickTarget,visibleTargetPoints,wallPoint} from '../src/core/inspection.js';
import {moveLocation,screenPoint,pointInShape} from '../src/core/geometry.js';
import {traceDungeonRay} from '../src/view/adv/raycast.js';
const world=JSON.parse(await fs.readFile(new URL('../data/building.json',import.meta.url),'utf8'));
const panelEngine=()=>{const e=new EscapeEngine(structuredClone(world));e.state.location={x:6,y:8,facing:'east'};e.inspect(true);return e;};
const center={x:.5,y:.5};
const click=(e,p=center)=>{e.pointer('pointerdown',p);e.pointer('pointerup',p);return e.pointer('click',p);};
test('authored map and events validate; every target is reachable and selectable from its wall origin',()=>{
  assert.deepEqual(validateWorld(world),[]);
  for(const target of world.targets){const e=new EscapeEngine(world);e.state.location={x:target.wall.x,y:target.wall.y,facing:target.wall.side};const candidates=visibleTargetPoints(world,e.state);assert.ok(candidates.some(c=>c.target.id===target.id),target.id);}
});
test('cardinal movement, reverse and shift strafe preserve facing',()=>{
  for(const facing of ['north','east','south','west']){
    const p={x:5,y:5,facing};assert.deepEqual(moveLocation(moveLocation(p,'forward'),'back'),p);assert.deepEqual(moveLocation(moveLocation(p,'strafe_left'),'strafe_right'),p);
    assert.deepEqual(moveLocation(moveLocation(p,'left'),'right'),p);
  }
  const e=new EscapeEngine(world);e.state.location={x:6,y:10,facing:'south'};assert.equal(e.move('forward'),false);assert.equal(e.state.location.y,10);
});
test('enter inspection freezes movement and turning, exit restores navigation',()=>{
  const e=panelEngine(),before={...e.state.location};for(const d of ['forward','back','left','right','strafe_left','strafe_right'])assert.equal(e.move(d),false);assert.deepEqual(e.state.location,before);
  e.inspect(false);assert.equal(e.move('left'),true);
});
test('screen coordinates normalize for resize; outside/invalid points cannot hit',()=>{
  assert.deepEqual(screenPoint({left:40,top:80,width:1200,height:600},640,380),center);
  assert.deepEqual(screenPoint({left:10,top:10,width:300,height:150},160,85),center);
  assert.equal(screenPoint({left:0,top:0,width:0,height:100},0,0),null);
  const e=panelEngine();for(const p of [null,{x:-.1,y:.5},{x:NaN,y:.5},{x:.5,y:Infinity}])assert.equal(pickTarget(world,e.state,p),null);
});
test('same wall ray selects near fixture, but not hidden or distant equipment',()=>{
  const e=panelEngine();assert.equal(pickTarget(world,e.state,center).target.id,'power_panel');
  e.state.location.facing='west';assert.notEqual(pickTarget(world,e.state,center)?.target.id,'power_panel');
  e.state.location={x:6,y:9,facing:'north'};assert.notEqual(pickTarget(world,e.state,center)?.target.id,'staff_door');
  e.state.location={x:10,y:8,facing:'west'};assert.equal(visibleTargetPoints(world,e.state).some(t=>t.target.id==='power_panel'),false);
});
test('pointer events route with normalized payload; click changes actual state and art',()=>{
  const e=panelEngine();e.pointer('pointermove',center);assert.equal(e.hover.id,'power_panel');assert.match(e.hint,/配電盤/);
  assert.equal(e.lastEvent.type,'pointermove');assert.ok(e.lastEvent.local.u>=0&&e.lastEvent.local.u<=1);
  assert.equal(click(e),true);assert.equal(e.state.flags.power,true);assert.equal(e.state.appearances.power_panel,'on');assert.ok(e.busy);
  assert.equal(click(e),false);assert.equal(e.inspect(false),false);assert.equal(e.move('left'),false);
  e.advance();assert.equal(e.busy,false);assert.equal(e.state.mode,'inspect');click(e);assert.equal(e.state.flags.power,false);
});
test('down/up mismatches, cancellation and right click do not perform left click action',()=>{
  const e=panelEngine();assert.equal(e.pointer('click',center),false);
  e.pointer('pointerdown',center);assert.equal(e.pointer('click',{x:0,y:0}),false);assert.equal(e.state.flags.power,false);
  e.pointer('pointerdown',center);e.cancelPointer();assert.equal(e.pointer('click',center),false);
  e.pointer('contextmenu',center,{button:2});assert.ok(e.message);assert.equal(e.state.flags.power,false);e.advance();
  e.pointer('pointerdown',center,{button:2});assert.equal(e.pointer('click',center,{button:2}),false);
});
test('hover leave is delivered and no hover survives mode exit',()=>{
  const e=panelEngine();e.world.targets[0].events.pointerleave=[{id:'left',actions:[{op:'hint',text:'left'}]}];
  e.pointer('pointermove',center);e.cancelPointer();assert.equal(e.lastEvent.type,'pointerleave');assert.equal(e.hover,null);
  e.pointer('pointermove',center);e.inspect(false);assert.equal(e.hover,null);assert.equal(e.pointer('pointermove',center),false);
});
test('once, conditions, disable and queued dialogue resume safely',()=>{
  const e=panelEngine();e.world.targets[0].events.click=[{id:'once_test',once:true,actions:[{op:'message',text:'first'},{op:'flag.set',key:'power',value:true},{op:'message',text:'second'},{op:'target.enable',target:'power_panel',value:false}]}];
  click(e);assert.equal(e.message.text,'first');assert.equal(e.state.flags.power,false);assert.throws(()=>e.snapshot());
  e.advance();assert.equal(e.message.text,'second');assert.equal(e.state.flags.power,true);e.advance();assert.equal(pickTarget(e.world,e.state,center),null);
  e.state.enabled.power_panel=true;assert.equal(click(e),false);assert.equal(e.state.done.length,1);
});
test('conditions and overlapping priority agree with enabled state',()=>{
  const e=panelEngine(),t=structuredClone(e.world.targets[0]);t.id='overlap';t.priority=5;t.when={power:true};e.world.targets.push(t);
  assert.equal(pickTarget(e.world,e.state,center).target.id,'power_panel');e.state.flags.power=true;assert.equal(pickTarget(e.world,e.state,center).target.id,'overlap');e.state.enabled.overlap=false;assert.equal(pickTarget(e.world,e.state,center).target.id,'power_panel');
});
test('valid save restores at same location in exploration; malformed states rejected',()=>{
  const e=panelEngine();click(e);e.advance();const saved=e.snapshot(),s=restoreState(world,JSON.stringify(saved));assert.equal(s.mode,'explore');assert.equal(s.flags.power,true);assert.deepEqual(s.location,e.state.location);
  for(const change of [{version:99},{location:{x:-1,y:8,facing:'east'}},{flags:{unknown:true}},{flags:{}},{enabled:{unknown:false}},{appearances:{power_panel:'missing'}},{seen:['999,999']},{done:['missing']},{log:[123]}])assert.throws(()=>restoreState(world,JSON.stringify({...saved,...change})));
  assert.throws(()=>restoreState(world,'{'));assert.throws(()=>restoreState(world,'x'.repeat(262145)));
});
test('validator rejects broken targets, unsupported commands and hover side effects',()=>{
  for(const mutate of [w=>w.targets[0].wall.x=0,w=>w.targets[0].rect.width=2,w=>w.targets[0].events.click[0].actions=[{op:'eval'}],w=>w.targets[0].events.pointermove=[{id:'bad',actions:[{op:'flag.set',key:'power',value:true}]}],w=>w.targets[0].events.click[0].actions=[{op:'appearance.set',target:'missing',value:'on'}]]){const w=structuredClone(world);mutate(w);assert.ok(validateWorld(w).length);}
});
test('all supported shapes are deterministic and ray corners do not leak',()=>{
  assert.equal(pointInShape({type:'circle',x:.5,y:.5,radius:.2},.5,.5),true);assert.equal(pointInShape({type:'circle',x:.5,y:.5,radius:.2},0,0),false);
  assert.equal(pointInShape({type:'polygon',points:[[0,0],[1,0],[0,1]]},.1,.1),true);assert.equal(pointInShape({type:'polygon',points:[[0,0],[1,0],[0,1]]},.9,.9),false);
  const hit=traceDungeonRay({geometry:['###','#.#','##.']},1.5,1.5,1,1);assert.equal(hit.distance,.5);
  assert.ok(wallPoint(world,panelEngine().state.location,center));
});
