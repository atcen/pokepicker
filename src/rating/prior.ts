import type { PokemonFeatures, FeatureWeights } from '../types';
import { CONFIG } from '../config';

export const DEFAULT_WEIGHTS: FeatureWeights = {
  types: {
    dragon: 50,
    fire: 30,
    psychic: 20,
    dark: 20,
    ghost: 15,
    steel: 15,
    ice: 10,
    electric: 10,
    fighting: 5,
    rock: 0,
    ground: 0,
    flying: 0,
    water: 0,
    grass: 0,
    fairy: 5,
    poison: -10,
    normal: -20,
    bug: -30,
  },
  generation: { 1: 20, 2: 10, 3: 15, 4: 10, 5: 5, 6: 0, 7: 0, 8: -5, 9: -5 },
  bodyGroup: {
    serpentine: 30,
    quadruped: 20,
    upright: 10,
    wings: 10,
    arms: 5,
    legs: 5,
    fish: 0,
    tentacles: 0,
    heads: 0,
    head: -5,
    blob: -10,
    squiggle: -10,
  },
  legendary: 80,
  mythical: 60,
  pseudoLegendary: 70,
  evoStage: { 0: -10, 1: 0, 2: 20 },
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
