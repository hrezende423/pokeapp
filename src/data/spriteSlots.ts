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

/*
  ================================================ NO WHITE-BACKGROUND SPRITES

  PokeAPI serves the Gen 1-2 sprites on an OPAQUE WHITE background. Audited by
  decoding the real PNGs and reading their corner alpha, per game and per slot:

    red-blue, yellow   front/back default and front/back gray are white
    gold, silver       front/back x default/shiny are white
    crystal            front/back x default/shiny are white
    Ruby/Sapphire on   already transparent, every slot

  Two different fixes, because upstream is inconsistent about what it also
  provides transparently:

  1. MOST OF THEM HAVE A TRANSPARENT COUNTERPART upstream -- a `transparent/`
     rendering of the same face and shininess -- so the white one is simply not
     rendered and the counterpart takes its place. 2,110 tiles. They are a
     different canvas size (96 x 96 against 40 x 40 for red-blue), which is why
     they are a real alternative rather than the same file with alpha.

  2. 2,110 HAVE NO COUNTERPART: both gray slots on red-blue and yellow, and
     front_shiny / back_default / back_shiny on gold and silver. Dropping those
     would have lost every Game Boy grayscale sprite and every Gold/Silver back
     and shiny, so they are keyed to transparency and hosted in pokeapp-sprites
     instead -- flood-filled inward from the border, not colour-keyed, because
     these sprites use the same #ffffff for eyes and teeth as for the background
     (344,194 interior white pixels survive across the set because of it).

  So every tile the app renders is transparent, and nothing was lost to get
  there.
*/

/** Slots each Gen 1-2 game serves on an opaque white background. */
const WHITE_BACKGROUND: Record<string, readonly SpriteSlot[]> = {
  'red-blue': ['front_default', 'back_default', 'front_gray', 'back_gray'],
  yellow: ['front_default', 'back_default', 'front_gray', 'back_gray'],
  gold: ['front_default', 'front_shiny', 'back_default', 'back_shiny'],
  silver: ['front_default', 'front_shiny', 'back_default', 'back_shiny'],
  crystal: ['front_default', 'front_shiny', 'back_default', 'back_shiny'],
}

/** The transparent slot that renders the same face and shininess, where one exists. */
const TRANSPARENT_COUNTERPART: Partial<Record<SpriteSlot, SpriteSlot>> = {
  front_default: 'front_transparent',
  back_default: 'back_transparent',
  front_shiny: 'front_shiny_transparent',
  back_shiny: 'back_shiny_transparent',
}

/** Our keyed copies, for the white slots with no counterpart upstream. */
const KEYED_BASE = 'https://raw.githubusercontent.com/hrezende423/pokeapp-sprites/main/transparent'

/** Does this game serve this slot on white? */
function isWhiteBacked(game: string, slot: SpriteSlot): boolean {
  return WHITE_BACKGROUND[game]?.includes(slot) ?? false
}

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
 * Gray is named as its own kind rather than as a modifier of "Normal": a Gen 1
 * gray sprite is not a shininess or a gender, it is a different rendering of the
 * same Pokemon, and calling it "Normal · Gray" read as a contradiction.
 *
 * "TRANSPARENT" IS NO LONGER A LABEL. It used to be, because the tab showed the
 * white-backgrounded slot AND its transparent counterpart side by side and the
 * background was the only difference between them. Now that every tile is
 * transparent it distinguishes nothing, and `front_transparent` is simply this
 * game's front sprite -- so it reads "Front · Normal", which is what the reader
 * is actually looking at.
 */
export function slotLabel(slot: SpriteSlot): string {
  const face = slot.startsWith('back_') ? 'Back' : 'Front'
  const parts: string[] = [face]
  if (slot.includes('_shiny')) parts.push('Shiny')
  else if (!slot.includes('gray')) parts.push('Normal')
  if (slot.endsWith('_female')) parts.push('Female')
  if (slot.includes('gray')) parts.push('Gray')
  return parts.join(' · ')
}

/**
 * Display order within one game: front before back, plain before shiny, male
 * before female, colour before grayscale.
 *
 * NOT SLOT_ORDER, which is a BIT order and is append-only -- the six Gen 1-2
 * variants were added last, so `front_transparent` sits at bit 8 and sorted
 * after every default and back slot. That put Gold's four tiles on screen as
 * "Front Shiny, Back Normal, Back Shiny, Front Normal", which is the bit layout
 * showing through the UI.
 */
function slotRank(slot: SpriteSlot): number {
  return (
    (slot.startsWith('back_') ? 8 : 0) +
    (slot.includes('gray') ? 4 : 0) +
    (slot.includes('_shiny') ? 2 : 0) +
    (slot.endsWith('_female') ? 1 : 0)
  )
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
    const slots = slotsFor(variety, g.game)
    // Sorted for display, not by bit position -- see slotRank.
    for (const slot of [...slots].sort((a, b) => slotRank(a) - slotRank(b))) {
      let url = versionSpriteUrl(variety.pokemon_id, g.game, slot)
      if (!url) continue
      if (isWhiteBacked(g.game, slot)) {
        // See the NO WHITE-BACKGROUND SPRITES note above.
        const counterpart = TRANSPARENT_COUNTERPART[slot]
        if (counterpart && slots.includes(counterpart)) continue
        url = `${KEYED_BASE}/${g.game}/${slot}/${variety.pokemon_id}.png`
      }
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
