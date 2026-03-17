import pickerDb, { pickerStmts, weightsToVector, vectorToWeights, VECTOR_DIM } from './picker-db';
import type { FeatureWeights } from '../src/types';

// ─── k-Means++ ────────────────────────────────────────────────────────────────

function euclidSq(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

function meanVector(vecs: Float32Array[]): Float32Array {
  const result = new Float32Array(VECTOR_DIM);
  for (const v of vecs) {
    for (let i = 0; i < VECTOR_DIM; i++) result[i] += v[i];
  }
  const n = vecs.length;
  for (let i = 0; i < VECTOR_DIM; i++) result[i] /= n;
  return result;
}

/** k-Means++ initialisation: picks k well-separated starting centroids. */
function kMeansPlusPlus(vectors: Float32Array[], k: number): Float32Array[] {
  if (vectors.length === 0) return [];
  const centroids: Float32Array[] = [];

  // Pick first centroid uniformly at random
  centroids.push(vectors[Math.floor(Math.random() * vectors.length)]);

  for (let c = 1; c < k; c++) {
    // Compute D² weights
    const weights: number[] = vectors.map((v) => {
      let minDist = Infinity;
      for (const cent of centroids) {
        const d = euclidSq(v, cent);
        if (d < minDist) minDist = d;
      }
      return minDist;
    });

    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    let chosen = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) { chosen = i; break; }
    }
    centroids.push(vectors[chosen]);
  }

  return centroids;
}

/** Run k-Means and return centroids + per-vector cluster assignments. */
export function kMeans(
  vectors: Float32Array[],
  k: number,
  maxIter: number
): { centroids: Float32Array[]; assignments: number[] } {
  if (vectors.length === 0) return { centroids: [], assignments: [] };
  const effectiveK = Math.min(k, vectors.length);

  let centroids = kMeansPlusPlus(vectors, effectiveK);
  let assignments = new Array<number>(vectors.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assignment step
    const newAssignments = vectors.map((v) => {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = euclidSq(v, centroids[c]);
        if (d < bestDist) { bestDist = d; best = c; }
      }
      return best;
    });

    // Check convergence
    let changed = false;
    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i] !== newAssignments[i]) { changed = true; break; }
    }
    assignments = newAssignments;
    if (!changed) break;

    // Update step
    const newCentroids: Float32Array[] = [];
    for (let c = 0; c < effectiveK; c++) {
      const members = vectors.filter((_, i) => assignments[i] === c);
      newCentroids.push(members.length > 0 ? meanVector(members) : centroids[c]);
    }
    centroids = newCentroids;
  }

  return { centroids, assignments };
}

// ─── Public API ───────────────────────────────────────────────────────────────

interface ClusteringResult {
  clusters: number;
  members: number;
}

/** Read completed sessions, run k-Means, write centroids to DB. */
export function runClustering(): ClusteringResult {
  type WeightRow = { id: string; weights: string };
  const rows = pickerStmts.getCompletedWeights.all() as WeightRow[];

  if (rows.length < 5) {
    // Not enough data — clear centroids and return
    pickerStmts.deleteCentroids.run();
    return { clusters: 0, members: rows.length };
  }

  const vectors = rows.map((r) => {
    const w: FeatureWeights = JSON.parse(r.weights);
    return weightsToVector(w);
  });

  const k = 5;
  const { centroids, assignments } = kMeans(vectors, k, 100);

  const memberCounts = new Array<number>(centroids.length).fill(0);
  for (const a of assignments) memberCounts[a]++;

  const writeCentroids = pickerDb.transaction(() => {
    pickerStmts.deleteCentroids.run();
    for (let c = 0; c < centroids.length; c++) {
      const centroidWeights = vectorToWeights(centroids[c]);
      pickerStmts.insertCentroid.run({
        centroid: JSON.stringify(centroidWeights),
        member_count: memberCounts[c],
        label: null,
      });
    }
  });
  writeCentroids();

  return { clusters: centroids.length, members: rows.length };
}

/** Returns true when we should auto-trigger clustering (every 10 completed sessions). */
export function shouldRunClustering(): boolean {
  const row = pickerStmts.getCompletedCount.get() as { n: number };
  return row.n > 0 && row.n % 10 === 0;
}
