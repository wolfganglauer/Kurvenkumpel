-- Kurvenkumpel POI-Datenbank (Cloudflare D1 / SQLite) - Kommerzialisierungs-Konzept Punkt 3.
-- Ersetzt Live-Overpass-Abfragen fuer Cafe/Tankstelle/Strassenoberflaechen durch einen periodisch aus
-- einem OSM-Auszug befuellten, selbst gehosteten Datensatz (siehe extract_pois.sh).
--
-- Bewusst einfache Bounding-Box-Suche (lat/lon BETWEEN) statt eines SQLite-RTree-Index: D1s
-- Unterstuetzung fuer die rtree-Erweiterung war zum Zeitpunkt der Erstellung nicht zuverlaessig
-- verifizierbar, eine Bounding-Box mit einem normalen Index auf (kind, lat, lon) reicht fuer das
-- erwartete Datenvolumen (Cafes/Tankstellen/Strassen-Segmente eines DACH+Alpen-Ausschnitts) aus.
--
-- Anlegen: wrangler d1 create kurvenkumpel-pois
-- Schema einspielen: wrangler d1 execute kurvenkumpel-pois --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS pois (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  osm_id INTEGER,
  kind TEXT NOT NULL,              -- 'coffee' oder 'fuel' (siehe index.html loadPOIs())
  name TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pois_kind_lat_lon ON pois (kind, lat, lon);

CREATE TABLE IF NOT EXISTS road_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  osm_id INTEGER,
  lat REAL NOT NULL,               -- Repraesentativpunkt des Way (Mittelpunkt), keine volle Geometrie
  lon REAL NOT NULL,
  surface TEXT,
  width REAL
);
CREATE INDEX IF NOT EXISTS idx_road_lat_lon ON road_segments (lat, lon);
