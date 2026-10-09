import assert from "node:assert/strict";
import test from "node:test";
import { PublicOsmProvider } from "../src/services/osm-provider";
import { WorldError } from "../src/services/errors";

test("city-state geocoding resolves the actual Bundesland from Nominatim ISO state tags", async (context) => {
  context.mock.method(
    globalThis,
    "fetch",
    async (_input: string | URL | Request, init?: RequestInit) => {
      assert.match(
        String((init?.headers as Record<string, string>)["User-Agent"]),
        /github\.com\/Racker12\/PLZ-Drive/,
      );
      return Response.json([
        {
          lon: "13.3845571",
          lat: "52.5321914",
          address: {
            postcode: "10115",
            city: "Berlin",
            country_code: "de",
            "ISO3166-2-lvl4": "DE-BE",
          },
        },
      ]);
    },
  );
  const place = await new PublicOsmProvider().resolvePostalCode("10115");
  assert.equal(place.state, "Berlin");
});

test("HTTP 200 with an Overpass timeout remark is incomplete and triggers retry", async (context) => {
  const elements = [
    {
      type: "way",
      id: 1,
      nodes: [1, 2, 3, 4, 5],
      geometry: [0, 1, 2, 3, 4].map((index) => ({
        lon: 13 + index * 0.001,
        lat: 52,
      })),
      tags: { highway: "residential" },
    },
  ];
  const fetchMock = context.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request) => {
      return Response.json(
        String(input).includes("overpass-api.de")
          ? { elements, remark: "runtime error: Query timed out" }
          : { elements },
      );
    },
  );
  const graph = await new PublicOsmProvider().loadRoadGraph([13, 52]);
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.equal(graph.edges.length, 8);
});

test("geocoding filters German exact postcodes and preserves leading zeroes", async (context) => {
  const fetchMock = context.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("postalcode"), "01067");
      assert.equal(url.searchParams.get("countrycodes"), "de");
      return Response.json([
        {
          lon: "13.7",
          lat: "51.05",
          address: { postcode: "01069", country_code: "de" },
        },
        {
          lon: "13.73",
          lat: "51.05",
          address: {
            postcode: "01067",
            country_code: "de",
            city: "Dresden",
            state: "Sachsen",
          },
        },
      ]);
    },
  );
  const result = await new PublicOsmProvider().resolvePostalCode("01067");
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(result.postalCode, "01067");
  assert.equal(result.place, "Dresden");
  assert.deepEqual(result.center, [13.73, 51.05]);
});

test("unavailable primary geocoder falls back to an exact German Photon result", async (context) => {
  context.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request) => {
      if (String(input).includes("nominatim"))
        return new Response("Unavailable", { status: 503 });
      return Response.json({
        features: [
          {
            geometry: { coordinates: [13.38, 52.53] },
            properties: {
              countrycode: "DE",
              postcode: "10115",
              city: "Berlin",
              state: "Berlin",
            },
          },
        ],
      });
    },
  );
  const result = await new PublicOsmProvider().resolvePostalCode("10115");
  assert.equal(result.place, "Berlin");
  assert.equal(result.postalCode, "10115");
});

test("successful empty postcode search gives a useful 404, never an unrelated place", async (context) => {
  context.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request) => {
      if (String(input).includes("nominatim")) return Response.json([]);
      return Response.json({
        features: [
          {
            geometry: { coordinates: [13.38, 52.53] },
            properties: {
              countrycode: "DE",
              postcode: "10115",
              city: "Berlin",
            },
          },
        ],
      });
    },
  );
  await assert.rejects(
    new PublicOsmProvider().resolvePostalCode("99999"),
    (error) => error instanceof WorldError && error.status === 404,
  );
});

test("a failed Overpass instance is retried against the second provider", async (context) => {
  const fetchMock = context.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("overpass-api.de"))
        return new Response("Unavailable", { status: 503 });
      assert.equal(init?.method, "POST");
      assert.match(String(init?.body), /around%3A1400%2C52%2C13/);
      return Response.json({
        elements: [
          {
            type: "way",
            id: 1,
            nodes: [1, 2, 3, 4, 5],
            geometry: [0, 1, 2, 3, 4].map((index) => ({
              lon: 13 + index * 0.001,
              lat: 52,
            })),
            tags: { highway: "residential", name: "Teststraße" },
          },
        ],
      });
    },
  );
  const graph = await new PublicOsmProvider().loadRoadGraph([13, 52]);
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.equal(graph.edges.length, 8);
});
