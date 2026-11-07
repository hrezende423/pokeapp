/**
 * `npm run status`: the project's metrics in one table. Reads files and git only:
 * no server, no browser, a second or two.
 *
 *   Suites passing      the suites that passed in the last non-fast `npm run check`
 *                       THIS worktree recorded, of the suites that exist
 *   Unlogged failures   suites that failed in that run and that KNOWN_FAILING and
 *                       FLAKY do not name
 *   Logged debt         root CLAUDE.md debt bullets + KNOWN_FAILING + FLAKY
 *   Unreleased commits  HEAD ahead of origin/main
 *   Data coverage       public/data/meta.json counts
 *   Token adoption      share of var(--x) references in src/ whose name is a token
 *                       of design-system/dist/tokens.css. Module-local scales
 *                       (--tb-*, --dp-*, --tm-*, ...) and runtime vars are counted
 *                       as "local" and left out of the ratio
 *   Rule violations     var(--accent...) references in src/ (the rule allows 2 USES:
 *                       the active nav item and the selected tab), :hover rules that
 *                       set a background, and native <select> elements in src/
 *   PRD Must done       docs/features.json: passing Must rows / all Must rows,
 *                       weighted by each row's "weight" (default 1). A row with no
 *                       "priority" counts as Must
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim()
const read = (p) => readFileSync(p, 'utf8')
const tracked = git('ls-files').split('\n')
const rows = []
const row = (metric, value, note = '') => rows.push([metric, String(value), note])

// ---- suites
const scripts = JSON.parse(read('package.json')).scripts
const suites = Object.keys(scripts).filter((s) => s.startsWith('verify:'))
const runFile = git('rev-parse', '--git-path', 'pokeapp-last-run.json')
const state = existsSync(runFile) ? JSON.parse(read(runFile)) : null
const suiteResults = (state?.results ?? []).filter((r) => r.name.startsWith('verify:'))
if (state) {
  const scope = state.all ? '--all' : state.since ? `--since ${state.since}` : 'changed files'
  row(
    'Suites passing',
    `${suiteResults.filter((r) => r.ok).length} of ${suiteResults.length} run (${suites.length} exist)`,
    `last gate ${state.head.slice(0, 7)} (${scope}), ${state.at.slice(0, 16).replace('T', ' ')}`,
  )
} else row('Suites passing', `? of ${suites.length}`, 'no gate recorded in this worktree: run npm run check')

// ---- debt
const gate = read('scripts/check.mjs')
const objectKeys = (name) => {
  const m = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`).exec(gate)
  return m ? [...m[1].matchAll(/^\s*'?([\w-]+)'?\s*:/gm)].map((x) => x[1]) : []
}
const known = objectKeys('KNOWN_FAILING')
const flaky = objectKeys('FLAKY')
const claude = read('CLAUDE.md')
const debtSection = /## Known deferred debt[\s\S]*?(?=\n## )/.exec(claude)?.[0] ?? ''
const debtItems = (debtSection.match(/^- /gm) ?? []).length
const unlogged = suiteResults.filter(
  (r) => !r.ok && !known.includes(r.name.slice('verify:'.length)) && !flaky.includes(r.name.slice('verify:'.length)),
)
row(
  'Unlogged failures',
  state ? unlogged.length : '?',
  state ? unlogged.map((r) => r.name).join(', ') || 'none in the last gate' : 'no recorded gate',
)
row(
  'Logged debt',
  debtItems + known.length + flaky.length,
  `CLAUDE.md ${debtItems}, KNOWN_FAILING ${known.length}, FLAKY ${flaky.length}${flaky.length ? ` (${flaky.join(', ')})` : ''}`,
)

// ---- release
let ahead = '?'
try {
  ahead = git('rev-list', '--count', 'origin/main..HEAD')
} catch {
  /* no origin/main fetched */
}
row('Unreleased commits', ahead, 'HEAD ahead of origin/main')

// ---- data
const meta = JSON.parse(read('public/data/meta.json'))
const c = meta.counts ?? {}
row('Data coverage', `${c.species} species, ${c.moves} moves, ${c.items} items, ${c.abilities} abilities`, `${c.version_groups} version groups, ${c.learnset_partitions} learnset and ${c.encounter_partitions} encounter partitions`)

// ---- tokens
const distNames = new Set([...read('design-system/dist/tokens.css').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
const srcFiles = tracked.filter((p) => p.startsWith('src/') && /\.(css|tsx?)$/.test(p))
let dist = 0
let other = 0
let local = 0
const LOCAL = /^--(tb|dp|tm|col|calc|ds|sb|scroll|dex|tool|tools|tc|evo|app|nav|layout)-/
for (const p of srcFiles) {
  for (const m of read(p).matchAll(/var\((--[\w-]+)/g)) {
    if (distNames.has(m[1])) dist++
    else if (LOCAL.test(m[1])) local++
    else other++
  }
}
row('Token adoption', `${((100 * dist) / (dist + other || 1)).toFixed(1)}%`, `${dist} dist-token references, ${other} legacy, ${local} module-local left out`)

// ---- rule violations
let accent = 0
let hoverBg = 0
let nativeSelect = 0
for (const p of srcFiles) {
  const text = read(p)
  accent += (text.match(/var\(--(color-)?accent\b[\w-]*/g) ?? []).length
  if (p.endsWith('.css')) {
    for (const m of text.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)) {
      if (/background(-color)?\s*:/.test(m[2])) hoverBg++
    }
  }
  if (p.endsWith('.tsx')) nativeSelect += (text.match(/<select\b/g) ?? []).length
}
row('var(--accent) references', accent, 'the rule allows 2 uses (active nav, selected tab); retired uses wait for each screen\'s migration')
row(':hover with a background', hoverBg, 'rule: no hover backgrounds')
row('Native <select>', nativeSelect, 'ds SelectField / SearchSelect are the standard')

// ---- PRD
const features = existsSync('docs/features.json') ? JSON.parse(read('docs/features.json')) : []
const must = features.filter((f) => (f.priority ?? 'Must') === 'Must')
const w = (f) => (typeof f.weight === 'number' ? f.weight : 1)
const total = must.reduce((s, f) => s + w(f), 0)
const done = must.filter((f) => f.passes).reduce((s, f) => s + w(f), 0)
row('PRD Must done', `${total ? ((100 * done) / total).toFixed(1) : '0.0'}%`, `${must.filter((f) => f.passes).length} of ${must.length} Must rows in docs/features.json`)

// ---- print
const widths = [0, 1].map((i) => Math.max(...rows.map((r) => r[i].length), i ? 5 : 6))
const line = (a, b, n) => `| ${a.padEnd(widths[0])} | ${b.padEnd(widths[1])} | ${n}`
console.log(line('Metric', 'Value', 'Note'))
console.log(`|${'-'.repeat(widths[0] + 2)}|${'-'.repeat(widths[1] + 2)}|------`)
for (const r of rows) console.log(line(...r))
