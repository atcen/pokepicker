export interface PokemonFeatures {
  id: number;
  name: string;
  sprite: string;
  types: string[];
  generation: number;
  evoLineId: number;
  evoStage: number;
  bodyGroup: string;
  isLegendary: boolean;
  isMythical: boolean;
  isPseudoLegendary: boolean;
  isStarter: boolean;
}

export interface Rating {
  pokemonId: number;
  mu: number;
  sigma: number;
  comparisons: number;
}

export interface FeatureWeights {
  types: Record<string, number>;
  generation: Record<number, number>;
  bodyGroup: Record<string, number>;
  legendary: number;
  mythical: number;
  pseudoLegendary: number;
  evoStage: Record<number, number>;
}

export interface SortResult {
  timestamp: number;
  rankedIds: number[];
}

export interface AppState {
  ratings: Record<number, Rating>;
  weights: FeatureWeights;
  history: SortResult[];
  totalInteractions: number;
  startedAt: number;
  onboardingComplete: boolean;
  onboardingIndex: number;
  weightHistory: FeatureWeights[];
}
