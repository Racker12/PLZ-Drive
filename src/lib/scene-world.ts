import type { Coordinate, GameWorld } from "./types";

export type WorldPoint = { x: number; z: number };
export type SceneRoad = { id: string; name: string; points: WorldPoint[] };
export type RoadSegment = { a: WorldPoint; b: WorldPoint; length: number };
export type SceneBuilding = WorldPoint & {
  width: number;
  depth: number;
  height: number;
  rotation: number;
  color: number;
};
export type SceneTree = WorldPoint & { height: number; scale: number };
export type SceneWorld = {
  origin: Coordinate;
  roads: SceneRoad[];
  junctions: WorldPoint[];
  segments: RoadSegment[];
  buildings: SceneBuilding[];
  trees: SceneTree[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

const METERS_PER_DEGREE = 111_195;
const CELL_SIZE = 40;

/** Local metric coordinates: +x is east, +z is south, Three.js +y is up. */
export function projectCoordinate(
  coordinate: Coordinate,
  origin: Coordinate,
): WorldPoint {
  return {
    x:
      (coordinate[0] - origin[0]) *
      METERS_PER_DEGREE *
      Math.cos((origin[1] * Math.PI) / 180),
    z: (origin[1] - coordinate[1]) * METERS_PER_DEGREE,
  };
}

export function distanceToSegment(
  point: WorldPoint,
  segment: RoadSegment,
): number {
  const dx = segment.b.x - segment.a.x;
  const dz = segment.b.z - segment.a.z;
  const fraction = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segment.a.x) * dx + (point.z - segment.a.z) * dz) /
        Math.max(dx * dx + dz * dz, 0.0001),
    ),
  );
  return Math.hypot(
    point.x - segment.a.x - dx * fraction,
    point.z - segment.a.z - dz * fraction,
  );
}

function seedFor(value: string): number {
  let seed = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    seed = Math.imul(seed ^ value.charCodeAt(index), 16777619);
  }
  return seed >>> 0;
}

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** A spatial index keeps procedural scenery off every road, including cross streets. */
function segmentIndex(segments: RoadSegment[]) {
  const cells = new Map<string, RoadSegment[]>();
  for (const segment of segments) {
    const minX = Math.floor(Math.min(segment.a.x, segment.b.x) / CELL_SIZE);
    const maxX = Math.floor(Math.max(segment.a.x, segment.b.x) / CELL_SIZE);
    const minZ = Math.floor(Math.min(segment.a.z, segment.b.z) / CELL_SIZE);
    const maxZ = Math.floor(Math.max(segment.a.z, segment.b.z) / CELL_SIZE);
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const key = `${x}:${z}`;
        const cell = cells.get(key) ?? [];
        cell.push(segment);
        cells.set(key, cell);
      }
    }
  }
  return (point: WorldPoint, clearance: number) => {
    const reach = Math.ceil(clearance / CELL_SIZE) + 1;
    const cellX = Math.floor(point.x / CELL_SIZE);
    const cellZ = Math.floor(point.z / CELL_SIZE);
    for (let x = cellX - reach; x <= cellX + reach; x += 1) {
      for (let z = cellZ - reach; z <= cellZ + reach; z += 1) {
        for (const segment of cells.get(`${x}:${z}`) ?? []) {
          if (distanceToSegment(point, segment) < clearance) return false;
        }
      }
    }
    return true;
  };
}

export function createSceneWorld(world: GameWorld): SceneWorld {
  const origin =
    world.graph.nodes[world.startNodeId]?.coordinate ?? world.center;
  const seen = new Set<string>();
  const roads: SceneRoad[] = [];
  const segments: RoadSegment[] = [];
  const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
  for (const edge of world.graph.edges) {
    // Directed reverse edges share one surface, but distinct parallel ways remain.
    const forward = edge.coordinates.map((point) => point.join(",")).join(";");
    const backward = [...edge.coordinates]
      .reverse()
      .map((point) => point.join(","))
      .join(";");
    const key = forward < backward ? forward : backward;
    if (seen.has(key) || edge.coordinates.length < 2) continue;
    seen.add(key);
    const points = edge.coordinates.map((point) =>
      projectCoordinate(point, origin),
    );
    roads.push({ id: edge.id, name: edge.name, points });
    for (const point of points) {
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minZ = Math.min(bounds.minZ, point.z);
      bounds.maxZ = Math.max(bounds.maxZ, point.z);
    }
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1];
      const b = points[index];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length > 0.1) segments.push({ a, b, length });
    }
  }

  const isClear = segmentIndex(segments);
  const occupied = new Map<string, { point: WorldPoint; radius: number }[]>();
  const reserve = (point: WorldPoint, radius: number) => {
    const cellX = Math.floor(point.x / CELL_SIZE);
    const cellZ = Math.floor(point.z / CELL_SIZE);
    for (let x = cellX - 2; x <= cellX + 2; x += 1) {
      for (let z = cellZ - 2; z <= cellZ + 2; z += 1) {
        for (const item of occupied.get(`${x}:${z}`) ?? []) {
          if (
            Math.hypot(point.x - item.point.x, point.z - item.point.z) <
            radius + item.radius + 3
          )
            return false;
        }
      }
    }
    const key = `${cellX}:${cellZ}`;
    const cell = occupied.get(key) ?? [];
    cell.push({ point, radius });
    occupied.set(key, cell);
    return true;
  };
  const buildings: SceneBuilding[] = [];
  const trees: SceneTree[] = [];
  // Prioritize the start neighborhood when very large graphs hit the scenery cap.
  const nearby = [...segments].sort(
    (a, b) => Math.hypot(a.a.x, a.a.z) - Math.hypot(b.a.x, b.a.z),
  );
  for (const segment of nearby) {
    if (buildings.length >= 1500 && trees.length >= 650) break;
    if (segment.length < 12) continue;
    const random = seededRandom(
      seedFor(`${segment.a.x}:${segment.a.z}:${segment.b.x}`),
    );
    const dx = (segment.b.x - segment.a.x) / segment.length;
    const dz = (segment.b.z - segment.a.z) / segment.length;
    const samples = Math.max(1, Math.floor(segment.length / 48));
    for (let sample = 0; sample < samples; sample += 1) {
      const distance = ((sample + 0.5) / samples) * segment.length;
      for (const side of [-1, 1]) {
        const width = 10 + random() * 12;
        const depth = 9 + random() * 12;
        const radius = Math.hypot(width, depth) / 2;
        const offset = radius + 10 + random() * 9;
        const point = {
          x: segment.a.x + dx * distance - dz * side * offset,
          z: segment.a.z + dz * distance + dx * side * offset,
        };
        if (
          buildings.length < 1500 &&
          random() > 0.12 &&
          isClear(point, radius + 6) &&
          reserve(point, radius)
        ) {
          buildings.push({
            ...point,
            width,
            depth,
            height: 6 + Math.floor(random() * 5) * 3.1,
            rotation: -Math.atan2(dz, dx),
            color: Math.floor(random() * 6),
          });
        }
        const treeOffset = 8 + random() * 3;
        const treePoint = {
          x: segment.a.x + dx * (distance + 13) - dz * side * treeOffset,
          z: segment.a.z + dz * (distance + 13) + dx * side * treeOffset,
        };
        if (
          trees.length < 650 &&
          isClear(treePoint, 6.5) &&
          reserve(treePoint, 2.3)
        ) {
          trees.push({
            ...treePoint,
            height: 5 + random() * 4,
            scale: 1.2 + random(),
          });
        }
      }
    }
  }
  return {
    origin,
    roads,
    segments,
    bounds,
    buildings,
    trees,
    junctions: Object.values(world.graph.nodes).map((node) =>
      projectCoordinate(node.coordinate, origin),
    ),
  };
}
