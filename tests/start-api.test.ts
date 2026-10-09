import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/start/route";
import type { GameWorld } from "../src/lib/types";
import { getSavedBerlinWorld } from "../src/services/saved-world";

function request(body: unknown) {
  return new Request("http://localhost/api/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("explicit Berlin demo returns the real saved road network without contacting public APIs", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("The instant demo must not contact public APIs");
  });
  const response = await POST(
    request({ postalCode: " 10115 ", preferSnapshot: true }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const world: GameWorld = await response.json();
  assert.equal(world.postalCode, "10115");
  assert.equal(world.place, "Berlin");
  assert.equal(world.state, "Berlin");
  assert.equal(Object.keys(world.graph.nodes).length, 1498);
  assert.equal(world.graph.edges.length, 2801);
  assert.deepEqual(
    world.center,
    world.graph.nodes[world.startNodeId].coordinate,
  );
  assert(world.graph.edges.some((edge) => edge.from === world.startNodeId));
  assert.match(world.notice!, /Gespeichertes OSM-Beispielnetz/);
  assert.match(world.notice!, /Berlin-Demo gewählt/);
  assert.doesNotMatch(world.notice!, /nicht verfügbar/);
  assert.equal(fetch.mock.calls.length, 0);
});

test("instant demo rejects other postal codes instead of relocating players to Berlin", async () => {
  for (const postalCode of ["20095", "01067", "abc"]) {
    const response = await POST(request({ postalCode, preferSnapshot: true }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /nur für 10115 Berlin/);
  }
});

test("demo selection accepts only a boolean when supplied", async () => {
  for (const preferSnapshot of ["true", 1, null, {}]) {
    const response = await POST(
      request({ postalCode: "10115", preferSnapshot }),
    );
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /true oder false/);
  }
});

test("normal startup retains postal-code validation when the demo flag is absent or false", async () => {
  for (const body of [
    { postalCode: "abc" },
    { postalCode: "abc", preferSnapshot: false },
    { postalCode: 10115 },
  ]) {
    const response = await POST(request(body));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /genau fünf Ziffern/);
  }
});

test("malformed JSON receives a useful 400 response", async () => {
  const response = await POST(
    new Request("http://localhost/api/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid-json",
    }),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /gültiges JSON/);
});

test("automatic Berlin fallback still describes an outage and demo selection leaves it unchanged", () => {
  const fallback = getSavedBerlinWorld();
  const demo = getSavedBerlinWorld("demo");
  assert.match(fallback.notice!, /Kartendienst ist gerade nicht verfügbar/);
  assert.doesNotMatch(fallback.notice!, /Demo gewählt/);
  assert.match(demo.notice!, /Berlin-Demo gewählt/);
  assert.equal(demo.graph, fallback.graph);
  assert.match(
    getSavedBerlinWorld().notice!,
    /Kartendienst ist gerade nicht verfügbar/,
  );
});
