import { traceDungeonRay } from '../view/adv/raycast.js';
import { FOCAL, WIDTH, HEIGHT, VECTORS, wallKey, pointInShape } from './geometry.js';

export function surfaceKey(hit) {
  const [dx, dy] = VECTORS[hit.side] ?? [0, 0];
  return wallKey({ x: hit.x - (hit.boundary ? 0 : dx), y: hit.y - (hit.boundary ? 0 : dy), side: hit.side });
}
export function wallPoint(world, location, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
  const [vx, vy] = VECTORS[location.facing];
  const camera = (point.x * WIDTH - WIDTH / 2) / FOCAL;
  const hit = traceDungeonRay({ geometry: world.tiles }, location.x + .5, location.y + .5, vx - vy * camera, vy + vx * camera);
  if (hit.empty || hit.distance < .001) return null;
  const h = FOCAL / hit.distance;
  const v = (point.y * HEIGHT - (HEIGHT / 2 - h / 2)) / h;
  if (v < 0 || v > 1) return null;
  return { wall: surfaceKey(hit), u: hit.u, v, distance: hit.distance * Math.hypot(vx - vy * camera, vy + vx * camera) };
}
export function visibleTargetPoints(world, state) {
  const loc = state.location, [vx, vy] = VECTORS[loc.facing], result = [];
  for (const target of activeTargets(world, state)) {
    const samples = [[.5,.5], ...[.05,.25,.5,.75,.95].flatMap(u => [.05,.25,.5,.75,.95].map(v => [u,v]))];
    for (const [pu, pv] of samples) {
      const u = target.rect.x + target.rect.width * pu, v = target.rect.y + target.rect.height * pv;
      const { x, y, side } = target.wall;
      const wx = side === 'east' ? x + 1 : side === 'west' ? x : x + u;
      const wy = side === 'north' ? y : side === 'south' ? y + 1 : y + u;
      const dx = wx - loc.x - .5, dy = wy - loc.y - .5, depth = dx * vx + dy * vy;
      if (depth <= .001) continue;
      const point = { x: .5 + (-dx * vy + dy * vx) * FOCAL / depth / WIDTH, y: .5 + (v - .5) * FOCAL / depth / HEIGHT };
      if (pickTarget(world, state, point)?.target.id === target.id) { result.push({ target, point }); break; }
    }
  }
  return result;
}
export function matches(condition, state) {
  return !condition || Object.entries(condition).every(([key, value]) => state.flags[key] === value);
}
export function activeTargets(world, state) {
  return world.targets.filter(t => state.enabled[t.id] !== false && matches(t.when, state));
}
export function pickTarget(world, state, point) {
  const hit = wallPoint(world, state.location, point);
  if (!hit) return null;
  // Sort matches by explicit priority; later targets paint over earlier targets.
  return activeTargets(world, state).map((target, order) => ({ target, order }))
    .sort((a, b) => (b.target.priority ?? 0) - (a.target.priority ?? 0) || b.order - a.order)
    .map(({ target }) => {
      if (wallKey(target.wall) !== hit.wall || hit.distance > (target.reach ?? 2.6)) return null;
      const u = (hit.u - target.rect.x) / target.rect.width, v = (hit.v - target.rect.y) / target.rect.height;
      const shape = target.shape ?? { type: 'rect', x: 0, y: 0, width: 1, height: 1 };
      return pointInShape(shape, u, v) ? { target, u, v, surface: hit } : null;
    }).find(Boolean) ?? null;
}
