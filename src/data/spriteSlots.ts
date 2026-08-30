/**
 * Decoding the bit-packed per-game sprite slots, and building their URLs.
 *
 * THE BUNDLE STORES A BITMASK per game, not slot names -- see versionSpriteSlots
 * in scripts/build-data.ts for why (390 KiB of repeated strings on an eagerly
 * precached file; the packed form costs 98 KiB for the same 16204 tiles). This
 * module is the other half of that contract: SLOT_ORDER here must match
 * SPRITE_SLOT_ORDER there bit for bit, and verify-design-system asserts they agree
 * rather than trusting this comment.
 *
 * WHY THE URLS ARE BUILT AND NOT STORED. api-data's sprite URLs are mechanical, so
 * storing 16204 of them to say what a 14-entry path table says was the thing worth
 * avoiding. The only fact that is NOT derivable is which slots exist, which is
 * exactly what the bitmask carries.
 *
 * THE PATH TABLE IS TRANSCRIBED FROM REAL URLS, not derived from the slot name,
 * because the naming does not map cleanly onto the directory order:
 *
 *   back_transparent         transparent/back/    <- transparent BEFORE back
 *   back_shiny_transparent   transparent/back/shiny/
 *   back_shiny               back/shiny/          <- but here back comes first
 *   back_shiny_female        back/shiny/female/
 *
 * A builder that appended `back`, then `shiny`, then the variant would produce
 * `back/transparent/` and 404 on all 1859 transparent back tiles. Every row below
 * was read off an actual snapshot URL.
 */

import type { Species, Variety } from './types'

/**
 * Bit position per slot. APPEND-ONLY, and must stay identical to
 * SPRITE_SLOT_ORDER in scripts/build-data.ts: the numbers live in the bundle, so
 * reordering this reinterprets every existing record.
 *
 * The last six are Gen 1-2 only -- the Game Boy grayscale and transparent-
 * background variants. Omitting them from a first pass silently dropped 2714 of
 * the 16204 real tiles.
 */
export const SLOT_ORDER = [
  'front_default',
  'front_shiny',
  'front_female',
  'front_shiny_female',
  'back_default',
  'back_shiny',
  'back_female',
  'back_shiny_female',
  'front_transparent',
  'back_transparent',
  'front_shiny_transparent',
  'back_shiny_transparent',
  'front_gray',
  'back_gray',
] as const

export type SpriteSlot = (typeof SLOT_ORDER)[number]

/** Directory chain between the game folder and `{id}.png`, transcribed. */
const SLOT_PATH: Record<SpriteSlot, string> = {
  front_default: '',
  front_shiny: 'shiny/',
  front_female: 'female/',
  front_shiny_female: 'shiny/female/',
  back_default: 'back/',
  back_shiny: 'back/shiny/',
  back_female: 'back/female/',
  back_shiny_female: 'back/shiny/female/',
  front_transparent: 'transparent/',
  back_transparent: 'transparent/back/',
  front_shiny_transparent: 'transparent/shiny/',
  back_shiny_transparent: 'transparent/back/shiny/',
  front_gray: 'gray/',
  back_gray: 'back/gray/',
}

/**
 * The eleven Gen 1-4 sprite sets, in release order.
 *
 * NOT version-group names, deliberately, though several coincide: api-data splits
 * Gold and Silver into separate sprite sets while the app's version group is
 * `gold-silver`, so treating these as version groups would collapse two genuinely
 * different sets. The generation is carried here rather than parsed from a prefix.
 */
export const SPRITE_GAMES = [
  { game: 'red-blue', generation: 1, genPath: 'generation-i', label: 'Red / Blue' },
  { game: 'yellow', generation: 1, genPath: 'generation-i', label: 'Yellow' },
  { game: 'gold', generation: 2, genPath: 'generation-ii', label: 'Gold' },
  { game: 'silver', generation: 2, genPath: 'generation-ii', label: 'Silver' },
  { game: 'crystal', generation: 2, genPath: 'generation-ii', label: 'Crystal' },
  { game: 'ruby-sapphire', generation: 3, genPath: 'generation-iii', label: 'Ruby / Sapphire' },
  { game: 'emerald', generation: 3, genPath: 'generation-iii', label: 'Emerald' },
  {
    game: 'firered-leafgreen',
    generation: 3,
    genPath: 'generation-iii',
    label: 'FireRed / LeafGreen',
  },
  { game: 'diamond-pearl', generation: 4, genPath: 'generation-iv', label: 'Diamond / Pearl' },
  { game: 'platinum', generation: 4, genPath: 'generation-iv', label: 'Platinum' },
  {
    game: 'heartgold-soulsilver',
    generation: 4,
    genPath: 'generation-iv',
    label: 'HeartGold / SoulSilver',
  },
] as const

const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions'

const defaultVariety = (species: Species): Variety | undefined =>
  species.varieties.find((v) => v.is_default) ?? species.varieties[0]

/** Does this game have this slot for this variety? */
export function hasSlot(variety: Variety, game: string, slot: SpriteSlot): boolean {
  const mask = variety.version_sprite_slots?.[game]
  if (mask == null) return false
  return (mask & (1 << SLOT_ORDER.indexOf(slot))) !== 0
}

/** Every slot this game actually has, in SLOT_ORDER. */
export function slotsFor(variety: Variety, game: string): SpriteSlot[] {
  const mask = variety.version_sprite_slots?.[game]
  if (mask == null) return []
  return SLOT_ORDER.filter((_, i) => (mask & (1 << i)) !== 0)
}

/** The URL for one game sprite, or null for an unknown game. */
export function versionSpriteUrl(pokemonId: number, game: string, slot: SpriteSlot): string | null {
  const entry = SPRITE_GAMES.find((g) => g.game === game)
  if (!entry) return null
  return `${SPRITE_BASE}/${entry.genPath}/${game}/${SLOT_PATH[slot]}${pokemonId}.png`
}

/**
 * Human label for a slot.
 *
 * Gray and transparent are named as their own kind rather than as modifiers of
 * "Normal": a Gen 1 gray sprite is not a shininess or a gender, it is a different
 * rendering of the same Pokemon, and calling it "Normal · Gray" read as a
 * contradiction in the grid.
 */
export function slotLabel(slot: SpriteSlot): string {
  const face = slot.startsWith('back_') ? 'Back' : 'Front'
  const parts: string[] = [face]
  if (slot.includes('_shiny')) parts.push('Shiny')
  else if (!slot.includes('gray') && !slot.includes('transparent')) parts.push('Normal')
  if (slot.endsWith('_female')) parts.push('Female')
  if (slot.includes('transparent')) parts.push('Transparent')
  if (slot.includes('gray')) parts.push('Gray')
  return parts.join(' · ')
}

export interface SpriteTile {
  game: string
  gameLabel: string
  generation: number
  slot: SpriteSlot
  slotLabel: string
  url: string
}

/**
 * Every (game, slot) tile that exists for a species, newest game first.
 *
 * Newest first because that is the sprite most people recognise; the Gen 1
 * grayscale variants are the curiosity, not the headline.
 */
export function spriteTiles(species: Species, maxGeneration = 4): SpriteTile[] {
  const variety = defaultVariety(species)
  if (!variety) return []
  const out: SpriteTile[] = []
  for (const g of [...SPRITE_GAMES].reverse()) {
    if (g.generation > maxGeneration) continue
    for (const slot of slotsFor(variety, g.game)) {
      const url = versionSpriteUrl(variety.pokemon_id, g.game, slot)
      if (!url) continue
      out.push({
        game: g.game,
        gameLabel: g.label,
        generation: g.generation,
        slot,
        slotLabel: slotLabel(slot),
        url,
      })
    }
  }
  return out
}
