import { FACES, VECTORS } from './geometry.js';
export const EVENTS = ['pointerenter', 'pointermove', 'pointerleave', 'pointerdown', 'pointerup', 'click', 'contextmenu'];
const passive = new Set(['pointerenter', 'pointermove', 'pointerleave', 'pointerdown', 'pointerup']);
const object = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const id = v => typeof v === 'string' && /^[a-z][a-z0-9_]*$/.test(v) && !['constructor', 'prototype', '__proto__'].includes(v);
const unit = v => Number.isFinite(v) && v >= 0 && v <= 1;
const rect = r => object(r) && [r.x, r.y, r.width, r.height].every(unit) && r.width > 0 && r.height > 0 && r.x + r.width <= 1 && r.y + r.height <= 1;
const asset = s => typeof s === 'string' && /^assets\/[a-zA-Z0-9_/-]+\.(png|svg|webp)$/.test(s) && !s.includes('..');
export function validateWorld(w) {
  const errors = [], fail = m => errors.push(m);
  if (!object(w)) return ['world must be an object'];
  if (w.schemaVersion !== 1 || !id(w.id) || typeof w.name !== 'string') fail('world identity/version');
  if (!Array.isArray(w.tiles) || !w.tiles.length || w.tiles.length > 64 || !w.tiles.every(r => typeof r === 'string' && r.length === w.tiles[0].length && r.length <= 64 && /^[#.]+$/.test(r))) return [...errors, 'tiles must be a rectangular #/. map (max 64×64)'];
  const floor = p => object(p) && Number.isInteger(p.x) && Number.isInteger(p.y) && w.tiles[p.y]?.[p.x] === '.';
  if (!floor(w.start) || !FACES.includes(w.start.facing)) fail('start must be a floor cell with cardinal facing');
  if (!object(w.flags) || Object.entries(w.flags).some(([k, v]) => !id(k) || typeof v !== 'boolean')) fail('flags must be named booleans');
  const condition = c => c === undefined || object(c) && Object.entries(c).every(([k, v]) => Object.hasOwn(w.flags ?? {}, k) && typeof v === 'boolean');
  for (const material of ['wall', 'floor', 'ceiling']) if (!asset(w.materials?.[material]?.url) || !rect(w.materials?.[material]?.rect)) fail(`material: ${material}`);
  if (!Array.isArray(w.targets)) return [...errors, 'targets must be an array'];
  const ids = new Set();
  for (const t of w.targets) {
    if (!object(t)) { fail('target must be an object'); continue; }
    if (!id(t.id) || ids.has(t.id)) fail(`target id: ${t.id}`);
    ids.add(t.id);
    if (typeof t.label !== 'string' || !t.label) fail(`${t.id}: label`);
    if (!floor(t.wall) || !FACES.includes(t.wall.side)) fail(`${t.id}: wall origin`);
    else { const [dx, dy] = VECTORS[t.wall.side]; if (w.tiles[t.wall.y + dy]?.[t.wall.x + dx] !== '#') fail(`${t.id}: fixture must face an adjacent wall`); }
    if (!rect(t.rect)) fail(`${t.id}: normalized rect`);
    if (t.reach !== undefined && (!Number.isFinite(t.reach) || t.reach <= 0 || t.reach > 8)) fail(`${t.id}: reach (0,8]`);
    if (t.priority !== undefined && !Number.isInteger(t.priority)) fail(`${t.id}: priority`);
    if (!condition(t.when)) fail(`${t.id}: when`);
    if (!object(t.art) || !asset(t.art.default) || Object.entries(t.art).some(([k, v]) => !id(k) || !asset(v))) fail(`${t.id}: art`);
    if (t.shape) {
      const s = t.shape;
      if (!(s.type === 'rect' && rect(s) || s.type === 'circle' && unit(s.x) && unit(s.y) && s.radius > 0 && s.radius <= .5 && s.x - s.radius >= 0 && s.x + s.radius <= 1 && s.y - s.radius >= 0 && s.y + s.radius <= 1 || s.type === 'polygon' && Array.isArray(s.points) && s.points.length >= 3 && s.points.every(p => Array.isArray(p) && p.length === 2 && p.every(unit)))) fail(`${t.id}: shape`);
    }
    if (!object(t.events)) { fail(`${t.id}: events`); continue; }
    for (const [type, handlers] of Object.entries(t.events)) {
      if (!EVENTS.includes(type) || !Array.isArray(handlers)) { fail(`${t.id}: event ${type}`); continue; }
      const handlerIds = new Set();
      for (const h of handlers) {
        if (!object(h) || !id(h.id) || handlerIds.has(h.id)) { fail(`${t.id}: handler id`); continue; }
        handlerIds.add(h.id);
        if (!condition(h.when) || h.once !== undefined && typeof h.once !== 'boolean' || h.stop !== undefined && typeof h.stop !== 'boolean') fail(`${t.id}/${h.id}: handler options`);
        if (passive.has(type) && h.once) fail(`${t.id}/${h.id}: passive events cannot be once`);
        if (!Array.isArray(h.actions) || h.actions.length > 64) { fail(`${t.id}/${h.id}: actions (max 64)`); continue; }
        for (const a of h.actions) {
          if (!object(a)) { fail(`${t.id}: action object`); continue; }
          if (passive.has(type) && a.op !== 'hint') fail(`${t.id}: passive events only accept hint`);
          switch (a.op) {
            case 'hint': case 'message': if (typeof a.text !== 'string' || !a.text || a.title !== undefined && typeof a.title !== 'string') fail(`${t.id}: text`); break;
            case 'flag.set': case 'flag.toggle': if (!Object.hasOwn(w.flags ?? {}, a.key) || a.op === 'flag.set' && typeof a.value !== 'boolean') fail(`${t.id}: flag`); break;
            case 'appearance.set': {
              const target = w.targets.find(t => t?.id === a.target);
              if (!target || !Object.hasOwn(target.art ?? {}, a.value)) fail(`${t.id}: appearance reference`); break;
            }
            case 'target.enable': if (!w.targets.some(t => t?.id === a.target) || typeof a.value !== 'boolean') fail(`${t.id}: enable reference`); break;
            case 'inspect.close': break;
            default: fail(`${t.id}: unknown op ${a.op}`);
          }
        }
      }
    }
  }
  if (!Array.isArray(w.zones) || w.zones.some(z => !object(z) || typeof z.name !== 'string' || !Array.isArray(z.rect) || z.rect.length !== 4 || !z.rect.every(Number.isInteger) || z.rect[0] < 0 || z.rect[1] < 0 || z.rect[2] <= 0 || z.rect[3] <= 0 || z.rect[0] + z.rect[2] > w.tiles[0].length || z.rect[1] + z.rect[3] > w.tiles.length)) fail('zones');
  if (floor(w.start)) {
    const seen = new Set([`${w.start.x},${w.start.y}`]), pending = [w.start];
    for (let i = 0; i < pending.length; i++) for (const [dx, dy] of Object.values(VECTORS)) {
      const p = { x: pending[i].x + dx, y: pending[i].y + dy }, key = `${p.x},${p.y}`;
      if (floor(p) && !seen.has(key)) { seen.add(key); pending.push(p); }
    }
    for (const t of w.targets) if (t?.wall && !seen.has(`${t.wall.x},${t.wall.y}`)) fail(`${t.id}: unreachable fixture`);
  }
  return errors;
}
export function restoreState(world, raw) {
  if (typeof raw !== 'string' || raw.length > 262144) throw new Error('保存データのサイズが不正です。');
  const s = JSON.parse(raw), loc = s?.location;
  if (!object(s) || s.version !== 1 || s.world !== world.id || !object(loc) || !Number.isInteger(loc.x) || !Number.isInteger(loc.y) || world.tiles[loc.y]?.[loc.x] !== '.' || !FACES.includes(loc.facing)) throw new Error('保存データの形式・現在地が不正です。');
  for (const key of ['flags', 'enabled', 'appearances']) if (!object(s[key])) throw new Error('保存データの状態が不正です。');
  if (Object.keys(s.flags).length !== Object.keys(world.flags).length || Object.keys(world.flags).some(k => !Object.hasOwn(s.flags, k)) || Object.entries(s.flags).some(([k,v]) => !Object.hasOwn(world.flags, k) || typeof v !== 'boolean')) throw new Error('保存データのフラグが不正です。');
  for (const [key, value] of Object.entries(s.enabled)) if (!world.targets.some(t => t.id === key) || typeof value !== 'boolean') throw new Error('保存データの調査対象が不正です。');
  for (const [key, value] of Object.entries(s.appearances)) if (!world.targets.some(t => t.id === key && Object.hasOwn(t.art, value))) throw new Error('保存データの外観が不正です。');
  const once = new Set(world.targets.flatMap(t => Object.entries(t.events).flatMap(([type, hs]) => hs.filter(h => h.once).map(h => `${t.id}/${type}/${h.id}`))));
  if (!Array.isArray(s.done) || s.done.some(k => !once.has(k))) throw new Error('保存データのイベント履歴が不正です。');
  if (!Array.isArray(s.seen) || s.seen.length > 4096 || s.seen.some(k => typeof k !== 'string' || !/^\d+,\d+$/.test(k) || world.tiles[+k.split(',')[1]]?.[+k.split(',')[0]] === undefined)) throw new Error('保存データの地図が不正です。');
  if (!Array.isArray(s.log) || s.log.length > 40 || s.log.some(t => typeof t !== 'string' || t.length > 5000)) throw new Error('保存データの記録が不正です。');
  return { version: 1, world: world.id, location: { x: loc.x, y: loc.y, facing: loc.facing }, mode: 'explore', flags: { ...s.flags }, enabled: { ...s.enabled }, appearances: { ...s.appearances }, seen: [...new Set(s.seen)], done: [...new Set(s.done)], log: [...s.log] };
}
