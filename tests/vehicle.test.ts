import assert from "node:assert/strict";
import test from "node:test";
import { distanceMeters, headingDifference } from "../src/lib/geo";
import type { Coordinate, GameWorld, RoadEdge } from "../src/lib/types";
import {
  advanceVehicle,
  createVehicleState,
  EMPTY_VEHICLE_INPUTS,
  stopVehicle,
  type VehicleInputs,
  type VehicleState,
} from "../src/lib/vehicle";

const throttle = { ...EMPTY_VEHICLE_INPUTS, throttle: true };
const brake = { ...EMPTY_VEHICLE_INPUTS, brake: true };
const right = { ...throttle, right: true };
const left = { ...throttle, left: true };

function world(
  nodes: Record<string, Coordinate>,
  roads: [string, string, string, Coordinate[]?][],
): GameWorld {
  const edges: RoadEdge[] = roads.map(([id, from, to, geometry]) => ({
    id,
    from,
    to,
    name: id,
    coordinates: geometry ?? [nodes[from], nodes[to]],
  }));
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

function longRoad(twoWay = true): GameWorld {
  return world(
    { a: [13, 52], b: [13, 52.01] },
    twoWay
      ? [
          ["ab", "a", "b"],
          ["ba", "b", "a"],
        ]
      : [["ab", "a", "b"]],
  );
}

function advance(
  game: GameWorld,
  state: VehicleState,
  inputs: VehicleInputs,
  seconds: number,
) {
  return advanceVehicle(game.graph, state, inputs, seconds);
}

test("gas accelerates smoothly up to 60 km/h and reports forward gear", () => {
  const game = longRoad();
  const initial = createVehicleState(game);
  assert.equal(initial.gear, "N");
  const first = advance(game, initial, throttle, 1);
  assert.ok(Math.abs(first.speedKmh - 15) < 0.001);
  assert.ok(Math.abs(first.distanceMeters - 7.5 / 3.6) < 0.001);
  assert.equal(first.gear, "D");
  assert.equal(first.velocityKmh, first.speedKmh);
  const cruising = advance(game, first, throttle, 5);
  assert.equal(cruising.speedKmh, 60);
  assert.equal(cruising.running, true);
});

test("releasing the pedal coasts on the road before coming to rest", () => {
  const game = longRoad();
  const moving = advance(game, createVehicleState(game), throttle, 2);
  const coast = advance(game, moving, EMPTY_VEHICLE_INPUTS, 1);
  assert.ok(coast.coordinate[1] > moving.coordinate[1]);
  assert.ok(Math.abs(coast.speedKmh - 18) < 0.001);
  assert.equal(coast.running, true);
  const stopped = advance(game, coast, EMPTY_VEHICLE_INPUTS, 3);
  assert.equal(stopped.speedKmh, 0);
  assert.equal(stopped.gear, "N");
  assert.equal(stopped.running, false);
  assert.ok(stopped.distanceMeters > coast.distanceMeters);
  assert.equal(advance(game, stopped, EMPTY_VEHICLE_INPUTS, 1), stopped);
});

test("brake slows forward motion before physically reversing the current segment", () => {
  const game = longRoad();
  const moving = advance(game, createVehicleState(game), throttle, 2);
  const braking = advance(game, moving, brake, 0.5);
  assert.ok(braking.velocityKmh > 0);
  assert.ok(braking.coordinate[1] > moving.coordinate[1]);
  const stopped = stopVehicle(braking);
  const backing = advance(game, stopped, brake, 0.1);
  assert.equal(backing.edgeId, "ba");
  assert.equal(backing.gear, "R");
  assert.ok(backing.velocityKmh < 0);
  assert.ok(backing.coordinate[1] < stopped.coordinate[1]);
  assert.ok(
    distanceMeters(stopped.coordinate, backing.coordinate) < 0.1,
    "changing gear never jumps to the other end of the road",
  );
  assert.ok(
    Math.abs(headingDifference(stopped.bearing, backing.bearing)) < 0.001,
    "the car front still points north while backing south",
  );
  const reverseCruise = advance(game, backing, brake, 1.5);
  assert.equal(reverseCruise.speedKmh, 18);
});

test("gas during reverse brakes, then drives forward without rotating the car", () => {
  const game = longRoad();
  const forward = advance(game, createVehicleState(game), throttle, 3);
  const backing = advance(game, stopVehicle(forward), brake, 1);
  const resumed = advance(game, backing, throttle, 1);
  assert.equal(resumed.edgeId, "ab");
  assert.equal(resumed.gear, "D");
  assert.ok(resumed.velocityKmh > 0);
  assert.ok(
    Math.abs(headingDifference(forward.bearing, resumed.bearing)) < 0.001,
  );
});

test("holding the brake changes direction only after forward velocity reaches zero", () => {
  const game = longRoad();
  const moving = advance(game, createVehicleState(game), throttle, 2);
  const nearlyStopped = advance(game, moving, brake, 0.8);
  assert.ok(nearlyStopped.velocityKmh > 0);
  assert.equal(nearlyStopped.edgeId, "ab");
  const reversing = advance(game, nearlyStopped, brake, 0.2);
  assert.ok(reversing.velocityKmh < 0);
  assert.equal(reversing.edgeId, "ba");
  assert.ok(
    distanceMeters(nearlyStopped.coordinate, reversing.coordinate) < 0.1,
  );
});

test("mid-road reversing preserves the exact bent-road geometry and car front", () => {
  const a: Coordinate = [13, 52];
  const corner: Coordinate = [13, 52.00002];
  const b: Coordinate = [13.001, 52.00002];
  const game = world({ a, b }, [
    ["bend", "a", "b", [a, corner, b]],
    ["reverse-bend", "b", "a", [b, corner, a]],
  ]);
  const moving = advance(game, createVehicleState(game), throttle, 2);
  assert.equal(moving.coordinate[1], corner[1]);
  assert.ok(moving.coordinate[0] > corner[0]);
  const reverse = advance(game, stopVehicle(moving), brake, 0.2);
  assert.equal(reverse.coordinate[1], corner[1]);
  assert.ok(reverse.coordinate[0] < moving.coordinate[0]);
  assert.ok(distanceMeters(moving.coordinate, reverse.coordinate) < 0.1);
  assert.ok(
    Math.abs(headingDifference(moving.bearing, reverse.bearing)) < 0.001,
  );
});

test("one-way segments reject reversing, but forward driving remains available", () => {
  const game = longRoad(false);
  const moving = advance(game, createVehicleState(game), throttle, 2);
  const stationary = stopVehicle(moving);
  const forbidden = advance(game, stationary, brake, 1);
  assert.deepEqual(forbidden.coordinate, stationary.coordinate);
  assert.equal(forbidden.velocityKmh, 0);
  assert.equal(forbidden.edgeId, "ab");
  const resumed = advance(game, forbidden, throttle, 1);
  assert.ok(resumed.coordinate[1] > forbidden.coordinate[1]);
});

test("an unrelated opposite road cannot serve as a mid-segment reverse edge", () => {
  const a: Coordinate = [13, 52];
  const b: Coordinate = [13, 52.01];
  const game = world({ a, b }, [
    ["ab", "a", "b"],
    ["parallel", "b", "a", [b, [13.001, 52.005], a]],
  ]);
  const stationary = stopVehicle(
    advance(game, createVehicleState(game), throttle, 2),
  );
  const forbidden = advance(game, stationary, brake, 0.2);
  assert.deepEqual(forbidden.coordinate, stationary.coordinate);
  assert.equal(forbidden.velocityKmh, 0);
});

test("relative right steering waits for the real junction and follows its road", () => {
  const a: Coordinate = [13, 52];
  const b: Coordinate = [13, 52.0001];
  const game = world({ a, b, c: [13.001, 52.0001], d: [13, 52.002] }, [
    ["ab", "a", "b"],
    ["ba", "b", "a"],
    ["bc", "b", "c"],
    ["bd", "b", "d"],
  ]);
  const approaching = advance(game, createVehicleState(game), right, 1);
  assert.equal(approaching.edgeId, "ab");
  assert.equal(approaching.coordinate[0], a[0]);
  const turned = advance(game, approaching, right, 2);
  assert.equal(turned.edgeId, "bc");
  assert.equal(turned.coordinate[1], b[1]);
  assert.ok(turned.coordinate[0] > b[0]);
  assert.equal(turned.steeringConsumed, true);
});

test("without steering the straightest continuation wins, never the reverse edge", () => {
  const game = world(
    { a: [13, 52], b: [13, 52.0001], c: [13.001, 52.0001], d: [13, 52.002] },
    [
      ["ab", "a", "b"],
      ["ba", "b", "a"],
      ["bc", "b", "c"],
      ["bd", "b", "d"],
    ],
  );
  const result = advance(game, createVehicleState(game), throttle, 3);
  assert.equal(result.edgeId, "bd");
  assert.equal(result.coordinate[0], 13);
  assert.ok(result.coordinate[1] > game.graph.nodes.b.coordinate[1]);
});

test("left steering is relative to the car rather than compass west", () => {
  const game = world(
    { a: [13, 52], b: [13.0001, 52], c: [13.0001, 52.002], d: [13.002, 52] },
    [
      ["ab", "a", "b"],
      ["ba", "b", "a"],
      ["bc", "b", "c"],
      ["bd", "b", "d"],
    ],
  );
  const result = advance(game, createVehicleState(game), left, 2);
  assert.equal(result.edgeId, "bc");
  assert.ok(result.coordinate[1] > 52);
});

test("geometry nodes and bent multi-point roads follow their curve automatically", () => {
  const a: Coordinate = [13, 52];
  const bend: Coordinate = [13, 52.00002];
  const b: Coordinate = [13.00004, 52.00002];
  const game = world({ a, b, c: [13.001, 52.00002] }, [
    ["curve", "a", "b", [a, bend, b]],
    ["reverse-curve", "b", "a", [b, bend, a]],
    ["continuation", "b", "c"],
  ]);
  const north = advance(game, createVehicleState(game), left, 0.5);
  assert.equal(north.coordinate[0], a[0]);
  const alongCurve = advance(game, north, left, 1);
  assert.equal(alongCurve.coordinate[1], bend[1]);
  assert.ok(alongCurve.coordinate[0] > bend[0]);
  assert.equal(
    alongCurve.steeringConsumed,
    false,
    "a road bend does not consume a queued junction turn",
  );
  const continued = advance(game, alongCurve, left, 1);
  assert.equal(continued.edgeId, "continuation");
  assert.equal(continued.steeringConsumed, false);
});

test("holding steering makes one junction turn, and release rearms it", () => {
  const game = world(
    {
      a: [13, 52],
      b: [13, 52.00004],
      c: [13.00006, 52.00004],
      d: [13, 52.001],
      e: [13.001, 52.00004],
      f: [13.00006, 51.999],
    },
    [
      ["ab", "a", "b"],
      ["ba", "b", "a"],
      ["bc", "b", "c"],
      ["bd", "b", "d"],
      ["cb", "c", "b"],
      ["ce", "c", "e"],
      ["cf", "c", "f"],
    ],
  );
  const oneTurn = advance(game, createVehicleState(game), right, 2.5);
  assert.equal(
    oneTurn.edgeId,
    "ce",
    "holding right must not make another premature turn at the following junction",
  );
  assert.equal(oneTurn.steeringConsumed, true);
  const rearmed = advance(game, oneTurn, throttle, 0.1);
  assert.equal(rearmed.steeringConsumed, false);
  assert.equal(rearmed.steeringIntent, 0);
  const betweenJunctions = advance(game, createVehicleState(game), right, 1.7);
  assert.equal(betweenJunctions.edgeId, "bc");
  const released = advance(game, betweenJunctions, throttle, 0.01);
  const secondTurn = advance(game, released, right, 0.7);
  assert.equal(
    secondTurn.edgeId,
    "cf",
    "a released and pressed steering key can turn at the following junction",
  );
});

test("dead ends stop forward motion instead of making a steering U-turn", () => {
  const game = world({ a: [13, 52], b: [13, 52.00004] }, [
    ["ab", "a", "b"],
    ["ba", "b", "a"],
  ]);
  const stopped = advance(game, createVehicleState(game), left, 3);
  assert.deepEqual(stopped.coordinate, game.graph.nodes.b.coordinate);
  assert.equal(stopped.atBoundary, true);
  assert.equal(stopped.speedKmh, 0);
  const backing = advance(game, stopped, brake, 0.5);
  assert.equal(backing.edgeId, "ba");
  assert.equal(backing.gear, "R");
  assert.ok(
    Math.abs(headingDifference(stopped.bearing, backing.bearing)) < 0.001,
  );
});

test("backing across segment boundaries preserves the forward-facing car bearing", () => {
  const game = world({ a: [13, 52], b: [13, 52.00004], c: [13, 52.0001] }, [
    ["ab", "a", "b"],
    ["ba", "b", "a"],
    ["bc", "b", "c"],
    ["cb", "c", "b"],
  ]);
  const forward = advance(game, createVehicleState(game), throttle, 2);
  assert.equal(forward.edgeId, "bc");
  const reverse = advance(game, stopVehicle(forward), brake, 1.8);
  assert.equal(reverse.edgeId, "ba");
  assert.equal(reverse.travelDirection, -1);
  assert.ok(
    Math.abs(headingDifference(forward.bearing, reverse.bearing)) < 0.001,
  );
});

test("pause/stop immediately clears velocity while keeping the exact position", () => {
  const game = longRoad();
  const moving = advance(game, createVehicleState(game), right, 2);
  const stopped = stopVehicle(moving);
  assert.deepEqual(stopped.coordinate, moving.coordinate);
  assert.equal(stopped.edgeDistanceMeters, moving.edgeDistanceMeters);
  assert.equal(stopped.distanceMeters, moving.distanceMeters);
  assert.equal(stopped.velocityKmh, 0);
  assert.equal(stopped.speedKmh, 0);
  assert.equal(stopped.running, false);
  assert.equal(stopped.steering, 0);
});

test("movement is independent of normal frame rate", () => {
  const game = longRoad();
  const initial = createVehicleState(game);
  const combined = advance(game, initial, throttle, 2);
  let frames = initial;
  for (let frame = 0; frame < 120; frame += 1)
    frames = advance(game, frames, throttle, 1 / 60);
  assert.ok(Math.abs(frames.speedKmh - combined.speedKmh) < 0.001);
  assert.ok(distanceMeters(frames.coordinate, combined.coordinate) < 0.001);
});

test("invalid frame times and degenerate graph data are safe", () => {
  const game = world({ a: [13, 52] }, [["zero", "a", "a"]]);
  const initial = createVehicleState(game);
  assert.equal(initial.atBoundary, true);
  for (const delta of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(advance(game, initial, throttle, delta), initial);
  }
  const blocked = advance(game, initial, throttle, 1);
  assert.deepEqual(blocked.coordinate, initial.coordinate);
  assert.equal(blocked.distanceMeters, 0);
  assert.equal(blocked.speedKmh, 0);
});
