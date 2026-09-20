/* Kurvenkumpel Service Worker - offline nutzbar ist ausschliesslich eine bereits geplante Route
   (App-Shell + explizit heruntergeladener Kachel-Korridor). Neue Routen/Orte/POIs suchen bleibt
   zwingend online, dafuer fasst dieser Worker OSRM/Overpass/Nominatim/Anthropic-Requests gar nicht
   erst an - die laufen unveraendert direkt durch.

   Zwei getrennte Cache-Versionen: SHELL_CACHE (App-Code) und TILE_CACHE (Kartenkacheln). Getrennt,
   damit ein kuenftiges App-Update (SHELL_CACHE-Version hoch) nicht versehentlich bereits
   heruntergeladene Offline-Kacheln mitloescht - die sind teuer neu zu laden, der App-Code nicht. */

var SHELL_CACHE = 'kurvenkumpel-shell-v1';
var TILE_CACHE = 'kurvenkumpel-tiles-v1';
var CURRENT_CACHES = [SHELL_CACHE, TILE_CACHE];

var SHELL_URLS = [
  './',
  './index.html',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

var TILE_HOSTS = ['tile.openstreetmap.org', 'server.arcgisonline.com'];

function isTileUrl(urlStr){
  try{
    var host = new URL(urlStr).hostname;
    return TILE_HOSTS.some(function(h){ return host === h || host.slice(-(h.length + 1)) === '.' + h; });
  }catch(e){ return false; }
}

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function(cache){
      return Promise.all(SHELL_URLS.map(function(url){
        return fetch(url, { mode: 'cors' }).then(function(res){
          if (res && (res.ok || res.type === 'opaque')) return cache.put(url, res);
        }).catch(function(){ /* einzelne Shell-Ressource beim Install nicht erreichbar - best effort, App bleibt online nutzbar */ });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(names.filter(function(n){
        return n.indexOf('kurvenkumpel-') === 0 && CURRENT_CACHES.indexOf(n) === -1;
      }).map(function(n){ return caches.delete(n); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var req = event.request;
  if (req.method !== 'GET') return; // Overpass-POST etc. unangetastet lassen, direkt durchs Netz

  var url = req.url;
  var sameOrigin = url.indexOf(self.location.origin) === 0;
  var isShellCdn = SHELL_URLS.indexOf(url) !== -1;
  var tile = isTileUrl(url);

  // OSRM/Overpass/Nominatim/Anthropic & alles sonstige Fremde: kein respondWith, laeuft normal ans Netz
  if (!sameOrigin && !isShellCdn && !tile) return;

  var cacheName = tile ? TILE_CACHE : SHELL_CACHE;

  event.respondWith(
    caches.open(cacheName).then(function(cache){
      return cache.match(req).then(function(cached){
        // Cache-First: liegt die Ressource vor, wird sie sofort bedient, nie erneut ubers Netz
        // angefragt - dadurch ist "wird bei Netzausfall die gecachte Kachel verwendet" deterministisch
        // pruefbar (siehe Testplan), nicht nur eine Hoffnung fuer den Ernstfall.
        if (cached) return cached;
        return fetch(req).then(function(res){
          // Kachel-Bilder werden von Leaflet per <img src> geladen -> no-cors -> opaque Response
          // (status immer 0/ok:false, Inhalt nicht auslesbar, aber trotzdem cachebar und spaeter
          // korrekt ausspielbar). Deshalb hier NICHT auf res.ok pruefen, sonst wuerde keine einzige
          // Kachel je gecacht.
          if (res) cache.put(req, res.clone());
          return res;
        });
      });
    }).catch(function(){
      return fetch(req); // Cache-Zugriff selbst fehlgeschlagen (sehr selten) - regulaerer Netzversuch
    })
  );
});
