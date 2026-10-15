/**
 * The one pass/fail gate: `npm run check`.
 *
 *   npm run check                      typecheck + lint changed files + build +
 *                                      the suites for the areas that changed
 *   npm run check -- --fast            typecheck + lint changed files only
 *                                      (what the Stop hook runs)
 *   npm run check -- team-builder ...  also run the named suites (verify:<name>)
 *   npm run check -- --all             lint everything, run every suite
 *   npm run check -- --since tools/integration
 *                                      also count what the branch committed
 *
 * "Changed" is the working tree against HEAD, plus untracked files (plus the
 * branch's commits with --since). A feature is not done until this passes. A
 * suite in KNOWN_FAILING passes only while it fails exactly as recorded, so a
 * regression in it is never mistaken for the logged debt.
 *
 * Prettier is NOT part of the gate: 260 files predate it, and a formatter pass
 * once rewrapped five calculator files that had to be restored.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Path prefix -> suites that exercise it. First match does NOT stop the scan. */
const SUITES_BY_PATH = [
  // The stat formula's own assertions live in the damage suite (section 4).
  ['src/modules/team-builder/statMath', ['damage-calc']],
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
  ['src/data/versionGroupData', ['eggmoves']],
  ['src/data/', ['pokedex', 'species-page']],
  ['design-system/', ['ds', 'team-builder']],
  // Global CSS reaches the frozen Team Builder screens: re-measure them.
  ['src/design-tokens.css', ['ds', 'team-builder']],
  ['src/index.css', ['ds', 'team-builder']],
  ['src/App.css', ['ds', 'team-builder']],
  ['scripts/verify-', []], // a changed suite runs itself, below
];

/**
 * Suites that fail at HEAD for a logged reason (CLAUDE.md, "Known deferred
 * debt"). One counts as PASSING only while its failures are EXACTLY these: a new
 * failure fails the run, and so does one of these disappearing -- fixed debt
 * means this list needs the line removed, not silently ignoring it.
 */
const KNOWN_FAILING = {
  ds: {
    reason: 'species card 212 x 214 vs Figma 199 (owner to decide whether 214 is the reference)',
    failures: ['light', 'dark'].flatMap((theme) =>
      [
        "the card keeps Figma's 497:467 aspect",
        "its box matches Figma's 74.4% x 42.4% of the card",
        "number+name sits at Figma's y=319/467",
        "type row sits at Figma's y=368/467",
        "ability sits at Figma's y=407/467",
        'the dex number and the name share one line, as the reference shows',
      ].map((label) => `[${theme}] ${label}`),
    ),
  },
};

const ALL_SUITES = Object.keys(
  JSON.parse(execSync('npm pkg get scripts', { encoding: 'utf8' })),
)
  .filter((s) => s.startsWith('verify:'))
  .map((s) => s.slice('verify:'.length));

const args = process.argv.slice(2);
const fast = args.includes('--fast');
const all = args.includes('--all');
const sinceAt = args.indexOf('--since');
const since = sinceAt >= 0 ? args[sinceAt + 1] : null;
const named = args.filter((a, i) => !a.startsWith('--') && (sinceAt < 0 || i !== sinceAt + 1));

/**
 * The working tree against HEAD, plus untracked files -- and, with `--since
 * <ref>`, everything committed since that ref too. A tool branch is checked with
 * `--since tools/integration`: once its work is committed the tree is clean, and
 * a check of "nothing changed" would pass by running nothing.
 */
function changedFiles() {
  const out = execSync('git status --porcelain --untracked-files=all', { encoding: 'utf8' });
  const files = out
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).replace(/^"|"$/g, ''))
    .map((p) => (p.includes(' -> ') ? p.split(' -> ')[1] : p));
  if (since) {
    const committed = execSync(`git diff --name-only ${since}...HEAD`, { encoding: 'utf8' });
    files.push(...committed.split('\n').filter(Boolean));
  }
  return [...new Set(files)].filter((p) => existsSync(p));
}

function run(label, cmd, cmdArgs) {
  process.stdout.write(`\n== ${label}\n`);
  const t = Date.now();
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
  const ok = r.status === 0;
  process.stdout.write(`== ${label}: ${ok ? 'PASS' : 'FAIL'} (${((Date.now() - t) / 1000).toFixed(0)}s)\n`);
  return { ok };
}

/** A suite with logged failures: passes only if it fails exactly as recorded. */
function runKnown(suite) {
  const label = `verify:${suite}`;
  const known = KNOWN_FAILING[suite];
  process.stdout.write(`\n== ${label}\n`);
  const t = Date.now();
  const r = spawnSync('npm', ['run', label], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 1 << 26,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(out);
  // A failing check prints "  FAIL  <label>  <detail>": label and detail are
  // separated by two or more spaces.
  const failed = out
    .split('\n')
    .filter((l) => /^\s*FAIL\s{2,}/.test(l))
    .map((l) => l.trim().split(/\s{2,}/)[1]);
  const extra = failed.filter((f) => !known.failures.includes(f));
  const gone = known.failures.filter((f) => !failed.includes(f));
  const ok = extra.length === 0 && gone.length === 0;
  const note = ok
    ? `known failures only (${failed.length}): ${known.reason}`
    : [
        extra.length && `NEW: ${extra.join(' | ')}`,
        gone.length && `no longer failing (remove from KNOWN_FAILING): ${gone.join(' | ')}`,
      ]
        .filter(Boolean)
        .join('; ');
  process.stdout.write(`== ${label}: ${ok ? 'PASS' : 'FAIL'} (${((Date.now() - t) / 1000).toFixed(0)}s) -- ${note}\n`);
  return { ok, note };
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
  if (built.ok) {
    for (const s of [...suites].sort()) {
      results.push([
        `verify:${s}`,
        KNOWN_FAILING[s] ? runKnown(s) : run(`verify:${s}`, 'npm', ['run', `verify:${s}`]),
      ]);
    }
  }
}

console.log('\n== SUMMARY');
for (const [name, { ok, note }] of results) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
}
if (!fast && !suites.size) console.log('  (no suites matched the changed files)');
process.exit(results.every(([, r]) => r.ok) ? 0 : 1);
