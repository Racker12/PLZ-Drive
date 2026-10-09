/** MapLibre and GeoJSON use longitude first, then latitude. */
export type Coordinate = [number, number];

export type RoadNode = {
  id: string;
  coordinate: Coordinate;
};

/** A directed segment: the vehicle may drive only from `from` to `to`. */
export type RoadEdge = {
  id: string;
  from: string;
  to: string;
  coordinates: Coordinate[];
  name: string;
};

export type RoadGraph = {
  nodes: Record<string, RoadNode>;
  edges: RoadEdge[];
};

export type GameWorld = {
  postalCode: string;
  place: string;
  state: string;
  center: Coordinate;
  graph: RoadGraph;
  startNodeId: string;
  fallback: boolean;
  notice?: string;
};

export type GeocodedPlace = {
  postalCode: string;
  place: string;
  state: string;
  center: Coordinate;
};

/** Replace this adapter with a local PBF/PostGIS service without changing gameplay. */
export interface DataProvider {
  resolvePostalCode(postalCode: string): Promise<GeocodedPlace>;
  loadRoadGraph(center: Coordinate): Promise<RoadGraph>;
}
