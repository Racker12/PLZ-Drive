import type { DrivingState } from "./driving";
import {
  bearingDegrees,
  distanceMeters,
  headingDifference,
  interpolateCoordinate,
  normalizeBearing,
} from "./geo";
import type { GameWorld, RoadEdge, RoadGraph } from "./types";

export type VehicleInput = "throttle" | "brake" | "left" | "right";
export type VehicleInputs = Record<VehicleInput, boolean>;

export const EMPTY_VEHICLE_INPUTS: VehicleInputs = {
  throttle: false,
  brake: false,
  left: false,
  right: false,
};

export interface VehicleState extends DrivingState {
  /** Positive means forward; the edge itself always follows legal OSM traffic. */
  velocityKmh: number;
  gear: "D" | "R" | "N";
  steering: number;
  /** Kept while stationary so changing gear does not rotate the vehicle. */
  travelDirection: 1 | -1;
  steeringIntent: -1 | 0 | 1;
  /** A held turn is used once at a real junction, then rearmed on release. */
  steeringConsumed: boolean;
}

interface IndexedEdge {
  edge: RoadEdge;
  segments: number[];
  length: number;
  bearing: number;
  reverse?: IndexedEdge;
}

interface GraphIndex {
  edges: Map<string, IndexedEdge>;
  outgoing: Map<string, IndexedEdge[]>;
}

const graphIndexes = new WeakMap<RoadGraph, GraphIndex>();
const FORWARD_ACCELERATION = 15;
const REVERSE_ACCELERATION = 12;
const BRAKE_DECELERATION = 36;
const COAST_DECELERATION = 12;
const MAX_FORWARD_KMH = 60;
const MAX_REVERSE_KMH = 18;
const EPSILON = 0.000001;

function indexGraph(graph: RoadGraph): GraphIndex {
  const cached = graphIndexes.get(graph);
  if (cached) return cached;
  const index: GraphIndex = { edges: new Map(), outgoing: new Map() };
  for (const edge of graph.edges) {
    if (
      edge.coordinates.length < 2 ||
      !graph.nodes[edge.from] ||
      !graph.nodes[edge.to]
    )
      continue;
    const segments = edge.coordinates
      .slice(1)
      .map((point, segment) =>
        distanceMeters(edge.coordinates[segment], point),
      );
    const length = segments.reduce((sum, segment) => sum + segment, 0);
    if (!Number.isFinite(length) || length < 0.01) continue;
    const firstSegment = segments.findIndex((segment) => segment > EPSILON);
    const indexed: IndexedEdge = {
      edge,
      segments,
      length,
      bearing: bearingDegrees(
        edge.coordinates[firstSegment],
        edge.coordinates[firstSegment + 1],
      ),
    };
    index.edges.set(edge.id, indexed);
    const outgoing = index.outgoing.get(edge.from) ?? [];
    outgoing.push(indexed);
    index.outgoing.set(edge.from, outgoing);
  }

  // A reverse edge must describe the same physical road, not just another road
  // between the same junctions. This prevents a gear change jumping a median.
  for (const indexed of index.edges.values()) {
    const points = indexed.edge.coordinates;
    indexed.reverse = index.outgoing.get(indexed.edge.to)?.find((candidate) => {
      if (
        candidate.edge.to !== indexed.edge.from ||
        candidate.edge.coordinates.length !== points.length
      )
        return false;
      return points.every((point, position) => {
        const reversed =
          candidate.edge.coordinates[points.length - 1 - position];
        return (
          Math.abs(point[0] - reversed[0]) < 1e-9 &&
          Math.abs(point[1] - reversed[1]) < 1e-9
        );
      });
    });
  }
  graphIndexes.set(graph, index);
  return index;
}

function positionOnEdge(indexed: IndexedEdge, travelled: number) {
  let remaining = Math.max(0, Math.min(indexed.length, travelled));
  for (let segment = 0; segment < indexed.segments.length; segment += 1) {
    const length = indexed.segments[segment];
    if (length < EPSILON) continue;
    if (remaining <= length || segment === indexed.segments.length - 1) {
      const start = indexed.edge.coordinates[segment];
      const end = indexed.edge.coordinates[segment + 1];
      return {
        coordinate: interpolateCoordinate(start, end, remaining / length),
        bearing: bearingDegrees(start, end),
      };
    }
    remaining -= length;
  }
  return {
    coordinate: indexed.edge.coordinates[indexed.edge.coordinates.length - 1],
    bearing: indexed.bearing,
  };
}

function chooseDeparture(
  index: GraphIndex,
  state: VehicleState,
  direction: 1 | -1,
): { indexed: IndexedEdge; tookTurn: boolean } | undefined {
  const changingGear = direction !== state.travelDirection;
  const motionBearing = normalizeBearing(
    state.bearing + (direction === -1 ? 180 : 0),
  );
  const departures = (index.outgoing.get(state.nodeId) ?? [])
    // Geometry nodes normally have the continuation plus the reverse edge.
    // Ignore the latter unless an explicit gear change asks to back up.
    .filter(({ edge }) => changingGear || edge.to !== state.previousNodeId)
    .map((indexed) => ({
      indexed,
      turn: headingDifference(motionBearing, indexed.bearing),
    }));
  const candidates = departures.filter(({ turn }) => {
    // A genuine hairpin on the only continuation is allowed; a steering key
    // must never select a U-turn branch or turn the stationary car around.
    return (
      Math.abs(turn) < 150 ||
      (departures.length === 1 &&
        !changingGear &&
        state.previousNodeId !== null)
    );
  });
  if (!candidates.length) return undefined;
  candidates.sort((a, b) => Math.abs(a.turn) - Math.abs(b.turn));
  const straight = candidates[0];
  if (
    candidates.length === 1 ||
    state.steeringIntent === 0 ||
    state.steeringConsumed
  ) {
    return { indexed: straight.indexed, tookTurn: false };
  }
  // When reversing, the rear follows the opposite steering direction, just
  // like a car. The vehicle's front bearing remains separate from motion.
  const desiredTurn = state.steeringIntent * direction;
  const turn = candidates
    .filter(
      (candidate) =>
        Math.sign(candidate.turn) === desiredTurn &&
        Math.abs(candidate.turn) >= 25 &&
        Math.abs(candidate.turn) < 150,
    )
    .sort(
      (a, b) =>
        Math.abs(Math.abs(a.turn) - 75) - Math.abs(Math.abs(b.turn) - 75),
    )[0];
  return turn
    ? { indexed: turn.indexed, tookTurn: true }
    : { indexed: straight.indexed, tookTurn: false };
}

function velocityAfterStep(
  velocity: number,
  inputs: VehicleInputs,
  seconds: number,
): number {
  // Both pedals act as a brake. Direction changes always pass through zero.
  if (inputs.throttle && inputs.brake) {
    return (
      Math.sign(velocity) *
      Math.max(0, Math.abs(velocity) - BRAKE_DECELERATION * seconds)
    );
  }
  if (inputs.brake) {
    return velocity > 0
      ? Math.max(0, velocity - BRAKE_DECELERATION * seconds)
      : Math.max(-MAX_REVERSE_KMH, velocity - REVERSE_ACCELERATION * seconds);
  }
  if (inputs.throttle) {
    return velocity < 0
      ? Math.min(0, velocity + BRAKE_DECELERATION * seconds)
      : Math.min(MAX_FORWARD_KMH, velocity + FORWARD_ACCELERATION * seconds);
  }
  return (
    Math.sign(velocity) *
    Math.max(0, Math.abs(velocity) - COAST_DECELERATION * seconds)
  );
}

export function createVehicleState(
  world: GameWorld,
  nodeId = world.startNodeId,
): VehicleState {
  const outgoing = indexGraph(world.graph).outgoing.get(nodeId);
  return {
    coordinate: [...(world.graph.nodes[nodeId]?.coordinate ?? world.center)],
    bearing: outgoing?.[0]?.bearing ?? 0,
    speedKmh: 0,
    velocityKmh: 0,
    gear: "N",
    distanceMeters: 0,
    roadName: outgoing?.[0]?.edge.name || "Unbenannte Straße",
    atBoundary: !outgoing?.length,
    running: false,
    nodeId,
    edgeId: null,
    edgeDistanceMeters: 0,
    previousNodeId: null,
    steering: 0,
    travelDirection: 1,
    steeringIntent: 0,
    steeringConsumed: false,
  };
}

/** Pause, focus loss and the explicit stop control stop immediately. */
export function stopVehicle(state: VehicleState): VehicleState {
  return {
    ...state,
    velocityKmh: 0,
    speedKmh: 0,
    running: false,
    gear: "N",
    steering: 0,
    steeringIntent: 0,
    steeringConsumed: false,
  };
}

/**
 * Accelerate and steer relative to the car, while all motion follows directed
 * OSM geometry. Small physics steps make braking and junctions frame-rate safe.
 */
export function advanceVehicle(
  graph: RoadGraph,
  state: VehicleState,
  inputs: VehicleInputs,
  elapsedSeconds: number,
): VehicleState {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return state;
  const intent: -1 | 0 | 1 =
    inputs.left === inputs.right ? 0 : inputs.left ? -1 : 1;
  if (
    state.velocityKmh === 0 &&
    !inputs.throttle &&
    !inputs.brake &&
    state.steering === 0 &&
    intent === 0 &&
    state.steeringIntent === 0
  )
    return state;

  const index = indexGraph(graph);
  const next: VehicleState = {
    ...state,
    steeringIntent: intent,
    steeringConsumed:
      intent === state.steeringIntent ? state.steeringConsumed : false,
  };
  // The hook also caps RAF delta; this bounds accidental huge external calls.
  const elapsed = Math.min(elapsedSeconds, 10);
  const steps = Math.ceil(elapsed / 0.05);
  const seconds = elapsed / steps;
  next.steering += (intent - next.steering) * (1 - Math.exp(-elapsed * 8));
  if (Math.abs(next.steering) < 0.001) next.steering = 0;

  for (let frame = 0; frame < steps; frame += 1) {
    const previousVelocity = next.velocityKmh;
    next.velocityKmh = velocityAfterStep(previousVelocity, inputs, seconds);
    const direction: 1 | -1 =
      (next.velocityKmh || previousVelocity) < 0 ? -1 : 1;
    let remaining =
      ((Math.abs(previousVelocity) + Math.abs(next.velocityKmh)) / 2 / 3.6) *
      seconds;
    if (remaining <= EPSILON) continue;
    next.atBoundary = false;

    if (next.edgeId && direction !== next.travelDirection) {
      const indexed = index.edges.get(next.edgeId);
      if (!indexed?.reverse) {
        // One-way streets have no matching legal reverse segment.
        next.velocityKmh = 0;
        next.atBoundary = true;
        continue;
      }
      next.edgeId = indexed.reverse.edge.id;
      next.edgeDistanceMeters = Math.max(
        0,
        indexed.reverse.length - next.edgeDistanceMeters,
      );
      next.nodeId = indexed.reverse.edge.from;
      next.previousNodeId = null;
      next.travelDirection = direction;
    }

    // Every meter, including a gear change, is consumed on real road geometry.
    for (
      let crossings = 0;
      remaining > EPSILON && crossings < 256;
      crossings += 1
    ) {
      let indexed = next.edgeId ? index.edges.get(next.edgeId) : undefined;
      if (!indexed) {
        const departure = chooseDeparture(index, next, direction);
        if (!departure) {
          next.atBoundary = true;
          next.velocityKmh = 0;
          break;
        }
        indexed = departure.indexed;
        next.edgeId = indexed.edge.id;
        next.edgeDistanceMeters = 0;
        next.travelDirection = direction;
        next.roadName = indexed.edge.name || "Unbenannte Straße";
        if (departure.tookTurn) next.steeringConsumed = true;
      }

      const movement = Math.min(
        remaining,
        indexed.length - next.edgeDistanceMeters,
      );
      next.edgeDistanceMeters += movement;
      next.distanceMeters += movement;
      remaining -= movement;
      const position = positionOnEdge(indexed, next.edgeDistanceMeters);
      next.coordinate = position.coordinate;
      next.bearing = normalizeBearing(
        position.bearing + (direction === -1 ? 180 : 0),
      );
      if (next.edgeDistanceMeters >= indexed.length - EPSILON) {
        next.previousNodeId = indexed.edge.from;
        next.nodeId = indexed.edge.to;
        next.edgeId = null;
        next.edgeDistanceMeters = 0;
      }
    }
  }
  if (Math.abs(next.velocityKmh) < 0.001) next.velocityKmh = 0;
  next.speedKmh = Math.abs(next.velocityKmh);
  next.gear = next.velocityKmh > 0 ? "D" : next.velocityKmh < 0 ? "R" : "N";
  next.running = next.velocityKmh !== 0;
  return next;
}
