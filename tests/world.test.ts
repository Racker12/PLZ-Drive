import assert from "node:assert/strict";
import test from "node:test";
import { buildRoadGraph, getLargestComponent } from "../src/lib/graph";
import { distanceMeters } from "../src/lib/geo";
import type { DataProvider } from "../src/lib/types";
import { WorldError } from "../src/services/errors";
import { createWorld, createWorldWithFallback } from "../src/services/world";
import { getSavedBerlinWorld } from "../src/services/saved-world";

test("10115 uses a clearly labeled real saved Berlin graph when the geocoder is unavailable", async () => {
  const provider: DataProvider = {
    async resolvePostalCode() {
      throw new WorldError("Geocoder unavailable", 503);
    },
    async loadRoadGraph() {
      throw new Error("Road provider must not be called");
    },
  };
  const world = await createWorldWithFallback("10115", provider);
  assert.equal(world.fallback, true);
  assert.equal(world.postalCode, "10115");
  assert.equal(world.place, "Berlin");
  assert.equal(world.state, "Berlin");
  assert.match(world.notice!, /Gespeichertes OSM-Beispielnetz/);
  assert.match(world.notice!, /09\.10\.2026/);
  assert.deepEqual(
    world.center,
    world.graph.nodes[world.startNodeId].coordinate,
  );
});

test("10115 uses the saved graph for an upstream road outage, with live data preferred otherwise", async () => {
  const provider: DataProvider = {
    async resolvePostalCode(postalCode) {
      return {
        postalCode,
        place: "Berlin",
        state: "Berlin",
        center: [13.381, 52.53],
      };
    },
    async loadRoadGraph() {
      throw new WorldError("Overpass unavailable", 503);
    },
  };
  assert.equal(
    (await createWorldWithFallback("10115", provider)).fallback,
    true,
  );
  provider.loadRoadGraph = async () => graph;
  const live = await createWorldWithFallback("10115", provider);
  assert.equal(live.fallback, false);
  assert.equal(live.graph, graph);
});

test("an unavailable or unknown other PLZ is never moved to the Berlin snapshot", async () => {
  for (const status of [503, 404]) {
    const provider: DataProvider = {
      async resolvePostalCode() {
        throw new WorldError("Provider unavailable", status);
      },
      async loadRoadGraph() {
        throw new Error("Road provider must not be called");
      },
    };
    await assert.rejects(
      createWorldWithFallback("01067", provider),
      (error) => error instanceof WorldError && error.status === status,
    );
  }
});

test("saved OSM network is connected, bounded, and has complete directed geometry", () => {
  const world = getSavedBerlinWorld();
  const graph = world.graph;
  const connected = getLargestComponent(graph);
  assert.equal(
    Object.keys(connected.nodes).length,
    Object.keys(graph.nodes).length,
  );
  assert.equal(connected.edges.length, graph.edges.length);
  assert.equal(
    new Set(graph.edges.map((edge) => edge.id)).size,
    graph.edges.length,
  );
  for (const node of Object.values(graph.nodes)) {
    assert(distanceMeters(node.coordinate, [13.3845571, 52.5321914]) <= 650);
    assert.match(node.id, /^\d+$/);
  }
  for (const edge of graph.edges) {
    assert.deepEqual(edge.coordinates[0], graph.nodes[edge.from].coordinate);
    assert.deepEqual(edge.coordinates.at(-1), graph.nodes[edge.to].coordinate);
    assert.equal(typeof edge.name, "string");
    assert(distanceMeters(edge.coordinates[0], edge.coordinates.at(-1)!) > 0);
  }
});

const graph = buildRoadGraph({
  elements: [
    {
      type: "way",
      id: 100,
      nodes: [1, 2, 3],
      geometry: [
        { lon: 13.38, lat: 52.53 },
        { lon: 13.381, lat: 52.53 },
        { lon: 13.382, lat: 52.53 },
      ],
      tags: { highway: "residential", name: "Teststraße" },
    },
  ],
});

test("world startup uses geocoder/provider and starts exactly on a road node", async () => {
  const provider: DataProvider = {
    async resolvePostalCode(postalCode) {
      return {
        postalCode,
        place: "Berlin",
        state: "Berlin",
        center: [13.381, 52.53],
      };
    },
    async loadRoadGraph(center) {
      assert.deepEqual(center, [13.381, 52.53]);
      return graph;
    },
  };
  const world = await createWorld("10115", provider);
  assert.equal(world.postalCode, "10115");
  assert.equal(world.fallback, false);
  assert.deepEqual(
    world.center,
    world.graph.nodes[world.startNodeId].coordinate,
  );
  assert.match(world.notice!, /PLZ-Grenzen/);
});

test("invalid input is rejected before querying any upstream service", async () => {
  const provider: DataProvider = {
    async resolvePostalCode() {
      throw new Error("Provider must not be called");
    },
    async loadRoadGraph() {
      throw new Error("Provider must not be called");
    },
  };
  await assert.rejects(
    createWorld("abc", provider),
    (error) => error instanceof WorldError && error.status === 400,
  );
});

test("an empty road network returns a useful error instead of placing a car off-road", async () => {
  const provider: DataProvider = {
    async resolvePostalCode(postalCode) {
      return { postalCode, place: "Ort", state: "Land", center: [13, 52] };
    },
    async loadRoadGraph() {
      return { nodes: {}, edges: [] };
    },
  };
  await assert.rejects(
    createWorld("10115", provider),
    /keine befahrbaren Straßen/,
  );
});
