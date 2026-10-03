import {EscapeEngine} from './core/engine.js';
import {validateWorld, restoreState} from './core/validation.js';
import {screenPoint} from './core/geometry.js';
import {visibleTargetPoints} from './core/inspection.js';
import {paintDungeon} from './view/adv/dungeon.js';
import {projectDungeon, zoneName} from './view/projection.js';
const $=id=>document.getElementById(id), canvas=$('dungeon'), storageKey='saw.escape.v1';
let engine, world, lastFocus, wasBusy=false, saveError='', hideUI=false, debug=false, movementAt=0, touchReleased=false;
const faceNames={north:'北',east:'東',south:'南',west:'西'};
function save(){
  if(!engine||engine.busy)return;
  try{localStorage.setItem(storageKey,JSON.stringify(engine.snapshot()));saveError='';$('saveStatus').textContent='自動保存済み';}
  catch(error){saveError=error.message;$('saveStatus').textContent='保存できません（探索は続行可）';}
}
function paintMap(){
  const ctx=$('map').getContext('2d'),w=world.tiles[0].length,h=world.tiles.length,size=18,ox=(260-w*size)/2,oy=(240-h*size)/2;
  ctx.fillStyle='#151e18';ctx.fillRect(0,0,260,240);const seen=new Set(engine.state.seen);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    ctx.fillStyle=seen.has(`${x},${y}`)?world.tiles[y][x]==='.'?'#64745a':'#303e2e':'#1d291e';ctx.fillRect(ox+x*size+1,oy+y*size+1,size-2,size-2);
  }
  const p=engine.state.location,angle={north:0,east:Math.PI/2,south:Math.PI,west:-Math.PI/2}[p.facing];
  ctx.save();ctx.translate(ox+(p.x+.5)*size,oy+(p.y+.5)*size);ctx.rotate(angle);ctx.fillStyle='#e0ba79';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(6,6);ctx.lineTo(0,3);ctx.lineTo(-6,6);ctx.closePath();ctx.fill();ctx.restore();
}
function updateHint(){
  $('hint').textContent=engine.hint||(engine.state.mode==='inspect'?'カーソルで画面を調べます。Escで戻ります。':'周囲を探索できます。気になる設備の方を向いて、詳細調べるを選んでください。');
  const hover=engine.hover;
  $('scene').classList.toggle('target-hover',Boolean(hover)&&!engine.busy);
  $('cursorLabel').textContent=hover?.label??'';
  if(!hover||engine.busy){$('cursorLabel').hidden=true;$('focusMarker').hidden=true;}
  if(debug)$('debugText').textContent=JSON.stringify({location:engine.state.location,mode:engine.state.mode,busy:engine.busy,flags:engine.state.flags,eventCount:engine.eventCount,lastEvent:engine.lastEvent,saveError},null,2);
}
function render({scene=true}={}){
  if(scene){paintDungeon(canvas,projectDungeon(world,engine.state),false);paintMap();}
  const inspect=engine.state.mode==='inspect',busy=engine.busy;
  $('scene').classList.toggle('inspect',inspect);
  $('zoneName').textContent=zoneName(world,engine.state.location);
  const loc=engine.state.location;
  $('position').textContent=`${faceNames[loc.facing]}向き / ${String(loc.x).padStart(2,'0')}, ${String(loc.y).padStart(2,'0')}`;
  $('modeName').textContent=busy?'調査記録':inspect?'詳細調査モード':'探索モード';
  $('sceneInstruction').textContent=inspect?'気になる箇所をクリックして調査':'矢印キーで移動・旋回';
  $('exitInspect').hidden=!inspect;$('exitInspect').disabled=busy;
  $('inspectButton').textContent=inspect?'調査を終える　Esc':'詳細調べる　I';
  $('inspectButton').setAttribute('aria-pressed',String(inspect));$('inspectButton').disabled=busy;
  $('controlState').textContent=inspect?'INSPECT':'MOVE';
  $('inspectHelp').textContent=inspect?'移動を止めて調査中です。反応する箇所はカーソルが変わります。':'画面の中の設備をカーソルで調べます。';
  document.querySelectorAll('[data-move]').forEach(b=>b.disabled=inspect||busy);
  $('hideUI').disabled=busy;$('resetButton').disabled=busy;
  $('targetList').hidden=!inspect;
  const list=$('accessibleTargets');list.replaceChildren();
  if(inspect)for(const {target,point} of visibleTargetPoints(world,engine.state)){
    const b=document.createElement('button');b.textContent=target.label;b.disabled=busy;
    b.onclick=()=>{engine.pointer('pointerdown',point,{pointerType:'keyboard'});engine.pointer('click',point,{pointerType:'keyboard'});render();save();};list.append(b);
  }
  if(inspect&&!list.children.length)list.textContent='この向きから手の届く調査箇所はありません。';
  $('log').replaceChildren(...engine.state.log.slice(-4).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  $('message').hidden=!engine.message;
  if(engine.message){$('messageTitle').textContent=engine.message.title;$('messageText').textContent=engine.message.text;$('advance').textContent=engine.queue.some(a=>a.op==='message')?'次へ　↵':'閉じる　↵';}
  document.querySelectorAll('.panels,.masthead,#help').forEach(el=>el.inert=busy);
  canvas.tabIndex=busy?-1:0;
  if(busy&&!wasBusy){lastFocus=document.activeElement;$('advance').focus({preventScroll:true});}
  if(!busy&&wasBusy){(lastFocus?.isConnected&&!lastFocus.disabled&&!lastFocus.closest('[inert]')?lastFocus:canvas).focus({preventScroll:true});}
  wasBusy=busy;updateHint();
}
function doMove(direction){
  if(performance.now()-movementAt<110)return;
  movementAt=performance.now();
  engine.move(direction);render();save();
}
function toggleInspect(value){if(engine.inspect(value)){render();canvas.focus({preventScroll:true});save();}}
function toggleUI(){if(engine.busy)return;hideUI=!hideUI;document.body.classList.toggle('ui-hidden',hideUI);$('hideUI').innerHTML=hideUI?'パネルを戻す <kbd>H</kbd>':'パネルを隠す <kbd>H</kbd>';$('hideUI').setAttribute('aria-pressed',String(hideUI));engine.cancelPointer();updateHint();}
async function start(){
  const response=await fetch(new URL('../data/building.json',import.meta.url));if(!response.ok)throw Error(`ビル定義を読み込めません (${response.status})`);
  world=await response.json();const errors=validateWorld(world);if(errors.length)throw Error(errors.join('\n'));
  engine=new EscapeEngine(world);
  try{const saved=localStorage.getItem(storageKey);if(saved)engine.state=restoreState(world,saved);}
  catch(error){saveError=error.message;engine.note('以前の保存データを読み込めなかったため、入口から開始します。');}
  // Stable public debugging interface for authoring and browser regression checks.
  window.saw={get engine(){return engine;},world,render,visibleTargets:()=>visibleTargetPoints(world,engine.state)};
  document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>doMove(b.dataset.move));
  $('inspectButton').onclick=()=>toggleInspect();$('exitInspect').onclick=()=>toggleInspect(false);
  $('advance').onclick=()=>{engine.advance();render();save();};$('hideUI').onclick=toggleUI;
  $('helpButton').onclick=()=>{$('help').hidden=!$('help').hidden;$('helpButton').setAttribute('aria-expanded',String(!$('help').hidden));};
  $('resetButton').onclick=()=>{$('resetConfirm').hidden=false;$('resetNo').focus();};
  $('resetNo').onclick=()=>{$('resetConfirm').hidden=true;$('resetButton').focus();};
  $('resetYes').onclick=()=>{engine=new EscapeEngine(world);$('resetConfirm').hidden=true;render();save();canvas.focus();};
  for(const type of ['pointermove','pointerdown','pointerup','click','contextmenu'])canvas.addEventListener(type,event=>{
    if(engine.state.mode!=='inspect'||engine.busy)return;
    if(type==='contextmenu')event.preventDefault();
    if(!event.isPrimary && type.startsWith('pointer'))return;
    const point=screenPoint(canvas.getBoundingClientRect(),event.clientX,event.clientY);
    if(type==='pointerdown')touchReleased=false;
    engine.pointer(type,point,{button:event.button,buttons:event.buttons,pointerType:event.pointerType||'mouse'});
    if(type==='pointerup'&&event.pointerType==='touch')touchReleased=true;
    if(type==='click')touchReleased=false;
    if(type==='click'||type==='contextmenu'){render();save();}
    else updateHint();
    if(point&&engine.hover&&!engine.busy){
      for(const id of ['focusMarker','cursorLabel']){const e=$(id);e.hidden=false;e.style.left=`${point.x*100}%`;e.style.top=`${point.y*100}%`;}
      $('cursorLabel').style.left=`${Math.max(.2,Math.min(.8,point.x))*100}%`;
    }
  });
  for(const type of ['pointerleave','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{
    // Touch releases implicit capture and leaves before its synthesized click.
    // Preserve only that completed tap; active drags/cancellations still clear it.
    if(touchReleased&&event.pointerType==='touch'&&type!=='pointercancel')return;
    touchReleased=false;engine.cancelPointer();updateHint();
  });
  window.addEventListener('blur',()=>{engine.cancelPointer();updateHint();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){engine.cancelPointer();updateHint();}});
  document.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    if(engine.busy){
      if(event.key==='Tab'){event.preventDefault();$('advance').focus();return;}
      if(['Enter',' ','Escape'].includes(event.key)){event.preventDefault();if(!event.repeat){engine.advance();render();save();}}return;
    }
    if(event.target.closest('input,textarea,select,[contenteditable=true]'))return;
    const key=event.key.toLowerCase();
    if(key==='escape'&&!$('resetConfirm').hidden){$('resetConfirm').hidden=true;return;}
    if(['i','escape','h','f2'].includes(key)){
      event.preventDefault();if(event.repeat)return;
      if(key==='i')toggleInspect();else if(key==='escape'&&engine.state.mode==='inspect')toggleInspect(false);
      else if(key==='h')toggleUI();else if(key==='f2'){debug=!debug;$('debug').hidden=!debug;updateHint();}return;
    }
    const direction={arrowup:'forward',w:'forward',arrowdown:'back',s:'back',arrowleft:event.shiftKey?'strafe_left':'left',a:event.shiftKey?'strafe_left':'left',arrowright:event.shiftKey?'strafe_right':'right',d:event.shiftKey?'strafe_right':'right',q:'strafe_left',e:'strafe_right'}[key];
    if(direction){event.preventDefault();doMove(direction);}
  });
  render();save();
}
start().catch(error=>{$('fatal').hidden=false;$('fatal').textContent=`起動できませんでした。${error.message}。READMEの起動手順を確認してください。`;console.error(error);});
