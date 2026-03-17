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

export function updateWeights(
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
    const delta = rating.mu - prior; // positive: did better than expected

    // Update type weights
    for (const type of pkm.types) {
      newWeights.types[type] = (newWeights.types[type] ?? 0) + lr * delta / pkm.types.length;
    }

    // Update generation weight
    const gen = pkm.generation;
    newWeights.generation[gen] = (newWeights.generation[gen] ?? 0) + lr * delta;

    // Update body group weight
    newWeights.bodyGroup[pkm.bodyGroup] =
      (newWeights.bodyGroup[pkm.bodyGroup] ?? 0) + lr * delta;

    // Update special status weights
    if (pkm.isLegendary) {
      newWeights.legendary += lr * delta;
    }
    if (pkm.isMythical) {
      newWeights.mythical += lr * delta;
    }
    if (pkm.isPseudoLegendary) {
      newWeights.pseudoLegendary += lr * delta;
    }

    // Update evo stage weight
    const stage = pkm.evoStage;
    newWeights.evoStage[stage] = (newWeights.evoStage[stage] ?? 0) + lr * delta;
  }

  // Clamp weights to avoid runaway values
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

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
