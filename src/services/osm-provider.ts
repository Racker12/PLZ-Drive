import {
  buildRoadGraph,
  getLargestComponent,
  type OverpassResponse,
} from "../lib/graph";
import type {
  Coordinate,
  DataProvider,
  GeocodedPlace,
  RoadGraph,
} from "../lib/types";
import { WorldError } from "./errors";

const USER_AGENT = "PLZDrive/0.1 (+https://github.com/Racker12/PLZ-Drive)";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const PHOTON_URL = "https://photon.komoot.io/api/";
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
let nextGeocodeAt = 0;

type NominatimResult = {
  lon: string;
  lat: string;
  address?: Record<string, string>;
  display_name?: string;
};
type PhotonFeature = {
  geometry?: { coordinates?: number[] };
  properties?: Record<string, string>;
};

async function fetchJson<T>(
  url: string,
  timeout: number,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Map provider returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function matchesPostalCode(
  value: string | undefined,
  postalCode: string,
): boolean {
  return Boolean(value?.split(/[;,\s]+/).includes(postalCode));
}

function validCoordinate(value: number[]): value is Coordinate {
  return (
    value.length === 2 &&
    value.every(Number.isFinite) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

const GERMAN_STATES: Record<string, string> = {
  "DE-BW": "Baden-Württemberg",
  "DE-BY": "Bayern",
  "DE-BE": "Berlin",
  "DE-BB": "Brandenburg",
  "DE-HB": "Bremen",
  "DE-HH": "Hamburg",
  "DE-HE": "Hessen",
  "DE-MV": "Mecklenburg-Vorpommern",
  "DE-NI": "Niedersachsen",
  "DE-NW": "Nordrhein-Westfalen",
  "DE-RP": "Rheinland-Pfalz",
  "DE-SL": "Saarland",
  "DE-SN": "Sachsen",
  "DE-ST": "Sachsen-Anhalt",
  "DE-SH": "Schleswig-Holstein",
  "DE-TH": "Thüringen",
};

function stateName(address: Record<string, string>): string {
  const isoState = GERMAN_STATES[address["ISO3166-2-lvl4"]];
  if (address.state || isoState) return address.state ?? isoState;
  // The city-states can appear as city instead of state in geocoding data.
  const city = address.city ?? address.town ?? address.name;
  return city && ["Berlin", "Hamburg", "Bremen", "Bremerhaven"].includes(city)
    ? city === "Bremerhaven"
      ? "Bremen"
      : city
    : "Deutschland";
}

async function nominatim(postalCode: string): Promise<GeocodedPlace | null> {
  // Nominatim permits at most one request/second. Cache and deduplication live
  // in world.ts; this gate also spaces different codes on the same instance.
  const currentTime = Date.now();
  const wait = Math.max(0, nextGeocodeAt - currentTime);
  nextGeocodeAt = currentTime + wait + 1_100;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  const params = new URLSearchParams({
    postalcode: postalCode,
    country: "Germany",
    countrycodes: "de",
    format: "jsonv2",
    addressdetails: "1",
    limit: "5",
    "accept-language": "de",
  });
  const results = await fetchJson<NominatimResult[]>(
    `${NOMINATIM_URL}?${params}`,
    8_000,
  );
  if (!Array.isArray(results)) throw new Error("Unexpected geocoding response");
  for (const result of results) {
    const address = result.address ?? {};
    const center = [Number(result.lon), Number(result.lat)];
    if (
      address.country_code?.toLowerCase() !== "de" ||
      !matchesPostalCode(address.postcode, postalCode) ||
      !validCoordinate(center)
    )
      continue;
    return {
      postalCode,
      place:
        address.city ??
        address.town ??
        address.village ??
        address.municipality ??
        address.suburb ??
        "Deutschland",
      state: stateName(address),
      center,
    };
  }
  return null;
}

async function photon(postalCode: string): Promise<GeocodedPlace | null> {
  const params = new URLSearchParams({
    q: `${postalCode} Deutschland`,
    limit: "5",
    lang: "de",
  });
  const response = await fetchJson<{ features?: PhotonFeature[] }>(
    `${PHOTON_URL}?${params}`,
    5_000,
  );
  if (!Array.isArray(response.features))
    throw new Error("Unexpected geocoding response");
  for (const feature of response.features) {
    const properties = feature.properties ?? {};
    const center = feature.geometry?.coordinates;
    if (
      properties.countrycode?.toLowerCase() !== "de" ||
      !matchesPostalCode(properties.postcode, postalCode) ||
      !center ||
      !validCoordinate(center)
    )
      continue;
    return {
      postalCode,
      place: properties.city ?? properties.name ?? "Deutschland",
      state: stateName(properties),
      center,
    };
  }
  return null;
}

export class PublicOsmProvider implements DataProvider {
  async resolvePostalCode(postalCode: string): Promise<GeocodedPlace> {
    let hadSuccessfulResponse = false;
    for (const geocoder of [nominatim, photon]) {
      try {
        const result = await geocoder(postalCode);
        hadSuccessfulResponse = true;
        if (result) return result;
      } catch {
        // A second OSM-backed geocoder may still be available.
      }
    }
    if (hadSuccessfulResponse) {
      throw new WorldError(
        "Zu dieser PLZ wurde kein deutscher Ort gefunden. Bitte prüfe die PLZ oder probiere eine benachbarte.",
        404,
      );
    }
    throw new WorldError(
      "Die Ortssuche ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.",
    );
  }

  async loadRoadGraph(center: Coordinate): Promise<RoadGraph> {
    // The response includes the original OSM node IDs, which are essential for
    // real junctions, one-way streets, and keeping bridges disconnected.
    const query = `[out:json][timeout:12];way(around:1400,${center[1]},${center[0]})["highway"~"^(primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service)$"]["area"!="yes"];out body geom;`;
    let successfulResponse = false;
    for (const url of OVERPASS_URLS) {
      try {
        const response = await fetchJson<OverpassResponse>(url, 15_000, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }).toString(),
        });
        if (!Array.isArray(response.elements))
          throw new Error("Unexpected roads response");
        if (response.remark) throw new Error("Incomplete Overpass response");
        successfulResponse = true;
        const graph = getLargestComponent(buildRoadGraph(response));
        if (graph.edges.length >= 8 && Object.keys(graph.nodes).length >= 5)
          return graph;
      } catch {
        // Public Overpass instances have independent capacity limits.
      }
    }
    throw new WorldError(
      successfulResponse
        ? "Hier wurden zu wenige öffentlich befahrbare Straßen gefunden. Bitte probiere eine benachbarte PLZ."
        : "Die Straßendaten sind gerade nicht erreichbar. Bitte versuche es gleich noch einmal.",
    );
  }
}
