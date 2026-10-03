// Fractions keep source rectangles valid at any encoded image resolution.
export function artRect(image,art){
  const r=art.rect;return [r.x*image.naturalWidth,r.y*image.naturalHeight,r.width*image.naturalWidth,r.height*image.naturalHeight];
}
export function dungeonArt(art,label,className='dungeon-art'){
  if(!art)return null;
  const e=document.createElement('div'),r=art.rect;e.className=className;e.setAttribute('role','img');e.setAttribute('aria-label',label);
  e.style.backgroundImage=`url("${art.url}")`;
  e.style.backgroundSize=`${100/r.width}% ${100/r.height}%`;
  e.style.backgroundPosition=`${r.x/(1-r.width)*100}% ${r.y/(1-r.height)*100}%`;
  return e;
}
export function appendDungeonArt(parent,art,label,className){const e=dungeonArt(art,label,className);if(e)parent.append(e);}
