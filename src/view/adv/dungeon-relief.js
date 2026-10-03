// Geometry in the projected view only. One horizontal cell represents 3 metres.
export const METRES_PER_CELL=3;
const EPS=1e-8;
export const floorElevation=cell=>cell?.relief?.bottomless?-Infinity:cell?.relief?.depth?-cell.relief.depth/METRES_PER_CELL:0;
export const eyeElevation=cell=>.5+(Number.isFinite(floorElevation(cell))?floorElevation(cell):0);
export function stepFace(a,b){
  const za=floorElevation(a),zb=floorElevation(b);
  if(za===zb)return null;
  return {top:Math.max(za,zb),bottom:Math.min(za,zb),cell:za>zb?a:b};
}
// The ordinary wall ray supplies the stopping distance, including doors/edges.
export function traceFloorSegments(d,ox,oy,dx,dy,limit,terminal=true){
  const segments=[];let x=Math.floor(ox),y=Math.floor(oy),start=0;
  const sx=dx<0?-1:1,sy=dy<0?-1:1,ax=Math.abs(dx)>EPS?Math.abs(1/dx):Infinity,ay=Math.abs(dy)>EPS?Math.abs(1/dy):Infinity;
  let tx=ax===Infinity?Infinity:(sx>0?x+1-ox:ox-x)*ax,ty=ay===Infinity?Infinity:(sy>0?y+1-oy:oy-y)*ay;
  while(start<limit-EPS){
    const end=Math.min(tx,ty,limit),cell=d.cells[y]?.[x];if(!cell)break;
    const crossX=tx<=ty+EPS,crossY=ty<=tx+EPS,side=crossX?'x':'y';
    let next=d.cells[y+(crossY?sy:0)]?.[x+(crossX?sx:0)];
    // A partition/door within a depressed cell continues down to its floor.
    if(end>=limit-EPS)next=terminal?{...cell,relief:undefined}:cell;
    let face=stepFace(cell,next);
    if(crossX&&crossY&&end<limit-EPS){
      // A ray through a shared corner must not pass through higher side cells.
      const high=[cell,next,d.cells[y]?.[x+sx],d.cells[y+sy]?.[x]].reduce((a,b)=>floorElevation(a)>=floorElevation(b)?a:b);
      const low=floorElevation(cell)<=floorElevation(next)?cell:next;
      face=stepFace(low,high);
    }
    segments.push({start,end,cell,face,side});
    if(crossX){x+=sx;tx+=ax;}if(crossY){y+=sy;ty+=ay;}start=end;
  }
  return segments;
}
export function sampleRelief(segments,eye,slope){
  let solid=null,water=null;
  for(const segment of segments){
    const {start,end,cell,face,side}=segment;
    if(cell.floor!==false&&!cell.relief?.bottomless&&Math.abs(slope)>EPS){
      const distance=(floorElevation(cell)-eye)/slope;
      if(distance>EPS&&distance>=start-EPS&&distance<=end+EPS&&(!solid||distance<solid.distance))solid={kind:'floor',distance,cell};
    }
    if(face){
      const z=eye+slope*end;
      if(z<face.top+EPS&&z>face.bottom-EPS&&(!solid||end<solid.distance-EPS))solid={kind:'side',distance:end,cell:face.cell,z,top:face.top,side};
    }
    if(cell.relief?.waterLevel!==null&&cell.relief?.waterLevel!==undefined&&Math.abs(slope)>EPS){
      const level=cell.relief.waterLevel/METRES_PER_CELL,distance=(level-eye)/slope;
      if(distance>EPS&&distance>=start-EPS&&distance<=end+EPS&&(!water||distance<water.distance))water={distance,cell,level};
    }
  }
  if(water&&solid&&water.distance>solid.distance+EPS)water=null;
  return {solid,water};
}
export function paintReliefPixels(pixels,rays,{width,height,stride,focal,eye,ox,oy,floorColor,material,materials,wallMaterial}){
  const fraction=n=>n-Math.floor(n);
  for(const ray of rays)for(let row=0;row<height;row+=stride){
    const slope=(height/2-row-stride/2)/focal,{solid,water}=sampleRelief(ray.segments,eye,slope);
    // The already painted wall owns the top of the terminal boundary.
    if(!solid&&!water&&row<height/2)continue;
    if(solid?.distance>=ray.hit.distance-1e-8&&solid.kind==='floor')continue;
    let color=[3,7,10];
    if(solid){
      const {cell,distance}=solid,wx=ox+ray.dx*distance,wy=oy+ray.dy*distance;
      if(solid.kind==='floor')color=floorColor(materials.get(cell)??material,wx,wy,cell.relief?{...cell,water:false,waterDepth:0}:cell,distance);
      else{
        const u=solid.side==='x'?wy:wx,v=solid.top-solid.z;
        color=floorColor(wallMaterial,u,v,{surface:cell?.surface,illumination:cell?.illumination??0,floor:true},distance);
        const shade=(solid.side==='x'?.75:.9)*Math.exp(-v*1.6),rim=v<.016?1.45:1;
        color=color.map(c=>c*shade*rim);
      }
    }
    if(water){
      const {cell,distance,level}=water,wx=ox+ray.dx*distance,wy=oy+ray.dy*distance;
      const depth=cell.relief.bottomless?8:Math.max(0,level-floorElevation(cell))*METRES_PER_CELL;
      const opacity=cell.relief.bottomless?.97:Math.min(.9,.25+depth*.35);
      const light=(.22+.78*(cell.illumination??8)/8)/(1+distance*.13),tint=cell.relief.bottomless?[12,48,65]:[37,100,119];
      color=color.map((c,i)=>c*(1-opacity)+tint[i]*light*opacity);
      // World-space ripples are continuous across cell boundaries.
      const ripple=fraction(wy*5+Math.sin(wx*5)*.10)<.045;
      if(ripple)color=color.map(c=>c+24*light);
    }
    // Leave wall/sky pixels untouched when there is no terrain intersection.
    if(!solid&&!water){
      const wallBottom=height/2+eye*focal/Math.max(.01,ray.hit.distance);
      if(!ray.hit.empty&&row+stride/2<wallBottom)continue;
    }
    for(let yy=row;yy<Math.min(height,row+stride);yy++)for(let xx=ray.column;xx<Math.min(width,ray.column+stride);xx++){
      const i=(yy*width+xx)*4;pixels.data[i]=color[0];pixels.data[i+1]=color[1];pixels.data[i+2]=color[2];pixels.data[i+3]=255;
    }
  }
}
