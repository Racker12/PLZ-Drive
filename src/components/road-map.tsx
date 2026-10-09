"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { FeatureCollection, LineString } from "geojson";
import type { Coordinate, GameWorld } from "@/lib/types";

const carMarkup =
  '<svg viewBox="0 0 40 64" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="12" width="7" height="13" rx="2" fill="#121719"/><rect x="32" y="12" width="7" height="13" rx="2" fill="#121719"/><rect x="1" y="42" width="7" height="13" rx="2" fill="#121719"/><rect x="32" y="42" width="7" height="13" rx="2" fill="#121719"/><rect x="7" y="3" width="26" height="58" rx="9" fill="#d5f87b" stroke="#101a13" stroke-width="2"/><path d="m11 24 3-10h12l3 10Z" fill="#283f31"/><rect x="12" y="43" width="16" height="8" rx="2" fill="#283f31"/><path d="M11 8h5m8 0h5" stroke="#fcffe6" stroke-width="3"/><path d="M11 56h5m8 0h5" stroke="#ef816e" stroke-width="2"/></svg>';

export function RoadMap({
  world,
  coordinate,
  bearing,
  follow,
}: {
  world: GameWorld;
  coordinate: Coordinate;
  bearing: number;
  follow: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [tileError, setTileError] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [roadsVisible, setRoadsVisible] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map | undefined;
    let errorFrame = 0;
    try {
      // Next.js chunks do not preserve MapLibre's default relative worker URL.
      // postinstall serves the worker from the same pinned npm package locally.
      maplibregl.setWorkerUrl("/maplibre-worker.mjs");
      map = new maplibregl.Map({
        container: container.current,
        center: world.graph.nodes[world.startNodeId].coordinate,
        zoom: 16.4,
        minZoom: 12,
        maxZoom: 19,
        pitch: 0,
        keyboard: false,
        dragRotate: false,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            basemap: {
              type: "raster",
              tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
            },
          },
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#141e21" },
            },
            { id: "basemap", type: "raster", source: "basemap" },
          ],
        },
      });
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      const element = document.createElement("div");
      element.className = "player-car";
      element.innerHTML = carMarkup;
      element.setAttribute("aria-label", "Dein Auto");
      element.setAttribute("role", "img");
      markerRef.current = new maplibregl.Marker({
        element,
        rotationAlignment: "map",
      })
        .setLngLat(world.graph.nodes[world.startNodeId].coordinate)
        .addTo(map);
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-right",
      );
      // Raster failures must not remove the actual OSM graph or stop gameplay.
      map.on("error", (event) => {
        console.warn("Kartenanzeige:", event.error.message);
        setTileError(true);
      });
      map.on("webglcontextlost", () => setWebglError(true));
      map.on("webglcontextrestored", () => setWebglError(false));
      let confirmedRoads = false;
      map.on("render", () => {
        if (confirmedRoads || !map?.getLayer("drive-roads")) return;
        if (map.queryRenderedFeatures({ layers: ["drive-roads"] }).length) {
          confirmedRoads = true;
          setRoadsVisible(true);
        }
      });
      // Do not wait for raster tiles: the street network must render even when
      // a basemap provider is slow or unreachable.
      map.on("style.load", () => {
        if (!map) return;
        const seen = new Set<string>();
        const roads: FeatureCollection<LineString> = {
          type: "FeatureCollection",
          features: world.graph.edges
            .filter((edge) => {
              const key = [edge.from, edge.to].sort().join(":");
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .map((edge) => ({
              type: "Feature",
              properties: { name: edge.name },
              geometry: { type: "LineString", coordinates: edge.coordinates },
            })),
        };
        map.addSource("drive-roads", { type: "geojson", data: roads });
        map.addLayer({
          id: "drive-road-outline",
          type: "line",
          source: "drive-roads",
          paint: {
            "line-color": "#a5ba8f",
            "line-width": 6,
            "line-opacity": 0.12,
          },
        });
        map.addLayer({
          id: "drive-roads",
          type: "line",
          source: "drive-roads",
          paint: {
            "line-color": "#a5ba8f",
            "line-width": 2,
            "line-opacity": 0.45,
          },
        });
      });
    } catch {
      errorFrame = requestAnimationFrame(() => setWebglError(true));
    }
    return () => {
      cancelAnimationFrame(errorFrame);
      markerRef.current?.remove();
      markerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, [world]);

  useEffect(() => {
    markerRef.current?.setLngLat(coordinate).setRotation(bearing);
    if (follow) mapRef.current?.jumpTo({ center: coordinate });
  }, [coordinate, bearing, follow]);

  return (
    <>
      <div
        ref={container}
        className="road-map"
        data-roads-visible={roadsVisible}
        aria-label="Straßenkarte mit Spielerposition"
      />
      {webglError && (
        <SimpleRoadMap
          world={world}
          coordinate={coordinate}
          bearing={bearing}
        />
      )}
      {(tileError || webglError) && (
        <div className="map-warning" role="status">
          {webglError
            ? "WebGL nicht verfügbar. Vereinfachte Ansicht der echten Straßen."
            : "Kartenhintergrund nicht verfügbar. Auf den markierten Straßen kannst du weiterfahren."}
        </div>
      )}
      <div className="north-indicator" aria-hidden="true">
        <span>N</span>↑
      </div>
    </>
  );
}

function SimpleRoadMap({
  world,
  coordinate,
  bearing,
}: {
  world: GameWorld;
  coordinate: Coordinate;
  bearing: number;
}) {
  const nodes = Object.values(world.graph.nodes);
  const lngs = nodes.map((node) => node.coordinate[0]);
  const lats = nodes.map((node) => node.coordinate[1]);
  const minLng = Math.min(...lngs),
    maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats),
    maxLat = Math.max(...lats);
  const project = ([lng, lat]: Coordinate): [number, number] => [
    70 + ((lng - minLng) / Math.max(maxLng - minLng, 0.00001)) * 860,
    930 - ((lat - minLat) / Math.max(maxLat - minLat, 0.00001)) * 860,
  ];
  const [x, y] = project(coordinate);
  return (
    <div className="simple-road-map">
      <svg
        viewBox="0 0 1000 1000"
        aria-label="Vereinfachtes echtes Straßennetz"
      >
        {world.graph.edges.map((edge) => (
          <polyline
            key={edge.id}
            points={edge.coordinates
              .map((point) => project(point).join(","))
              .join(" ")}
            fill="none"
            stroke="#677663"
            strokeWidth="3"
          />
        ))}
        <g transform={`translate(${x} ${y}) rotate(${bearing})`}>
          <circle r="22" fill="#d5f87b" opacity=".13" />
          <path d="M0-13 8 10 0 6-8 10Z" fill="#d5f87b" />
        </g>
      </svg>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        © OpenStreetMap-Mitwirkende
      </a>
    </div>
  );
}
