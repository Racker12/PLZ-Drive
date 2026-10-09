import { isGermanPostalCode } from "../lib/geo";
import { selectStartNode } from "../lib/graph";
import type { DataProvider, GameWorld } from "../lib/types";
import { WorldError } from "./errors";
import { PublicOsmProvider } from "./osm-provider";
import { getSavedBerlinWorld } from "./saved-world";

const provider = new PublicOsmProvider();
const CACHE_TTL = 30 * 60 * 1_000;
const FALLBACK_CACHE_TTL = 5 * 60 * 1_000;
const MAX_CACHED_WORLDS = 60;
const worlds = new Map<string, { expiresAt: number; world: GameWorld }>();
const pending = new Map<string, Promise<GameWorld>>();

export async function createWorld(
  postalCode: string,
  dataProvider: DataProvider,
): Promise<GameWorld> {
  if (!isGermanPostalCode(postalCode)) {
    throw new WorldError(
      "Bitte gib eine deutsche PLZ mit genau fünf Ziffern ein.",
      400,
    );
  }
  const place = await dataProvider.resolvePostalCode(postalCode);
  const graph = await dataProvider.loadRoadGraph(place.center);
  if (!graph.edges.length)
    throw new WorldError("Es wurden keine befahrbaren Straßen gefunden.");
  const startNodeId = selectStartNode(graph, place.center);
  return {
    ...place,
    graph,
    startNodeId,
    center: graph.nodes[startNodeId].coordinate,
    fallback: false,
    notice:
      "Straßennetz im Umkreis von etwa 1,4 km geladen. Der Start liegt nahe der PLZ-Mitte; PLZ-Grenzen werden im MVP nicht geprüft.",
  };
}

export async function createWorldWithFallback(
  postalCode: string,
  dataProvider: DataProvider,
): Promise<GameWorld> {
  try {
    return await createWorld(postalCode, dataProvider);
  } catch (error) {
    // A validated real snapshot is available only for this one postcode.
    // Never silently move players requesting a different postcode to Berlin.
    if (
      postalCode === "10115" &&
      error instanceof WorldError &&
      (error.status === 503 || error.status === 404)
    ) {
      return getSavedBerlinWorld();
    }
    throw error;
  }
}

/** In-process TTL cache reduces load; a new start reuses the real road graph. */
export async function loadGameWorld(postalCode: string): Promise<GameWorld> {
  if (!isGermanPostalCode(postalCode)) {
    throw new WorldError(
      "Bitte gib eine deutsche PLZ mit genau fünf Ziffern ein.",
      400,
    );
  }
  const cached = worlds.get(postalCode);
  if (cached && cached.expiresAt > Date.now()) {
    const world = cached.world;
    const startNodeId = selectStartNode(world.graph, world.center);
    return {
      ...world,
      startNodeId,
      center: world.graph.nodes[startNodeId].coordinate,
    };
  }
  worlds.delete(postalCode);
  const existing = pending.get(postalCode);
  if (existing) return existing;
  if (pending.size >= 4) {
    throw new WorldError(
      "Die Kartendienste sind gerade ausgelastet. Bitte warte einen Moment.",
      429,
    );
  }
  const request = createWorldWithFallback(postalCode, provider)
    .then((world) => {
      if (worlds.size >= MAX_CACHED_WORLDS)
        worlds.delete(worlds.keys().next().value!);
      const ttl = world.fallback ? FALLBACK_CACHE_TTL : CACHE_TTL;
      worlds.set(postalCode, { world, expiresAt: Date.now() + ttl });
      return world;
    })
    .finally(() => {
      pending.delete(postalCode);
    });
  pending.set(postalCode, request);
  return request;
}
