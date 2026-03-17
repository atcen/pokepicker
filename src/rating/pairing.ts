import type { PokemonFeatures, Rating, FeatureWeights } from '../types';
import { computePrior } from './prior';
import { computeWeightDelta } from './weights';
import { CONFIG } from '../config';

export function selectNextBatch(
  ratings: Record<number, Rating>,
  _pokemon: Record<number, PokemonFeatures>,
  outliers: number[],
  batchSize: number,
  recentBatchIds: number[]
): number[] {
  const recentSet = new Set(recentBatchIds);
  const allIds = Object.keys(ratings).map(Number);

  if (allIds.length === 0) return [];

  const scored = allIds
    .filter((id) => !recentSet.has(id))
    .map((id) => {
      const r = ratings[id];
      const isOutlier = outliers.includes(id);

      const explorationScore = r.sigma / CONFIG.INITIAL_SIGMA;
      const exploitationScore =
        r.mu > CONFIG.BASE_RATING ? (1 - r.sigma / CONFIG.INITIAL_SIGMA) * 0.3 : 0;
      const outlierBonus = isOutlier ? 0.5 : 0;

      return { id, score: explorationScore + exploitationScore + outlierBonus };
    });

  scored.sort((a, b) => b.score - a.score);

  const selected: number[] = [];

  const highUncertain = scored.find((s) => ratings[s.id].sigma > CONFIG.INITIAL_SIGMA * 0.7);
  if (highUncertain) selected.push(highUncertain.id);

  const knownFav = scored.find(
    (s) =>
      ratings[s.id].sigma < CONFIG.INITIAL_SIGMA * 0.5 &&
      ratings[s.id].mu > CONFIG.BASE_RATING + 100 &&
      !selected.includes(s.id)
  );
  if (knownFav) selected.push(knownFav.id);

  for (const outlierId of outliers) {
    if (selected.length >= batchSize) break;
    if (!selected.includes(outlierId) && !recentSet.has(outlierId)) {
      selected.push(outlierId);
    }
  }

  const remaining = scored.filter((s) => !selected.includes(s.id));
  if (selected.length > 0) {
    const anchorMu = ratings[selected[0]].mu;
    remaining.sort(
      (a, b) => Math.abs(ratings[a.id].mu - anchorMu) - Math.abs(ratings[b.id].mu - anchorMu)
    );
  }

  for (const s of remaining) {
    if (selected.length >= batchSize) break;
    selected.push(s.id);
  }

  if (selected.length < batchSize) {
    for (const id of allIds) {
      if (selected.length >= batchSize) break;
      if (!selected.includes(id)) selected.push(id);
    }
  }

  return selected.slice(0, batchSize);
}

export interface ConfidenceInfo {
  confidence: number;
  weightStability: number;
  topNSettled: boolean;
  label: string;
}

// Maximum expected total weight delta across 5 batches in normal usage
const MAX_EXPECTED_DELTA = 300;

/**
 * Composite confidence metric with three components:
 *
 * 1. Weight stability (40%): how much have feature weights changed recently?
 * 2. Prior coverage (30%): does the prior correlate with empirical ratings?
 * 3. Top-N empirical stability (30%): how many top-N have low sigma?
 */
export function computeConfidence(
  ratings: Record<number, Rating>,
  allPokemon: Record<number, PokemonFeatures>,
  weights: FeatureWeights,
  weightHistory: FeatureWeights[],
  topN: number = CONFIG.SETTLED_TOP_N
): ConfidenceInfo {
  // --- Component 1: Weight stability ---
  const weightStability = computeWeightStability(weights, weightHistory);

  // --- Component 2: Prior coverage ---
  const priorCoverage = computePriorCoverage(ratings, allPokemon, weights);

  // --- Component 3: Top-N empirical stability ---
  const sorted = Object.values(ratings)
    .sort((a, b) => b.mu - a.mu)
    .slice(0, topN);

  const topNSettledFraction =
    sorted.length === 0
      ? 0
      : sorted.filter((r) => r.sigma <= CONFIG.SETTLED_SIGMA).length / Math.min(sorted.length, topN);

  const topNSettled = topNSettledFraction >= 0.9;

  // --- Composite ---
  const confidence =
    0.4 * weightStability + 0.3 * priorCoverage + 0.3 * topNSettledFraction;

  const confidencePct = Math.round(confidence * 100);
  const seenCount = Object.values(ratings).filter((r) => r.comparisons > 0).length;

  let label: string;
  if (confidence < 0.2) {
    label = `Rangliste aufbaut... ${seenCount} gesehen`;
  } else if (confidence < 0.5) {
    label = `Profil kalibriert sich (${confidencePct}%)`;
  } else if (confidence < 0.8) {
    label = `Rangliste zuverlässig (${confidencePct}%)`;
  } else {
    label = `Top ${topN} stabil (${confidencePct}%)`;
  }

  return { confidence, weightStability, topNSettled, label };
}

function computeWeightStability(
  current: FeatureWeights,
  history: FeatureWeights[]
): number {
  if (history.length === 0) return 0;

  // Average delta vs each historical snapshot (older = more weight to delta)
  let totalDelta = 0;
  for (const past of history) {
    totalDelta += computeWeightDelta(current, past);
  }
  const avgDelta = totalDelta / history.length;

  return Math.max(0, Math.min(1, 1 - avgDelta / MAX_EXPECTED_DELTA));
}

function computePriorCoverage(
  ratings: Record<number, Rating>,
  allPokemon: Record<number, PokemonFeatures>,
  weights: FeatureWeights
): number {
  const seen = Object.values(ratings).filter(
    (r) => r.comparisons >= 2 && allPokemon[r.pokemonId]
  );

  if (seen.length < 5) return 0;

  const priors = seen.map((r) => computePrior(allPokemon[r.pokemonId], weights));
  const empirical = seen.map((r) => r.mu);

  const corr = pearsonCorrelation(priors, empirical);
  // Correlation is [-1, 1]; map to [0, 1], treating negative as 0
  return Math.max(0, corr);
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}
