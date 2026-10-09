import snapshot from "../data/berlin-10115.json";
import { selectStartNode } from "../lib/graph";
import type { Coordinate, GameWorld, RoadGraph } from "../lib/types";

// The bundled database contains original OSM IDs and coordinates in compact
// tuples. Reconstruct the same graph contract used by the live provider.
const nodes: RoadGraph["nodes"] = Object.fromEntries(
  snapshot.graph.nodes.map(([id, longitude, latitude]) => [
    String(id),
    { id: String(id), coordinate: [longitude, latitude] as Coordinate },
  ]),
);
const graph: RoadGraph = {
  nodes,
  edges: snapshot.graph.edges.map(([wayId, index, fromId, toId, nameIndex]) => {
    const from = String(fromId);
    const to = String(toId);
    return {
      id: `${wayId}:${index}:${from}>${to}`,
      from,
      to,
      coordinates: [nodes[from].coordinate, nodes[to].coordinate],
      name: snapshot.graph.names[nameIndex],
    };
  }),
};
const center = snapshot.metadata.center as Coordinate;

/** This is real, attributed OSM data for 10115; never use it for another PLZ. */
export function getSavedBerlinWorld(
  reason: "outage" | "demo" = "outage",
): GameWorld {
  const startNodeId = selectStartNode(graph, center);
  return {
    postalCode: snapshot.metadata.postalCode,
    place: snapshot.metadata.place,
    state: snapshot.metadata.state,
    center: graph.nodes[startNodeId].coordinate,
    graph,
    startNodeId,
    fallback: true,
    notice:
      "Gespeichertes OSM-Beispielnetz für 10115 Berlin (Stand 09.10.2026): " +
      (reason === "demo"
        ? "Du hast die Berlin-Demo gewählt. Sie startet sofort ohne Anfrage an öffentliche Kartendienste. "
        : "Der Kartendienst ist gerade nicht verfügbar. ") +
      "Fahrgebiet etwa 650 m um die PLZ-Mitte; PLZ-Grenzen werden nicht geprüft.",
  };
}
