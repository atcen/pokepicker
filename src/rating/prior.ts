import type { PokemonFeatures, FeatureWeights } from '../types';
import { CONFIG } from '../config';

export const DEFAULT_WEIGHTS: FeatureWeights = {
  types: {
    fire: 0, water: 0, grass: 0, dragon: 0, psychic: 0,
    dark: 0, ghost: 0, electric: 0, ice: 0, fighting: 0,
    rock: 0, ground: 0, flying: 0, poison: 0, bug: 0,
    normal: 0, steel: 0, fairy: 0,
  },
  generation: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
  bodyGroup: {},
  legendary: 0,
  mythical: 0,
  pseudoLegendary: 0,
  evoStage: { 0: 0, 1: 0, 2: 0 },
};

export function computePrior(
  pokemon: PokemonFeatures,
  weights: FeatureWeights
): number {
  let score = CONFIG.BASE_RATING;

  // Type contributions (average if dual type)
  if (pokemon.types.length > 0) {
    const typeScore = pokemon.types.reduce((sum, t) => {
      return sum + (weights.types[t] ?? 0);
    }, 0);
    score += typeScore / pokemon.types.length;
  }

  // Generation
  const genWeight = weights.generation[pokemon.generation] ?? 0;
  score += genWeight;

  // Body group
  const bodyWeight = weights.bodyGroup[pokemon.bodyGroup] ?? 0;
  score += bodyWeight;

  // Special status
  if (pokemon.isLegendary) score += weights.legendary;
  if (pokemon.isMythical) score += weights.mythical;
  if (pokemon.isPseudoLegendary) score += weights.pseudoLegendary;

  // Evo stage
  const evoWeight = weights.evoStage[pokemon.evoStage] ?? 0;
  score += evoWeight;

  return Math.max(400, Math.min(1600, score));
}
