import { distanceMeters } from "./geo";
import type { Coordinate, RoadEdge, RoadGraph } from "./types";

export type OsmNode = { type: "node"; id: number; lon: number; lat: number };
export type OsmWay = {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
  geometry?: { lon: number; lat: number }[];
};
export type OverpassResponse = {
  elements: (OsmNode | OsmWay | { type: string })[];
  /** Overpass can return HTTP 200 and a timeout remark with incomplete data. */
  remark?: string;
};

const DRIVEABLE_HIGHWAYS = new Set([
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
  "living_street",
  "service",
]);
const FORBIDDEN_ACCESS = new Set(["no", "private", "agricultural", "forestry"]);

function permitsCars(tags: Record<string, string>): boolean {
  if (!DRIVEABLE_HIGHWAYS.has(tags.highway)) return false;
  if (tags.area === "yes") return false;
  // The most specific access tag overrides the general one in OSM.
  const access =
    tags.motorcar ?? tags.motor_vehicle ?? tags.vehicle ?? tags.access;
  return !access || !FORBIDDEN_ACCESS.has(access);
}

/** Shared OSM IDs connect junctions; geometry crossings do not connect bridges. */
export function buildRoadGraph(response: OverpassResponse): RoadGraph {
  const coordinates = new Map<number, Coordinate>();
  for (const element of response.elements) {
    if (element.type === "node" && "lon" in element && "lat" in element) {
      const node = element as OsmNode;
      coordinates.set(node.id, [node.lon, node.lat]);
    }
  }
  const graph: RoadGraph = { nodes: {}, edges: [] };
  const addEdge = (
    wayId: number,
    index: number,
    from: string,
    to: string,
    name: string,
  ) => {
    const edge: RoadEdge = {
      id: `${wayId}:${index}:${from}>${to}`,
      from,
      to,
      coordinates: [graph.nodes[from].coordinate, graph.nodes[to].coordinate],
      name,
    };
    graph.edges.push(edge);
  };

  for (const element of response.elements) {
    if (element.type !== "way" || !("nodes" in element)) continue;
    const way = element as OsmWay;
    const tags = way.tags ?? {};
    if (!permitsCars(tags)) continue;
    way.nodes.forEach((id, index) => {
      const point = way.geometry?.[index];
      if (point) coordinates.set(id, [point.lon, point.lat]);
    });
    const oneWay =
      tags["oneway:motorcar"] ?? tags["oneway:motor_vehicle"] ?? tags.oneway;
    const reverseOnly = oneWay === "-1";
    const forwardOnly =
      ["yes", "true", "1"].includes(oneWay) ||
      (tags.junction === "roundabout" &&
        !["no", "false", "0", "-1"].includes(oneWay));
    for (let index = 1; index < way.nodes.length; index += 1) {
      const fromId = way.nodes[index - 1];
      const toId = way.nodes[index];
      const fromCoordinate = coordinates.get(fromId);
      const toCoordinate = coordinates.get(toId);
      if (!fromCoordinate || !toCoordinate || fromId === toId) continue;
      if (distanceMeters(fromCoordinate, toCoordinate) < 0.1) continue;
      const from = String(fromId);
      const to = String(toId);
      graph.nodes[from] = { id: from, coordinate: fromCoordinate };
      graph.nodes[to] = { id: to, coordinate: toCoordinate };
      const name = tags.name ?? tags.ref ?? "Unbenannte Straße";
      if (!reverseOnly) addEdge(way.id, index, from, to, name);
      if (!forwardOnly) addEdge(way.id, index, to, from, name);
    }
  }
  return graph;
}

/** Keep a connected area so isolated service roads cannot become the start. */
export function getLargestComponent(graph: RoadGraph): RoadGraph {
  const neighbors = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!neighbors.has(edge.from)) neighbors.set(edge.from, new Set());
    if (!neighbors.has(edge.to)) neighbors.set(edge.to, new Set());
    neighbors.get(edge.from)!.add(edge.to);
    neighbors.get(edge.to)!.add(edge.from);
  }
  const visited = new Set<string>();
  let largest = new Set<string>();
  for (const nodeId of neighbors.keys()) {
    if (visited.has(nodeId)) continue;
    const component = new Set<string>();
    const pending = [nodeId];
    while (pending.length) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.add(current);
      for (const neighbor of neighbors.get(current) ?? []) {
        if (!visited.has(neighbor)) pending.push(neighbor);
      }
    }
    if (component.size > largest.size) largest = component;
  }
  return {
    nodes: Object.fromEntries([...largest].map((id) => [id, graph.nodes[id]])),
    edges: graph.edges.filter(
      (edge) => largest.has(edge.from) && largest.has(edge.to),
    ),
  };
}

export function selectStartNode(
  graph: RoadGraph,
  center: Coordinate,
  random: () => number = Math.random,
): string {
  const departures = new Map<string, number>();
  for (const edge of graph.edges)
    departures.set(edge.from, (departures.get(edge.from) ?? 0) + 1);
  const candidates = Object.values(graph.nodes)
    .filter((node) => (departures.get(node.id) ?? 0) >= 2)
    .sort(
      (a, b) =>
        distanceMeters(a.coordinate, center) -
        distanceMeters(b.coordinate, center),
    );
  const usable = candidates.length
    ? candidates
    : Object.values(graph.nodes)
        .filter((node) => departures.has(node.id))
        .sort(
          (a, b) =>
            distanceMeters(a.coordinate, center) -
            distanceMeters(b.coordinate, center),
        );
  if (!usable.length)
    throw new Error("Es wurden keine befahrbaren Straßen gefunden.");
  // Stay near the geocoded postal-area center, while allowing different starts.
  const nearestDistance = distanceMeters(usable[0].coordinate, center);
  const pool = usable
    .filter(
      (node) =>
        distanceMeters(node.coordinate, center) <= nearestDistance + 450,
    )
    .slice(0, 24);
  const index = Math.min(
    pool.length - 1,
    Math.max(0, Math.floor(random() * pool.length)),
  );
  return pool[index].id;
}
