/**
 * The custom painted evolution-condition icons: keys, URLs, and where they live.
 *
 * WHY public/ AND NOT pokeapp-sprites. These are bundled app assets, checked into
 * this repo and precached with the rest of the shell. pokeapp-sprites exists for
 * one reason -- 648 MB of species artwork cannot go in a git repo that also has to
 * be cloned by CI -- and nothing about 11 condition icons meets that bar. They are
 * also chrome rather than content: an evolution chart with no icons is broken,
 * whereas a missing species sprite degrades to a placeholder. Chrome belongs in
 * the install payload.
 *
 * WHY public/evo-icons/ AND NOT src/assets/. public/ is where every other bundled
 * static asset in this project already lives (favicon.svg, icons.svg, the two pwa
 * icons, apple-touch-icon.png), and a folder plus a JSON manifest describing it is
 * exactly the shape public/data/ already has with src/data/manifest.ts. Hashed
 * src/assets/ imports would give better cache-busting, but they would also make
 * the manifest a set of build-time import bindings rather than a file a person can
 * read and edit, which is the opposite of what was asked for.
 *
 * They arrived in a top-level custom-icons/ folder, which looks like it is "in the
 * project" but sits outside Vite's asset pipeline entirely -- not copied to dist/,
 * not served, not precached. Moving them into public/ is what actually makes the
 * intended bundling happen.
 *
 * ONE THING TO FIX BEFORE THESE RENDER: 3.14 MB unoptimised, at up to 1024x1024
 * for a glyph that draws at 16-24px, and the workbox glob in vite.config.ts is
 * `**\/*.{js,css,html,svg,png,ico,woff2}` -- so every byte lands in the precache
 * automatically. Numbers and the recommendation are in the report; nothing here
 * silently resizes the originals.
 *
 * GENDER IS NOT IN THIS FILE. The two gender assets are listed in the JSON
 * manifest under `gender-male` and `gender-female`, but deliberately absent from
 * EvoConditionIconKey and from EVO_CONDITION_ICON_FILES below. They are reachable
 * only through ./evoGenderIcon, which eslint.config.js forbids importing from
 * anywhere except the evolution chart. See that file for the whole argument.
 *
 * Their filenames are deliberately not written out anywhere in this module, and
 * verify-evo-icons.mjs asserts that -- so the check stays a blunt "this module
 * never names them", with no prose exception to reason about.
 */

/** Folder under the Vite base holding the icon set and its manifest. */
export const EVO_ICON_DIR = 'evo-icons'

/**
 * Semantic key -> filename, mirroring public/evo-icons/evo-condition-icons.json.
 *
 * The JSON is the human-readable source of truth and carries the data mapping and
 * caveats; this is the typed copy the app compiles against. verify-evo-icons.mjs
 * asserts the two agree and that every file exists, the same way the design-token
 * suite compares design-tokens.json against the CSS.
 */
export const EVO_CONDITION_ICON_FILES = {
  day: 'icon-sun.png',
  night: 'icon-moon.png',
  trade: 'icon-trade.png',
  'random-split': 'icon-dice.png',
  'location-moss-rock': 'icon-moss-rock.png',
  'location-ice-rock': 'icon-ice-rock.png',
  'location-mount-coronet': 'icon-mount-coronet.png',
  beauty: 'icon-beauty.png',
  'party-species-remoraid': 'icon-remoraid.png',
} as const

export type EvoConditionIconKey = keyof typeof EVO_CONDITION_ICON_FILES

/**
 * Resolve one icon filename against the Vite base.
 *
 * Not exported as a bare path: BASE_URL is '/pokeapp/' in production and '/' in
 * dev, and a hardcoded leading-slash asset path in code is the exact bug that
 * broke the deployed icons once already (see the note on dataUrl in
 * src/data/loader.ts).
 */
export function evoIconUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${EVO_ICON_DIR}/${file}`
}

/** The URL for a non-gender condition icon. */
export function evoConditionIconUrl(key: EvoConditionIconKey): string {
  return evoIconUrl(EVO_CONDITION_ICON_FILES[key])
}

/*
  The three location ids and the one party species that have a painted icon.

  Named constants rather than inline numbers because the mapping is not derivable:
  the asset is named for the in-game object (the Moss Rock) while the bundle names
  the surrounding place (Eterna Forest), so only a lookup table connects them. All
  four were read out of public/data/ rather than assumed -- see the manifest.
*/
const LOCATION_ETERNA_FOREST = 8
const LOCATION_ROUTE_217 = 48
const LOCATION_MT_CORONET = 10
const SPECIES_REMORAID = 223

/** Only what the resolver needs, so it stays testable without a full detail. */
interface ConditionFields {
  trigger: string | null
  location_id: number | null
  party_species_id: number | null
  min_beauty: number | null
  time_of_day: string | null
}

/**
 * The painted icon for one evolution requirement, or null to fall back to the
 * Tabler trigger glyph.
 *
 * PRECEDENCE IS MOST-DISTINGUISHING-FIRST, matching what triggerKind already does:
 * a requirement usually sets several fields at once, and the icon should carry the
 * one that separates this branch from its siblings while the caption spells out
 * the rest. Espeon and Umbreon are both level-up-plus-friendship, so the time of
 * day is the whole story and beats the friendship glyph.
 *
 * Verified against the bundle: no detail sets two of these categories at once, so
 * the order below never actually has to break a tie. It is fixed rather than
 * arbitrary anyway, so a future generation cannot make the icon flicker between
 * two equally valid answers.
 *
 * GENDER IS RESOLVED SEPARATELY and takes precedence over everything here -- it is
 * the distinguishing field for all five details that set it. The caller checks the
 * gender module first; this function never sees the gender field at all, which is
 * what keeps those two assets out of this module.
 */
export function evoConditionIconKey(detail: ConditionFields): EvoConditionIconKey | null {
  if (detail.location_id === LOCATION_ETERNA_FOREST) return 'location-moss-rock'
  if (detail.location_id === LOCATION_ROUTE_217) return 'location-ice-rock'
  if (detail.location_id === LOCATION_MT_CORONET) return 'location-mount-coronet'
  if (detail.min_beauty != null) return 'beauty'
  if (detail.party_species_id === SPECIES_REMORAID) return 'party-species-remoraid'
  if (detail.time_of_day === 'day') return 'day'
  if (detail.time_of_day === 'night') return 'night'
  // Both plain trade and trade-holding-an-item: it is the same condition, and the
  // caption already names the item on the 14 details that carry one.
  if (detail.trigger === 'trade') return 'trade'
  return null
}

/**
 * Do these sibling branches differ by nothing the data records?
 *
 * WHY THIS IS A SHAPE TEST AND NOT A SPECIES LIST. Wurmple's split into Silcoon
 * and Cascoon is decided by the personality value, which PokeAPI does not model,
 * so both branches carry byte-identical details -- level-up at 7, every other
 * field null. Rather than hardcode that pair, the fork is detected structurally:
 * two or more siblings whose requirements are indistinguishable.
 *
 * Measured across the whole bundle, that rule fires on exactly one fork. The other
 * ten multi-branch forks all distinguish their branches (Tyrogue by relative
 * stats, Burmy and Kirlia and Snorunt by gender, Eevee's seven by stone, location
 * and time), so this is a precise description of the Wurmple case rather than a
 * net that catches innocents -- and it will pick up any future fork of the same
 * shape without an edit here.
 *
 * NOTE ON WHAT IT DOES NOT MEAN: this marks the branch point as random for
 * DISPLAY. It does not resolve which outcome a given Pokemon gets, because nothing
 * in this app tracks individual caught Pokemon -- no personality value, no IVs, no
 * per-instance state of any kind. There is nothing to resolve against.
 */
export function isIndistinguishableFork(details: unknown[]): boolean {
  if (details.length < 2) return false
  const first = JSON.stringify(details[0])
  return details.every((d) => JSON.stringify(d) === first)
}
