import type { PokemonFeatures, FeatureWeights } from '../types';
import { CONFIG } from '../config';

export const DEFAULT_WEIGHTS: FeatureWeights = {
  types: {
    dragon: 12,
    fire: 8,
    psychic: 5,
    dark: 5,
    ghost: 4,
    steel: 4,
    ice: 3,
    electric: 3,
    fighting: 1,
    rock: 0,
    ground: 0,
    flying: 0,
    water: 0,
    grass: 0,
    fairy: 1,
    poison: -3,
    normal: -5,
    bug: -8,
  },
  generation: { 1: 5, 2: 3, 3: 4, 4: 3, 5: 1, 6: 0, 7: 0, 8: -1, 9: -1 },
  bodyGroup: {
    serpentine: 8,
    quadruped: 5,
    upright: 3,
    wings: 3,
    arms: 1,
    legs: 1,
    fish: 0,
    tentacles: 0,
    heads: 0,
    head: -1,
    blob: -3,
    squiggle: -3,
  },
  legendary: 20,
  mythical: 15,
  pseudoLegendary: 17,
  evoStage: { 0: -3, 1: 0, 2: 5 },
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
