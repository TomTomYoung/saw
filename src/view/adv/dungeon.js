import {traceDungeonRay} from './raycast.js';
import {surfaceKey} from '../../core/inspection.js';
import {eyeElevation,traceFloorSegments,paintReliefPixels} from './dungeon-relief.js';
import {artRect} from './dungeon-art.js';
// Presentation only: collision, water depth and material references arrive in the snapshot.
const WIDTH=800,HEIGHT=400,FOCAL=WIDTH/(2*Math.tan(Math.PI/5.2)),EYE=.5,STRIDE=2;
const textures=new Map(),floorPixels=new WeakMap(),loaded=new WeakSet(),frames=new WeakMap();
function texture(src,draw){
  if(!src)return null;
  let entry=textures.get(src);
  if(entry){if(entry.pending)entry.draws.add(draw);return entry.image;}
  const image=new Image();entry={image,pending:true,draws:new Set([draw])};textures.set(src,entry);
  const finish=ok=>{entry.pending=false;if(ok)loaded.add(image);floorPixels.delete(image);const callbacks=[...entry.draws];entry.draws.clear();for(const callback of callbacks)callback();};
  image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=src;return image;
}
const drawable=image=>image&&loaded.has(image)&&image.naturalWidth;
const fraction=n=>n-Math.floor(n);
const closed=(d,x,y,side)=>Boolean(d.boundaries?.[`${x},${y}/${side}`]);
function materialPixels(canvas,image,art){
  if(!drawable(image)||!art)return null;
  const key=JSON.stringify(art.rect);let cache=floorPixels.get(image);if(cache?.key===key)return cache;
  const tile=canvas.ownerDocument?.createElement('canvas')??(typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(128,128):null);if(!tile)return null;
  tile.width=tile.height=128;const ctx=tile.getContext('2d');if(!ctx)return null;
  try{ctx.drawImage(image,...artRect(image,art),0,0,128,128);cache={key,width:128,height:128,pixels:ctx.getImageData(0,0,128,128).data};floorPixels.set(image,cache);return cache;}
  catch{return null;}
}
export function floorColor(material,wx,wy,cell,distance){
  let r,g,b;
  if(cell.floor===false&&!cell.waterDepth)return [4,9,12];
  if(material){const at=(Math.floor(fraction(wy)*material.height)*material.width+Math.floor(fraction(wx)*material.width))*4;r=material.pixels[at];g=material.pixels[at+1];b=material.pixels[at+2];}
  else{const joint=fraction(wx*2)<.035||fraction(wy*2)<.035,shade=(Math.floor(wx*2)+Math.floor(wy*2))%2;r=joint?23:58+shade*6;g=joint?31:64+shade*6;b=joint?32:60+shade*6;}
  const palette={earth:[102,74,45],wood:[124,84,42],wet:[40,74,81],ice:[128,196,221],cracked:[92,84,72],roots:[78,108,48],thorns:[73,89,42],poison:[86,125,40],corrosion:[133,87,44],rune:[92,72,132]};
  if(palette[cell.surface]){const color=palette[cell.surface];[r,g,b]=[r,g,b].map((v,i)=>v*.4+color[i]*.6);
    const u=fraction(wx),v=fraction(wy),line=cell.surface==='wood'?(fraction(wy*5)<.06||fraction(wx+Math.floor(wy*5)*.3)<.025):cell.surface==='cracked'?Math.abs(v-fraction(u*1.7))<.025:cell.surface==='ice'?Math.abs(v-u)<.02:cell.surface==='rune'?Math.abs(Math.hypot(u-.5,v-.5)-.28)<.025:cell.surface==='roots'||cell.surface==='thorns'?fraction(wy*5+Math.sin(wx*9)*.12)<.06:false;
    if(line){r*=.55;g*=.55;b*=.55;}}
  const depth=cell.waterDepth??(cell.water?3:0);
  if(depth){const color=[[0,0,0],[51,118,127],[32,98,126],[16,60,87]][depth],alpha=[0,.4,.65,.9][depth];r=r*(1-alpha)+color[0]*alpha;g=g*(1-alpha)+color[1]*alpha;b=b*(1-alpha)+color[2]*alpha;
    if(fraction(wy*4+Math.sin(wx*3)*.07)<.03){r+=28;g+=39;b+=40;}}
  const light=Math.max(.22,1/(1+distance*.13))*(.22+.78*(cell.illumination??8)/8);return [r*light,g*light,b*light];
}
export function visibleDungeonObjects(dungeon){
  const {x,y,facing}=dungeon.location,[dx,dy]={north:[0,-1],east:[1,0],south:[0,1],west:[-1,0]}[facing];
  return dungeon.objects.filter(o=>!['water','vector','boundary','map_connection'].includes(o.kind)&&(o.edge?o.x===x&&o.y===y&&o.edge===facing:o.x===x&&o.y===y||o.x===x+dx&&o.y===y+dy&&!closed(dungeon,x,y,facing)));
}
export function paintDungeon(canvas,dungeon,battle){
  const ctx=canvas.getContext('2d');if(!ctx)return;canvas.width=WIDTH;canvas.height=HEIGHT;
  const frame={};frames.set(canvas,frame);
  const draw=()=>{
    if(!canvas.isConnected||frames.get(canvas)!==frame)return;ctx.imageSmoothingEnabled=false;
    const sky=ctx.createLinearGradient(0,0,0,HEIGHT);sky.addColorStop(0,'#101a1e');sky.addColorStop(.5,'#202d2b');sky.addColorStop(.5,'#30332d');sky.addColorStop(1,'#161e1e');ctx.fillStyle=sky;ctx.fillRect(0,0,WIDTH,HEIGHT);
    const wall=texture(dungeon.wall?.url??dungeon.background,draw),floor=texture(dungeon.floorArt?.url,draw),material=materialPixels(canvas,floor,dungeon.floorArt);
    const materials=new Map();
    for(const row of dungeon.cells)for(const cell of row)if(cell.art&&cell.floor)materials.set(cell,materialPixels(canvas,texture(cell.art.url,draw),cell.art));
    const {x,y,facing}=dungeon.location,angle={north:-Math.PI/2,east:0,south:Math.PI/2,west:Math.PI}[facing],vx=Math.cos(angle),vy=Math.sin(angle);
    const relief=dungeon.cells.some(row=>row.some(cell=>cell.relief)),eye=relief?eyeElevation(dungeon.cells[y]?.[x]):EYE;
    const rays=[];
    for(let column=0;column<WIDTH;column+=STRIDE){const camera=(column+STRIDE/2-WIDTH/2)/FOCAL,dx=vx-vy*camera,dy=vy+vx*camera;rays.push({column,dx,dy,hit:traceDungeonRay(dungeon,x+.5,y+.5,dx,dy)});}
    // The same focal length and eye height anchor floor texels to the wall bases.
    const ceiling=materialPixels(canvas,texture(dungeon.ceilingArt?.url,draw),dungeon.ceilingArt);
    const pixels=ctx.getImageData(0,0,WIDTH,HEIGHT);
    for(let row=HEIGHT/2+1;!relief&&row<HEIGHT;row+=STRIDE){
      const distance=EYE*FOCAL/(row+STRIDE/2-HEIGHT/2);if(distance>16)continue;
      for(const ray of rays){if(distance>=ray.hit.distance)continue;const wx=x+.5+ray.dx*distance,wy=y+.5+ray.dy*distance,cell=dungeon.cells[Math.floor(wy)]?.[Math.floor(wx)];if(!cell||cell.wall)continue;
        const [r,g,b]=floorColor(materials.has(cell)?materials.get(cell):material,wx,wy,cell,distance);
        for(let yy=row;yy<Math.min(HEIGHT,row+STRIDE);yy++)for(let xx=ray.column;xx<ray.column+STRIDE;xx++){const i=(yy*WIDTH+xx)*4;pixels.data[i]=r;pixels.data[i+1]=g;pixels.data[i+2]=b;pixels.data[i+3]=255;
          const ci=((HEIGHT-1-yy)*WIDTH+xx)*4;
          const [cr,cg,cb]=floorColor(ceiling,wx,wy,{illumination:7},distance);
          pixels.data[ci]=cr*.72;pixels.data[ci+1]=cg*.75;pixels.data[ci+2]=cb*.73;pixels.data[ci+3]=255;}
      }
    }
    ctx.putImageData(pixels,0,0);
    for(const {column,hit} of rays){
      if(hit.empty)continue;const h=FOCAL/Math.max(.01,hit.distance),top=HEIGHT/2-h*(1-eye);
      if(hit.door){
        // An actual opaque pressure door, including frame, ribs, lock and wheel.
        // The water is behind this surface and never rendered as a vertical wall.
        const u=hit.u,frame=u<.06||u>.94;
        ctx.fillStyle=frame?'#283437':Math.abs(u-.5)<.012?'#172326':'#697c7d';ctx.fillRect(column,top,STRIDE,h);
        ctx.fillStyle='#344548';for(const v of [.04,.24,.74,.94])ctx.fillRect(column,top+h*v,STRIDE,h*.025);
        if(u>.33&&u<.63){ctx.fillStyle=hit.door.closed?'#c18b46':'#74b48e';ctx.fillRect(column,top+h*.46,STRIDE,h*.045);}
        const wheel=Math.abs(u-.73);if(wheel<.10){const radius=Math.sqrt(.01-wheel*wheel);ctx.fillStyle='#d4dbce';ctx.fillRect(column,top+h*(.57-radius),STRIDE,h*radius*2);if(wheel<.065){const inner=Math.sqrt(.065**2-wheel**2);ctx.fillStyle='#425859';ctx.fillRect(column,top+h*(.57-inner),STRIDE,h*inner*2);}}
      }
      else{
        const art=hit.edge?.art??dungeon.cells[hit.y]?.[hit.x]?.art??dungeon.wall,image=art?texture(art.url,draw):wall;
        if(drawable(image)){const rect=art?artRect(image,art):[18,45,50,76];ctx.drawImage(image,rect[0]+hit.u*(rect[2]-1),rect[1],1,rect[3],column,top,STRIDE,h);}
        else{ctx.fillStyle='#405b5a';ctx.fillRect(column,top,STRIDE,h);}
      }
      // Fixture art is sampled on the same wall plane and u-coordinate as hit testing.
      const key=surfaceKey(hit);
      for(const fixture of dungeon.fixtures??[]){
        if(fixture.wallKey!==key)continue;
        const r=fixture.rect,u=(hit.u-r.x)/r.width;if(u<0||u>1)continue;
        const image=texture(fixture.src,draw);
        if(drawable(image))ctx.drawImage(image,Math.min(image.naturalWidth-1,Math.floor(u*image.naturalWidth)),0,1,image.naturalHeight,column,top+h*r.y,STRIDE,h*r.height);
      }
      const surface=hit.edge?.visual.surface??dungeon.cells[hit.y]?.[hit.x]?.surface,color={wood:'rgba(124,84,42,.55)',earth:'rgba(111,75,42,.55)',salt:'rgba(215,200,181,.55)',rock:'rgba(73,79,86,.55)',thorns:'rgba(58,93,38,.55)'}[surface];if(color&&!hit.door){ctx.fillStyle=color;ctx.fillRect(column,top,STRIDE,h);}
      ctx.fillStyle=`rgba(2,9,11,${Math.min(.82,.12+hit.distance*.075)})`;ctx.fillRect(column,top,STRIDE,h);
      const level=dungeon.cells[hit.y]?.[hit.x]?.illumination??0;
      ctx.fillStyle=`rgba(0,0,0,${.72*(1-level/8)})`;ctx.fillRect(column,top,STRIDE,h);
    }
    if(relief){
      for(const ray of rays)ray.segments=traceFloorSegments(dungeon,x+.5,y+.5,ray.dx,ray.dy,ray.hit.distance,!ray.hit.empty);
      const terrainPixels=ctx.getImageData(0,0,WIDTH,HEIGHT),wallMaterial=materialPixels(canvas,wall,dungeon.wall);
      paintReliefPixels(terrainPixels,rays,{width:WIDTH,height:HEIGHT,stride:STRIDE,focal:FOCAL,eye,ox:x+.5,oy:y+.5,floorColor,material,materials,wallMaterial});
      ctx.putImageData(terrainPixels,0,0);
    }
    const shade=ctx.createRadialGradient(WIDTH*.5,HEIGHT*.55,100,WIDTH*.5,HEIGHT*.5,WIDTH*.65);shade.addColorStop(0,'#00000000');shade.addColorStop(1,'#000000b0');ctx.fillStyle=shade;ctx.fillRect(0,0,WIDTH,HEIGHT);
    if(!battle){
      const ahead=visibleDungeonObjects(dungeon);
      const object=ahead.find(o=>!o.edge&&o.art)??ahead.find(o=>!o.edge);if(object){const sprite=object.art?texture(object.art.url,draw):null;
        if(drawable(sprite))ctx.drawImage(sprite,...artRect(sprite,object.art),WIDTH/2-55,HEIGHT*.47,110,110);
        else{const markerY=Number(globalThis.getComputedStyle?.(canvas).getPropertyValue('--dungeon-marker-y'))||.61;ctx.textAlign='center';ctx.font='bold 38px serif';ctx.fillStyle='#edc989';ctx.fillText(object.glyph,WIDTH/2,HEIGHT*markerY);}}
      const edge=ahead.find(o=>o.edge);if(edge){ctx.textAlign='center';ctx.font='bold 30px serif';ctx.fillStyle='#edc989';ctx.fillText(edge.glyph,WIDTH*.67,HEIGHT*.43);}
    }
  };draw();
}
