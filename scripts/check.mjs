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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { browserPreflight, CHROME_HELP } from './lib/browser.mjs';
import { suitesFor } from './lib/suiteMap.mjs';

// The routing table (path prefix -> suites) lives in lib/suiteMap.mjs.

/**
 * Suites that fail at HEAD for a logged reason (CLAUDE.md, "Known deferred
 * debt"). One counts as PASSING only while its failures are EXACTLY these: a new
 * failure fails the run, and so does one of these disappearing -- fixed debt
 * means this list needs the line removed, not silently ignoring it.
 */
const KNOWN_FAILING = {};

/**
 * Suites that fail INTERMITTENTLY for an undiagnosed reason, retried up to three
 * times. Every failed attempt is still printed; a pass is labelled with the
 * attempt it took. Each entry is deferred debt (CLAUDE.md), not a fix.
 */
const FLAKY = {
  // Empty since 2026-11-07. scroll-nav §2 was here for months; the test, not the
  // app, was wrong: it clicked a card below the fold, so Playwright's
  // scroll-into-view moved the grid (to 1455) before the click and the app saved
  // that real scroll. Forced, it failed 3/3 at 1455; fixed, it passed 5/5.
};

const ALL_SUITES = Object.keys(
  JSON.parse(execSync('npm pkg get scripts', { encoding: 'utf8' })),
)
  .filter((s) => s.startsWith('verify:'))
  .map((s) => s.slice('verify:'.length));

const args = process.argv.slice(2);
const fast = args.includes('--fast');
const uncheckedOnly = args.includes('--unchecked');
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

/*
  THE LAST PASSING GATE, per worktree (inside the git dir, never committed): the
  HEAD it passed at, and whether it was --all. `--unchecked` (the Stop hook's
  reminder) lists the suites whose areas changed since then, so "the fast gate
  passed" can never read as "this branch is checked".
*/
const STATE_FILE = execSync('git rev-parse --git-path pokeapp-last-check.json', { encoding: 'utf8' }).trim();
const LAST_RUN_FILE = execSync('git rev-parse --git-path pokeapp-last-run.json', { encoding: 'utf8' }).trim();
function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}
function uncheckedReminder() {
  const state = readState();
  let files = [];
  let known = false;
  if (state?.head) {
    try {
      files = execSync(`git diff --name-only ${state.head}`, { encoding: 'utf8' }).split('\n').filter(Boolean);
      known = true;
    } catch {
      /* the recorded commit is gone (rebased): treat as never checked */
    }
  }
  const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean);
  if (!known) {
    files = execSync('git diff --name-only HEAD', { encoding: 'utf8' }).split('\n').filter(Boolean);
  }
  const areas = [...suitesFor([...new Set([...files, ...untracked])].filter((p) => !p.endsWith('.md')))].sort();
  if (!areas.length) return null;
  const since = known ? `since the last passing gate (${state.head.slice(0, 7)}${state.all ? ', --all' : ''})` : '(no passing gate recorded in this worktree)';
  return `== unchecked ${since}: ${areas.join(', ')}. Run \`npm run check -- --since <base>\`; before merging, \`npm run check -- --all\`.`;
}
if (uncheckedOnly) {
  const line = uncheckedReminder();
  if (line) console.log(line);
  process.exit(0);
}

// Docs never pick a suite: a CLAUDE.md beside a module is not the module.
const changed = changedFiles().filter((p) => !p.endsWith('.md'));
const lintable = changed.filter((p) => /\.(tsx?|mjs|js)$/.test(p) && !p.startsWith('_'));

const suites = new Set(named);
if (all) ALL_SUITES.forEach((s) => suites.add(s));
else if (!fast) {
  suitesFor(changed).forEach((s) => suites.add(s));
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

/*
  Every browser suite launches SYSTEM Chrome (lib/browser.mjs), checked once here,
  before the build, with a message that says what to do.
*/
const BROWSERLESS = new Set(['infra', 'curated', 'store', 'entities']);
if ([...suites].some((s) => !BROWSERLESS.has(s))) {
  const problem = await browserPreflight();
  if (problem) {
    console.error(
      `\n== browser pre-flight: FAIL\nChrome did not start:\n  ${problem}\n${CHROME_HELP}\n`,
    );
    process.exit(1);
  }
  process.stdout.write('\n== browser pre-flight: PASS (system Chrome starts)\n');
}

if (suites.size) {
  // Preview-server suites test dist/, so it has to be current.
  const built = run('build (vite)', 'npx', ['vite', 'build']);
  results.push(['build', built]);
  if (built.ok) {
    for (const s of [...suites].sort()) {
      if (KNOWN_FAILING[s]) {
        results.push([`verify:${s}`, runKnown(s)]);
        continue;
      }
      const attempts = FLAKY[s] ? 3 : 1;
      let r = { ok: false };
      let attempt = 0;
      while (!r.ok && attempt < attempts) {
        attempt++;
        r = run(`verify:${s}${attempts > 1 ? ` (attempt ${attempt}/${attempts})` : ''}`, 'npm', ['run', `verify:${s}`]);
      }
      if (FLAKY[s] && attempt > 1) r.note = `flaky, ${r.ok ? `passed on attempt ${attempt}` : 'failed every attempt'}: ${FLAKY[s]}`;
      results.push([`verify:${s}`, r]);
    }
  }
}

console.log('\n== SUMMARY');
for (const [name, { ok, note }] of results) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
}
if (!fast && !suites.size) console.log('  (no suites matched the changed files)');
const passed = results.every(([, r]) => r.ok);
if (!fast) {
  const head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const record = {
    head,
    all,
    since,
    suites: [...suites].sort(),
    results: results.map(([name, r]) => ({ name, ok: r.ok })),
    at: new Date().toISOString(),
  };
  // Every run, pass or fail, for `npm run status`; a passing one also for the reminder.
  writeFileSync(LAST_RUN_FILE, JSON.stringify(record, null, 2));
  if (passed) writeFileSync(STATE_FILE, JSON.stringify(record, null, 2));
}
if (fast) {
  const line = uncheckedReminder();
  if (line) console.log(`\n${line}`);
}
process.exit(passed ? 0 : 1);
