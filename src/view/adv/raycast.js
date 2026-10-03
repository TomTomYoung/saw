// Extracted unchanged in behavior from adv; boundary flag added to hit metadata.
const fraction=n=>n-Math.floor(n);
const closed=(d,x,y,side)=>Boolean(d.boundaries?.[`${x},${y}/${side}`]);
export function traceDungeonRay(d,ox,oy,dx,dy,max=16){
  let x=Math.floor(ox),y=Math.floor(oy),distance=0,side='north';
  const sx=dx<0?-1:1,sy=dy<0?-1:1,ax=dx===0?Infinity:Math.abs(1/dx),ay=dy===0?Infinity:Math.abs(1/dy);
  let tx=dx===0?Infinity:(sx>0?x+1-ox:ox-x)*ax,ty=dy===0?Infinity:(sy>0?y+1-oy:oy-y)*ay;
  const hit=(boundary=false)=>({distance,x,y,side,boundary,u:fraction(side==='east'||side==='west'?oy+dy*distance:ox+dx*distance),edge:boundary?d.edges?.[`${x},${y}/${side}`]:undefined,door:d.doors?.[`${x},${y}/${side}`]});
  if(d.geometry[y]?.[x]!=='.')return hit();
  while(distance<max){
    const east=sx>0?'east':'west',south=sy>0?'south':'north';
    // Rays exactly through a corner must not leak between two touching walls.
    if(Math.abs(tx-ty)<1e-9){
      distance=tx;side=east;
      if(closed(d,x,y,east))return distance<=max?hit(true):{distance:max,empty:true};
      if(closed(d,x,y,south)){side=south;return distance<=max?hit(true):{distance:max,empty:true};}
      if(d.geometry[y]?.[x+sx]!=='.'||d.geometry[y+sy]?.[x]!=='.')return distance<=max?hit():{distance:max,empty:true};
      if(closed(d,x+sx,y,south)){x+=sx;side=south;return distance<=max?hit(true):{distance:max,empty:true};}
      if(closed(d,x,y+sy,east)){y+=sy;return distance<=max?hit(true):{distance:max,empty:true};}
      x+=sx;y+=sy;tx+=ax;ty+=ay;
    }else if(tx<ty){distance=tx;side=east;if(closed(d,x,y,side))return distance<=max?hit(true):{distance:max,empty:true};x+=sx;tx+=ax;}
    else{distance=ty;side=south;if(closed(d,x,y,side))return distance<=max?hit(true):{distance:max,empty:true};y+=sy;ty+=ay;}
    if(distance>max)return {distance:max,empty:true};
    if(d.geometry[y]?.[x]!=='.')return hit();
  }
  return {distance:max,empty:true};
}
