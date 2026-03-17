import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'path';
import type { FeatureWeights } from '../src/types';

// ─── Canonical vector layout ─────────────────────────────────────────────────
// 18 types + 9 gens + 12 body groups + 3 specials + 3 evo stages = 45 dims
export const CANONICAL_TYPES = [
  'fire', 'water', 'grass', 'dragon', 'psychic', 'dark', 'ghost', 'electric',
  'ice', 'fighting', 'rock', 'ground', 'flying', 'poison', 'bug', 'normal',
  'steel', 'fairy',
] as const;

export const CANONICAL_GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export const CANONICAL_BODY_GROUPS = [
  'head', 'squiggle', 'fish', 'arms', 'blob', 'upright',
  'legs', 'quadruped', 'wings', 'tentacles', 'heads', 'serpentine',
] as const;

export const CANONICAL_EVO_STAGES = [0, 1, 2] as const;

export const VECTOR_DIM =
  CANONICAL_TYPES.length +      // 18
  CANONICAL_GENS.length +       // 9
  CANONICAL_BODY_GROUPS.length + // 12
  3 +                            // legendary, mythical, pseudoLegendary
  CANONICAL_EVO_STAGES.length;  // 3  →  total: 45

/** Convert FeatureWeights to a fixed-length Float32Array. */
export function weightsToVector(w: FeatureWeights): Float32Array {
  const vec = new Float32Array(VECTOR_DIM);
  let i = 0;
  for (const t of CANONICAL_TYPES)       vec[i++] = w.types[t] ?? 0;
  for (const g of CANONICAL_GENS)        vec[i++] = w.generation[g] ?? 0;
  for (const b of CANONICAL_BODY_GROUPS) vec[i++] = w.bodyGroup[b] ?? 0;
  vec[i++] = w.legendary;
  vec[i++] = w.mythical;
  vec[i++] = w.pseudoLegendary;
  for (const s of CANONICAL_EVO_STAGES)  vec[i++] = w.evoStage[s] ?? 0;
  return vec;
}

/** Convert a Float32Array back to FeatureWeights (only canonical keys). */
export function vectorToWeights(vec: Float32Array): FeatureWeights {
  let i = 0;
  const types: Record<string, number> = {};
  for (const t of CANONICAL_TYPES) types[t] = vec[i++];

  const generation: Record<number, number> = {};
  for (const g of CANONICAL_GENS) generation[g] = vec[i++];

  const bodyGroup: Record<string, number> = {};
  for (const b of CANONICAL_BODY_GROUPS) bodyGroup[b] = vec[i++];

  const legendary   = vec[i++];
  const mythical    = vec[i++];
  const pseudoLegendary = vec[i++];

  const evoStage: Record<number, number> = {};
  for (const s of CANONICAL_EVO_STAGES) evoStage[s] = vec[i++];

  return { types, generation, bodyGroup, legendary, mythical, pseudoLegendary, evoStage };
}

// ─── Database ─────────────────────────────────────────────────────────────────

const DB_PATH = path.join(process.cwd(), 'picker.db');
const pickerDb = new Database(DB_PATH);
sqliteVec.load(pickerDb);

pickerDb.exec(`
  CREATE TABLE IF NOT EXISTS user_weights (
    id                TEXT    PRIMARY KEY,
    created_at        INTEGER DEFAULT (unixepoch()),
    completed_at      INTEGER,
    interaction_count INTEGER DEFAULT 0,
    weights           TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cluster_centroids (
    id           INTEGER PRIMARY KEY,
    updated_at   INTEGER DEFAULT (unixepoch()),
    centroid     TEXT    NOT NULL,
    member_count INTEGER,
    label        TEXT
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS weight_vectors
  USING vec0(
    session_id TEXT PRIMARY KEY,
    embedding  float[${VECTOR_DIM}]
  );
`);

export const pickerStmts = {
  upsertSession: pickerDb.prepare(`
    INSERT INTO user_weights (id, weights) VALUES (@id, @weights)
    ON CONFLICT(id) DO NOTHING
  `),

  updateWeights: pickerDb.prepare(`
    UPDATE user_weights
    SET weights = @weights,
        interaction_count = @interaction_count,
        completed_at = CASE WHEN @completed THEN unixepoch() ELSE completed_at END
    WHERE id = @id
  `),

  getCompletedCount: pickerDb.prepare(`
    SELECT COUNT(*) as n FROM user_weights
    WHERE completed_at IS NOT NULL
  `),

  getCompletedWeights: pickerDb.prepare(`
    SELECT id, weights FROM user_weights
    WHERE completed_at IS NOT NULL
  `),

  getAllCentroids: pickerDb.prepare(`
    SELECT id, updated_at, centroid, member_count, label FROM cluster_centroids
  `),

  deleteCentroids: pickerDb.prepare(`DELETE FROM cluster_centroids`),

  insertCentroid: pickerDb.prepare(`
    INSERT INTO cluster_centroids (centroid, member_count, label)
    VALUES (@centroid, @member_count, @label)
  `),
};

export default pickerDb;
