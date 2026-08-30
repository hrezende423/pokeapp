/**
 * Larger artwork for items and berries, and the honest limits of it.
 *
 * WHAT WAS ACTUALLY CHECKED. Items have no equivalent of a species' official
 * artwork. `species.sprites.other['official-artwork']` is a distinct, uniformly
 * available asset; the item sprite system has nothing of the kind. The whole set
 * of directories under PokeAPI/sprites `sprites/items/` was enumerated against
 * the repo tree:
 *
 *   sprites/items/*.png              30x30   561/563 of our items  <- the bundle's `sprite`
 *   sprites/items/dream-world/*.png  90x90   284/561 (51%)
 *   sprites/items/berries/*.png      48x48    64/64 berries
 *   sprites/items/gen3, gen5, gen8, gen9, underground/   era-specific icon variants
 *
 * So the nearest thing to "high-resolution item artwork" is the Dream World set
 * at 90x90 -- 3x linear on the icon -- and it covers just over half our items.
 * The 277 without one are not a random tail: 100 are TMs/HMs, 45 plot items, 37
 * gameplay, 27 data cards, 24 mail. Common held items are missing too (Adamant
 * Orb, Lustrous Orb, Odd Keystone, all four mulches).
 *
 * BERRIES ARE THE HAPPY CASE: 64/64 have a Dream World image, so a berry card
 * never falls back and the Berrydex grid is uniform by construction.
 *
 * ITEMS ARE THE MIXED CASE, and this module does not hide that. `itemArtworkUrl`
 * returns the Dream World URL, which 404s for 49% of items; the component pairs
 * it with `onError` and swaps in the 30x30 icon rendered pixelated at the same
 * box. Probing 561 URLs at build time to pick per item was the alternative, and
 * it would put a network fetch inside a build that is otherwise hermetic against
 * the local snapshot (see scripts/build-data.ts) -- one `onError` per broken
 * image is the cheaper honest answer, and the browser caches the 404.
 */

import type { Berry, Item } from './types'

/** `.../sprites/items/master-ball.png` -> `master-ball.png`. */
function spriteFile(url: string | null): string | null {
  return url?.match(/\/sprites\/items\/([^/]+)$/)?.[1] ?? null
}

/**
 * The 90x90 Dream World image for an item, or null when the item has no icon at
 * all to derive it from.
 *
 * MAY 404 -- 51% coverage, see the module note. Always pair with
 * `itemIconUrl` as an error fallback.
 */
export function itemArtworkUrl(item: Item | undefined): string | null {
  const file = spriteFile(item?.sprite ?? null)
  if (!file) return null
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world/${file}`
}

/** The 30x30 in-game icon: what list rows use, and the artwork fallback. */
export function itemIconUrl(item: Item | undefined): string | null {
  return item?.sprite ?? null
}

/**
 * A berry's artwork, via its backing item. Present for all 64, so unlike
 * `itemArtworkUrl` this one does not need a fallback in practice -- the caller
 * still passes one, because "verified today" is not "guaranteed forever".
 */
export function berryArtworkUrl(_berry: Berry, item: Item | undefined): string | null {
  return itemArtworkUrl(item)
}
