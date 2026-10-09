import type { Coordinate, GameWorld, RoadEdge, RoadGraph } from "./types";

export type DrivingDirection = "north" | "east" | "south" | "west";

export interface DrivingState {
  coordinate: Coordinate;
  bearing: number;
  speedKmh: number;
  distanceMeters: number;
  roadName: string;
  atBoundary: boolean;
  running: boolean;
  nodeId: string;
  edgeId: string | null;
  edgeDistanceMeters: number;
  previousNodeId: string | null;
}

const EARTH_RADIUS = 6_371_000;
const SPEED_KMH = 35;
const SPEED_METERS_PER_SECOND = SPEED_KMH / 3.6;
const HEADINGS: Record<DrivingDirection, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

interface IndexedEdge {
  edge: RoadEdge;
  segmentLengths: number[];
  length: number;
  bearing: number;
}

interface GraphIndex {
  edges: Map<string, IndexedEdge>;
  outgoing: Map<string, IndexedEdge[]>;
}

// Worlds are immutable. Cache lengths so driving does not scan the road graph each frame.
const graphIndexes = new WeakMap<RoadGraph, GraphIndex>();

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function distance(from: Coordinate, to: Coordinate): number {
  const latDelta = radians(to[1] - from[1]);
  const lonDelta = radians(to[0] - from[0]);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(from[1])) *
      Math.cos(radians(to[1])) *
      Math.sin(lonDelta / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(from: Coordinate, to: Coordinate): number {
  const lonDelta = radians(to[0] - from[0]);
  const startLat = radians(from[1]);
  const endLat = radians(to[1]);
  const y = Math.sin(lonDelta) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(lonDelta);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function indexGraph(graph: RoadGraph): GraphIndex {
  const cached = graphIndexes.get(graph);
  if (cached) return cached;

  const index: GraphIndex = { edges: new Map(), outgoing: new Map() };
  for (const edge of graph.edges) {
    if (edge.coordinates.length < 2) continue;
    const segmentLengths = edge.coordinates
      .slice(1)
      .map((point, i) => distance(edge.coordinates[i], point));
    const length = segmentLengths.reduce(
      (total, segment) => total + segment,
      0,
    );
    // Ignore degenerate edges, which otherwise cause a zero-distance junction loop.
    if (length < 0.01 || !graph.nodes[edge.from] || !graph.nodes[edge.to])
      continue;
    const firstSegment = segmentLengths.findIndex((segment) => segment > 0);
    const indexed: IndexedEdge = {
      edge,
      segmentLengths,
      length,
      bearing: bearing(
        edge.coordinates[firstSegment],
        edge.coordinates[firstSegment + 1],
      ),
    };
    index.edges.set(edge.id, indexed);
    const outgoing = index.outgoing.get(edge.from) ?? [];
    outgoing.push(indexed);
    index.outgoing.set(edge.from, outgoing);
  }
  graphIndexes.set(graph, index);
  return index;
}

function angularDifference(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function chooseEdge(
  index: GraphIndex,
  state: DrivingState,
  direction: DrivingDirection,
): IndexedEdge | undefined {
  const heading = HEADINGS[direction];
  return (
    (index.outgoing.get(state.nodeId) ?? [])
      .map((candidate) => ({
        candidate,
        difference: angularDifference(candidate.bearing, heading),
      }))
      // Holding a direction that points away from every road should stop the car.
      // Leave a small tolerance for geodesic bearings on apparently perpendicular roads.
      .filter(({ difference }) => difference < 89.5)
      .sort((a, b) => {
        const alignment = a.difference - b.difference;
        if (Math.abs(alignment) > 0.5) return alignment;
        // At equally good junctions prefer continuing instead of immediately returning.
        return (
          Number(a.candidate.edge.to === state.previousNodeId) -
          Number(b.candidate.edge.to === state.previousNodeId)
        );
      })[0]?.candidate
  );
}

function positionOnEdge(indexed: IndexedEdge, travelled: number) {
  const { edge, segmentLengths } = indexed;
  let remaining = Math.max(0, Math.min(travelled, indexed.length));
  for (let i = 0; i < segmentLengths.length; i += 1) {
    const segmentLength = segmentLengths[i];
    if (remaining <= segmentLength || i === segmentLengths.length - 1) {
      const start = edge.coordinates[i];
      const end = edge.coordinates[i + 1];
      const fraction =
        segmentLength > 0 ? Math.min(1, remaining / segmentLength) : 0;
      const coordinate: Coordinate = [
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
      ];
      return { coordinate, bearing: bearing(start, end) };
    }
    remaining -= segmentLength;
  }
  return {
    coordinate: edge.coordinates[edge.coordinates.length - 1],
    bearing: indexed.bearing,
  };
}

export function createDrivingState(
  world: GameWorld,
  nodeId = world.startNodeId,
): DrivingState {
  const index = indexGraph(world.graph);
  const outgoing = index.outgoing.get(nodeId);
  return {
    coordinate: [...(world.graph.nodes[nodeId]?.coordinate ?? world.center)],
    bearing: outgoing?.[0]?.bearing ?? 0,
    speedKmh: 0,
    distanceMeters: 0,
    roadName: outgoing?.[0]?.edge.name || "Unbenannte Straße",
    atBoundary: !outgoing?.length,
    running: false,
    nodeId,
    edgeId: null,
    edgeDistanceMeters: 0,
    previousNodeId: null,
  };
}

/**
 * Advance exclusively along directed OSM edges. A direction change takes effect
 * at the next node; even a U-turn traverses a real reverse edge, never open space.
 */
export function advanceDriving(
  graph: RoadGraph,
  state: DrivingState,
  direction: DrivingDirection | null,
  elapsedSeconds: number,
): DrivingState {
  if (!direction || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return state.running || state.speedKmh !== 0
      ? { ...state, running: false, speedKmh: 0 }
      : state;
  }

  const index = indexGraph(graph);
  let remaining = SPEED_METERS_PER_SECOND * elapsedSeconds;
  const next = {
    ...state,
    atBoundary: false,
    running: true,
    speedKmh: SPEED_KMH,
  };

  // Limit work for pathological graph data or unusually large time steps.
  for (
    let crossings = 0;
    remaining > 0.000001 && crossings < 256;
    crossings += 1
  ) {
    let indexed = next.edgeId ? index.edges.get(next.edgeId) : undefined;
    if (!indexed) {
      indexed = chooseEdge(index, next, direction);
      if (!indexed) {
        next.atBoundary = true;
        next.running = false;
        next.speedKmh = 0;
        break;
      }
      next.edgeId = indexed.edge.id;
      next.edgeDistanceMeters = 0;
      next.roadName = indexed.edge.name || "Unbenannte Straße";
    }

    const step = Math.min(remaining, indexed.length - next.edgeDistanceMeters);
    next.edgeDistanceMeters += step;
    next.distanceMeters += step;
    remaining -= step;
    const position = positionOnEdge(indexed, next.edgeDistanceMeters);
    next.coordinate = position.coordinate;
    next.bearing = position.bearing;

    if (next.edgeDistanceMeters >= indexed.length - 0.000001) {
      next.previousNodeId = indexed.edge.from;
      next.nodeId = indexed.edge.to;
      next.edgeId = null;
      next.edgeDistanceMeters = 0;
    }
  }
  return next;
}

export function drivableNodeIds(graph: RoadGraph): string[] {
  return [...indexGraph(graph).outgoing.keys()];
}
