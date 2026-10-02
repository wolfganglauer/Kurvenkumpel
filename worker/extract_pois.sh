#!/usr/bin/env bash
# Kurvenkumpel POI-Extraktion (Kommerzialisierungs-Konzept Punkt 3)
#
# Zieht Cafe-/Tankstellen-Punkte und Strassen mit surface/width-Tag aus einem OSM-Regionalauszug und
# spielt sie in die Cloudflare-D1-Datenbank ein (schema.sql). Gedacht zum manuellen oder per Cron
# periodischen (z.B. monatlichen) erneuten Ausfuehren - Cafe/Tankstelle aendern sich selten genug,
# dass das unkritisch ist.
#
# Voraussetzungen (einmalig installieren):
#   - osmium-tool  (z.B. "apt install osmium-tool" / "brew install osmium-tool")
#   - node         (fuer build_sql.js)
#   - wrangler     (bereits fuer den Worker-Deploy installiert)
#
# Aufruf: ./extract_pois.sh [geofabrik-pbf-url]
# Ohne Argument wird der Bayern-Auszug verwendet (deckt u.a. die Fraenkische Schweiz, Allgaeu ab) -
# fuer einen groesseren Einsatzraum (z.B. ganz Deutschland + Alpenbogen) die passende Geofabrik-URL
# (https://download.geofabrik.de) uebergeben - Achtung, die Datei ist dann deutlich groesser und der
# Download/Import entsprechend langsamer.

set -euo pipefail

REGION_URL="${1:-https://download.geofabrik.de/europe/germany/bayern-latest.osm.pbf}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "1/4: Lade Regionalauszug von $REGION_URL ..."
curl -L --fail -o "$WORKDIR/region.osm.pbf" "$REGION_URL"

echo "2/4: Filtere auf Cafe/Tankstelle/Strassen mit Oberflaechen-Tag ..."
osmium tags-filter "$WORKDIR/region.osm.pbf" \
  n/amenity=cafe,fuel \
  w/highway \
  -o "$WORKDIR/filtered.osm.pbf" --overwrite

echo "3/4: Exportiere nach GeoJSON ..."
osmium export "$WORKDIR/filtered.osm.pbf" -o "$WORKDIR/filtered.geojson" --overwrite

echo "4/4: Baue SQL-Insert-Batches und spiele sie in D1 ein ..."
node "$(dirname "$0")/build_sql.js" "$WORKDIR/filtered.geojson" > "$WORKDIR/import.sql"
wrangler d1 execute kurvenkumpel-pois --remote --file="$WORKDIR/import.sql"

echo "Fertig."
