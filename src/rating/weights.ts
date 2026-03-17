import type { PokemonFeatures, Rating, FeatureWeights, SortResult } from '../types';
import { computePrior } from './prior';
import { CONFIG } from '../config';

export function detectOutliers(
  ratings: Record<number, Rating>,
  pokemon: Record<number, PokemonFeatures>,
  weights: FeatureWeights
): number[] {
  const outliers: number[] = [];

  for (const [idStr, rating] of Object.entries(ratings)) {
    const id = parseInt(idStr, 10);
    const pkm = pokemon[id];
    if (!pkm || rating.comparisons < 2) continue;

    const prior = computePrior(pkm, weights);
    const delta = Math.abs(rating.mu - prior);

    if (delta > CONFIG.OUTLIER_THRESHOLD) {
      outliers.push(id);
    }
  }

  return outliers;
}

/**
 * Updates feature weights based on the sort result, then propagates the
 * new weights across all Pokémon ratings via blending.
 *
 * Returns both the updated weights and the propagated ratings.
 */
export function updateWeightsAndPropagate(
  sortResult: SortResult,
  allPokemon: Record<number, PokemonFeatures>,
  ratings: Record<number, Rating>,
  weights: FeatureWeights
): { weights: FeatureWeights; ratings: Record<number, Rating> } {
  const newWeights = _updateWeights(sortResult, allPokemon, ratings, weights);
  const newRatings = propagateWeights(allPokemon, ratings, newWeights);
  return { weights: newWeights, ratings: newRatings };
}

/**
 * Re-blend every Pokémon's rating toward the updated prior.
 * Items never directly seen (comparisons === 0) get the full new prior.
 * Items seen N times retain their empirical rating proportionally.
 */
export function propagateWeights(
  allPokemon: Record<number, PokemonFeatures>,
  ratings: Record<number, Rating>,
  weights: FeatureWeights
): Record<number, Rating> {
  const updated = { ...ratings };

  for (const pkm of Object.values(allPokemon)) {
    const rating = updated[pkm.id];
    if (!rating) continue;

    const newPrior = computePrior(pkm, weights);

    if (rating.comparisons === 0) {
      // Never seen: fully determined by prior
      updated[pkm.id] = { ...rating, mu: newPrior };
    } else {
      // Blend: high sigma → lean toward prior; low sigma → lean toward empirical
      const blendFactor = rating.sigma / CONFIG.INITIAL_SIGMA;
      const blendedMu = blendFactor * newPrior + (1 - blendFactor) * rating.mu;
      updated[pkm.id] = { ...rating, mu: blendedMu };
    }
  }

  return updated;
}

function _updateWeights(
  sortResult: SortResult,
  pokemon: Record<number, PokemonFeatures>,
  ratings: Record<number, Rating>,
  weights: FeatureWeights
): FeatureWeights {
  const newWeights: FeatureWeights = {
    types: { ...weights.types },
    generation: { ...weights.generation },
    bodyGroup: { ...weights.bodyGroup },
    legendary: weights.legendary,
    mythical: weights.mythical,
    pseudoLegendary: weights.pseudoLegendary,
    evoStage: { ...weights.evoStage },
  };

  const lr = CONFIG.LEARNING_RATE;

  for (const id of sortResult.rankedIds) {
    const pkm = pokemon[id];
    const rating = ratings[id];
    if (!pkm || !rating || rating.comparisons < 2) continue;

    const prior = computePrior(pkm, weights);
    const delta = rating.mu - prior;

    for (const type of pkm.types) {
      newWeights.types[type] = (newWeights.types[type] ?? 0) + (lr * delta) / pkm.types.length;
    }

    const gen = pkm.generation;
    newWeights.generation[gen] = (newWeights.generation[gen] ?? 0) + lr * delta;

    newWeights.bodyGroup[pkm.bodyGroup] =
      (newWeights.bodyGroup[pkm.bodyGroup] ?? 0) + lr * delta;

    if (pkm.isLegendary) newWeights.legendary += lr * delta;
    if (pkm.isMythical) newWeights.mythical += lr * delta;
    if (pkm.isPseudoLegendary) newWeights.pseudoLegendary += lr * delta;

    const stage = pkm.evoStage;
    newWeights.evoStage[stage] = (newWeights.evoStage[stage] ?? 0) + lr * delta;
  }

  // Clamp weights
  for (const key of Object.keys(newWeights.types)) {
    newWeights.types[key] = clamp(newWeights.types[key], -200, 200);
  }
  for (const key of Object.keys(newWeights.generation)) {
    const k = parseInt(key, 10);
    newWeights.generation[k] = clamp(newWeights.generation[k], -100, 100);
  }
  for (const key of Object.keys(newWeights.bodyGroup)) {
    newWeights.bodyGroup[key] = clamp(newWeights.bodyGroup[key], -150, 150);
  }
  newWeights.legendary = clamp(newWeights.legendary, 0, 300);
  newWeights.mythical = clamp(newWeights.mythical, 0, 300);
  newWeights.pseudoLegendary = clamp(newWeights.pseudoLegendary, 0, 300);
  for (const key of Object.keys(newWeights.evoStage)) {
    const k = parseInt(key, 10);
    newWeights.evoStage[k] = clamp(newWeights.evoStage[k], -100, 100);
  }

  return newWeights;
}

/**
 * Compute the total absolute delta between two weight snapshots.
 * Used for weight stability tracking.
 */
export function computeWeightDelta(a: FeatureWeights, b: FeatureWeights): number {
  let delta = 0;
  for (const key of Object.keys(a.types)) {
    delta += Math.abs((a.types[key] ?? 0) - (b.types[key] ?? 0));
  }
  for (const key of Object.keys(a.generation)) {
    const k = parseInt(key, 10);
    delta += Math.abs((a.generation[k] ?? 0) - (b.generation[k] ?? 0));
  }
  for (const key of Object.keys(a.bodyGroup)) {
    delta += Math.abs((a.bodyGroup[key] ?? 0) - (b.bodyGroup[key] ?? 0));
  }
  delta += Math.abs(a.legendary - b.legendary);
  delta += Math.abs(a.mythical - b.mythical);
  delta += Math.abs(a.pseudoLegendary - b.pseudoLegendary);
  for (const key of Object.keys(a.evoStage)) {
    const k = parseInt(key, 10);
    delta += Math.abs((a.evoStage[k] ?? 0) - (b.evoStage[k] ?? 0));
  }
  return delta;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
