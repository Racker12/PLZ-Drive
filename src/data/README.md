# Gespeichertes Straßennetz: Berlin 10115

`berlin-10115.json` enthält echte, abgeleitete OpenStreetMap-Daten und wird nur
für die PLZ **10115** verwendet, wenn der Live-Kartendienst ausfällt. Andere
Postleitzahlen werden niemals nach Berlin verlegt. Die App kennzeichnet dieses
gespeicherte Beispielnetz ausdrücklich.

- Quelle: `https://overpass-api.de/api/interpreter` (POST, URL-encoded `data`).
- OSM-Datenstand: **2026-10-09T12:59:50Z**, heruntergeladen am 09.10.2026.
- Ursprüngliche Abfrage: Umkreis 1.400 m um `[13.384, 52.532]`.
- Ausschnitt: Beide Endpunkte einer Kante müssen maximal 650 m vom durch
  Nominatim aufgelösten PLZ-Zentrum `[13.3845571, 52.5321914]` entfernt sein.
- Verarbeitung: `getLargestComponent(buildRoadGraph(response))`, Ausschnitt,
  anschließend erneut größte zusammenhängende Komponente. Es wurden keine
  Koordinaten, Straßenverläufe oder OSM-IDs erfunden.
- Ergebnis: 1.498 OSM-Knoten, 2.801 gerichtete Straßenkanten. Einbahnstraßen und
  Zugangsbeschränkungen werden vom gleichen Graph-Konverter wie live verarbeitet.

Die vollständige Abfrage und Provenienz stehen in `metadata` der JSON-Datei.
Kompakte Tupel vermeiden wiederholte Straßenamen und Koordinaten; die
Datei enthält weiterhin alle Knoten und Kanten des Ausschnitts. Die Bedeutung
der Tupel steht im Feld `graph.encoding`. `src/services/saved-world.ts`
rekonstruiert daraus den normalen `RoadGraph`.

**© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).**
Diese abgeleitete Datenbank steht unter der
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Die Datenlizenz gilt unabhängig von einer eventuell vorhandenen Lizenz des
Anwendungscodes. Ein exakter PLZ-Grenzabgleich ist nicht Bestandteil dieses MVPs.
