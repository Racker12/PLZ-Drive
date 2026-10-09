# PLZ Drive

Ein Browser-Spiel für kleine Entdeckungstouren durch echte deutsche Straßen: PLZ eingeben, einsteigen und mit WASD oder den Pfeiltasten fahren. **Next.js, React, TypeScript, Tailwind CSS und MapLibre GL JS**. Keine API-Schlüssel nötig.

## Lokal starten

Voraussetzung: **Node.js 22 oder neuer**, npm. In der Cloud wurde Node.js 24 verwendet.

```sh
npm ci
npm run dev
```

Bei `npm ci` wird über `postinstall` auch der zur installierten MapLibre-Version passende Karten-Worker lokal vorbereitet. Die generierte Datei `public/maplibre-worker.mjs` wird nicht eingecheckt; Vercel erzeugt sie bei der Installation ebenfalls.

Die App läuft auf Port 3000. Gib eine deutsche fünfstellige PLZ ein, beispielsweise `10115`. Führende Nullen bleiben erhalten. Beim ersten Start lädt die App den Ort und das Straßennetz; öffentliche Dienste können dafür einige Sekunden brauchen. Im Fehlerfall kannst du erneut starten.

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

- **W / ↑**: Richtung Norden, **D / →**: Osten, **S / ↓**: Süden, **A / ←**: Westen. Die Karte bleibt nach Norden ausgerichtet.
- Taste halten, um mit 35 km/h zu fahren; loslassen, um anzuhalten. Die Bildschirmtasten funktionieren auch mit Maus oder Touch.
- Eine neue Richtung wird am nächsten Straßenknoten gewählt. Kurven folgen der echten Straßengeometrie. Es gibt keine freie Bewegung über Flächen.
- **Leertaste / P** oder Pause-Button: pausieren und fortsetzen. Tab-Wechsel oder Fokusverlust pausiert automatisch.
- Der Kompass-Button schaltet die automatische Zentrierung ein oder aus. Bei ausgeschalteter Zentrierung kannst du die Karte verschieben und zoomen.
- „Neuen Startpunkt wählen“ versetzt das Auto an einen anderen befahrbaren Knoten im geladenen Netz und setzt die Fahrtstrecke zurück. „Andere PLZ“ führt zurück zum Startscreen.
- Sackgasse oder Netzrand: eine andere Richtung oder einen neuen Startpunkt wählen. Auf Einbahnstraßen ist eine Rückfahrt nicht erlaubt.

## Datenstrategie und MVP-Grenzen

1. `POST /api/start` validiert `{ "postalCode": "10115" }` serverseitig. Die Prüfung der fünf Ziffern ersetzt keine Existenzprüfung; der Geocoder muss einen passenden deutschen Ort liefern.
2. **Nominatim** sucht den Ort zur PLZ. Bei Fehlern oder fehlenden Ergebnissen wird **Photon** versucht. Auch der Ersatzdienst muss Deutschland und dieselbe PLZ zurückliefern; ein anderer Ort wird nicht stillschweigend verwendet.
3. **Overpass** lädt öffentlich zugängliche Autostraßen rund um den gefundenen Mittelpunkt (Abfrageradius etwa 1,4 km). Ein zweiter Overpass-Dienst dient als Ausweichquelle.
4. Der Graph verbindet aufeinanderfolgende **echte OSM-Knoten-IDs**. Geometrisch kreuzende Brücken werden dadurch nicht versehentlich verbunden. Einbahnstraßen und grundlegende `motorcar`/`motor_vehicle`/`vehicle`/`access`-Regeln werden berücksichtigt. Fußwege und Autobahnen sind ausgeschlossen.
5. Ein Startknoten wird zufällig unter den nahegelegenen Knoten mit befahrbaren Ausgängen ausgewählt. Die größte zusammenhängende Komponente vermeidet isolierte Straßen.
6. **MapLibre** zeigt CARTO-Rasterkacheln und hebt die befahrbaren Straßen hervor. Wenn Kartenkacheln ausfallen, bleibt das geladene Straßennetz spielbar. Bei fehlendem WebGL gibt es eine vereinfachte SVG-Ansicht desselben echten Graphen.

Der Start liegt **nahe dem geocodierten PLZ-Mittelpunkt**. Exakte PLZ-Polygone werden im MVP nicht abgefragt; der Start oder eine Fahrt kann die PLZ-Grenze überschreiten. Die UI zeigt das **Startgebiet**, keine laufend neu berechnete PLZ. Über das geladene Straßennetz hinaus werden noch keine weiteren Straßen nachgeladen. Overpass liefert vollständige Wege, deren Geometrie auch über den Abfrageradius hinausreichen kann. Abbiegebeschränkungen aus OSM-Relationen, bedingte Zufahrtsregeln, Ampeln, Verkehr, Kollisionen und Fahrspuren sind nicht simuliert.

Die Daten werden für 30 Minuten pro Serverinstanz im Speicher zwischengespeichert; identische laufende Anfragen werden zusammengefasst. Es gibt höchstens vier parallele neue PLZ-Anfragen pro Instanz. Nominatim-Anfragen werden pro Instanz mit mindestens 1,1 Sekunden Abstand gestartet. Das ist ein Schutz für ein kleines MVP, **kein globaler Rate-Limiter** für ein skaliertes öffentliches Deployment.

Die Landingpage zeigt eine als illustrativ beschriftete Vorschau. Die Spielkarte verwendet ausschließlich Daten aus dem Datenprovider. Bei einem Ausfall der öffentlichen Dienste gibt es ausschließlich für `10115` einen gespeicherten echten OSM-Ausschnitt aus Berlin (Datenstand 9. Oktober 2026, etwa 650 m um den PLZ-Mittelpunkt). Die UI kennzeichnet diesen Fallback. Andere PLZ werden niemals an einen anderen Ort umgeleitet. Herkunft, Lizenz und Abfrage des gespeicherten Ausschnitts stehen in `src/data/README.md`. Tests erzeugen ihre eigenen ausdrücklich synthetischen Testgraphen.

## Projektstruktur

```text
src/
  app/                  Next.js App Router, globales Design, POST /api/start
  components/           Landingpage, Spiel-HUD, MapLibre und SVG-Ersatzansicht
  hooks/use-driving.ts  Keyboard/Touch, Pausen, Animation und Lebenszyklus
  lib/
    types.ts            Gemeinsames Modell und DataProvider-Schnittstelle
    geo.ts              Geografische Hilfsfunktionen und PLZ-Validierung
    graph.ts            OSM → gerichteter Straßengraph, Startauswahl
    driving.ts          Reine, unabhängig testbare Fahrmechanik
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

Der Browser benötigt HTTPS-Zugriff auf `basemaps.cartocdn.com` für die Rasterkacheln. Attribution für **OpenStreetMap** und **CARTO** bleibt sichtbar. Keine Kacheln vorladen oder offline massenhaft herunterladen.

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
5. Für größere Fahrten die API um Graph-Kacheln/Nachladen erweitern und die Fahrposition beim Zusammenführen stabil halten. Für die Hintergrundkarte einen geeigneten Tile-Server ergänzen.

Kartendaten: © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright), ODbL. Hintergrundkarte: © [CARTO](https://carto.com/attributions).
