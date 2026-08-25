/**
 * Per-species detail-page background colours, for the species-tinted mode of the
 * detail page (DESIGN-SYSTEM.md §5, "Species detail page").
 *
 * The table lives in the pokeapp-sprites repo, not in this bundle, because it is
 * asset metadata about the artwork -- the same reasoning that puts the animated
 * WebPs there. Fetched from the raw file on `main`, which the service worker
 * already CacheFirsts (raw.githubusercontent.com is in the artwork runtime-cache
 * pattern), so after one load it is available offline like every sprite.
 *
 * Deliberately NOT copied into public/data: this file was just published as the
 * single source of truth, and a bundled duplicate would start drifting from it.
 *
 * The colours are art-directed per illustration, not derived from type colours --
 * see §9 for the methodology and the two automated approaches that were tried and
 * rejected. Nothing here recomputes or adjusts them.
 */

export interface SpeciesBackground {
  bg_light: string
  bg_dark: string
}

const SOURCE =
  'https://raw.githubusercontent.com/hrezende423/pokeapp-sprites/main/species-background-colors.json'

let table: Record<string, SpeciesBackground> | null = null
let inFlight: Promise<Record<string, SpeciesBackground>> | null = null

const key = (speciesId: number) => String(speciesId).padStart(3, '0')

/**
 * Loads the table once and reuses it. Rejects rather than resolving to an empty
 * object if the fetch fails, so a caller can fall back to the standard
 * (untinted) mode instead of silently rendering every species on --surface and
 * calling that the tinted mode.
 */
export async function loadSpeciesBackgrounds(): Promise<Record<string, SpeciesBackground>> {
  if (table) return table
  inFlight ??= fetch(SOURCE).then(async (res) => {
    if (!res.ok) throw new Error(`species background table: HTTP ${res.status}`)
    const json = (await res.json()) as Record<string, SpeciesBackground>
    table = json
    return json
  })
  try {
    return await inFlight
  } catch (err) {
    inFlight = null
    throw err
  }
}

/** The pair for a species, or null when the table is not loaded or has no entry. */
export function speciesBackground(speciesId: number): SpeciesBackground | null {
  return table?.[key(speciesId)] ?? null
}

/** Loaded-and-non-empty, for callers deciding whether tinted mode is available. */
export function speciesBackgroundsReady(): boolean {
  return table != null
}

export function __resetSpeciesBackgrounds() {
  table = null
  inFlight = null
}
