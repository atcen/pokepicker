import type { Rating } from '../types';
import { CONFIG } from '../config';

export function kFactor(comparisons: number): number {
  return Math.max(8, CONFIG.K_BASE / (1 + comparisons * 0.1));
}

export function updateSigma(_sigma: number, comparisons: number): number {
  return Math.max(CONFIG.MIN_SIGMA, CONFIG.INITIAL_SIGMA - comparisons * 15);
}

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function updateRatingsFromSort(
  rankedIds: number[],
  ratings: Record<number, Rating>
): Record<number, Rating> {
  const updated = { ...ratings };

  // Each position implies a win over all positions below it
  for (let i = 0; i < rankedIds.length; i++) {
    const winnerId = rankedIds[i];
    for (let j = i + 1; j < rankedIds.length; j++) {
      const loserId = rankedIds[j];

      const winner = updated[winnerId];
      const loser = updated[loserId];

      if (!winner || !loser) continue;

      const kW = kFactor(winner.comparisons);
      const kL = kFactor(loser.comparisons);

      const eW = expectedScore(winner.mu, loser.mu);
      const eL = expectedScore(loser.mu, winner.mu);

      updated[winnerId] = {
        ...winner,
        mu: winner.mu + kW * (1 - eW),
        comparisons: winner.comparisons + 1,
        sigma: updateSigma(winner.sigma, winner.comparisons + 1),
      };

      updated[loserId] = {
        ...loser,
        mu: loser.mu + kL * (0 - eL),
        comparisons: loser.comparisons + 1,
        sigma: updateSigma(loser.sigma, loser.comparisons + 1),
      };
    }
  }

  return updated;
}
