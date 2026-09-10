CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  capture_token TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT);
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'nueva',
  price_eur INTEGER, fees_eur INTEGER, area_m2 INTEGER, rooms INTEGER, bathrooms INTEGER,
  floor TEXT, lift INTEGER, outdoor TEXT, parking INTEGER, condition TEXT, energy_rating TEXT,
  description TEXT, address_text TEXT, address_precision TEXT NOT NULL DEFAULT 'none',
  lat REAL, lng REAL, building_key TEXT, neighborhood TEXT, agency TEXT,
  created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  portal TEXT NOT NULL, portal_ref TEXT, url_normalized TEXT UNIQUE NOT NULL, url_original TEXT NOT NULL,
  via TEXT NOT NULL, facts_json TEXT NOT NULL, facts_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL, last_checked_at TEXT, last_ok_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0, availability TEXT NOT NULL DEFAULT 'active');
CREATE UNIQUE INDEX IF NOT EXISTS sources_ref ON sources(portal, portal_ref) WHERE portal_ref IS NOT NULL;
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, sha256 TEXT NOT NULL, width INTEGER, height INTEGER,
  UNIQUE (property_id, sha256));
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, payload_json TEXT, actor_id TEXT REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ratings (
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id), dimension TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5), updated_at TEXT NOT NULL,
  PRIMARY KEY (property_id, user_id, dimension));
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews (
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id), reviewed_at TEXT NOT NULL,
  PRIMARY KEY (property_id, user_id));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
