import type { Rating } from '../types';
import type { CorrelationEntry } from '../backend/client';
import { CONFIG } from '../config';

/**
 * Apply item-based collaborative filtering boosts to unseen pokemon ratings.
 *
 * For each source pokemon that the user just ranked highly, we boost the mu
 * of correlated unseen pokemon proportional to the correlation strength.
 * Items already seen (comparisons > 0) are left untouched — empirical data wins.
 *
 * @param ratings       Current ratings map (mutated in-place copy returned)
 * @param topRankedIds  Pokemon ranked highly in the current sort (position 0..N/2)
 * @param correlations  Map of sourceId → correlation entries from backend
 * @returns             Updated ratings with boosts applied
 */
export function applyCorrelationBoosts(
  ratings: Record<number, Rating>,
  topRankedIds: number[],
  correlations: Map<number, CorrelationEntry[]>
): Record<number, Rating> {
  if (correlations.size === 0) return ratings;

  // Accumulate boost deltas separately to avoid double-counting within one batch
  const boostDelta: Record<number, number> = {};

  for (const sourceId of topRankedIds) {
    const entries = correlations.get(sourceId);
    if (!entries || entries.length === 0) continue;

    // Normalise shared_opponents to [0, 1] relative to the strongest correlation
    const maxShared = entries[0].shared_opponents;
    if (maxShared === 0) continue;

    for (const entry of entries) {
      const target = ratings[entry.pokemon_id];
      if (!target || target.comparisons > 0) continue; // skip seen items

      // Boost strength: up to CORRELATION_BOOST_MAX at full correlation,
      // scaled by relative strength and decayed by number of sources
      const relativeStrength = entry.shared_opponents / maxShared;
      const boost = CORRELATION_BOOST_MAX * relativeStrength / topRankedIds.length;

      boostDelta[entry.pokemon_id] = (boostDelta[entry.pokemon_id] ?? 0) + boost;
    }
  }

  if (Object.keys(boostDelta).length === 0) return ratings;

  const updated = { ...ratings };
  for (const [idStr, delta] of Object.entries(boostDelta)) {
    const id = parseInt(idStr, 10);
    const r = updated[id];
    if (!r) continue;
    // Cap at BASE_RATING + 2× initial sigma so boosts stay reasonable
    const cap = CONFIG.BASE_RATING + 2 * CONFIG.INITIAL_SIGMA;
    updated[id] = { ...r, mu: Math.min(r.mu + delta, cap) };
  }

  return updated;
}

/** Max mu boost per source pokemon for a fully correlated unseen item. */
const CORRELATION_BOOST_MAX = 30;
