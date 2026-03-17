import type { PokemonFeatures } from '../types';
import {
  extractFeatures,
  extractEvoLineFromChain,
  type RawPokemonData,
  type RawSpeciesData,
  type RawEvoChain,
  type EvoLineInfo,
} from './features';
import { CONFIG } from '../config';

const CACHE_PREFIX = 'pkm_';
const EVO_CACHE_PREFIX = 'evo_';

function cacheKey(id: number): string {
  return `${CACHE_PREFIX}${id}`;
}

function evoCacheKey(chainId: number): string {
  return `${EVO_CACHE_PREFIX}${chainId}`;
}

function loadFromCache(id: number): PokemonFeatures | null {
  try {
    const raw = localStorage.getItem(cacheKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as PokemonFeatures;
  } catch {
    return null;
  }
}

function saveToCache(pokemon: PokemonFeatures): void {
  try {
    localStorage.setItem(cacheKey(pokemon.id), JSON.stringify(pokemon));
  } catch {
    // localStorage full – ignore
  }
}

async function apiFetch<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`PokeAPI error ${resp.status}: ${url}`);
  }
  return resp.json() as Promise<T>;
}

const evoChainCache = new Map<number, RawEvoChain>();

async function fetchEvoChain(chainUrl: string): Promise<RawEvoChain> {
  const parts = chainUrl.split('/').filter(Boolean);
  const chainId = parseInt(parts[parts.length - 1], 10);

  if (evoChainCache.has(chainId)) {
    return evoChainCache.get(chainId)!;
  }

  const stored = localStorage.getItem(evoCacheKey(chainId));
  if (stored) {
    const data = JSON.parse(stored) as RawEvoChain;
    evoChainCache.set(chainId, data);
    return data;
  }

  const data = await apiFetch<RawEvoChain>(chainUrl);
  evoChainCache.set(chainId, data);
  try {
    localStorage.setItem(evoCacheKey(chainId), JSON.stringify(data));
  } catch {
    // ignore
  }
  return data;
}

export async function fetchPokemon(id: number): Promise<PokemonFeatures> {
  const cached = loadFromCache(id);
  if (cached) return cached;

  const [pokemonData, speciesData] = await Promise.all([
    apiFetch<RawPokemonData>(`https://pokeapi.co/api/v2/pokemon/${id}`),
    apiFetch<RawSpeciesData>(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
  ]);

  let evoLineInfo: EvoLineInfo = { baseId: id, stage: 0 };

  if (speciesData.evolution_chain?.url) {
    try {
      const chain = await fetchEvoChain(speciesData.evolution_chain.url);
      evoLineInfo = extractEvoLineFromChain(chain, id);
    } catch {
      // fallback: treat as standalone
    }
  }

  const features = extractFeatures(pokemonData, speciesData, evoLineInfo);
  saveToCache(features);
  return features;
}

export async function fetchAllPokemon(
  onProgress: (loaded: number, total: number) => void
): Promise<PokemonFeatures[]> {
  const total = CONFIG.POKEMON_COUNT;
  const results: PokemonFeatures[] = new Array(total);
  let loaded = 0;

  // Check which are already cached
  const toFetch: number[] = [];
  for (let i = 1; i <= total; i++) {
    const cached = loadFromCache(i);
    if (cached) {
      results[i - 1] = cached;
      loaded++;
    } else {
      toFetch.push(i);
    }
  }

  onProgress(loaded, total);

  // Fetch remaining in batches
  const batchSize = CONFIG.API_BATCH_SIZE;
  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((id) => fetchPokemon(id))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const id = batch[j];
      if (result.status === 'fulfilled') {
        results[id - 1] = result.value;
      } else {
        // Minimal fallback entry
        results[id - 1] = {
          id,
          name: `pokemon-${id}`,
          sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
          types: ['normal'],
          generation: 1,
          evoLineId: id,
          evoStage: 0,
          bodyGroup: 'blob',
          isLegendary: false,
          isMythical: false,
          isPseudoLegendary: false,
        };
      }
      loaded++;
    }

    onProgress(loaded, total);
  }

  return results.filter(Boolean);
}
