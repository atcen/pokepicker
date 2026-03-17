import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'pokeapi-cache.db');
export const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS pokemon_features (
    id        INTEGER PRIMARY KEY,
    data      TEXT    NOT NULL,
    cached_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pokemon_names (
    id   INTEGER NOT NULL,
    lang TEXT    NOT NULL,
    name TEXT    NOT NULL,
    PRIMARY KEY (id, lang)
  );

  CREATE TABLE IF NOT EXISTS type_names (
    type TEXT NOT NULL,
    lang TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (type, lang)
  );

  -- Cross-user statistics
  CREATE TABLE IF NOT EXISTS sort_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT    NOT NULL,
    timestamp  INTEGER NOT NULL,
    ranked_ids TEXT    NOT NULL,   -- JSON array, index 0 = winner
    batch_size INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pairwise_wins (
    winner_id INTEGER NOT NULL,
    loser_id  INTEGER NOT NULL,
    count     INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (winner_id, loser_id)
  );
`);

export const stmts = {
  // PokeAPI cache
  upsertFeature:    db.prepare(`INSERT OR REPLACE INTO pokemon_features (id, data, cached_at) VALUES (@id, @data, @cached_at)`),
  upsertName:       db.prepare(`INSERT OR IGNORE INTO pokemon_names (id, lang, name) VALUES (@id, @lang, @name)`),
  upsertTypeName:   db.prepare(`INSERT OR IGNORE INTO type_names (type, lang, name) VALUES (@type, @lang, @name)`),
  getFeature:       db.prepare(`SELECT data FROM pokemon_features WHERE id = ?`),
  getAllFeatures:   db.prepare(`SELECT data FROM pokemon_features ORDER BY id`),
  getCachedCount:   db.prepare(`SELECT COUNT(*) as n FROM pokemon_features`),
  getAllNames:       db.prepare(`SELECT id, lang, name FROM pokemon_names`),
  getAllTypeNames:   db.prepare(`SELECT type, lang, name FROM type_names`),
  getTypeNameCount: db.prepare(`SELECT COUNT(*) as n FROM type_names`),

  // Stats
  insertSortEvent: db.prepare(`
    INSERT INTO sort_events (session_id, timestamp, ranked_ids, batch_size)
    VALUES (@session_id, @timestamp, @ranked_ids, @batch_size)
  `),
  upsertPairwiseWin: db.prepare(`
    INSERT INTO pairwise_wins (winner_id, loser_id, count) VALUES (@winner_id, @loser_id, 1)
    ON CONFLICT (winner_id, loser_id) DO UPDATE SET count = count + 1
  `),
  topWinners: db.prepare(`
    SELECT winner_id as id, SUM(count) as wins
    FROM pairwise_wins GROUP BY winner_id ORDER BY wins DESC LIMIT ?
  `),
  totalSortEvents: db.prepare(`SELECT COUNT(*) as n FROM sort_events`),
  totalUniqueSessions: db.prepare(`SELECT COUNT(DISTINCT session_id) as n FROM sort_events`),
  winRateForPokemon: db.prepare(`
    SELECT
      COALESCE(SUM(w.count), 0) as wins,
      COALESCE(SUM(l.count), 0) as losses
    FROM
      (SELECT count FROM pairwise_wins WHERE winner_id = ?) w,
      (SELECT count FROM pairwise_wins WHERE loser_id  = ?) l
  `),

  /** Pokemon that beat the same opponents as A — i.e. same tier, liked by similar users. */
  correlatedPokemon: db.prepare(`
    SELECT
      b.winner_id        AS pokemon_id,
      COUNT(*)           AS shared_opponents,
      SUM(a.count + b.count) AS combined_strength
    FROM pairwise_wins a
    JOIN pairwise_wins b ON a.loser_id = b.loser_id
    WHERE a.winner_id = ?
      AND b.winner_id != ?
    GROUP BY b.winner_id
    HAVING shared_opponents >= 2
    ORDER BY shared_opponents DESC, combined_strength DESC
    LIMIT 30
  `),
};
