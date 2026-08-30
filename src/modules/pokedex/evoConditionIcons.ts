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
