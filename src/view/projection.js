import { activeTargets } from '../core/inspection.js';
import { wallKey } from '../core/geometry.js';
export function projectDungeon(world, state) {
  return {
    location: { ...state.location }, geometry: world.tiles,
    cells: world.tiles.map((row, y) => [...row].map((tile, x) => ({ x, y, wall: tile === '#', floor: tile === '.', illumination: 7 }))),
    wall: world.materials.wall, floorArt: world.materials.floor, ceilingArt: world.materials.ceiling,
    boundaries: {}, edges: {}, doors: {}, objects: [],
    fixtures: activeTargets(world, state).map((t, order) => ({ ...t, order })).sort((a,b) => (a.priority ?? 0) - (b.priority ?? 0) || a.order - b.order)
      .map(t => ({ wallKey: wallKey(t.wall), rect: t.rect, src: t.art[state.appearances[t.id] ?? 'default'] }))
  };
}
export function zoneName(world, location) {
  return world.zones.find(z => { const [x, y, w, h] = z.rect; return location.x >= x && location.y >= y && location.x < x+w && location.y < y+h; })?.name ?? world.name;
}
