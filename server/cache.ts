import { db, stmts } from './db';
import type { PokemonFeatures } from '../src/types';
import fs from 'fs';
import path from 'path';

export const SPRITES_DIR = path.join(process.cwd(), 'sprites');
if (!fs.existsSync(SPRITES_DIR)) fs.mkdirSync(SPRITES_DIR, { recursive: true });

async function downloadSprite(url: string, id: number): Promise<void> {
  const dest = path.join(SPRITES_DIR, `${id}.png`);
  if (fs.existsSync(dest)) return;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`sprite fetch ${r.status}`);
    const buf = await r.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buf));
  } catch { /* keep external url as fallback */ }
}

const POKEMON_COUNT = 1025;
const BATCH = 20;

// ─── Types used by the server-side fetcher ────────────────────────────────

interface RawPokemon {
  id: number;
  name: string;
  sprites: {
    front_default: string | null;
    other?: { 'official-artwork'?: { front_default: string | null } };
  };
  types: { type: { name: string } }[];
}

interface RawSpecies {
  generation?: { name: string };
  is_legendary: boolean;
  is_mythical: boolean;
  shape?: { name: string };
  evolution_chain?: { url: string };
  names: { language: { name: string }; name: string }[];
}

interface EvoNode {
  species: { url: string };
  evolves_to: EvoNode[];
}

interface RawEvoChain {
  chain: EvoNode;
}

// ─── Starter line IDs (base form IDs) ────────────────────────────────────

const STARTER_BASE_IDS = new Set([
  1, 4, 7,          // Kanto
  152, 155, 158,    // Johto
  252, 255, 258,    // Hoenn
  387, 390, 393,    // Sinnoh
  495, 498, 501,    // Unova
  650, 653, 656,    // Kalos
  722, 725, 728,    // Alola
  810, 813, 816,    // Galar
  906, 909, 912,    // Paldea
]);

const PSEUDO_LEGENDARY_LINE_IDS = new Set([
  147, 246, 371, 374, 443, 633, 704, 782, 885, 996,
]);

// ─── Helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`PokeAPI ${r.status}: ${url}`);
  return r.json() as Promise<T>;
}

const evoCache = new Map<number, RawEvoChain>();

async function fetchEvoChain(url: string): Promise<RawEvoChain> {
  const id = parseInt(url.split('/').filter(Boolean).at(-1) ?? '0', 10);
  if (evoCache.has(id)) return evoCache.get(id)!;
  const data = await apiFetch<RawEvoChain>(url);
  evoCache.set(id, data);
  return data;
}

function parseGen(name: string): number {
  const m: Record<string, number> = { i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8,ix:9 };
  return m[name.split('-')[1]] ?? 1;
}

function shapeToGroup(shape: string): string {
  const m: Record<string, string> = {
    head:'head', squiggle:'squiggle', fish:'fish', arms:'arms', blob:'blob',
    upright:'upright', legs:'legs', quadruped:'quadruped', wings:'wings',
    tentacles:'tentacles', heads:'heads', serpentine:'serpentine',
    humanoid:'upright', 'bug-wings':'wings',
  };
  return m[shape] ?? 'blob';
}

function evoStageInfo(chain: RawEvoChain, targetId: number): { baseId: number; stage: number } {
  const baseId = parseInt(chain.chain.species.url.split('/').filter(Boolean).at(-1) ?? '0', 10);

  function search(node: EvoNode, stage: number): { baseId: number; stage: number } | null {
    const nodeId = parseInt(node.species.url.split('/').filter(Boolean).at(-1) ?? '0', 10);
    if (nodeId === targetId) return { baseId, stage };
    for (const next of node.evolves_to) {
      const r = search(next, stage + 1);
      if (r) return r;
    }
    return null;
  }

  return search(chain.chain, 0) ?? { baseId, stage: 0 };
}

// ─── Fetch + process one Pokémon ─────────────────────────────────────────

async function fetchAndStorePokemon(id: number): Promise<void> {
  if (stmts.getFeature.get(id)) return; // already cached

  const [raw, species] = await Promise.all([
    apiFetch<RawPokemon>(`https://pokeapi.co/api/v2/pokemon/${id}`),
    apiFetch<RawSpecies>(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
  ]);

  let evoInfo = { baseId: id, stage: 0 };
  if (species.evolution_chain?.url) {
    try {
      const chain = await fetchEvoChain(species.evolution_chain.url);
      evoInfo = evoStageInfo(chain, id);
    } catch { /* ignore, use default */ }
  }

  const externalSprite = raw.sprites.other?.['official-artwork']?.front_default
    ?? raw.sprites.front_default
    ?? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

  await downloadSprite(externalSprite, id);

  const features: PokemonFeatures = {
    id,
    name: raw.name,
    sprite: `/sprites/${id}.png`,
    types: raw.types.map(t => t.type.name),
    generation: parseGen(species.generation?.name ?? 'generation-i'),
    evoLineId: evoInfo.baseId,
    evoStage: evoInfo.stage,
    bodyGroup: shapeToGroup(species.shape?.name ?? 'blob'),
    isLegendary: species.is_legendary,
    isMythical: species.is_mythical,
    isPseudoLegendary: PSEUDO_LEGENDARY_LINE_IDS.has(evoInfo.baseId),
    isStarter: STARTER_BASE_IDS.has(evoInfo.baseId),
  };

  // Store features
  stmts.upsertFeature.run({ id, data: JSON.stringify(features), cached_at: Date.now() });

  // Store localized names
  const insertNames = db.transaction(() => {
    for (const entry of species.names) {
      stmts.upsertName.run({ id, lang: entry.language.name, name: entry.name });
    }
  });
  insertNames();
}

// ─── Type names (18 types) ────────────────────────────────────────────────

const ALL_TYPES = [
  'normal','fire','water','electric','grass','ice','fighting','poison',
  'ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy',
];

async function fetchTypeNames(): Promise<void> {
  const count = (stmts.getTypeNameCount.get() as { n: number }).n;
  if (count > 0) return; // already cached

  await Promise.all(ALL_TYPES.map(async (type) => {
    try {
      const data = await apiFetch<{ names: { language: { name: string }; name: string }[] }>(
        `https://pokeapi.co/api/v2/type/${type}`
      );
      const insert = db.transaction(() => {
        for (const entry of data.names) {
          stmts.upsertTypeName.run({ type, lang: entry.language.name, name: entry.name });
        }
      });
      insert();
    } catch { /* ignore */ }
  }));
}

// ─── Background warmup ────────────────────────────────────────────────────

let warmupProgress = { done: (stmts.getCachedCount.get() as { n: number }).n, total: POKEMON_COUNT };

export function getWarmupProgress() { return warmupProgress; }

async function migrateSprites(): Promise<void> {
  const rows = stmts.getAllFeatures.all() as { data: string }[];
  const toMigrate = rows
    .map(r => JSON.parse(r.data) as PokemonFeatures)
    .filter(pkm => !pkm.sprite.startsWith('/sprites/'));

  if (toMigrate.length === 0) return;
  console.log(`Migrating sprites for ${toMigrate.length} Pokémon...`);

  for (let i = 0; i < toMigrate.length; i += BATCH) {
    const batch = toMigrate.slice(i, i + BATCH);
    await Promise.allSettled(batch.map(async (pkm) => {
      await downloadSprite(pkm.sprite, pkm.id);
      const updated: PokemonFeatures = { ...pkm, sprite: `/sprites/${pkm.id}.png` };
      stmts.upsertFeature.run({ id: pkm.id, data: JSON.stringify(updated), cached_at: Date.now() });
    }));
  }

  console.log('Sprite migration complete.');
}

export async function warmCache(): Promise<void> {
  await fetchTypeNames();
  await migrateSprites();

  const ids: number[] = [];
  for (let i = 1; i <= POKEMON_COUNT; i++) {
    if (!stmts.getFeature.get(i)) ids.push(i);
  }
  warmupProgress.total = POKEMON_COUNT;

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    await Promise.allSettled(batch.map(fetchAndStorePokemon));
    warmupProgress.done = (stmts.getCachedCount.get() as { n: number }).n;
  }
}

// ─── Data accessors ───────────────────────────────────────────────────────

export function getAllFeatures(): PokemonFeatures[] {
  return (stmts.getAllFeatures.all() as { data: string }[]).map(r => JSON.parse(r.data));
}

export function getAllNames(): Record<number, Record<string, string>> {
  const rows = stmts.getAllNames.all() as { id: number; lang: string; name: string }[];
  const result: Record<number, Record<string, string>> = {};
  for (const r of rows) {
    if (!result[r.id]) result[r.id] = {};
    result[r.id][r.lang] = r.name;
  }
  return result;
}

export function getAllTypeNames(): Record<string, Record<string, string>> {
  const rows = stmts.getAllTypeNames.all() as { type: string; lang: string; name: string }[];
  const result: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    if (!result[r.type]) result[r.type] = {};
    result[r.type][r.lang] = r.name;
  }
  return result;
}
