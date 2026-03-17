import type { PokemonFeatures, Rating } from '../types';
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

  // Score each pokemon for how useful it would be in the next batch
  const scored = allIds
    .filter((id) => !recentSet.has(id))
    .map((id) => {
      const r = ratings[id];
      const isOutlier = outliers.includes(id);

      // Exploration score: high sigma = uncertain = need more data
      const explorationScore = r.sigma / CONFIG.INITIAL_SIGMA;

      // Exploitation score: high mu with low sigma = established favorite
      const exploitationScore = r.mu > CONFIG.BASE_RATING ? (1 - r.sigma / CONFIG.INITIAL_SIGMA) * 0.3 : 0;

      // Outlier bonus
      const outlierBonus = isOutlier ? 0.5 : 0;

      const total = explorationScore + exploitationScore + outlierBonus;

      return { id, score: total };
    });

  scored.sort((a, b) => b.score - a.score);

  const selected: number[] = [];

  // Always include at least 1 highly uncertain pokemon
  const highUncertain = scored.find((s) => {
    const r = ratings[s.id];
    return r.sigma > CONFIG.INITIAL_SIGMA * 0.7;
  });
  if (highUncertain) {
    selected.push(highUncertain.id);
  }

  // Always include at least 1 known favorite (low sigma, high mu)
  const knownFav = scored.find((s) => {
    const r = ratings[s.id];
    return r.sigma < CONFIG.INITIAL_SIGMA * 0.5 && r.mu > CONFIG.BASE_RATING + 100 && !selected.includes(s.id);
  });
  if (knownFav) {
    selected.push(knownFav.id);
  }

  // Add outliers
  for (const outlierId of outliers) {
    if (selected.length >= batchSize) break;
    if (!selected.includes(outlierId) && !recentSet.has(outlierId)) {
      selected.push(outlierId);
    }
  }

  // Fill with mixed ratings (nearby mu = informative comparison)
  const remaining = scored.filter((s) => !selected.includes(s.id));

  // Try to group by similar ratings for informative comparisons
  if (selected.length > 0) {
    const anchorMu = ratings[selected[0]].mu;
    remaining.sort((a, b) => {
      const distA = Math.abs(ratings[a.id].mu - anchorMu);
      const distB = Math.abs(ratings[b.id].mu - anchorMu);
      return distA - distB;
    });
  }

  for (const s of remaining) {
    if (selected.length >= batchSize) break;
    selected.push(s.id);
  }

  // If still not enough, pick from recent ids too
  if (selected.length < batchSize) {
    for (const id of allIds) {
      if (selected.length >= batchSize) break;
      if (!selected.includes(id)) selected.push(id);
    }
  }

  return selected.slice(0, batchSize);
}

export function isRankingSettled(
  ratings: Record<number, Rating>,
  topN: number
): { settled: boolean; confidence: number } {
  const sorted = Object.values(ratings)
    .sort((a, b) => b.mu - a.mu)
    .slice(0, topN);

  if (sorted.length < topN) {
    return { settled: false, confidence: 0 };
  }

  const settledCount = sorted.filter((r) => r.sigma <= CONFIG.SETTLED_SIGMA).length;
  const confidence = settledCount / topN;

  // Check if top-N are clearly separated (no sigma overlap between consecutive pairs)
  let overlaps = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const upper = sorted[i];
    const lower = sorted[i + 1];
    if (upper.mu - upper.sigma < lower.mu + lower.sigma) {
      overlaps++;
    }
  }

  const overlapRatio = overlaps / (sorted.length - 1);
  const settled = confidence >= 0.9 && overlapRatio < 0.1;

  return { settled, confidence };
}
