import type { PokemonFeatures } from '../types';

const PSEUDO_LEGENDARY_IDS = new Set([
  149, // Dragonite
  248, // Tyranitar
  373, // Salamence
  376, // Metagross
  445, // Garchomp
  635, // Hydreigon
  706, // Goodra
  784, // Kommo-o (actually 784 is Kommo-o)
  887, // Dragapult
  998, // Baxcalibur
]);

// Also add the pre-evolutions' line IDs are based on base form
const PSEUDO_LEGENDARY_LINES = new Set([
  147, // Dratini line
  246, // Larvitar line
  371, // Bagon line
  374, // Beldum line
  443, // Gible line
  633, // Deino line
  704, // Goomy line
  782, // Jangmo-o line (782 is Jangmo-o)
  885, // Dreepy line
  996, // Frigibax line
]);

export function mapBodyGroup(shape: string): string {
  const shapeMap: Record<string, string> = {
    head: 'head',
    squiggle: 'squiggle',
    fish: 'fish',
    arms: 'arms',
    blob: 'blob',
    upright: 'upright',
    legs: 'legs',
    quadruped: 'quadruped',
    wings: 'wings',
    tentacles: 'tentacles',
    heads: 'heads',
    serpentine: 'serpentine',
    humanoid: 'upright',
    'bug-wings': 'wings',
  };
  return shapeMap[shape] ?? 'blob';
}

export function extractFeatures(
  pokemonData: RawPokemonData,
  speciesData: RawSpeciesData,
  evoLineInfo: EvoLineInfo,
  shapeOverride?: string
): PokemonFeatures {
  const id = pokemonData.id;
  const name = pokemonData.name;
  const sprite =
    pokemonData.sprites?.other?.['official-artwork']?.front_default ??
    pokemonData.sprites?.front_default ??
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

  const types: string[] = pokemonData.types.map(
    (t: { type: { name: string } }) => t.type.name
  );

  const genStr: string = speciesData.generation?.name ?? 'generation-i';
  const genNum = parseGenerationNumber(genStr);

  const isLegendary = speciesData.is_legendary === true;
  const isMythical = speciesData.is_mythical === true;
  const isPseudoLegendary =
    PSEUDO_LEGENDARY_IDS.has(id) || PSEUDO_LEGENDARY_LINES.has(evoLineInfo.baseId);

  const shape = shapeOverride ?? speciesData.shape?.name ?? 'blob';
  const bodyGroup = mapBodyGroup(shape);

  return {
    id,
    name,
    sprite,
    types,
    generation: genNum,
    evoLineId: evoLineInfo.baseId,
    evoStage: evoLineInfo.stage,
    bodyGroup,
    isLegendary,
    isMythical,
    isPseudoLegendary,
  };
}

function parseGenerationNumber(genName: string): number {
  const parts = genName.split('-');
  if (parts.length < 2) return 1;
  const romanMap: Record<string, number> = {
    i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9,
  };
  return romanMap[parts[1]] ?? 1;
}

export interface EvoLineInfo {
  baseId: number;
  stage: number;
}

export interface RawPokemonData {
  id: number;
  name: string;
  sprites: {
    front_default: string | null;
    other?: {
      'official-artwork'?: {
        front_default: string | null;
      };
    };
  };
  types: Array<{ type: { name: string } }>;
}

export interface RawSpeciesData {
  generation?: { name: string };
  is_legendary: boolean;
  is_mythical: boolean;
  shape?: { name: string };
  evolution_chain?: { url: string };
}

export function extractEvoLineFromChain(
  chainData: RawEvoChain,
  targetId: number
): EvoLineInfo {
  const baseId = extractFirstId(chainData.chain);

  function search(
    node: EvoChainNode,
    stage: number
  ): EvoLineInfo | null {
    const speciesUrl = node.species.url;
    const parts = speciesUrl.split('/').filter(Boolean);
    const nodeId = parseInt(parts[parts.length - 1], 10);

    if (nodeId === targetId) {
      return { baseId, stage };
    }

    for (const next of node.evolves_to) {
      const found = search(next, stage + 1);
      if (found) return found;
    }
    return null;
  }

  return search(chainData.chain, 0) ?? { baseId, stage: 0 };
}

function extractFirstId(node: EvoChainNode): number {
  const url = node.species.url;
  const parts = url.split('/').filter(Boolean);
  return parseInt(parts[parts.length - 1], 10);
}

export interface EvoChainNode {
  species: { url: string };
  evolves_to: EvoChainNode[];
}

export interface RawEvoChain {
  chain: EvoChainNode;
}
