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

export type PairingMode =
  | 'exploration'  // Standard: maximaler Information Gain über alle Items
  | 'refinement'   // Nur Top-N gegeneinander, enge mu-Abstände
  | 'challenge'    // Aufsteiger mit hohem sigma gegen etablierte Top-Items
  | 'onboarding';  // Gescriptete Batches (Phase 1)

export interface ClusterCentroidRow {
  id: number;
  updated_at: number;
  centroid: FeatureWeights;
  member_count: number;
  label: string | null;
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
  pairingMode: PairingMode;
  modeAutoSwitch: boolean;
  clusterMatch?: {
    clusterId: number;
    similarity: number;
    weights: FeatureWeights;
  };
}
