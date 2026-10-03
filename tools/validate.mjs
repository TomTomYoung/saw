import fs from 'node:fs/promises';
import path from 'node:path';
import {validateWorld} from '../src/core/validation.js';
const root=new URL('../',import.meta.url),world=JSON.parse(await fs.readFile(new URL('data/building.json',root),'utf8'));
const errors=validateWorld(world),assets=new Set([...Object.values(world.materials).map(m=>m.url),...world.targets.flatMap(t=>Object.values(t.art))]);
for(const asset of assets)try{await fs.access(new URL(asset,root));}catch{errors.push('Missing asset: '+asset);}
async function imports(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await imports(file);else if(file.endsWith('.js')){const source=await fs.readFile(file,'utf8');for(const m of source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)){if(m[1].startsWith('.'))try{await fs.access(path.resolve(dir,m[1]));}catch{errors.push('Missing import: '+file+' '+m[1]);}}}}}
await imports(new URL('src',root).pathname);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Validated map, ${world.targets.length} targets, event commands and ${assets.size} asset paths.`);
