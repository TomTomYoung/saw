// Cardinal movement is extracted from adv/src/core/engine.js (see doc/PORTING.md).
export const FACES = ['north', 'east', 'south', 'west'];
export const VECTORS = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
export const WIDTH = 800, HEIGHT = 400, FOCAL = WIDTH / (2 * Math.tan(Math.PI / 5.2));
export const wallKey = ({ x, y, side }) => `${x},${y}/${side}`;
export function moveLocation(location, direction) {
  const i = FACES.indexOf(location.facing);
  if (direction === 'left' || direction === 'right') return { ...location, facing: FACES[(i + (direction === 'left' ? 3 : 1)) % 4] };
  const offset = { forward: 0, back: 2, strafe_left: 3, strafe_right: 1 }[direction];
  if (offset === undefined) return null;
  const [dx, dy] = VECTORS[FACES[(i + offset) % 4]];
  return { ...location, x: location.x + dx, y: location.y + dy };
}
export function pointInShape(shape, u, v) {
  if (shape.type === 'rect') return u >= shape.x && v >= shape.y && u <= shape.x + shape.width && v <= shape.y + shape.height;
  if (shape.type === 'circle') return Math.hypot(u - shape.x, v - shape.y) <= shape.radius;
  let inside = false;
  for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {
    const [ax, ay] = shape.points[i], [bx, by] = shape.points[j];
    if ((ay > v) !== (by > v) && u < (bx - ax) * (v - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}
export function screenPoint(rect, clientX, clientY) {
  if (!rect.width || !rect.height) return null;
  const x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}
