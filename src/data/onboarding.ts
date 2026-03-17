export interface OnboardingBatch {
  id: string;
  label: string;
  pokemonIds: number[];
  targetFeatures: string[];
}

// Reihenfolge ist wichtig — frühere Batches liefern die stärksten Signale.
// Ziel: maximale Feature-Coverage in minimalen Batches.
export const ONBOARDING_BATCHES: OnboardingBatch[] = [
  {
    id: 'kanto_starters',
    label: 'Sortiere die Kanto-Starter',
    pokemonIds: [1, 4, 7, 2, 5, 8],
    targetFeatures: ['types', 'evoStage', 'generation'],
  },
  {
    id: 'kanto_legendary',
    label: 'Sortiere die Kanto-Legendären',
    pokemonIds: [144, 145, 146, 150, 151, 243],
    targetFeatures: ['legendary', 'mythical', 'types'],
  },
  {
    id: 'pseudo_legendary',
    label: 'Sortiere diese Pseudo-Legendären',
    pokemonIds: [149, 248, 373, 376, 445, 635],
    targetFeatures: ['pseudoLegendary', 'dragon', 'generation'],
  },
  {
    id: 'single_stage',
    label: 'Sortiere diese Einzelpokémon',
    pokemonIds: [133, 132, 131, 143, 196, 197],
    targetFeatures: ['evoStage', 'bodyGroup', 'types'],
  },
  {
    id: 'bug_normal',
    label: 'Sortiere diese Pokémon',
    pokemonIds: [10, 13, 16, 19, 43, 161],
    targetFeatures: ['types'],
  },
  {
    id: 'johto_starters',
    label: 'Sortiere die Johto-Starter',
    pokemonIds: [152, 155, 158, 153, 156, 159],
    targetFeatures: ['generation', 'types', 'evoStage'],
  },
  // Batches 7 & 8 (Index 6 & 7): mixed mode — 4 scripted + 2 freie Items
  {
    id: 'popular_mixed',
    label: 'Sortiere diese bekannten Pokémon',
    pokemonIds: [25, 39, 94, 130],   // nur 4 — 2 Slots für freie Picks
    targetFeatures: ['bodyGroup', 'types', 'popularity'],
  },
  {
    id: 'hoenn_starters',
    label: 'Sortiere die Hoenn-Starter',
    pokemonIds: [252, 255, 258, 253], // nur 4 — 2 Slots für freie Picks
    targetFeatures: ['generation', 'types'],
  },
];

export const ONBOARDING_COUNT = ONBOARDING_BATCHES.length;

// Ab diesem Index beginnt der mixed mode (4 scripted + 2 frei)
export const MIXED_MODE_START_INDEX = 6;
