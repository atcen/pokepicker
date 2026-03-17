import type { PokemonFeatures } from '../types';
import {
  extractFeatures,
  extractEvoLineFromChain,
  type RawPokemonData,
  type RawSpeciesData,
  type RawEvoChain,
  type EvoLineInfo,
} from './features';
import { loadNames, loadTypeNames } from './i18n';
import { CONFIG } from '../config';

const CACHE_PREFIX = 'pkm_';
const EVO_CACHE_PREFIX = 'evo_';

function loadFromCache(id: number): PokemonFeatures | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${id}`);
    if (!raw) return null;
    const pkm = JSON.parse(raw) as PokemonFeatures;
    // Migrate old cache entries missing isStarter
    if (pkm.isStarter === undefined) return null;
    return pkm;
  } catch { return null; }
}

function saveToCache(pokemon: PokemonFeatures): void {
  try { localStorage.setItem(`${CACHE_PREFIX}${pokemon.id}`, JSON.stringify(pokemon)); }
  catch { /* full */ }
}

async function apiFetch<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`PokeAPI ${r.status}: ${url}`);
  return r.json() as Promise<T>;
}

const evoChainMem = new Map<number, RawEvoChain>();

async function fetchEvoChain(chainUrl: string): Promise<RawEvoChain> {
  const id = parseInt(chainUrl.split('/').filter(Boolean).at(-1) ?? '0', 10);
  if (evoChainMem.has(id)) return evoChainMem.get(id)!;
  const stored = localStorage.getItem(`${EVO_CACHE_PREFIX}${id}`);
  if (stored) { const d = JSON.parse(stored) as RawEvoChain; evoChainMem.set(id, d); return d; }
  const data = await apiFetch<RawEvoChain>(chainUrl);
  evoChainMem.set(id, data);
  try { localStorage.setItem(`${EVO_CACHE_PREFIX}${id}`, JSON.stringify(data)); } catch { /* full */ }
  return data;
}

async function fetchPokemonDirect(id: number): Promise<PokemonFeatures> {
  const cached = loadFromCache(id);
  if (cached) return cached;

  const [raw, species] = await Promise.all([
    apiFetch<RawPokemonData>(`https://pokeapi.co/api/v2/pokemon/${id}`),
    apiFetch<RawSpeciesData>(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
  ]);

  let evoInfo: EvoLineInfo = { baseId: id, stage: 0 };
  if (species.evolution_chain?.url) {
    try { evoInfo = extractEvoLineFromChain(await fetchEvoChain(species.evolution_chain.url), id); }
    catch { /* standalone */ }
  }

  const features = extractFeatures(raw, species, evoInfo);
  saveToCache(features);
  return features;
}

// ─── Server-first strategy ────────────────────────────────────────────────

interface ServerResponse {
  pokemon: PokemonFeatures[];
  names: Record<number, Record<string, string>>;
  typeNames: Record<string, Record<string, string>>;
  complete: boolean;
  cached: number;
  total: number;
}

export async function fetchAllPokemon(
  onProgress: (loaded: number, total: number) => void
): Promise<PokemonFeatures[]> {
  const total = CONFIG.POKEMON_COUNT;

  // Try server cache first
  try {
    const resp = await fetch('/api/pokemon');
    if (resp.ok) {
      const data = await resp.json() as ServerResponse;

      // Load i18n data
      loadNames(data.names);
      loadTypeNames(data.typeNames);

      // Cache server results locally
      for (const pkm of data.pokemon) saveToCache(pkm);

      onProgress(data.cached, total);

      if (data.complete) {
        onProgress(total, total);
        return data.pokemon;
      }

      // Server still warming up — fill gaps from direct PokeAPI
      const servedIds = new Set(data.pokemon.map(p => p.id));
      const results: PokemonFeatures[] = [...data.pokemon];
      let loaded = data.cached;

      const missing: number[] = [];
      for (let i = 1; i <= total; i++) {
        if (!servedIds.has(i)) missing.push(i);
      }

      for (let i = 0; i < missing.length; i += CONFIG.API_BATCH_SIZE) {
        const batch = missing.slice(i, i + CONFIG.API_BATCH_SIZE);
        const settled = await Promise.allSettled(batch.map(fetchPokemonDirect));
        for (let j = 0; j < settled.length; j++) {
          const r = settled[j];
          results.push(r.status === 'fulfilled' ? r.value : makeFallback(batch[j]));
          loaded++;
        }
        onProgress(loaded, total);
      }

      return results.sort((a, b) => a.id - b.id);
    }
  } catch { /* server not running – fall through */ }

  // Full direct PokeAPI fallback
  return fetchAllDirect(onProgress);
}

async function fetchAllDirect(
  onProgress: (loaded: number, total: number) => void
): Promise<PokemonFeatures[]> {
  const total = CONFIG.POKEMON_COUNT;
  const results: PokemonFeatures[] = new Array(total);
  let loaded = 0;
  const toFetch: number[] = [];

  for (let i = 1; i <= total; i++) {
    const cached = loadFromCache(i);
    if (cached) { results[i - 1] = cached; loaded++; }
    else toFetch.push(i);
  }
  onProgress(loaded, total);

  for (let i = 0; i < toFetch.length; i += CONFIG.API_BATCH_SIZE) {
    const batch = toFetch.slice(i, i + CONFIG.API_BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map(fetchPokemonDirect));
    for (let j = 0; j < settled.length; j++) {
      const id = batch[j];
      results[id - 1] = settled[j].status === 'fulfilled'
        ? (settled[j] as PromiseFulfilledResult<PokemonFeatures>).value
        : makeFallback(id);
      loaded++;
    }
    onProgress(loaded, total);
  }

  return results.filter(Boolean);
}

function makeFallback(id: number): PokemonFeatures {
  return {
    id, name: `pokemon-${id}`,
    sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
    types: ['normal'], generation: 1, evoLineId: id, evoStage: 0, bodyGroup: 'blob',
    isLegendary: false, isMythical: false, isPseudoLegendary: false, isStarter: false,
  };
}
