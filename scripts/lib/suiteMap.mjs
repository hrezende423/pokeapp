/**
 * Which verify suites exercise which paths: the routing table of `npm run check`,
 * shared with the Stop hook's reminder and asserted by verify:infra.
 */

/** Path prefix -> suites that exercise it. First match does NOT stop the scan. */
export const SUITES_BY_PATH = [
  // The stat formula's own assertions live in the damage suite (section 4).
  ['src/modules/team-builder/statMath', ['damage-calc']],
  ['src/modules/team-builder/', ['team-builder', 'team-transfer', 'legal-moveset', 'collection']],
  ['src/modules/collection/', ['collection', 'tools']],
  ['src/sync/', ['team-builder', 'collection']],
  // The damage engine is shared with Team Matchup's battles.
  ['src/modules/calculators/damage/', ['team-matchup']],
  ['src/modules/calculators/', ['damage-calc', 'tools', 'collection']],
  ['src/modules/tools/', ['tools']],
  ['src/modules/battle/', ['team-matchup']],
  ['src/modules/team-matchup/', ['team-matchup', 'collection']],
  ['src/modules/typecoverage/', ['type-coverage']],
  ['src/modules/search/', ['search']],
  ['src/modules/dex/Trainer', ['trainers']],
  ['src/modules/dex/trainer', ['trainers']],
  ['src/modules/dex/', ['dexes', 'dex-filters', 'movedex', 'collection']],
  ['src/modules/pokedex/evo', ['evo-icons', 'ux']],
  ['src/modules/pokedex/', ['pokedex', 'species-page', 'eggmoves']],
  // verify-design-system asserts every tab's dropdown, line by line.
  ['src/modules/nav/', ['scroll-nav', 'dexes', 'tools', 'ds']],
  // verify-ux asserts the back stack and the evolution data: the map once hid its failure.
  ['src/modules/nav/', ['ux']],
  ['src/modules/stubs/', ['ds']],
  ['src/components/', ['scroll-nav', 'ds']],
  ['src/modules/design-system/', ['ds']],
  ['src/data/moveEra', ['legal-moveset', 'movedex']],
  ['src/data/versionGroupData', ['eggmoves']],
  ['src/data/', ['pokedex', 'species-page', 'ux']],
  ['design-system/', ['ds', 'team-builder']],
  // Global CSS reaches the frozen Team Builder screens: re-measure them.
  ['src/design-tokens.css', ['ds', 'team-builder']],
  ['src/index.css', ['ds', 'team-builder']],
  ['src/App.css', ['ds', 'team-builder']],
  ['scripts/verify-', []], // a changed suite runs itself, below
  // The static infrastructure rules (no browser): see scripts/verify-infra.mjs.
  ['scripts/', ['infra']],
  ['vite.config.ts', ['infra']],
  ['package.json', ['infra']],
  // A dependency change reaches every screen: at least boot the app and the PWA.
  ['package-lock.json', ['infra', 'app']],
  ['.nvmrc', ['infra']],
  ['init.sh', ['infra']],
  ['.gitignore', ['infra']],
  ['.github/', ['infra']],
];


/** The suites a set of changed files calls for (a changed suite runs itself; any src/ change boots the app). */
export function suitesFor(files) {
  const suites = new Set()
  for (const file of files) {
    for (const [prefix, list] of SUITES_BY_PATH) {
      if (file.startsWith(prefix)) list.forEach((s) => suites.add(s))
    }
    const own = /^scripts\/verify-(.+)\.mjs$/.exec(file)
    if (own) suites.add(own[1] === 'design-system' ? 'ds' : own[1])
  }
  if (files.some((f) => f.startsWith('src/'))) suites.add('app')
  return suites
}
