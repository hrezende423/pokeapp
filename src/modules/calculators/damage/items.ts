/**
 * Item facts the formulas key off, ported from the reference's calc/src/items.ts
 * and re-keyed to the bundle's item slugs.
 *
 * These are relations the bundle does not carry as fields -- "Charcoal boosts
 * Fire" is prose in `effect` -- so they are written out, the same way era.ts
 * writes out start-of-mechanic facts. Every slug below is asserted to exist in the
 * bundle by verify-damage-calc, so a rename upstream fails loudly instead of
 * silently turning an item into a no-op.
 */

import { listBerries } from '../../../data'

/** Held item -> the type it boosts (1.1x in Gen 2-3, 1.2x in Gen 4). */
const ITEM_BOOST_TYPE: Record<string, string> = {
  'draco-plate': 'dragon',
  'dragon-fang': 'dragon',
  'dread-plate': 'dark',
  'black-glasses': 'dark',
  'earth-plate': 'ground',
  'soft-sand': 'ground',
  'fist-plate': 'fighting',
  'black-belt': 'fighting',
  'flame-plate': 'fire',
  charcoal: 'fire',
  'icicle-plate': 'ice',
  'never-melt-ice': 'ice',
  'insect-plate': 'bug',
  'silver-powder': 'bug',
  'iron-plate': 'steel',
  'metal-coat': 'steel',
  'meadow-plate': 'grass',
  'rose-incense': 'grass',
  'miracle-seed': 'grass',
  'mind-plate': 'psychic',
  'odd-incense': 'psychic',
  'twisted-spoon': 'psychic',
  'sky-plate': 'flying',
  'sharp-beak': 'flying',
  'splash-plate': 'water',
  'sea-incense': 'water',
  'wave-incense': 'water',
  'mystic-water': 'water',
  'spooky-plate': 'ghost',
  'spell-tag': 'ghost',
  'stone-plate': 'rock',
  'rock-incense': 'rock',
  'hard-stone': 'rock',
  'toxic-plate': 'poison',
  'poison-barb': 'poison',
  'zap-plate': 'electric',
  magnet: 'electric',
  // The bundle lists Silk Scarf from Gen 2, where the game's Normal booster was the
  // Pink Bow / Polkadot Bow (absent from the bundle). Same 1.1x, same type.
  'silk-scarf': 'normal',
}

export function itemBoostType(item: string): string | undefined {
  return ITEM_BOOST_TYPE[item]
}

/** The sixteen Plates, for Judgment. */
export function isPlate(item: string): boolean {
  return item.endsWith('-plate') && item in ITEM_BOOST_TYPE
}

/** Gen 4 type-resist berries -> the type they halve. */
const BERRY_RESIST_TYPE: Record<string, string> = {
  'chilan-berry': 'normal',
  'occa-berry': 'fire',
  'passho-berry': 'water',
  'wacan-berry': 'electric',
  'rindo-berry': 'grass',
  'yache-berry': 'ice',
  'chople-berry': 'fighting',
  'kebia-berry': 'poison',
  'shuca-berry': 'ground',
  'coba-berry': 'flying',
  'payapa-berry': 'psychic',
  'tanga-berry': 'bug',
  'charti-berry': 'rock',
  'kasib-berry': 'ghost',
  'haban-berry': 'dragon',
  'colbur-berry': 'dark',
  'babiri-berry': 'steel',
}

export function berryResistType(item: string): string | undefined {
  return BERRY_RESIST_TYPE[item]
}

/**
 * Natural Gift's type and power for a held berry, from the bundle's berry record.
 *
 * The bundle's power is the Gen 4-5 value (60/70/80 -- Oran 60, Liechi 80), which
 * matches the reference's Gen 4 data for every berry checked. Gen 6 raised them by
 * 20; a Gen 6 module would pass its generation in and add it here.
 */
export function naturalGift(itemId: number): { typeId: number; power: number } | null {
  const berry = listBerries().find((b) => b.item_id === itemId)
  if (!berry || berry.natural_gift_type_id == null || berry.natural_gift_power == null) return null
  return { typeId: berry.natural_gift_type_id, power: berry.natural_gift_power }
}

/** Every slug this file names, for the suite's existence check. */
export const ITEM_SLUGS_REFERENCED: readonly string[] = [
  ...Object.keys(ITEM_BOOST_TYPE),
  ...Object.keys(BERRY_RESIST_TYPE),
]
