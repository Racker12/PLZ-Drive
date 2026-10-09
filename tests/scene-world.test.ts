import assert from "node:assert/strict";
import test from "node:test";
import {
  createSceneWorld,
  distanceToSegment,
  projectCoordinate,
} from "../src/lib/scene-world";
import type { Coordinate, GameWorld } from "../src/lib/types";

const origin: Coordinate = [13.4, 52.5];
const east: Coordinate = [13.407, 52.5];
const north: Coordinate = [13.4, 52.505];
const world: GameWorld = {
  postalCode: "10115",
  place: "Berlin",
  state: "Berlin",
  center: origin,
  startNodeId: "a",
  fallback: false,
  graph: {
    nodes: {
      a: { id: "a", coordinate: origin },
      b: { id: "b", coordinate: east },
      c: { id: "c", coordinate: north },
    },
    edges: [
      {
        id: "ab",
        from: "a",
        to: "b",
        coordinates: [origin, east],
        name: "Oststraße",
      },
      {
        id: "ba",
        from: "b",
        to: "a",
        coordinates: [east, origin],
        name: "Oststraße",
      },
      {
        id: "ac",
        from: "a",
        to: "c",
        coordinates: [origin, north],
        name: "Nordstraße",
      },
    ],
  },
};

test("local projection preserves east/north directions and meter scale", () => {
  assert.deepEqual(projectCoordinate(origin, origin), { x: 0, z: 0 });
  const eastPoint = projectCoordinate(east, origin);
  const northPoint = projectCoordinate(north, origin);
  assert(eastPoint.x > 470 && eastPoint.x < 480);
  assert.equal(eastPoint.z, 0);
  assert.equal(northPoint.x, 0);
  assert(northPoint.z < -550 && northPoint.z > -560);
});

test("reverse directed edges share one 3D street surface", () => {
  const scene = createSceneWorld(world);
  assert.equal(scene.roads.length, 2);
  assert.equal(scene.segments.length, 2);
  assert.equal(scene.junctions.length, 3);
});

test("procedural buildings are deterministic and clear of all roads", () => {
  const scene = createSceneWorld(world);
  assert(scene.buildings.length > 0);
  assert.deepEqual(scene.buildings, createSceneWorld(world).buildings);
  for (const building of scene.buildings) {
    const radius = Math.hypot(building.width, building.depth) / 2;
    for (const segment of scene.segments) {
      assert(distanceToSegment(building, segment) >= radius + 6);
    }
  }
  for (const tree of scene.trees) {
    for (const segment of scene.segments) {
      assert(distanceToSegment(tree, segment) >= 6.5);
    }
  }
});

test("different parallel geometry is retained and invalid short edges are ignored", () => {
  const scene = createSceneWorld({
    ...world,
    graph: {
      ...world.graph,
      edges: [
        ...world.graph.edges,
        {
          id: "curve",
          from: "a",
          to: "b",
          coordinates: [origin, [13.403, 52.5003], east],
          name: "Bogen",
        },
        {
          id: "short",
          from: "a",
          to: "a",
          coordinates: [origin],
          name: "Invalid",
        },
      ],
    },
  });
  assert.equal(scene.roads.length, 3);
});
