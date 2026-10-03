import { moveLocation } from './geometry.js';
import { matches, pickTarget } from './inspection.js';

export class EscapeEngine {
  constructor(world) {
    this.world = world;
    this.state = { version: 1, world: world.id, location: { ...world.start }, mode: 'explore',
      flags: { ...world.flags }, enabled: {}, appearances: {}, seen: [], done: [], log: [] };
    this.hover = null;
    this.pressed = null;
    this.hint = '';
    this.message = null;
    this.queue = [];
    this.lastEvent = null;
    this.eventCount = 0;
    this.reveal();
    this.note('古いビルの中にいます。周囲を歩き、気になる箇所を詳しく調べられます。');
  }
  get busy() { return Boolean(this.message || this.queue.length); }
  note(text) { this.state.log.push(text); this.state.log = this.state.log.slice(-40); }
  reveal() {
    const { x, y } = this.state.location;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (this.world.tiles[y + dy]?.[x + dx] !== undefined) {
        const key = `${x + dx},${y + dy}`;
        if (!this.state.seen.includes(key)) this.state.seen.push(key);
      }
    }
  }
  move(direction) {
    if (this.state.mode !== 'explore' || this.busy) return false;
    const next = moveLocation(this.state.location, direction);
    if (!next) return false;
    if (this.world.tiles[next.y]?.[next.x] !== '.') { this.hint = '壁があり、進めません。'; return false; }
    this.state.location = next;
    this.hint = '';
    this.reveal();
    return true;
  }
  inspect(value = this.state.mode !== 'inspect') {
    if (this.busy) return false;
    this.cancelPointer();
    this.state.mode = value ? 'inspect' : 'explore';
    this.hint = value ? '画面の気になる箇所へカーソルを合わせてください。' : '';
    return true;
  }
  cancelPointer() {
    const old = this.hover;
    this.hover = null;
    this.pressed = null;
    this.hint = '';
    if (old && this.state.mode === 'inspect' && !this.busy) this.emit('pointerleave', old, null);
  }
  pointer(type, point, { button = 0, pointerType = 'mouse', buttons = 0 } = {}) {
    if (this.state.mode !== 'inspect' || this.busy) return false;
    const hit = pickTarget(this.world, this.state, point);
    const target = hit?.target ?? null;
    const meta = { point, button, buttons, pointerType, local: hit ? { u: hit.u, v: hit.v } : null };
    if (type === 'pointermove') {
      if (this.hover?.id !== target?.id) {
        if (this.hover) this.emit('pointerleave', this.hover, meta);
        this.hover = target;
        this.hint = target ? target.label : 'この箇所には調べられる設備は見当たりません。';
        if (target) this.emit('pointerenter', target, meta);
      }
      if (target) this.emit('pointermove', target, meta);
      return Boolean(target);
    }
    if (type === 'pointerdown') { this.pressed = button === 0 ? target?.id ?? null : null; }
    if (type === 'pointercancel') { this.cancelPointer(); return true; }
    if (type === 'click') {
      const valid = button === 0 && this.pressed && this.pressed === target?.id;
      this.pressed = null;
      if (!valid) { if (!target) this.hint = 'ここには、今調べられるものはありません。'; return false; }
    }
    if (!target) return false;
    return this.emit(type, target, meta);
  }
  emit(type, target, meta) {
    this.lastEvent = { type, target: target.id, location: { ...this.state.location }, ...meta };
    this.eventCount++;
    let handled = false;
    for (const handler of target.events?.[type] ?? []) {
      const key = `${target.id}/${type}/${handler.id}`;
      if (handler.once && this.state.done.includes(key) || !matches(handler.when, this.state)) continue;
      if (handler.once) this.state.done.push(key);
      this.queue.push(...structuredClone(handler.actions));
      handled = true;
      if (handler.stop !== false) break;
    }
    this.pump();
    return handled;
  }
  pump() {
    while (!this.message && this.queue.length) {
      const action = this.queue.shift();
      switch (action.op) {
        case 'hint': this.hint = action.text; break;
        case 'message': this.message = { title: action.title ?? '調査', text: action.text }; this.note(action.text); this.pressed = null; break;
        case 'flag.set': this.state.flags[action.key] = action.value; break;
        case 'flag.toggle': this.state.flags[action.key] = !this.state.flags[action.key]; break;
        case 'appearance.set': this.state.appearances[action.target] = action.value; break;
        case 'target.enable': this.state.enabled[action.target] = action.value; break;
        case 'inspect.close': this.state.mode = 'explore'; this.hover = this.pressed = null; this.hint = ''; break;
        default: throw new Error(`未対応の命令: ${action.op}`);
      }
    }
    if (this.message) { this.hover = null; this.pressed = null; }
  }
  advance() {
    if (!this.message) return false;
    this.message = null;
    this.pump();
    if (!this.busy) this.hint = this.state.mode === 'inspect' ? '調査を続けられます。Escで探索へ戻ります。' : '';
    return true;
  }
  snapshot() {
    if (this.busy) throw new Error('イベント表示中は保存できません。');
    return structuredClone({ ...this.state, mode: 'explore' });
  }
}
