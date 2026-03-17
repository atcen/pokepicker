export interface OnboardingBatch {
  id: string;
  label: string;
  pokemonIds: number[];
  targetFeatures: string[];
}

export const ONBOARDING_BATCHES: OnboardingBatch[] = [
  // ─── Gen 1 ────────────────────────────────────────────────────────────────
  { id: 'starters_gen1',   label: 'Sortiere die Kanto-Starter',    pokemonIds: [1, 4, 7, 25],                         targetFeatures: ['types', 'generation'] },
  { id: 'legendary_gen1',  label: 'Sortiere die Kanto-Legendären',  pokemonIds: [144, 145, 146, 150, 151],         targetFeatures: ['legendary', 'mythical', 'types'] },
  // ─── Let's Go ─────────────────────────────────────────────────────────────
  { id: 'starters_letsgo',  label: "Sortiere die Let's Go-Starter",  pokemonIds: [25, 133],                         targetFeatures: ['types', 'generation'] },
  // ─── Gen 2 ────────────────────────────────────────────────────────────────
  { id: 'starters_gen2',   label: 'Sortiere die Johto-Starter',    pokemonIds: [152, 155, 158],                   targetFeatures: ['types', 'generation'] },
  { id: 'legendary_gen2',  label: 'Sortiere die Johto-Legendären',  pokemonIds: [243, 244, 245, 249, 250, 251],   targetFeatures: ['legendary', 'mythical', 'types'] },
  // ─── Gen 3 ────────────────────────────────────────────────────────────────
  { id: 'starters_gen3',   label: 'Sortiere die Hoenn-Starter',    pokemonIds: [252, 255, 258],                   targetFeatures: ['types', 'generation'] },
  { id: 'legendary_gen3',  label: 'Sortiere die Hoenn-Legendären',  pokemonIds: [380, 381, 382, 383, 384, 385],   targetFeatures: ['legendary', 'mythical', 'types'] },
  // ─── Gen 4 ────────────────────────────────────────────────────────────────
  { id: 'starters_gen4',   label: 'Sortiere die Sinnoh-Starter',   pokemonIds: [387, 390, 393],                   targetFeatures: ['types', 'generation'] },
  { id: 'legendary_gen4',  label: 'Sortiere die Sinnoh-Legendären', pokemonIds: [483, 484, 487, 491, 492, 493],   targetFeatures: ['legendary', 'mythical', 'types'] },
  // ─── Gen 5 ────────────────────────────────────────────────────────────────
  { id: 'starters_gen5',   label: 'Sortiere die Einall-Starter',   pokemonIds: [495, 498, 501],                   targetFeatures: ['types', 'generation'] },
  { id: 'legendary_gen5',  label: 'Sortiere die Einall-Legendären', pokemonIds: [638, 639, 640, 643, 644, 646],   targetFeatures: ['legendary', 'mythical', 'types'] },
  // ─── Gen 6 ────────────────────────────────────────────────────────────────
  { id: 'starters_gen6',   label: 'Sortiere die Kalos-Starter',    pokemonIds: [650, 653, 656],                   targetFeatures: ['types', 'generation'] },
  { id: 'legendary_gen6',  label: 'Sortiere die Kalos-Legendären',  pokemonIds: [716, 717, 718, 719, 720, 721],   targetFeatures: ['legendary', 'mythical', 'types'] },
  // ─── Gen 7 ────────────────────────────────────────────────────────────────
  { id: 'starters_gen7',   label: 'Sortiere die Alola-Starter',    pokemonIds: [722, 725, 728],                   targetFeatures: ['types', 'generation'] },
  { id: 'legendary_gen7',  label: 'Sortiere die Alola-Legendären',  pokemonIds: [785, 786, 787, 788, 791, 792],   targetFeatures: ['legendary', 'mythical', 'types'] },
  // ─── Gen 8 ────────────────────────────────────────────────────────────────
  { id: 'starters_gen8',   label: 'Sortiere die Galar-Starter',    pokemonIds: [810, 813, 816],                   targetFeatures: ['types', 'generation'] },
  { id: 'legendary_gen8',  label: 'Sortiere die Galar-Legendären',  pokemonIds: [888, 889, 890, 894, 895, 898],   targetFeatures: ['legendary', 'mythical', 'types'] },
  // ─── Gen 9 ────────────────────────────────────────────────────────────────
  { id: 'starters_gen9',   label: 'Sortiere die Paldea-Starter',   pokemonIds: [906, 909, 912],                   targetFeatures: ['types', 'generation'] },
  { id: 'legendary_gen9',  label: 'Sortiere die Paldea-Legendären', pokemonIds: [1001, 1002, 1003, 1004, 1005, 1006], targetFeatures: ['legendary', 'mythical', 'types'] },
];

export const ONBOARDING_COUNT = ONBOARDING_BATCHES.length;

// Kein mixed mode — alle Batches sind vollständig geskriptet
export const MIXED_MODE_START_INDEX = ONBOARDING_COUNT;
