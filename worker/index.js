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
 *
 * Secrets setzen (einmalig, siehe README.md):
 *   wrangler secret put MAPBOX_TOKEN
 *   wrangler secret put GEOAPIFY_KEY
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
      return jsonResponse({ error: 'Not found' }, 404, origin);
    }catch(e){
      return jsonResponse({ error: 'Proxy-Fehler', message: String(e && e.message || e) }, 502, origin);
    }
  }
};
