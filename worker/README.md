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
