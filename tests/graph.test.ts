import assert from "node:assert/strict";
import test from "node:test";
import { distanceMeters, isGermanPostalCode } from "../src/lib/geo";
import {
  buildRoadGraph,
  getLargestComponent,
  selectStartNode,
  type OverpassResponse,
} from "../src/lib/graph";

const roads: OverpassResponse = {
  elements: [
    { type: "node", id: 1, lon: 13.4, lat: 52.5 },
    { type: "node", id: 2, lon: 13.401, lat: 52.5 },
    { type: "node", id: 3, lon: 13.402, lat: 52.5 },
    { type: "node", id: 4, lon: 13.401, lat: 52.501 },
    { type: "node", id: 5, lon: 13.401, lat: 52.499 },
    {
      type: "way",
      id: 10,
      nodes: [1, 2, 3],
      tags: { highway: "residential", name: "Hauptstraße" },
    },
    {
      type: "way",
      id: 20,
      nodes: [2, 4],
      tags: { highway: "residential", oneway: "yes" },
    },
    {
      type: "way",
      id: 30,
      nodes: [2, 5],
      tags: { highway: "service", oneway: "-1" },
    },
  ],
};

test("postal code validation accepts leading zeroes and rejects partial codes", () => {
  assert.equal(isGermanPostalCode("01067"), true);
  for (const invalid of ["1067", "123456", "12a45", " 10115", "10115\n", ""]) {
    assert.equal(isGermanPostalCode(invalid), false);
  }
});

test("street graph joins shared OSM nodes and respects forward/reverse one-way streets", () => {
  const graph = buildRoadGraph(roads);
  assert.equal(Object.keys(graph.nodes).length, 5);
  assert.equal(graph.edges.length, 6);
  assert(graph.edges.some((edge) => edge.from === "2" && edge.to === "4"));
  assert(!graph.edges.some((edge) => edge.from === "4" && edge.to === "2"));
  assert(graph.edges.some((edge) => edge.from === "5" && edge.to === "2"));
  assert(!graph.edges.some((edge) => edge.from === "2" && edge.to === "5"));
  assert.equal(graph.edges[0].name, "Hauptstraße");
  for (const edge of graph.edges) {
    assert.deepEqual(edge.coordinates[0], graph.nodes[edge.from].coordinate);
    assert.deepEqual(edge.coordinates.at(-1), graph.nodes[edge.to].coordinate);
  }
});

test("footpaths/private roads are excluded and explicit motorcar access takes precedence", () => {
  const graph = buildRoadGraph({
    elements: [
      {
        type: "way",
        id: 1,
        nodes: [1, 2],
        geometry: [
          { lon: 13, lat: 52 },
          { lon: 13.01, lat: 52 },
        ],
        tags: { highway: "footway" },
      },
      {
        type: "way",
        id: 2,
        nodes: [3, 4],
        geometry: [
          { lon: 13, lat: 52 },
          { lon: 13.01, lat: 52 },
        ],
        tags: { highway: "service", access: "private" },
      },
      {
        type: "way",
        id: 3,
        nodes: [5, 6],
        geometry: [
          { lon: 13, lat: 52 },
          { lon: 13.01, lat: 52 },
        ],
        tags: { highway: "residential", access: "no", motorcar: "yes" },
      },
    ],
  });
  assert.deepEqual(Object.keys(graph.nodes), ["5", "6"]);
  assert.equal(graph.edges.length, 2);
});

test("geometry crossing without shared OSM node does not create a junction", () => {
  const graph = buildRoadGraph({
    elements: [
      {
        type: "way",
        id: 1,
        nodes: [1, 2, 3],
        geometry: [
          { lon: 13, lat: 52 },
          { lon: 13.01, lat: 52 },
          { lon: 13.02, lat: 52 },
        ],
        tags: { highway: "residential" },
      },
      {
        type: "way",
        id: 2,
        nodes: [4, 5],
        geometry: [
          { lon: 13.01, lat: 51.99 },
          { lon: 13.01, lat: 52.01 },
        ],
        tags: { highway: "residential", bridge: "yes" },
      },
    ],
  });
  const connected = getLargestComponent(graph);
  assert.deepEqual(Object.keys(connected.nodes).sort(), ["1", "2", "3"]);
  assert.equal(connected.edges.length, 4);
});

test("start selection favors usable nearby junctions in the selected graph", () => {
  const graph = getLargestComponent(buildRoadGraph(roads));
  const start = selectStartNode(graph, [13.401, 52.5], () => 0);
  assert.equal(start, "2");
  assert(distanceMeters(graph.nodes[start].coordinate, [13.401, 52.5]) < 1);
  assert.throws(() => selectStartNode({ nodes: {}, edges: [] }, [13, 52]));
});

test("roundabouts default to one-way but explicit car-direction tags override it", () => {
  const geometry = [
    { lon: 13, lat: 52 },
    { lon: 13.001, lat: 52 },
  ];
  const roundabout = (tags: Record<string, string>) =>
    buildRoadGraph({
      elements: [
        {
          type: "way",
          id: 1,
          nodes: [1, 2],
          geometry,
          tags: { highway: "residential", junction: "roundabout", ...tags },
        },
      ],
    });
  assert.equal(roundabout({}).edges.length, 1);
  assert.equal(roundabout({ oneway: "no" }).edges.length, 2);
  assert.equal(roundabout({ oneway: "false" }).edges.length, 2);
  const reverse = roundabout({ "oneway:motorcar": "-1" });
  assert.equal(reverse.edges.length, 1);
  assert.equal(reverse.edges[0].from, "2");
  assert.equal(reverse.edges[0].to, "1");
});
