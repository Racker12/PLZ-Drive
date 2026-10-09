# PLZ Drive

Ein Browser-Spiel für kleine Entdeckungstouren durch echte deutsche Straßen: PLZ eingeben, einsteigen und mit WASD oder den Pfeiltasten fahren. Die **3D-Ansicht mit einer Kamera hinter dem Auto** wird direkt im Browser gerendert. **Next.js, React, TypeScript, Tailwind CSS, Three.js** sowie MapLibre als Ersatzansicht. Keine API-Schlüssel nötig.

## Lokal starten

Voraussetzung: **Node.js 22 oder neuer**, npm. In der Cloud wurde Node.js 24 verwendet.

```sh
npm ci
npm run dev
```

Bei `npm ci` wird über `postinstall` auch der zur installierten MapLibre-Version passende Karten-Worker lokal vorbereitet. Die generierte Datei `public/maplibre-worker.mjs` wird nicht eingecheckt; Vercel erzeugt sie bei der Installation ebenfalls.

Die App läuft auf Port 3000. Mit **„Berlin sofort testen“** startet die 3D-Fahrt direkt auf einem gespeicherten echten OSM-Straßennetz, ohne externe Datenabfragen. Alternativ gib eine deutsche fünfstellige PLZ ein, beispielsweise `10115`. Führende Nullen bleiben erhalten. Beim ersten Start lädt die App den Ort und das Straßennetz; öffentliche Dienste können dafür einige Sekunden brauchen. Im Fehlerfall kannst du erneut starten.

```sh
npm run build       # Produktionsbuild
npm run start       # Produktionsserver (Build vorher erforderlich)
npm run lint
npm run typecheck
npm test            # Geocoding, Graphaufbau und Fahrmechanik
npm run test:e2e    # Browser-Integration, siehe unten
npm run format:check
```

Für Browser-Tests einmal `npx playwright install chromium` ausführen. Falls `/usr/bin/chromium` vorhanden ist, verwendet die Konfiguration diesen Browser. Die E2E-Suite startet den Entwicklungsserver selbst oder verwendet einen bereits laufenden Server auf Port 3000. Sie verwendet ausdrücklich synthetische Testdaten und benötigt keine öffentlichen Kartendienste.

## Spielen

- **W / ↑**: Gas geben. Die Geschwindigkeit steigt weich bis auf 60 km/h.
- **S / ↓**: bremsen; weiter halten, um mit maximal 18 km/h rückwärts zu fahren. Rückwärtsfahrt ist nur auf einer vorhandenen erlaubten Gegenkante möglich, nicht entgegen einer Einbahnstraße.
- **A / ←** und **D / →**: links bzw. rechts abbiegen, relativ zum Fahrzeug. Halte die gewünschte Richtung bis zur nächsten Abzweigung. Für einen weiteren Abzweig die Taste kurz loslassen und erneut drücken. Kurven folgen automatisch den echten Straßenpunkten; das Auto fährt nicht frei über Flächen.
- Gas loslassen: das Auto rollt aus und wird allmählich langsamer.
- **C** oder Kamera-Button: zwischen Verfolgerkamera und Haubenkamera wechseln. Position und Blickrichtung der Kamera folgen gedämpft.
- **Leertaste / P** oder Pause-Button: pausieren und fortsetzen. Tab-Wechsel oder Fokusverlust pausiert automatisch und löst gehaltene Tasten.
- Die Bildschirmtasten funktionieren auch mit Maus/Touch; Gas und Lenken können gleichzeitig gehalten werden.
- „Neuen Startpunkt wählen“ setzt das Auto auf einen anderen befahrbaren Straßenknoten und die Fahrtstrecke zurück. „Andere PLZ“ führt zurück zum Startscreen.
- Sackgasse oder Netzrand: zurückfahren oder einen neuen Startpunkt wählen. Es wird nicht über Felder weitergefahren.

## 3D-Darstellung und Performance

`scene-world.ts` projiziert das Straßennetz in lokale Meterkoordinaten. Rückwärtskanten werden für die Darstellung zusammengefasst; Asphalt, Bürgersteige, Fahrbahnmarkierungen und Kreuzungsflächen entstehen als gemeinsame Buffer-Geometrien. Gebäude, Dächer, Fenster und Bäume werden per Instancing gezeichnet. Die Kamera folgt mit zeitabhängiger Dämpfung, damit das Verhalten nicht von der Bildrate abhängt. Auflösung, Schatten und Sichtweite sind begrenzt; Größenänderungen und das Freigeben von GPU-Ressourcen beim Verlassen der Ansicht werden behandelt.

**Die Straßen sind echte OSM-Geometrien. Gebäude, Bäume und Landschaft sind stilisierte, deterministisch erzeugte Kulisse.** Es werden weder reale Gebäudefassaden noch echte Geländehöhen abgebildet. Die Fahrphysik bleibt ein einfacher Straßen-Controller: Beschleunigung, Bremse, Rückwärtsfahrt und Auswahl an Abzweigungen, keine vollständige freie Fahrzeugsimulation.

Die 3D-Ansicht benötigt einen Browser mit aktiviertem WebGL. Wenn 3D nicht verfügbar ist, bleibt die vorhandene Karten-/SVG-Ersatzansicht spielbar. Die 3D-Szene lädt **keine externen Kartenkacheln oder Modelle**.

## Datenstrategie und MVP-Grenzen

1. `POST /api/start` validiert `{ "postalCode": "10115" }` serverseitig. Mit `preferSnapshot: true` wird ausschließlich für `10115` die ausdrücklich gekennzeichnete echte Berlin-Demo sofort geladen; andere PLZ mit dieser Option werden abgewiesen. Die Prüfung der fünf Ziffern ersetzt keine Existenzprüfung; der Geocoder muss einen passenden deutschen Ort liefern.
2. **Nominatim** sucht den Ort zur PLZ. Bei Fehlern oder fehlenden Ergebnissen wird **Photon** versucht. Auch der Ersatzdienst muss Deutschland und dieselbe PLZ zurückliefern; ein anderer Ort wird nicht stillschweigend verwendet.
3. **Overpass** lädt öffentlich zugängliche Autostraßen rund um den gefundenen Mittelpunkt (Abfrageradius etwa 1,4 km). Ein zweiter Overpass-Dienst dient als Ausweichquelle.
4. Der Graph verbindet aufeinanderfolgende **echte OSM-Knoten-IDs**. Geometrisch kreuzende Brücken werden dadurch nicht versehentlich verbunden. Einbahnstraßen und grundlegende `motorcar`/`motor_vehicle`/`vehicle`/`access`-Regeln werden berücksichtigt. Fußwege und Autobahnen sind ausgeschlossen.
5. Ein Startknoten wird zufällig unter den nahegelegenen Knoten mit befahrbaren Ausgängen ausgewählt. Die größte zusammenhängende Komponente vermeidet isolierte Straßen.
6. **Three.js** rendert die Straßen als 3D-Fahrgebiet mit Auto und Verfolgerkamera. Die Straßenpunkte der Fahrmechanik und der Darstellung stammen aus demselben Graphen. **MapLibre** / SVG bleiben als Ersatzansicht bei fehlendem WebGL erhalten.

Der Start liegt **nahe dem geocodierten PLZ-Mittelpunkt**. Exakte PLZ-Polygone werden im MVP nicht abgefragt; der Start oder eine Fahrt kann die PLZ-Grenze überschreiten. Die UI zeigt das **Startgebiet**, keine laufend neu berechnete PLZ. Über das geladene Straßennetz hinaus werden noch keine weiteren Straßen nachgeladen. Overpass liefert vollständige Wege, deren Geometrie auch über den Abfrageradius hinausreichen kann. Abbiegebeschränkungen aus OSM-Relationen, bedingte Zufahrtsregeln, Ampeln, Verkehr, Kollisionen und Fahrspuren sind nicht simuliert.

Die Daten werden für 30 Minuten pro Serverinstanz im Speicher zwischengespeichert; identische laufende Anfragen werden zusammengefasst. Es gibt höchstens vier parallele neue PLZ-Anfragen pro Instanz. Fallback-Daten werden fünf Minuten zwischengespeichert. Die bewusst gewählte Berlin-Demo fragt keine öffentlichen Dienste ab. Nominatim-Anfragen werden pro Instanz mit mindestens 1,1 Sekunden Abstand gestartet. Das ist ein Schutz für ein kleines MVP, **kein globaler Rate-Limiter** für ein skaliertes öffentliches Deployment.

Die Landingpage zeigt eine als illustrativ beschriftete 3D-Vorschau. Die Straßengeometrie der Spielansicht verwendet ausschließlich Daten aus dem Datenprovider. Bei einem Ausfall der öffentlichen Dienste gibt es ausschließlich für `10115` einen gespeicherten echten OSM-Ausschnitt aus Berlin (Datenstand 9. Oktober 2026, etwa 650 m um den PLZ-Mittelpunkt). Die UI kennzeichnet diesen Fallback. Andere PLZ werden niemals an einen anderen Ort umgeleitet. Herkunft, Lizenz und Abfrage des gespeicherten Ausschnitts stehen in `src/data/README.md`. Tests erzeugen ihre eigenen ausdrücklich synthetischen Testgraphen.

## Projektstruktur

```text
src/
  app/                  Next.js App Router, globales Design, POST /api/start
  components/           Landingpage, 3D-Szene, Spiel-HUD, Karten-/SVG-Ersatzansicht
  hooks/use-driving.ts  Keyboard/Touch, Pausen, Animation und Lebenszyklus
  lib/
    types.ts            Gemeinsames Modell und DataProvider-Schnittstelle
    geo.ts              Geografische Hilfsfunktionen und PLZ-Validierung
    graph.ts            OSM → gerichteter Straßengraph, Startauswahl
    vehicle.ts          Relative Steuerung, Beschleunigung, Bremse und Rückwärtsfahrt
    scene-world.ts      Metrische Straßen und stilisierte 3D-Kulisse
    driving.ts          Frühere Karten-Fahrmechanik, weiterhin unabhängig getestet
  services/
    osm-provider.ts     Öffentliche Geocoding-/Overpass-Adapter und Timeouts
    world.ts            Weltaufbau, Cache, Deduplizierung
    errors.ts           Verständliche API-Fehler
  data/                 Echter Berlin-Snapshot und OSM-Provenienz
 tests/                 Unit- und Browser-Tests
scripts/               Vorbereitung des lokalen MapLibre-Workers
```

## Deployment auf Vercel

1. Repository bei Vercel importieren, Framework **Next.js**, Root Directory dieses Repository.
2. Node.js **24.x** oder eine von Next.js unterstützte Version ab 22 wählen.
3. Build Command `npm run build`; Standardausgabeverzeichnis und Startkonfiguration verwenden. **Keine Secrets oder Umgebungsvariablen erforderlich.**
4. Die API verwendet die Node-Runtime und `maxDuration = 60`. Der gewählte Vercel-Tarif muss diese Laufzeit unterstützen. Öffentliche Anbieter können trotz Timeouts ausfallen; Fehlermeldung und erneuter Start sind Bestandteil des MVP.

Der Server benötigt HTTPS-Zugriff auf:

- `nominatim.openstreetmap.org`
- `photon.komoot.io`
- `overpass-api.de`
- `overpass.kumi.systems`

Die reguläre 3D-Ansicht benötigt im Browser keine externen Assets. Nur die Karten-Ersatzansicht benötigt HTTPS-Zugriff auf `basemaps.cartocdn.com` für Rasterkacheln. Attribution für **OpenStreetMap** und **CARTO** bleibt sichtbar. Keine Kacheln vorladen oder offline massenhaft herunterladen.

Vor einem breit beworbenen öffentlichen Betrieb: Anbieterbedingungen und Kapazitäten prüfen, insbesondere [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) und [CARTO Basemap Terms](https://carto.com/basemaps). Der öffentliche Nominatim-Dienst ist kapazitätsbeschränkt. Für mehr als ein kleines MVP einen eigenen oder geeigneten kommerziellen Geocoder, zentralen Cache und einen globalen Rate-Limiter verwenden. Den identifizierenden User-Agent in `osm-provider.ts` bei einem Fork aktualisieren.

In einer Cloud-Umgebung mit HTTPS-Proxy kann Node.js 24 mit `NODE_USE_ENV_PROXY=1 npm run dev` bzw. `NODE_USE_ENV_PROXY=1 npm run start` gestartet werden. Dieser Schalter aktiviert die vorhandene Proxy-Konfiguration; Zertifikatsprüfung bleibt aktiviert. Die erforderlichen Hosts müssen zusätzlich in der Netzwerkfreigabe stehen.

## Später eine lokale OSM-PBF integrieren

Die UI und die Fahrmechanik hängen nur vom Modell `GameWorld` / `RoadGraph` ab. Die Schnittstelle `DataProvider` hat zwei Methoden:

```ts
resolvePostalCode(postalCode: string): Promise<GeocodedPlace>
loadRoadGraph(center: Coordinate): Promise<RoadGraph>
```

Für eine lokale Datenquelle:

1. Einen Deutschland-Auszug, z. B. `germany-latest.osm.pbf` von Geofabrik, auf einem separaten Datenserver importieren. Eine große PBF gehört nicht in das Git-Repository oder in eine Vercel Function.
2. Mit `osmium` / `osm2pgsql` einen befahrbaren Graphen in PostGIS oder einen Routingdienst wie Valhalla/GraphHopper aufbauen. OSM-IDs, Wegegeometrien, Einbahn- und Zufahrtsregeln erhalten.
3. PLZ-Flächen/-Orte separat indexieren. Damit lässt sich später ein Start **innerhalb** des gewählten PLZ-Polygons garantieren.
4. Einen `LocalOsmProvider` implementieren, der diese Daten über eine interne HTTP-API abfragt und dasselbe Modell liefert. In `services/world.ts` den Provider austauschen; Karte, HUD und Fahrmechanik können bestehen bleiben.
5. Für größere Fahrten die API um Graph-Kacheln/Nachladen erweitern und die Fahrposition beim Zusammenführen stabil halten. Für die 3D-Szene echte Gebäude-Footprints und Geländehöhen ergänzen; für die Karten-Ersatzansicht gegebenenfalls einen Tile-Server verwenden.

Kartendaten: © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright), ODbL. Hintergrundkarte: © [CARTO](https://carto.com/attributions).
