#!/usr/bin/env node
/* Wandelt die von "osmium export" erzeugte GeoJSON-Datei in SQL-INSERT-Batches fuer D1 um.
 * Cafes/Tankstellen (amenity=cafe|fuel, Punkte) -> Tabelle "pois".
 * Strassen mit surface- oder width-Tag (highway-Ways) -> Tabelle "road_segments", als ein
 * Repraesentativpunkt (geometrische Mitte der Liniengeometrie) statt der vollen Geometrie - siehe
 * schema.sql fuer die Begruendung (reicht fuer eine Umkreis-Naeherungssuche, keine exakte
 * Geometrie-Pruefung wie bei Overpass).
 *
 * Aufruf: node build_sql.js <geojson-datei>  >  import.sql
 */
var fs = require('fs');

var file = process.argv[2];
if (!file){ console.error('Usage: node build_sql.js <geojson-datei>'); process.exit(1); }

var data = JSON.parse(fs.readFileSync(file, 'utf8'));

function esc(s){ return (s === undefined || s === null) ? 'NULL' : ("'" + String(s).replace(/'/g, "''") + "'"); }
function num(n){ return (n === undefined || n === null || !isFinite(n)) ? 'NULL' : String(n); }

var poiRows = [], roadRows = [];

(data.features || []).forEach(function(f){
  var tags = f.properties || {};
  var geom = f.geometry;
  if (!geom) return;

  if ((tags.amenity === 'cafe' || tags.amenity === 'fuel') && geom.type === 'Point'){
    var kind = tags.amenity === 'cafe' ? 'coffee' : 'fuel';
    poiRows.push('(' + num(tags['@id']) + ',' + esc(kind) + ',' + esc(tags.name) + ',' + geom.coordinates[1] + ',' + geom.coordinates[0] + ')');
    return;
  }

  if (tags.highway && (tags.surface || tags.width)){
    var coords = geom.type === 'LineString' ? geom.coordinates
      : (geom.type === 'MultiLineString' ? geom.coordinates[0] : null);
    if (!coords || !coords.length) return;
    var mid = coords[Math.floor(coords.length / 2)];
    var width = tags.width ? parseFloat(String(tags.width).replace(',', '.')) : null;
    roadRows.push('(' + num(tags['@id']) + ',' + mid[1] + ',' + mid[0] + ',' + esc(tags.surface) + ',' + num(width) + ')');
  }
});

var BATCH = 500;
console.log('DELETE FROM pois;');
console.log('DELETE FROM road_segments;');
for (var i = 0; i < poiRows.length; i += BATCH){
  console.log('INSERT INTO pois (osm_id, kind, name, lat, lon) VALUES ' + poiRows.slice(i, i + BATCH).join(',') + ';');
}
for (var j = 0; j < roadRows.length; j += BATCH){
  console.log('INSERT INTO road_segments (osm_id, lat, lon, surface, width) VALUES ' + roadRows.slice(j, j + BATCH).join(',') + ';');
}
console.error('Fertig: ' + poiRows.length + ' POIs, ' + roadRows.length + ' Strassensegmente.');
