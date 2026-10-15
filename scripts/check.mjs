/**
 * The one pass/fail gate: `npm run check`.
 *
 *   npm run check                      typecheck + lint changed files + build +
 *                                      the suites for the areas that changed
 *   npm run check -- --fast            typecheck + lint changed files only
 *                                      (what the Stop hook runs)
 *   npm run check -- team-builder ...  also run the named suites (verify:<name>)
 *   npm run check -- --all             lint everything, run every suite
 *
 * "Changed" is the working tree against HEAD, plus untracked files. A feature is
 * not done until this passes; a suite listed in KNOWN_FAILING still fails the
 * run, but says why, so a regression in it is not mistaken for the logged debt.
 *
 * Prettier is NOT part of the gate: 260 files predate it, and a formatter pass
 * once rewrapped five calculator files that had to be restored.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Path prefix -> suites that exercise it. First match does NOT stop the scan. */
const SUITES_BY_PATH = [
  ['src/modules/team-builder/', ['team-builder', 'legal-moveset']],
  ['src/sync/', ['team-builder']],
  ['src/modules/calculators/', ['damage-calc']],
  ['src/modules/battle/', ['team-matchup']],
  ['src/modules/team-matchup/', ['team-matchup']],
  ['src/modules/typecoverage/', ['type-coverage']],
  ['src/modules/search/', ['search']],
  ['src/modules/dex/Trainer', ['trainers']],
  ['src/modules/dex/trainer', ['trainers']],
  ['src/modules/dex/', ['dexes', 'dex-filters', 'movedex']],
  ['src/modules/pokedex/evo', ['evo-icons', 'ux']],
  ['src/modules/pokedex/', ['pokedex', 'species-page', 'eggmoves']],
  ['src/modules/nav/', ['scroll-nav', 'dexes']],
  ['src/components/', ['scroll-nav', 'ds']],
  ['src/modules/design-system/', ['ds']],
  ['src/data/moveEra', ['legal-moveset', 'movedex']],
  ['src/data/', ['pokedex', 'species-page']],
  ['design-system/', ['ds', 'team-builder']],
  // Global CSS reaches the frozen Team Builder screens: re-measure them.
  ['src/design-tokens.css', ['ds', 'team-builder']],
  ['src/index.css', ['ds', 'team-builder']],
  ['src/App.css', ['ds', 'team-builder']],
  ['scripts/verify-', []], // a changed suite runs itself, below
];

const KNOWN_FAILING = {
  ds: '12 species-card geometry checks fail at HEAD (CLAUDE.md, deferred debt)',
};

const ALL_SUITES = Object.keys(
  JSON.parse(execSync('npm pkg get scripts', { encoding: 'utf8' })),
)
  .filter((s) => s.startsWith('verify:'))
  .map((s) => s.slice('verify:'.length));

const args = process.argv.slice(2);
const fast = args.includes('--fast');
const all = args.includes('--all');
const named = args.filter((a) => !a.startsWith('--'));

function changedFiles() {
  const out = execSync('git status --porcelain --untracked-files=all', { encoding: 'utf8' });
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).replace(/^"|"$/g, ''))
    .map((p) => (p.includes(' -> ') ? p.split(' -> ')[1] : p))
    .filter((p) => existsSync(p));
}

function run(label, cmd, cmdArgs) {
  process.stdout.write(`\n== ${label}\n`);
  const t = Date.now();
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
  const ok = r.status === 0;
  process.stdout.write(`== ${label}: ${ok ? 'PASS' : 'FAIL'} (${((Date.now() - t) / 1000).toFixed(0)}s)\n`);
  return ok;
}

// Docs never pick a suite: a CLAUDE.md beside a module is not the module.
const changed = changedFiles().filter((p) => !p.endsWith('.md'));
const lintable = changed.filter((p) => /\.(tsx?|mjs|js)$/.test(p) && !p.startsWith('_'));

const suites = new Set(named);
if (all) ALL_SUITES.forEach((s) => suites.add(s));
else if (!fast) {
  for (const file of changed) {
    for (const [prefix, list] of SUITES_BY_PATH) {
      if (file.startsWith(prefix)) list.forEach((s) => suites.add(s));
    }
    const own = /^scripts\/verify-(.+)\.mjs$/.exec(file);
    if (own) suites.add(own[1] === 'design-system' ? 'ds' : own[1]);
  }
  if (changed.some((f) => f.startsWith('src/'))) suites.add('app');
}
for (const s of suites) {
  if (!ALL_SUITES.includes(s)) {
    console.error(`Unknown suite "${s}". Known: ${ALL_SUITES.join(', ')}`);
    process.exit(1);
  }
}

const results = [];
results.push(['typecheck', run('typecheck (tsc -b)', 'npx', ['tsc', '-b'])]);
if (all) results.push(['lint', run('lint (all)', 'npx', ['eslint', '.'])]);
else if (lintable.length)
  results.push(['lint', run(`lint (${lintable.length} changed files)`, 'npx', ['eslint', ...lintable.map((p) => `"${p}"`)])]);

if (suites.size) {
  // Preview-server suites test dist/, so it has to be current.
  const built = run('build (vite)', 'npx', ['vite', 'build']);
  results.push(['build', built]);
  if (built) {
    for (const s of [...suites].sort()) {
      results.push([`verify:${s}`, run(`verify:${s}`, 'npm', ['run', `verify:${s}`])]);
    }
  }
}

console.log('\n== SUMMARY');
for (const [name, ok] of results) {
  const known = KNOWN_FAILING[name.replace('verify:', '')];
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && known ? `  (known: ${known})` : ''}`);
}
if (!fast && !suites.size) console.log('  (no suites matched the changed files)');
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
