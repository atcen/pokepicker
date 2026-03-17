import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'pokeapi-cache.db');
export const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS pokemon_features (
    id      INTEGER PRIMARY KEY,
    data    TEXT NOT NULL,
    cached_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pokemon_names (
    id   INTEGER NOT NULL,
    lang TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (id, lang)
  );

  CREATE TABLE IF NOT EXISTS type_names (
    type TEXT NOT NULL,
    lang TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (type, lang)
  );
`);

export const stmts = {
  upsertFeature: db.prepare(`
    INSERT OR REPLACE INTO pokemon_features (id, data, cached_at)
    VALUES (@id, @data, @cached_at)
  `),
  upsertName: db.prepare(`
    INSERT OR IGNORE INTO pokemon_names (id, lang, name) VALUES (@id, @lang, @name)
  `),
  upsertTypeName: db.prepare(`
    INSERT OR IGNORE INTO type_names (type, lang, name) VALUES (@type, @lang, @name)
  `),
  getFeature: db.prepare(`SELECT data FROM pokemon_features WHERE id = ?`),
  getAllFeatures: db.prepare(`SELECT data FROM pokemon_features ORDER BY id`),
  getCachedCount: db.prepare(`SELECT COUNT(*) as n FROM pokemon_features`),
  getAllNames: db.prepare(`SELECT id, lang, name FROM pokemon_names`),
  getAllTypeNames: db.prepare(`SELECT type, lang, name FROM type_names`),
  getTypeNameCount: db.prepare(`SELECT COUNT(*) as n FROM type_names`),
};
