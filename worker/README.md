# Kurvenkumpel API-Proxy

Cloudflare Worker, der die bezahlten Mapbox-/Geoapify-Keys serverseitig haelt (Phase B des
Kommerzialisierungs-Konzepts). Ohne diesen Proxy wuerden die Keys offen im Client-Code der App
stehen und waeren fuer jeden Seitenbesucher auslesbar/missbrauchbar.

## Einmaliges Setup (musst du selbst tun - Konto-/Formularaktionen mache ich nicht eigenmaechtig)

1. **Cloudflare-Konto**: falls noch nicht vorhanden, kostenlos auf [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) anlegen.
2. **Mapbox-Token**: auf [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens) einen Token erstellen (Default Public Token reicht, "Directions API"-Scope ist standardmaessig enthalten).
3. **Geoapify-Key**: auf [myprojects.geoapify.com](https://myprojects.geoapify.com/) ein Projekt anlegen, den API-Key kopieren.
4. **Wrangler installieren** (Cloudflares CLI, braucht Node.js):
   ```bash
   npm install -g wrangler
   wrangler login
   ```
5. **Im `worker/`-Ordner deployen**:
   ```bash
   cd worker
   wrangler deploy
   wrangler secret put MAPBOX_TOKEN
   wrangler secret put GEOAPIFY_KEY
   ```
   `wrangler deploy` gibt am Ende die Worker-URL aus, z. B. `https://kurvenkumpel-proxy.<dein-name>.workers.dev`.
6. **Diese URL in `index.html` eintragen**: die Konstante `PROXY_BASE_URL` (Suche danach) auf die
   ausgegebene Worker-URL setzen. Gib mir die URL, dann trage ich sie ein.

## POI-Datenbank (Cafe/Tankstelle/Strassendaten) - optional, Punkt 3 des Konzepts

Ersetzt die Live-Overpass-Abfragen fuer Cafe/Tankstelle/Strassenoberflaechen durch eine eigene,
periodisch befuellte Datenbank. Overpass ist ein gemeinsam genutzter, oeffentlicher Dienst mit
Fair-Use-Policy - das passt nicht zu dauerhafter kommerzieller Nutzung. **Solange dieser Teil nicht
eingerichtet ist, funktioniert die App unveraendert weiter** (automatischer Rueckfall auf Overpass,
siehe `fetchViaOverpass()` in `index.html`) - dieser Schritt ist optional und kann jederzeit
nachgeholt werden.

1. **D1-Datenbank anlegen**:
   ```bash
   cd worker
   wrangler d1 create kurvenkumpel-pois
   ```
   Gibt eine `database_id` aus.
2. **In `wrangler.toml` eintragen**: den auskommentierten `[[d1_databases]]`-Block am Ende der Datei
   einkommentieren und die ausgegebene `database_id` einsetzen.
3. **Schema anlegen**:
   ```bash
   wrangler d1 execute kurvenkumpel-pois --remote --file=schema.sql
   ```
4. **Worker neu deployen** (jetzt mit D1-Bindung):
   ```bash
   wrangler deploy
   ```
5. **Datenbank befuellen** (braucht `osmium-tool` und `node`, siehe Kommentar in `extract_pois.sh`):
   ```bash
   ./extract_pois.sh
   ```
   Laedt per Default den Bayern-Auszug von Geofabrik (deckt u. a. die Fraenkische Schweiz ab) - fuer
   einen groesseren Einsatzraum eine andere [Geofabrik-URL](https://download.geofabrik.de) als
   Argument uebergeben. Sollte periodisch wiederholt werden (z. B. monatlich per Cron), damit neue/
   geschlossene Cafes und Tankstellen nachgezogen werden - ein erneuter Lauf ersetzt den kompletten
   Datenbestand (kein inkrementelles Update).

**Wichtig, bevor du Schritt 5 zum ersten Mal laeufst:** ohne befuellte Datenbank liefern die neuen
Endpunkte `0` Treffer (gueltige, aber leere Antwort) statt automatisch auf Overpass zurueckzufallen -
der Overpass-Rueckfall greift nur, wenn der Endpunkt selbst nicht erreichbar ist (vor Schritt 4), nicht
bei einer leeren, aber technisch gueltigen Antwort danach. Schritt 4 und 5 deshalb moeglichst kurz
hintereinander ausfuehren.

## Lokal testen (optional, vor dem Deploy)

```bash
cd worker
wrangler dev
```
Startet den Worker lokal (Standard: `http://localhost:8787`), inkl. Secrets aus `.dev.vars` (siehe
`wrangler dev --help` fuer Details) oder ueber `wrangler secret put --local`.

## Warum ein eigener Pfad-Aufbau wie bei OSRM/Nominatim?

Der Worker spiegelt bewusst die bisherigen URL-Pfade (`/route/v1/driving/...`, `/geocode/search`,
`/geocode/reverse`) statt Mapbox/Geoapify direkt 1:1 nachzubilden - dadurch bleibt die Aenderung in
`index.html` auf einen Basis-URL-Tausch beschraenkt, die komplette Provider-Uebersetzung (Parameter,
Antwortformat, Auth) passiert ausschliesslich in diesem Worker.
