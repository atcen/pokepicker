import type { ClusterCentroidRow, FeatureWeights } from '../types';

// ─── Canonical vector layout (must match server/picker-db.ts) ────────────────

const CANONICAL_TYPES = [
  'fire', 'water', 'grass', 'dragon', 'psychic', 'dark', 'ghost', 'electric',
  'ice', 'fighting', 'rock', 'ground', 'flying', 'poison', 'bug', 'normal',
  'steel', 'fairy',
] as const;

const CANONICAL_GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const CANONICAL_BODY_GROUPS = [
  'head', 'squiggle', 'fish', 'arms', 'blob', 'upright',
  'legs', 'quadruped', 'wings', 'tentacles', 'heads', 'serpentine',
] as const;

const CANONICAL_EVO_STAGES = [0, 1, 2] as const;

function weightsToVector(w: FeatureWeights): number[] {
  const vec: number[] = [];
  for (const t of CANONICAL_TYPES)       vec.push(w.types[t] ?? 0);
  for (const g of CANONICAL_GENS)        vec.push(w.generation[g] ?? 0);
  for (const b of CANONICAL_BODY_GROUPS) vec.push(w.bodyGroup[b] ?? 0);
  vec.push(w.legendary, w.mythical, w.pseudoLegendary);
  for (const s of CANONICAL_EVO_STAGES)  vec.push(w.evoStage[s] ?? 0);
  return vec;
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Cluster matching ────────────────────────────────────────────────────────

export interface ClusterMatch {
  clusterId: number;
  similarity: number;
  weights: FeatureWeights;
}

/**
 * Find the closest cluster centroid to the given weights.
 * Returns null if no clusters are available.
 */
export function matchCluster(
  weights: FeatureWeights,
  centroids: ClusterCentroidRow[]
): ClusterMatch | null {
  if (centroids.length === 0) return null;

  const userVec = weightsToVector(weights);
  let bestMatch: ClusterMatch | null = null;

  for (const c of centroids) {
    const centVec = weightsToVector(c.centroid);
    const sim = cosineSimilarity(userVec, centVec);
    if (!bestMatch || sim > bestMatch.similarity) {
      bestMatch = { clusterId: c.id, similarity: sim, weights: c.centroid };
    }
  }

  return bestMatch;
}

// ─── Weight blending ─────────────────────────────────────────────────────────

/**
 * Blend user weights with a cluster centroid.
 * At similarity=1 the centroid weights are returned unchanged.
 * At similarity=0 the user weights are returned unchanged.
 */
export function blendWithCluster(
  userWeights: FeatureWeights,
  clusterWeights: FeatureWeights,
  similarity: number
): FeatureWeights {
  const alpha = Math.max(0, Math.min(1, similarity)); // cluster influence

  function blendRecord<K extends string | number>(
    a: Record<K, number>,
    b: Record<K, number>
  ): Record<K, number> {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<K>;
    const result = {} as Record<K, number>;
    for (const k of keys) {
      result[k] = (1 - alpha) * (a[k] ?? 0) + alpha * (b[k] ?? 0);
    }
    return result;
  }

  return {
    types:           blendRecord(userWeights.types,      clusterWeights.types),
    generation:      blendRecord(userWeights.generation, clusterWeights.generation),
    bodyGroup:       blendRecord(userWeights.bodyGroup,  clusterWeights.bodyGroup),
    legendary:       (1 - alpha) * userWeights.legendary       + alpha * clusterWeights.legendary,
    mythical:        (1 - alpha) * userWeights.mythical        + alpha * clusterWeights.mythical,
    pseudoLegendary: (1 - alpha) * userWeights.pseudoLegendary + alpha * clusterWeights.pseudoLegendary,
    evoStage:        blendRecord(userWeights.evoStage,   clusterWeights.evoStage),
  };
}
