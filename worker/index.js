/* Kurvenkumpel API-Proxy (Cloudflare Worker) - Phase B des Kommerzialisierungs-Konzepts.
 *
 * Haelt die bezahlten API-Keys (Mapbox, Geoapify) serverseitig als Worker-Secrets statt sie offen
 * im Client-Code der App auszuliefern. Die App spricht weiterhin URLs an, die bewusst denselben
 * Pfad-/Parameter-Aufbau wie die bisherigen OSRM-/Nominatim-Endpunkte verwenden - dadurch bleiben
 * die Aenderungen in index.html auf einen Basis-URL-Tausch beschraenkt, die eigentliche
 * Provider-Uebersetzung passiert ausschliesslich hier.
 *
 * Routen:
 *   GET /route/v1/driving/{coords}?overview=full&geometries=geojson&steps=true&alternatives=true&bearings=...
 *     -> Mapbox Directions API (mapbox/driving-Profil)
 *   GET /geocode/search?q={text}&limit={n}&format=json
 *     -> Geoapify Forward-Geocoding
 *   GET /geocode/reverse?lat={lat}&lon={lon}&format=json
 *     -> Geoapify Reverse-Geocoding
 *   GET /pois/nearby?kind={coffee|fuel}&points={lat,lon;lat,lon;...}&radius_m={m}
 *     -> eigene D1-POI-Datenbank statt Live-Overpass (Kommerzialisierungs-Konzept Punkt 3)
 *   GET /roads/surface?points={lat,lon;lat,lon;...}
 *     -> eigene D1-Strassendaten statt Live-Overpass
 *
 * Secrets setzen (einmalig, siehe README.md):
 *   wrangler secret put MAPBOX_TOKEN
 *   wrangler secret put GEOAPIFY_KEY
 *
 * D1-Datenbank fuer /pois/nearby und /roads/surface (einmalig, siehe README.md):
 *   wrangler d1 create kurvenkumpel-pois
 *   -> ausgegebene database_id in wrangler.toml eintragen
 *   wrangler d1 execute kurvenkumpel-pois --remote --file=schema.sql
 *   -> danach periodisch extract_pois.sh laufen lassen, um die Tabellen zu befuellen/aktualisieren.
 *   Ohne eingetragene D1-Bindung antworten beide Routen mit HTTP 404 - index.html faellt dann
 *   automatisch auf die alte Live-Overpass-Abfrage zurueck (siehe dortige fetchViaOverpass()).
 */

// Nur die eigene GitHub-Pages-Origin (und lokale Testserver) duerfen den Proxy nutzen - verhindert,
// dass fremde Seiten das Kontingent/die Kosten des Betreibers ueber denselben Worker mitverbrauchen.
var ALLOWED_ORIGINS = [
  'https://wolfganglauer.github.io',
  'http://localhost:8743',
  'http://127.0.0.1:8743'
];

function corsHeaders(origin){
  var allowed = ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function jsonResponse(data, status, origin){
  var headers = corsHeaders(origin);
  headers['Content-Type'] = 'application/json; charset=utf-8';
  return new Response(JSON.stringify(data), { status: status || 200, headers: headers });
}

async function handleRoute(request, url, env, origin){
  // Pfad-Form: /route/v1/driving/{lon,lat;lon,lat;...}
  var parts = url.pathname.split('/').filter(Boolean); // ["route","v1","driving","<coords>"]
  var coords = parts[3];
  if (!coords) return jsonResponse({ code: 'InvalidInput', message: 'Keine Koordinaten angegeben' }, 400, origin);

  var mbUrl = new URL('https://api.mapbox.com/directions/v5/mapbox/driving/' + coords);
  // Alle vom Client mitgegebenen Parameter 1:1 durchreichen (overview, geometries, steps,
  // alternatives, bearings, ...) - Mapbox verwendet dieselben Parameternamen wie OSRM fuer all das.
  url.searchParams.forEach(function(value, key){ mbUrl.searchParams.set(key, value); });
  mbUrl.searchParams.set('access_token', env.MAPBOX_TOKEN);

  var upstream = await fetch(mbUrl.toString());
  var data = await upstream.json();
  return jsonResponse(data, upstream.status, origin);
}

async function handleGeocodeSearch(request, url, env, origin){
  var q = url.searchParams.get('q') || '';
  var limit = url.searchParams.get('limit') || '5';
  if (!q.trim()) return jsonResponse({ results: [] }, 200, origin);

  var gaUrl = new URL('https://api.geoapify.com/v1/geocode/search');
  gaUrl.searchParams.set('text', q);
  gaUrl.searchParams.set('limit', limit);
  gaUrl.searchParams.set('format', 'json');
  gaUrl.searchParams.set('apiKey', env.GEOAPIFY_KEY);

  var upstream = await fetch(gaUrl.toString());
  var data = await upstream.json();
  return jsonResponse(data, upstream.status, origin);
}

async function handleGeocodeReverse(request, url, env, origin){
  var lat = url.searchParams.get('lat');
  var lon = url.searchParams.get('lon');
  if (!lat || !lon) return jsonResponse({ results: [] }, 200, origin);

  var gaUrl = new URL('https://api.geoapify.com/v1/geocode/reverse');
  gaUrl.searchParams.set('lat', lat);
  gaUrl.searchParams.set('lon', lon);
  gaUrl.searchParams.set('format', 'json');
  gaUrl.searchParams.set('apiKey', env.GEOAPIFY_KEY);

  var upstream = await fetch(gaUrl.toString());
  var data = await upstream.json();
  return jsonResponse(data, upstream.status, origin);
}

// Grobe Bounding-Box statt Umkreisberechnung: schnell, ohne trigonometrische Funktionen, und fuer die
// hier verwendeten Radien (5 km Cafe/Tankstelle, 300 m Strassendaten) genau genug - der Umkreisfilter
// der App selbst (siehe loadPOIs()) arbeitet ohnehin schon mit grosszuegigen 5-km-Kreisen um
// Stuetzpunkte, eine Bounding-Box-Ungenauigkeit von ein paar hundert Metern an den Ecken faellt da
// nicht ins Gewicht. 1 Grad Breite ~ 111 km, Laengengrad hier bewusst nicht breitenabhaengig verkleinert
// (einfacher, liefert in Mitteleuropa eher zu viele als zu wenige Treffer - unkritisch).
function bboxFromRadius(lat, lon, radiusM){
  var deg = radiusM / 111000;
  return { minLat: lat - deg, maxLat: lat + deg, minLon: lon - deg, maxLon: lon + deg };
}

function parsePoints(pointsParam){
  return (pointsParam || '').split(';').filter(Boolean).map(function(p){
    var xy = p.split(',');
    return { lat: parseFloat(xy[0]), lon: parseFloat(xy[1]) };
  }).filter(function(p){ return isFinite(p.lat) && isFinite(p.lon); });
}

async function handlePoisNearby(request, url, env, origin){
  if (!env.POI_DB) return jsonResponse({ error: 'D1-Datenbank nicht konfiguriert (POI_DB-Binding fehlt in wrangler.toml)' }, 404, origin);
  var kind = url.searchParams.get('kind');
  var radiusM = parseFloat(url.searchParams.get('radius_m') || '5000');
  var points = parsePoints(url.searchParams.get('points'));
  if ((kind !== 'coffee' && kind !== 'fuel') || !points.length) return jsonResponse({ elements: [] }, 200, origin);

  var seen = {}, elements = [];
  for (var i = 0; i < points.length; i++){
    var bb = bboxFromRadius(points[i].lat, points[i].lon, radiusM);
    var rows = await env.POI_DB.prepare(
      'SELECT name, lat, lon FROM pois WHERE kind = ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?'
    ).bind(kind, bb.minLat, bb.maxLat, bb.minLon, bb.maxLon).all();
    (rows.results || []).forEach(function(r){
      var key = r.lat.toFixed(4) + ',' + r.lon.toFixed(4);
      if (seen[key]) return;
      seen[key] = true;
      // Antwortform bewusst wie Overpass ({elements:[{type:'node',lat,lon,tags:{name}}]}) - index.html
      // wertet beide Quellen mit demselben Code aus, siehe loadPOIs().
      elements.push({ type: 'node', lat: r.lat, lon: r.lon, tags: { name: r.name } });
    });
  }
  return jsonResponse({ elements: elements }, 200, origin);
}

async function handleRoadsSurface(request, url, env, origin){
  if (!env.POI_DB) return jsonResponse({ error: 'D1-Datenbank nicht konfiguriert (POI_DB-Binding fehlt in wrangler.toml)' }, 404, origin);
  var points = parsePoints(url.searchParams.get('points'));
  if (!points.length) return jsonResponse({ elements: [] }, 200, origin);

  // 300 m statt der 20 m, die Overpass bekommt - road_segments speichert nur einen Repraesentativpunkt
  // pro Way (siehe schema.sql), kein exaktes Geometrie-Matching, deshalb grosszuegigerer Radius noetig.
  var SEARCH_RADIUS_M = 300;
  var elements = [];
  for (var i = 0; i < points.length; i++){
    var bb = bboxFromRadius(points[i].lat, points[i].lon, SEARCH_RADIUS_M);
    var rows = await env.POI_DB.prepare(
      'SELECT surface, width FROM road_segments WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 5'
    ).bind(bb.minLat, bb.maxLat, bb.minLon, bb.maxLon).all();
    (rows.results || []).forEach(function(r){
      elements.push({ type: 'way', tags: { surface: r.surface || undefined, width: (r.width != null ? String(r.width) : undefined) } });
    });
  }
  return jsonResponse({ elements: elements }, 200, origin);
}

export default {
  async fetch(request, env){
    var url = new URL(request.url);
    var origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS'){
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'GET'){
      return jsonResponse({ error: 'Method not allowed' }, 405, origin);
    }

    try{
      if (url.pathname.indexOf('/route/v1/driving/') === 0) return await handleRoute(request, url, env, origin);
      if (url.pathname === '/geocode/search') return await handleGeocodeSearch(request, url, env, origin);
      if (url.pathname === '/geocode/reverse') return await handleGeocodeReverse(request, url, env, origin);
      if (url.pathname === '/pois/nearby') return await handlePoisNearby(request, url, env, origin);
      if (url.pathname === '/roads/surface') return await handleRoadsSurface(request, url, env, origin);
      return jsonResponse({ error: 'Not found' }, 404, origin);
    }catch(e){
      return jsonResponse({ error: 'Proxy-Fehler', message: String(e && e.message || e) }, 502, origin);
    }
  }
};
