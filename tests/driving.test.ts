import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceDriving,
  createDrivingState,
  drivableNodeIds,
} from "../src/lib/driving";
import type {
  Coordinate,
  GameWorld,
  RoadEdge,
  RoadGraph,
} from "../src/lib/types";

function world(
  nodes: Record<string, Coordinate>,
  edges: RoadEdge[],
): GameWorld {
  return {
    postalCode: "10115",
    place: "Berlin",
    state: "Berlin",
    center: nodes.a,
    startNodeId: "a",
    fallback: false,
    graph: {
      nodes: Object.fromEntries(
        Object.entries(nodes).map(([id, coordinate]) => [
          id,
          { id, coordinate },
        ]),
      ),
      edges,
    },
  };
}

function edge(
  id: string,
  from: string,
  to: string,
  coordinates: Coordinate[],
): RoadEdge {
  return { id, from, to, coordinates, name: id };
}

test("movement interpolates the actual bent road, never a direct shortcut", () => {
  const start: Coordinate = [13, 52];
  const corner: Coordinate = [13, 52.0001];
  const end: Coordinate = [13.0002, 52.0001];
  const game = world({ a: start, b: end }, [
    edge("bend", "a", "b", [start, corner, end]),
  ]);

  const first = advanceDriving(
    game.graph,
    createDrivingState(game),
    "north",
    0.5,
  );
  assert.equal(first.coordinate[0], start[0]);
  assert.ok(first.coordinate[1] > start[1] && first.coordinate[1] < corner[1]);
  assert.equal(first.speedKmh, 35);

  const afterCorner = advanceDriving(game.graph, first, "north", 1);
  assert.equal(afterCorner.coordinate[1], corner[1]);
  assert.ok(
    afterCorner.coordinate[0] > corner[0] && afterCorner.coordinate[0] < end[0],
  );
  assert.ok(Math.abs(afterCorner.distanceMeters - (35 / 3.6) * 1.5) < 0.001);
});

test("releasing the key stops immediately and retains position", () => {
  const game = world({ a: [13, 52], b: [13, 52.01] }, [
    edge("north", "a", "b", [
      [13, 52],
      [13, 52.01],
    ]),
  ]);
  const moving = advanceDriving(
    game.graph,
    createDrivingState(game),
    "north",
    1,
  );
  const stopped = advanceDriving(game.graph, moving, null, 20);
  assert.deepEqual(stopped.coordinate, moving.coordinate);
  assert.equal(stopped.distanceMeters, moving.distanceMeters);
  assert.equal(stopped.running, false);
  assert.equal(stopped.speedKmh, 0);
});

test("a turn is chosen at the next junction without jumping off the incoming edge", () => {
  const a: Coordinate = [13, 52];
  const b: Coordinate = [13, 52.0001];
  const c: Coordinate = [13.0002, 52.0001];
  const d: Coordinate = [13, 52.0003];
  const game = world({ a, b, c, d }, [
    edge("ab", "a", "b", [a, b]),
    edge("bc", "b", "c", [b, c]),
    edge("bd", "b", "d", [b, d]),
  ]);
  const approaching = advanceDriving(
    game.graph,
    createDrivingState(game),
    "north",
    0.3,
  );
  const stillApproaching = advanceDriving(game.graph, approaching, "east", 0.3);
  assert.equal(stillApproaching.edgeId, "ab");
  assert.equal(stillApproaching.coordinate[0], a[0]);
  const turned = advanceDriving(game.graph, stillApproaching, "east", 1);
  assert.equal(turned.edgeId, "bc");
  assert.equal(turned.coordinate[1], b[1]);
  assert.ok(turned.coordinate[0] > b[0]);
});

test("one-way dead ends stop safely; a reverse edge allows a physical U-turn", () => {
  const a: Coordinate = [13, 52];
  const b: Coordinate = [13, 52.0001];
  const game = world({ a, b }, [edge("ab", "a", "b", [a, b])]);
  const atEnd = advanceDriving(
    game.graph,
    createDrivingState(game),
    "north",
    10,
  );
  assert.deepEqual(atEnd.coordinate, b);
  assert.equal(atEnd.atBoundary, true);
  assert.equal(atEnd.running, false);
  const blocked = advanceDriving(game.graph, atEnd, "south", 1);
  assert.deepEqual(blocked.coordinate, b);

  const twoWay = world({ a, b }, [
    edge("ab", "a", "b", [a, b]),
    edge("ba", "b", "a", [b, a]),
  ]);
  const returned = advanceDriving(twoWay.graph, atEnd, "south", 0.5);
  assert.equal(returned.edgeId, "ba");
  assert.ok(returned.coordinate[1] < b[1] && returned.coordinate[1] > a[1]);
});

test("degenerate roads are ignored and a disconnected start is safe", () => {
  const game = world({ a: [13, 52], b: [13.01, 52] }, [
    edge("empty", "a", "b", []),
    edge("zero", "a", "a", [
      [13, 52],
      [13, 52],
    ]),
  ]);
  assert.deepEqual(drivableNodeIds(game.graph), []);
  const initial = createDrivingState(game);
  assert.equal(initial.atBoundary, true);
  const stopped = advanceDriving(game.graph, initial, "east", 1);
  assert.deepEqual(stopped.coordinate, [13, 52]);
  assert.equal(stopped.distanceMeters, 0);
});

test("invalid elapsed time does not move the vehicle", () => {
  const graph: RoadGraph = {
    nodes: { a: { id: "a", coordinate: [13, 52] } },
    edges: [],
  };
  const game = world({ a: [13, 52] }, []);
  const initial = createDrivingState(game);
  for (const delta of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(
      advanceDriving(graph, initial, "north", delta).coordinate,
      initial.coordinate,
    );
  }
});

test("a perpendicular road does not move the car in an unintended direction", () => {
  const game = world({ a: [13, 52], b: [13.001, 52] }, [
    edge("east", "a", "b", [
      [13, 52],
      [13.001, 52],
    ]),
  ]);
  const stopped = advanceDriving(
    game.graph,
    createDrivingState(game),
    "north",
    1,
  );
  assert.deepEqual(stopped.coordinate, [13, 52]);
  assert.equal(stopped.atBoundary, true);
  assert.equal(stopped.running, false);
});
