/**
 * Generate the Battle Frontier mockups, public/mockups/frontier-{facilities,brains,
 * tracker,sets}.html: static review pages for the owner to mark up before the build.
 *
 * REAL DATA ONLY. Every rule, set, trainer and Brain comes from the frozen loader
 * (src/modules/battle-frontier/data/, bundled in memory as verify:frontier-data
 * does); names come from the eager bundle; the tracker's runs are built from the
 * owner's log, docs/fixtures/bf-tracker.xlsx. Nothing here is app code: the
 * fixture-to-run mapping below is the mockup's, not an importer.
 *
 * Self-contained files, as the other mockups: the full design-system/dist/tokens.css
 * inlined, plus the two self-hosted faces (IBM Plex Sans, Martian Mono; latin
 * subsets) as data URIs, so the preview renders the real type.
 *
 *   node scripts/mockups/frontier.mjs
 */
import { build } from 'esbuild'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSheet } from '../lib/xlsx.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))

// ------------------------------------------------------------------ the loader

globalThis.fetch = async (url) => {
  const path = join(ROOT, 'public', String(url).replace(/^\//, ''))
  return existsSync(path) ? new Response(readFileSync(path)) : new Response('', { status: 404 })
}
const bundled = await build({
  stdin: {
    contents: [
      "export * from './src/modules/battle-frontier/data/index.ts'",
      "export { initDataLayer } from './src/data/index.ts'",
    ].join('\n'),
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
  define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, PROD: true, MODE: 'mockup' }) },
})
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
await api.initDataLayer()
const fd = await api.loadFrontierData(3)
if (!fd) throw new Error('the loader returned nothing for Gen 3')
/** The rules file the loader reads; only its trainer-id IV slices are read directly (Trainers view). */
const RULES = json('public/data/frontier/emerald.json')

// ------------------------------------------------------------------ names

const byId = (file) => new Map(Object.values(json(`public/data/${file}`)).map((r) => [r.id, r]))
const SPECIES = byId('species.json')
const ITEMS = byId('items.json')
const NATURES = byId('natures.json')
const MOVES = byId('moves.json')
const spName = (id) => SPECIES.get(id)?.display_name ?? `#${id}`
const itemName = (id) => (id == null ? '—' : (ITEMS.get(id)?.display_name ?? `item ${id}`))
const natureName = (id) => (id == null ? '—' : (NATURES.get(id)?.display_name ?? '—'))
const moveName = (id) => MOVES.get(id)?.display_name ?? `move ${id}`

const FAC = Object.fromEntries(fd.facilities().map((f) => [f.id, f]))
const BRAIN = Object.fromEntries(fd.brains().map((b) => [b.facility, b]))
const ORDER = ['tower', 'dome', 'factory', 'palace', 'arena', 'pike', 'pyramid']
const FORMAT = { singles: 'Singles', doubles: 'Doubles', multi: 'Multi', 'link-multi': 'Link Multi' }
const LEVEL = { lv50: 'Lv50', open: 'Open Level' }
const STATS = [
  ['hp', 'HP'],
  ['attack', 'Atk'],
  ['defense', 'Def'],
  ['special-attack', 'SpA'],
  ['special-defense', 'SpD'],
  ['speed', 'Spe'],
]

// ------------------------------------------------------------------ html helpers

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const num = (n) => `<span class="mono">${esc(Number(n).toLocaleString('en-US'))}</span>`
const link = (id) =>
  id == null
    ? '<span class="unknown">Unknown</span>'
    : `<a class="link" href="#species-${id}" title="Opens ${esc(spName(id))} in the Pokédex">${esc(spName(id))}</a>`
/** EVs in game order: mono digits, muted stat labels. */
const evHtml = (evs) =>
  STATS.filter(([k]) => evs?.[k])
    .map(([k, l]) => `<span class="nw">${num(evs[k])} <span class="muted">${l}</span></span>`)
    .join(' / ') || '—'
const range = (a, b, hash = '') => `<span class="nw">${hash}${num(a)}–${hash}${num(b)}</span>`
/** More than two stacked children: position them by named area (root rule). */
const areas = (layout, pairs) =>
  `<div class="stack" data-layout="${layout}" style="grid-template-areas:${pairs.map(([a]) => `'${a}'`).join(' ')}">${pairs.map(([a, html]) => `<div style="grid-area:${a}">${html}</div>`).join('')}</div>`
const ICON = {
  back: '<path d="M5 12l14 0"/><path d="M5 12l6 6"/><path d="M5 12l6 -6"/>',
  plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
  search: '<path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/>',
  square: '<path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"/>',
  check: '<path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"/><path d="M9 12l2 2l4 -4"/>',
  chevron: '<path d="M9 6l6 6l-6 6"/>',
  x: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
}
const icon = (name) =>
  `<svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`
const symbolToggle = (label, on) =>
  `<button class="sym" type="button" aria-pressed="${on}">${icon(on ? 'check' : 'square')}<span>${esc(label)}</span></button>`

/** The streak-table value as the facility counts it (HTML: mono numbers). */
function appearanceHtml(a) {
  if (a.unit === 'tournament') return `tournament ${num(a.unitNumber)} final (battle ${num(a.battle)})`
  if (a.unit === 'room') return `room ${num(a.battle)}`
  if (a.unit === 'floor') return `the top, after floor ${num(a.battle)}`
  return `battle ${num(a.battle)}`
}
const repeatHtml = (b) =>
  b.silver.unit === 'tournament'
    ? `every ${num(b.streak.repeat)} tournaments after`
    : `every ${num(b.streak.repeat)} ${b.silver.unit}s after`

/** The label a logged battle number gets (the tracker stores the number as logged). */
function battleLabel(facility, n) {
  if (facility === 'dome') return `Tournament ${Math.ceil(n / 4)} · ${['Round 1', 'Round 2', 'Semifinal', 'Final'][(n - 1) % 4]}`
  if (facility === 'pike') return `Challenge ${Math.ceil(n / 14)} · room ${((n - 1) % 14) + 1}`
  if (facility === 'pyramid') return `Challenge ${Math.ceil(n / 7)} · floor ${((n - 1) % 7) + 1}`
  return `Set ${Math.ceil(n / 7)} · battle ${((n - 1) % 7) + 1}`
}
/** Logged battle number -> the loader's streak (wins before it, in the facility's own unit). */
const loaderStreak = (facility, n) => (facility === 'dome' ? Math.floor((n - 1) / 4) : n - 1)

// ------------------------------------------------------------------ the owner's log

const rows = readSheet(join(ROOT, 'docs/fixtures/bf-tracker.xlsx'))
const header = rows.findIndex((row) => row.cells.A === 'attempt')
const data = rows.slice(header + 1).filter((row) => /^\d+$/.test(row.cells.A ?? ''))
const gap = data.findIndex((row, i) => i > 0 && row.r !== data[i - 1].r + 1)
const sp = (cell) => (cell && cell !== '-' ? fd.resolveSpecies(cell) : null)
const domeTeamCell = rows.find((row) => /^## dome/.test(row.cells.B ?? '')).cells.H
const domeTeam = [...domeTeamCell.matchAll(/([ABC]) ([^,]+)/g)].map((m) => sp(m[2].trim()))

/**
 * Mockup assumptions (results.md, question batch): the log has no W/L column, so
 * every battle is a win except the last battle of a run that was followed by
 * another run (a loss); the last run of a block is ongoing. Both runs are singles
 * (a Brain appeared) at Lv50 (Noland's team fits the Lv50 draw).
 */
function makeRuns(facility, block, extra) {
  const attempts = [...new Set(block.map((row) => row.cells.A))]
  return attempts.map((a, i) => {
    const battles = block.filter((row) => row.cells.A === a)
    const last = i === attempts.length - 1
    return {
      facility,
      format: 'singles',
      levelMode: 'lv50',
      attempt: Number(a),
      ongoing: last,
      battles: battles.map((row, j) => ({
        n: Number(row.cells.B),
        opponents: ['C', 'D', 'E'].map((c) => sp(row.cells[c])),
        raw: ['C', 'D', 'E'].map((c) => row.cells[c] ?? ''),
        result: !last && j === battles.length - 1 ? 'L' : 'W',
        logBrain: Object.values(row.cells).find((v) => v === 'silver' || v === 'gold') ?? null,
        ...extra(row),
      })),
    }
  })
}
const domeRuns = makeRuns('dome', data.slice(0, gap), (row) => ({
  pair: [...(row.cells.J ?? '')].map((c) => 'abc'.indexOf(c)),
  dropped: row.cells.I ? Number(row.cells.I) : null,
}))
const factoryRuns = makeRuns('factory', data.slice(gap), (row) => ({ rentals: ['F', 'G', 'H'].map((c) => sp(row.cells[c])) }))

/** Brain flags from the loader, symbols carried across runs of a facility in order. */
function flagBrains(runs) {
  let symbols = 0
  for (const run of runs) {
    run.symbolsAtStart = symbols
    for (const b of run.battles) {
      const pool = fd.trainerPoolForStreak({
        facility: run.facility,
        format: run.format,
        levelMode: run.levelMode,
        streak: loaderStreak(run.facility, b.n),
        symbols,
      })
      const due = pool.brain && (run.facility !== 'dome' || b.n % 4 === 0) ? pool.brain : null
      b.brain = due
      if (Boolean(due) !== Boolean(b.logBrain) || (due && due.symbol !== b.logBrain)) {
        throw new Error(`${run.facility} run ${run.attempt} battle ${b.n}: loader says ${due?.symbol ?? 'no Brain'}, log says ${b.logBrain ?? 'none'}`)
      }
      if (due && b.result === 'W') symbols = due.symbol === 'silver' ? Math.max(symbols, 1) : 2
    }
    run.symbolsAtEnd = symbols
  }
}
flagBrains(domeRuns)
flagBrains(factoryRuns)

/** Factory rentals: a draft at every 7-battle boundary (factory_generaterentalmons), swaps between. */
function rentalEvents(run) {
  const events = []
  run.battles.forEach((b, i) => {
    const prev = run.battles[i - 1]
    if ((b.n - 1) % 7 === 0) events.push({ n: b.n, kind: 'draft', team: b.rentals })
    else if (prev && prev.rentals.join() !== b.rentals.join()) {
      events.push({
        n: b.n,
        kind: 'swap',
        out: prev.rentals.filter((x) => !b.rentals.includes(x)),
        in: b.rentals.filter((x) => !prev.rentals.includes(x)),
      })
    }
  })
  return events
}

const wins = (run) => run.battles.filter((b) => b.result === 'W').length
/** Sets completed in a run: whole sets of won battles (Dome: tournaments). */
const setsCompleted = (run) => Math.floor(wins(run) / (run.facility === 'dome' ? 4 : 7))

/** BP from bpAward for every completed set, with the Brain bonus where the set ended on a Brain. */
function bpEntries(run) {
  const per = run.facility === 'dome' ? 4 : 7
  return Array.from({ length: setsCompleted(run) }, (_, k) => {
    const lastBattle = run.battles.find((b) => b.n === (k + 1) * per)
    const award = fd.bpAward({ facility: run.facility, format: run.format, completedSets: k + 1, brain: !!lastBattle?.brain })
    return { run, set: k + 1, battle: (k + 1) * per, brain: lastBattle?.brain ?? null, ...award }
  })
}
const allRuns = [...domeRuns, ...factoryRuns]
const ledger = allRuns.flatMap(bpEntries)
let balance = 0
for (const e of ledger) e.balance = balance = fd.addBattlePoints(balance, e.points)

// ------------------------------------------------------------------ page shell

const tokensCss = readFileSync(join(ROOT, 'design-system/dist/tokens.css'), 'utf8')
const font = (file) => readFileSync(join(ROOT, 'src/assets/fonts', file)).toString('base64')
const fontCss = `
@font-face{font-family:'IBM Plex Sans';font-style:normal;font-weight:100 700;font-display:swap;src:url(data:font/woff2;base64,${font('ibm-plex-sans-latin.woff2')}) format('woff2')}
@font-face{font-family:'Martian Mono';font-style:normal;font-weight:100 800;font-display:swap;src:url(data:font/woff2;base64,${font('martian-mono-latin.woff2')}) format('woff2')}`

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:var(--color-bg-canvas);color:var(--color-text-default);font-family:var(--font-family-sans);font-size:var(--font-style-body-size);line-height:var(--font-style-body-line-height);letter-spacing:var(--font-style-body-letter-spacing)}
h1,h2,h3,h4,p{margin:0;font-weight:var(--font-weight-regular)}
.mockup{max-width:1440px;margin:0 auto;padding:var(--space-8) var(--space-6);display:grid;gap:var(--space-16)}
.intro{display:grid;gap:var(--space-2)}
.intro h1{font-size:var(--font-style-h2-size);line-height:var(--font-style-h2-line-height);letter-spacing:var(--font-tracking-heading)}
.state{display:grid;gap:var(--space-3);min-width:0}
.state>h2{font-size:var(--font-style-h4-size);line-height:var(--font-style-h4-line-height);letter-spacing:var(--font-tracking-heading);padding-bottom:var(--space-2);border-bottom:var(--border-width-thin) solid var(--color-border-hairline)}
.note{color:var(--color-text-muted);font-size:var(--font-style-caption-size);line-height:var(--font-style-caption-line-height);max-width:90ch}
.frame{display:grid;grid-template-areas:"bar" "scroll";border:var(--border-width-thin) solid var(--color-border-hairline);border-radius:var(--radius-lg);min-width:0}
.frame.narrow{max-width:390px}

/* app bar: the real NavBar's look, with the new tab between Team Building and Tools */
.appbar{grid-area:bar;display:grid;grid-template-areas:"back brand tabs search filter account";grid-template-columns:auto auto minmax(0,1fr) auto auto auto;align-items:center;column-gap:var(--space-4);padding:var(--space-3) var(--space-6);border-bottom:var(--border-width-thin) solid var(--color-border-hairline);min-width:0}
.appbar .back{grid-area:back;display:grid;color:var(--color-text-muted)}
.appbar .brand{grid-area:brand;font-weight:var(--font-weight-semibold)}
.appbar .tabs{grid-area:tabs;display:flex;flex-wrap:wrap;column-gap:var(--space-3);min-width:0}
.appbar .search{grid-area:search;font-size:var(--font-style-caption-size);color:var(--color-text-muted)}
.appbar .filter{grid-area:filter;color:var(--color-text-disabled)}
.appbar .account{grid-area:account}
.frame.narrow .appbar{grid-template-areas:"back brand account" "tabs tabs tabs";grid-template-columns:auto minmax(0,1fr) auto;row-gap:var(--space-2)}
.frame.narrow .appbar .search,.frame.narrow .appbar .filter{display:none}
.tab{position:relative}
.tab>a{color:var(--color-text-muted);text-decoration:none;white-space:nowrap}
.tab>a[aria-current="page"]{color:var(--color-accent-default);font-weight:var(--font-weight-semibold)}
.menu{position:absolute;top:100%;left:0;margin-top:var(--space-2);display:grid;width:max-content;background:var(--color-bg-surface);border:var(--border-width-thin) solid var(--color-border-hairline);border-radius:var(--radius-md)}
.menu a{padding:var(--space-2) var(--space-4) var(--space-2) var(--space-3);color:var(--color-text-default);text-decoration:none;border-bottom:var(--border-width-thin) solid var(--color-border-hairline)}
.menu a:last-child{border-bottom:0}
.menu a[aria-current="page"]{font-weight:var(--font-weight-semibold)}

/* the module root: a ScrollArea (nothing clipped: wide content scrolls inside it) */
.scroll{grid-area:scroll;overflow:auto;min-width:0;container:frontier / inline-size}
.page{display:grid;gap:var(--space-8);padding:var(--space-6);min-width:0}
.page-head{display:grid;grid-template-areas:"title scope actions";grid-template-columns:auto minmax(0,1fr) auto;align-items:baseline;column-gap:var(--space-4)}
.page-head h1{grid-area:title;font-size:var(--font-style-h4-size);line-height:var(--font-style-h4-line-height);letter-spacing:var(--font-tracking-heading)}
.page-head .scope{grid-area:scope;color:var(--color-text-muted);font-size:var(--font-style-caption-size)}
.page-head .actions{grid-area:actions;display:flex;column-gap:var(--space-2)}
.sec{font-size:var(--font-style-caption-size);line-height:var(--font-style-caption-line-height);letter-spacing:var(--font-tracking-caps);text-transform:uppercase;color:var(--color-text-muted);padding-bottom:var(--space-2)}
.name{font-size:var(--font-style-name-size);line-height:var(--font-style-name-line-height);letter-spacing:var(--font-tracking-name)}
.muted{color:var(--color-text-muted)}
.mono{font-family:var(--font-family-mono);font-variant-numeric:tabular-nums;font-size:var(--font-style-data-size);letter-spacing:var(--font-tracking-data)}
.cap{font-size:var(--font-style-caption-size);line-height:var(--font-style-caption-line-height);color:var(--color-text-muted)}
.notice{padding:var(--space-8) 0;color:var(--color-text-muted)}

/* links: a clickable label with a hairline, never a button shape */
.link{color:inherit;text-decoration:none;border-bottom:var(--border-width-thin) solid transparent}
.link:hover{border-bottom-color:var(--color-border-strong)}
.unknown{color:var(--color-text-muted)}
.sat-out{color:var(--color-text-muted)}

/* key-value rows: the hairline is the row's; no row gap (hairline-band rule) */
.kv{display:grid;margin:0}
.kv>div{display:grid;grid-template-areas:"k v";grid-template-columns:minmax(0,1fr) minmax(0,2fr);column-gap:var(--space-4);padding-block:var(--space-2);border-bottom:var(--border-width-thin) solid var(--color-border-hairline)}
.kv dt{grid-area:k;color:var(--color-text-muted)}
.kv dd{grid-area:v;margin:0}

/* tables */
.tw{overflow-x:auto;min-width:0}
.t{width:100%;border-collapse:collapse}
.t th{font-size:var(--font-style-label-caps-size);line-height:var(--font-style-label-caps-line-height);letter-spacing:var(--font-tracking-caps);text-transform:uppercase;font-weight:var(--font-weight-regular);color:var(--color-text-muted);text-align:left;white-space:nowrap;padding:var(--space-2) var(--space-4) var(--space-2) 0;border-bottom:var(--border-width-thin) solid var(--color-border-hairline)}
.t td{padding:var(--space-2) var(--space-4) var(--space-2) 0;border-bottom:var(--border-width-thin) solid var(--color-border-hairline);vertical-align:top}
.t .r{text-align:right}
.nw{white-space:nowrap}
.t tr.group td{padding-top:var(--space-6);border-bottom-color:var(--color-border-strong)}

/* actions and fields */
button{font:inherit;letter-spacing:inherit;color:var(--color-text-default);background:none;border:0;padding:0;cursor:pointer}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:var(--border-width-thick) solid var(--color-border-focus);outline-offset:var(--space-1)}
.ghost{display:inline-flex;align-items:center;column-gap:var(--space-1);height:var(--d-field);padding:0 var(--space-3);font-weight:var(--font-weight-semibold);font-size:var(--font-style-label-size)}
.ghost:hover{font-weight:var(--font-weight-bold)}
.ic{flex:none}
.uf{font:inherit;letter-spacing:inherit;color:var(--color-text-default);background:none;border:0;border-bottom:var(--border-width-thin) solid var(--color-border-strong);border-radius:0;height:var(--d-field);padding:0 var(--space-1);min-width:0;width:100%}
.uf::placeholder{color:var(--color-text-disabled)}
.uf.num{font-family:var(--font-family-mono);font-variant-numeric:tabular-nums;font-size:var(--font-style-data-size)}
.field{display:grid;row-gap:var(--space-1);min-width:0}
.sym{display:inline-flex;align-items:center;column-gap:var(--space-1)}
.sym[aria-pressed="true"]{font-weight:var(--font-weight-semibold)}
.vtabs{display:flex;column-gap:var(--space-6);border-bottom:var(--border-width-thin) solid var(--color-border-hairline)}
.vtabs button{padding:var(--space-2) 0;color:var(--color-text-muted);border-bottom:var(--border-width-thick) solid transparent;margin-bottom:calc(-1 * var(--border-width-thin))}
.vtabs button[aria-selected="true"]{color:var(--color-accent-default);font-weight:var(--font-weight-semibold);border-bottom-color:var(--color-accent-default)}
.textfilter{display:inline-flex;align-items:center;column-gap:var(--space-1)}
.textfilter[aria-pressed="true"]{font-weight:var(--font-weight-semibold)}

/* species picker: a popover is --color-bg-surface plus a hairline, nothing else */
.picker{position:relative;min-width:0}
.picker ul{position:absolute;top:100%;left:0;margin:var(--space-1) 0 0;padding:0;list-style:none;width:max-content;min-width:100%;background:var(--color-bg-surface);border:var(--border-width-thin) solid var(--color-border-hairline);border-radius:var(--radius-md)}
.picker li{padding:var(--space-2) var(--space-3);border-bottom:var(--border-width-thin) solid var(--color-border-hairline)}
.picker li:last-child{border-bottom:0}
.picker li[aria-selected="true"]{font-weight:var(--font-weight-semibold)}

/* facilities */
.fac-grid{display:grid;grid-template-areas:"tower dome" "factory palace" "arena pike" "pyramid ." "shared shared";grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-12) var(--space-8)}
.fac{display:grid;grid-template-areas:"name" "rule" "facts";row-gap:var(--space-3);min-width:0;align-content:start}
.fac .name{grid-area:name}.fac .rule{grid-area:rule}.fac .kv{grid-area:facts}
.menu-room{height:calc(var(--space-16) * 2)}
.shared{grid-area:shared;display:grid;grid-template-areas:"title title" "symbols levels" "banned bprules" "shop shop";grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-8);padding-top:var(--space-8);border-top:var(--border-width-thin) solid var(--color-border-strong)}
.shop{grid-area:shop;display:grid;grid-template-areas:"d1 d2 vit hold";grid-template-columns:repeat(4,minmax(0,1fr));column-gap:var(--space-6)}
.banned{display:flex;flex-wrap:wrap;gap:var(--space-2) var(--space-4)}

/* brains */
.brain{display:grid;grid-template-areas:"head" "when" "silver" "gold";row-gap:var(--space-4);padding-block:var(--space-8);border-bottom:var(--border-width-thin) solid var(--color-border-strong);min-width:0}
.brain:first-child{padding-top:0}
.brain:last-child{border-bottom:0}
.brain-list{display:grid;min-width:0}
.brain-head .name{grid-area:name}
.brain-head{grid-area:head;display:grid;grid-template-areas:"name meta";grid-template-columns:auto minmax(0,1fr);column-gap:var(--space-3);align-items:baseline}
.brain-head .meta{grid-area:meta}

/* tracker */
.tracker{display:grid;grid-template-areas:"head head" "main side";grid-template-columns:minmax(0,3fr) minmax(0,1fr);gap:var(--space-8);min-width:0}
.tracker>.page-head{grid-area:head}
.tracker>.main{grid-area:main;display:grid;row-gap:var(--space-12);align-content:start;min-width:0}
.tracker>.side{grid-area:side;display:grid;row-gap:var(--space-8);align-content:start;min-width:0}
.run-head{display:grid;grid-template-areas:"back back" "title facts";grid-template-columns:auto minmax(0,1fr);row-gap:var(--space-2);column-gap:var(--space-6);align-items:baseline}
.run-head .backlink{grid-area:back;justify-self:start}
.run-head h1{grid-area:title;font-size:var(--font-style-h4-size);line-height:var(--font-style-h4-line-height)}
.run-head .facts{grid-area:facts;color:var(--color-text-muted)}
.addrow{display:grid;grid-template-areas:"n label s1 s2 s3 result" ". . note note note .";row-gap:var(--space-3);grid-template-columns:auto auto repeat(3,minmax(0,1fr)) auto;column-gap:var(--space-4);align-items:end;padding-block:var(--space-3);border-bottom:var(--border-width-thin) solid var(--color-border-hairline)}
.stack{display:grid;row-gap:var(--space-3);min-width:0}
.three{display:grid;grid-template-areas:"a b c";grid-template-columns:repeat(3,minmax(0,1fr));column-gap:var(--space-8)}
.four{display:grid;grid-template-areas:"a b c d";grid-template-columns:repeat(4,minmax(0,1fr));column-gap:var(--space-8)}
.fac>*,.shared>*,.three>*,.four>*,.main>*,.side>*,.page>*,.stack>*,.tracker>*{min-width:0}
.team{table-layout:fixed}
.cases-head{padding-top:var(--space-8)}
.picker-room{padding-bottom:calc(var(--space-16) * 5)}
@container frontier (max-width:900px){
  .fac-grid{grid-template-areas:"tower" "dome" "factory" "palace" "arena" "pike" "pyramid" "shared";grid-template-columns:minmax(0,1fr)}
  .shared{grid-template-areas:"title" "symbols" "levels" "banned" "bprules" "shop";grid-template-columns:minmax(0,1fr)}
  .four{grid-template-areas:"a" "b" "c" "d";grid-template-columns:minmax(0,1fr);row-gap:var(--space-4)}
  .team{table-layout:auto}
  .shop{grid-template-areas:"d1" "d2" "vit" "hold";grid-template-columns:minmax(0,1fr)}
  .tracker{grid-template-areas:"head" "main" "side";grid-template-columns:minmax(0,1fr)}
  .three{grid-template-areas:"a" "b" "c";grid-template-columns:minmax(0,1fr);row-gap:var(--space-6)}
  .run-head{grid-template-areas:"back" "title" "facts";grid-template-columns:minmax(0,1fr)}
  .addrow{grid-template-areas:"n label" "s1 s1" "s2 s2" "s3 s3" "note note" "result result";grid-template-columns:auto minmax(0,1fr)}
}
`

const TABS = ['Poképedia', 'Team Building', 'Battle Frontier', 'Tools']
const ENTRIES = ['Facilities', 'Brains', 'Challenge Tracker', 'Sets & Trainers']
function appBar(current, menuOpen = false) {
  const tabs = TABS.map((t) => {
    const on = t === 'Battle Frontier'
    const menu =
      on && menuOpen
        ? `<div class="menu" data-layout="nav-dropdown">${ENTRIES.map((e) => `<a href="#"${e === current ? ' aria-current="page"' : ''}>${esc(e)}</a>`).join('')}</div>`
        : ''
    return `<span class="tab"><a href="#"${on ? ' aria-current="page"' : ''}>${esc(t)}</a>${menu}</span>`
  }).join('')
  return `<header class="appbar" data-layout="app-bar"><span class="back">${icon('back')}</span><span class="brand">Pokeapp</span><nav class="tabs" data-layout="nav-tabs">${tabs}</nav><span class="search">Search all dexes…</span><span class="filter">Sort/Filter</span><span class="account">Sign in</span></header>`
}
const frame = (current, body, { menu = false, narrow = false, page = 'frontier' } = {}) =>
  `<div class="frame${narrow ? ' narrow' : ''}">${appBar(current, menu)}<div class="scroll" data-layout="frontier-scroll"><div class="page" data-layout="${page}">${body}</div></div></div>`
const state = (n, title, note, html) =>
  `<section class="state" data-layout="state"><h2>${n}. ${esc(title)}</h2>${note ? `<p class="note">${note}</p>` : ''}${html}</section>`
const pageHead = (title, actions = '', scope = 'Emerald · Gen 3') =>
  `<header class="page-head" data-layout="page-head"><h1>${esc(title)}</h1>${scope ? `<span class="scope">${scope}</span>` : ''}${actions ? `<div class="actions">${actions}</div>` : ''}</header>`
const NOTICE = '<p class="notice" data-layout="frontier-notice">Battle Frontier data covers Emerald (Gen 3).</p>'

function page(file, title, intro, states) {
  const html = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} mockup</title><style>${tokensCss}</style><style>${fontCss}${CSS}</style></head><body><main class="mockup" data-layout="mockup" data-density="default"><header class="intro"><h1>Battle Frontier · ${esc(title)}</h1><p class="note">${intro} Data: the frontier loader (${esc(RULES.source)}) and, for the tracker, docs/fixtures/bf-tracker.xlsx. Generated by scripts/mockups/frontier.mjs. Open with <span class="mono">?layout=1</span> in the app to compare region names.</p></header>${states.join('\n')}</main></body></html>\n`
  writeFileSync(join(ROOT, 'public/mockups', file), html)
  console.log(`wrote public/mockups/${file} (${(html.length / 1024).toFixed(0)} KiB)`)
}

// ================================================================== 1. FACILITIES

/**
 * BP per completed set (Dome: tournament), from bpAward for sets 1-30, as runs of
 * equal awards: "1–2 → 1 · 3–4 → 2 · … · 29 on → 15". Exact, and one line per format.
 */
function bpRuns(facility, format) {
  const v = Array.from({ length: 30 }, (_, k) => fd.bpAward({ facility, format, completedSets: k + 1 }).base)
  const runs = []
  v.forEach((x, k) => (runs.at(-1)?.v === x ? (runs.at(-1).to = k + 1) : runs.push({ from: k + 1, to: k + 1, v: x })))
  return runs
    .map((r, i) => `<span class="nw">${i === runs.length - 1 ? `${num(r.from)} <span class="muted">on</span>` : r.from === r.to ? num(r.from) : range(r.from, r.to)} <span class="muted">→</span> ${num(r.v)}</span>`)
    .join('<span class="muted"> · </span>')
}

function partyText(f) {
  if (f.id === 'dome') return 'Register 3, choose 2 before each match'
  const sizes = f.formats.map((x) => `${FORMAT[x.id]} ${x.partySize}`)
  if (f.id === 'factory') return `3 rentals (${f.formats.map((x) => FORMAT[x.id]).join(' and ')})`
  return new Set(f.formats.map((x) => x.partySize)).size === 1 ? `${f.formats[0].partySize}` : sizes.join(' · ')
}
const SET_TEXT = {
  battle: (f) => `${f.perSet} battles per set; the streak counts battles`,
  tournament: () => '4 rounds per tournament; the streak counts tournaments won',
  room: (f) => `${f.perSet} rooms per challenge; the streak counts rooms cleared`,
  floor: (f) => `${f.perSet} floors per challenge; the streak counts floors cleared`,
}

function facilitySection(id) {
  const f = FAC[id]
  const b = BRAIN[id]
  const facts = [
    ['Formats', f.formats.map((x) => FORMAT[x.id]).join(' · ')],
    ['Party', partyText(f)],
    ['Challenge', SET_TEXT[f.unit](f)],
    ['Brain', `${esc(b.title)} ${esc(b.name)} · ${esc(b.symbolName)}`],
    ['Silver', `${appearanceHtml(b.silver)}`],
    ['Gold', `${appearanceHtml(b.gold)}, then ${repeatHtml(b)}`],
    ['Brain team', b.teamKind === 'generated' ? 'Generated from the rental sets each time' : 'Fixed (see Brains)'],
    ...f.formats.map((x) => [`BP · ${FORMAT[x.id]}`, bpRuns(id, x.id)]),
  ]
  const unit = id === 'dome' ? 'tournament' : 'set'
  return `<section class="fac" data-layout="facility" style="grid-area:${id}" aria-label="${esc(f.name)}"><h2 class="name">${esc(f.name)}</h2><p class="rule">${esc(f.rules)} <span class="cap">BP rows: completed ${unit}s in the streak → BP for that ${unit}.</span></p><dl class="kv" data-layout="facility-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>`
}

function sharedSection() {
  const symbols = `<div style="grid-area:symbols" data-layout="frontier-symbols"><p class="sec">Symbols</p><div class="tw"><table class="t"><thead><tr><th>Facility</th><th>Symbol</th><th>Silver</th><th>Gold</th></tr></thead><tbody>${ORDER.map((id) => {
    const b = BRAIN[id]
    return `<tr><td>${esc(FAC[id].name)}</td><td>${esc(b.symbolName)}</td><td>${appearanceHtml(b.silver)}</td><td>${appearanceHtml(b.gold)}</td></tr>`
  }).join('')}</tbody></table></div></div>`
  const open = fd.trainerPoolForStreak({ facility: 'tower', levelMode: 'open', streak: 0 }).level
  const factoryOpen = fd.trainerPoolForStreak({ facility: 'factory', levelMode: 'open', streak: 0 }).level
  const openOnly = fd.sets().filter((s) => s.openOnly)
  const levels = `<div style="grid-area:levels" data-layout="frontier-levels"><p class="sec">Level 50 and Open Level</p><dl class="kv"><div><dt>Level 50</dt><dd>Opponents are level 50. The ${openOnly.length} sets from #${openOnly[0].index} to #${openOnly.at(-1).index} are never drawn.</dd></div><div><dt>Open Level</dt><dd>Opponents match your highest-level Pokémon, at least ${open.min}. Battle Factory: always ${factoryOpen.min}, because the rentals are level ${factoryOpen.min}.</dd></div></dl></div>`
  const banned = `<div style="grid-area:banned" data-layout="frontier-banned"><p class="sec">Banned species (${fd.bannedSpecies().length})</p><p class="banned">${fd.bannedSpecies().map(link).join('')}</p></div>`
  const bprules = `<div style="grid-area:bprules" data-layout="frontier-bp-rules"><p class="sec">Battle Points</p><dl class="kv"><div><dt>Brain win</dt><dd>+${fd.bpAward({ facility: 'tower', format: 'singles', completedSets: 1, brain: true }).brainBonus} on top of the set’s award</dd></div><div><dt>Balance cap</dt><dd>${num(fd.addBattlePoints(9999, 1))} BP</dd></div></dl></div>`
  const clerks = [
    ['decor-1', 'd1', 'Dolls and cushions'],
    ['decor-2', 'd2', 'Large dolls'],
    ['vitamins', 'vit', 'Vitamins'],
    ['hold-items', 'hold', 'Hold items'],
  ]
  const shop = `<div class="shop" data-layout="frontier-bp-shop">${clerks
    .map(([clerk, area, label]) => {
      const entries = fd.bpShop().filter((e) => e.clerk === clerk)
      return `<div style="grid-area:${area}" data-layout="bp-shop-clerk"><p class="sec">${label} (${entries.length})</p><table class="t"><tbody>${entries.map((e) => `<tr><td>${esc(e.name)}</td><td class="r nw">${num(e.price)} <span class="muted">BP</span></td></tr>`).join('')}</tbody></table></div>`
    })
    .join('')}</div>`
  return `<section class="shared" data-layout="frontier-shared" aria-label="Across the Frontier"><h2 class="name" style="grid-area:title">Across the Frontier</h2>${symbols}${levels}${banned}${bprules}${shop}</section>`
}

page(
  'frontier-facilities.html',
  'Facilities',
  'The tab word opens this screen. Seven facility sections, then what they share.',
  [
    state(
      1,
      'The Battle Frontier tab, open',
      'New tab between Team Building and Tools; the word opens Facilities. Accent: the active tab only (the open dropdown marks the current entry by weight, not colour).',
      frame('Facilities', `${pageHead('Facilities')}<div class="menu-room" aria-hidden="true"></div>`, { menu: true, page: 'frontier-facilities' }),
    ),
    state(
      2,
      'Facilities (Gen 3 selected)',
      'All values from the loader: formats, party sizes, set length and unit, the rule, the Brain and when they appear, BP per format per completed set.',
      frame('Facilities', `${pageHead('Facilities')}<div class="fac-grid" data-layout="facility-grid">${ORDER.map(facilitySection).join('')}${sharedSection()}</div>`, { page: 'frontier-facilities' }),
    ),
    state(3, 'Any other generation selected', 'One text notice; no selector of its own (no fifth exception).', frame('Facilities', `${pageHead('Facilities', '', '')}${NOTICE}`, { page: 'frontier-facilities' })),
    state(4, 'Narrow viewport (390px): nothing clips', 'Phone layout stays parked; this only checks that every region stacks and wide tables scroll inside the scroll area.', frame('Facilities', `${pageHead('Facilities')}<div class="fac-grid" data-layout="facility-grid">${['tower', 'dome'].map(facilitySection).join('')}</div>`, { narrow: true, page: 'frontier-facilities' })),
  ],
)

// ================================================================== 2. BRAINS

function teamTable(label, team, iv) {
  return `<div data-layout="brain-team" style="grid-area:${label.toLowerCase()}"><p class="sec">${label} Symbol team · IVs ${iv} in every stat</p><div class="tw"><table class="t team"><colgroup><col style="width:14%"><col style="width:14%"><col style="width:10%"><col style="width:28%"><col style="width:34%"></colgroup><thead><tr><th>Pokémon</th><th>Item</th><th>Nature</th><th>EVs</th><th>Moves</th></tr></thead><tbody>${team
    .map(
      (m) =>
        `<tr><td class="nw">${link(m.species_id)}</td><td class="nw">${esc(itemName(m.item_id))}</td><td>${esc(natureName(m.nature_id))}</td><td>${evHtml(m.evs)}</td><td>${m.moves.map((id) => esc(moveName(id))).join(' · ')}</td></tr>`,
    )
    .join('')}</tbody></table></div></div>`
}

function brainSection(id) {
  const b = BRAIN[id]
  const head = `<header class="brain-head" data-layout="brain-head"><h2 class="name">${esc(b.title)} ${esc(b.name)}</h2><span class="meta muted">${esc(FAC[id].name)} · ${esc(b.symbolName)}</span></header>`
  const when = `<p style="grid-area:when" data-layout="brain-appearances">Silver at ${appearanceHtml(b.silver)}. Gold at ${appearanceHtml(b.gold)}, then ${repeatHtml(b)}. Singles only.</p>`
  if (b.teamKind === 'fixed') {
    return `<section class="brain" data-layout="brain" aria-label="${esc(b.name)}">${head}${when}${teamTable('Silver', b.teams.silver, b.ivs.silver)}${teamTable('Gold', b.teams.gold, b.ivs.gold)}</section>`
  }
  const rows = Array.from({ length: 8 }, (_, c) => {
    const lv = fd.trainerPoolForStreak({ facility: 'factory', levelMode: 'lv50', streak: c * 7 }).factorySetRange
    const op = fd.trainerPoolForStreak({ facility: 'factory', levelMode: 'open', streak: c * 7 }).factorySetRange
    const span = c < 7 ? `${c * 7 + 1}–${c * 7 + 7}` : `${c * 7 + 1} on`
    return `<tr><td class="mono">${span}</td><td class="r mono">#${lv.from}–#${lv.to}</td><td class="r mono">${lv.to - lv.from + 1}</td><td class="r mono">#${op.from}–#${op.to}</td><td class="r mono">${op.to - op.from + 1}</td></tr>`
  }).join('')
  return `<section class="brain" data-layout="brain" aria-label="${esc(b.name)}">${head}${when}<div style="grid-area:silver;grid-template-areas:'rule' 'note' 'ranges'" class="stack" data-layout="brain-generated"><p style="grid-area:rule">No fixed team. Each time, Noland draws three sets from the rental range of your current set, exactly as a regular Factory opponent does (no Unown, no repeated species or held item). IVs: ${num(b.ivs.silver)} in every stat at battle ${num(b.silver.battle)}, ${num(b.ivs.gold)} at battle ${num(b.gold.battle)} and after.</p><p class="cap" style="grid-area:note">The table team listed for him in the game data (Metang, Skarmory, Aggron) is Steven’s multi-battle team and is never used here.</p><div class="tw" style="grid-area:ranges"><table class="t"><thead><tr><th>Battles</th><th class="r">Lv50 sets</th><th class="r">Count</th><th class="r">Open Level sets</th><th class="r">Count</th></tr></thead><tbody>${rows}</tbody></table></div></div></section>`
}

page('frontier-brains.html', 'Brains', 'Seven Brains: their Silver and Gold teams, or the rule that generates one.', [
  state(1, 'Brains (Gen 3 selected)', 'Species names link to the species page. EVs in game order; IVs are one value for all six stats.', frame('Brains', `${pageHead('Brains')}<div class="brain-list" data-layout="brain-list">${ORDER.map(brainSection).join('')}</div>`, { page: 'frontier-brains' })),
  state(2, 'Any other generation selected', null, frame('Brains', `${pageHead('Brains', '', '')}${NOTICE}`, { page: 'frontier-brains' })),
])

// ================================================================== 3. CHALLENGE TRACKER

const outcome = (run) =>
  run.ongoing ? `Ongoing · ${wins(run)} won` : `Lost battle ${run.battles.at(-1).n} · ${wins(run)} won`

function runList() {
  const groups = ['dome', 'factory'].map((facility) => {
    const runs = allRuns.filter((r) => r.facility === facility).reverse()
    return `<tr class="group"><td colspan="6">${esc(FAC[facility].name)} · ${runs.length} run${runs.length > 1 ? 's' : ''}</td></tr>${runs
      .map(
        (r) =>
          `<tr><td><a class="link" href="#run">Run ${r.attempt}</a></td><td>${FORMAT[r.format]}</td><td>${LEVEL[r.levelMode]}</td><td class="nw">14 Nov 2026 <span class="muted">(imported)</span></td><td class="r mono">${r.battles.length}</td><td>${esc(outcome(r))}</td></tr>`,
      )
      .join('')}`
  })
  return `<section data-layout="tracker-runs"><p class="sec">Runs, newest first</p><div class="tw"><table class="t"><thead><tr><th>Run</th><th>Format</th><th>Level</th><th>Date</th><th class="r">Battles</th><th>Outcome</th></tr></thead><tbody>${groups.join('')}</tbody></table></div></section>`
}

function statsPanel(facility, format, levelMode) {
  const runs = allRuns.filter((r) => r.facility === facility && r.format === format && r.levelMode === levelMode)
  const current = runs.find((r) => r.ongoing)
  const best = Math.max(...runs.map(wins))
  const symbols = runs.at(-1).symbolsAtEnd
  const next = fd.nextBrainAt({ facility, format, levelMode, streak: current ? loaderStreak(facility, wins(current) + 1) : 0, symbols })
  const b = BRAIN[facility]
  const curText = current
    ? `${num(wins(current))} battles${facility === 'dome' ? ` · ${num(setsCompleted(current))} tournaments` : ''} <span class="muted">(run ${current.attempt})</span>`
    : '—'
  const nextText = next
    ? `${next.symbol === 'silver' ? 'Silver' : 'Gold'} at ${appearanceHtml(next)}${current ? `, ${num(next.battle - wins(current))} to go` : ''}`
    : 'None in this streak'
  return `<section data-layout="tracker-stats"><p class="sec">${esc(FAC[facility].name)} · ${FORMAT[format]} · ${LEVEL[levelMode]}</p><dl class="kv"><div><dt>Current streak</dt><dd>${curText}</dd></div><div><dt>Best streak</dt><dd>${num(best)} battles</dd></div><div><dt>${esc(b.symbolName)}</dt><dd>${symbolToggle('Silver', symbols >= 1)} ${symbolToggle('Gold', symbols >= 2)}</dd></div><div><dt>Next Brain</dt><dd>${esc(b.name)}: ${nextText}</dd></div></dl><p class="cap">The symbols are set from the log; toggle one you won before using the app.</p></section>`
}

function bpPanel(limit = 12) {
  const shown = [...ledger].reverse().slice(0, limit)
  return `<section data-layout="tracker-bp"><p class="sec">Battle Points</p><p><span class="mono">${balance}</span> BP <span class="muted">of ${num(9999)} max</span></p><label class="field"><span class="cap">Opening balance (your in-game BP before the first logged set)</span><input class="uf num" value="0" aria-label="Opening balance"></label><div class="tw"><table class="t"><thead><tr><th>Earned</th><th class="r">BP</th><th class="r">Balance</th></tr></thead><tbody>${shown
    .map(
      (e) =>
        `<tr><td>${esc(FAC[e.run.facility].name.replace('Battle ', ''))} run ${e.run.attempt}, ${e.run.facility === 'dome' ? 'tournament' : 'set'} ${e.set}${e.brain ? ` <span class="nw">· ${esc(BRAIN[e.run.facility].name)} +${num(e.brainBonus)}</span>` : ''}</td><td class="r mono">+${e.points}</td><td class="r mono">${e.balance}</td></tr>`,
    )
    .join('')}</tbody></table></div><p class="cap">${ledger.length} entries; ${Math.max(0, ledger.length - limit)} older not shown. Spending at the Exchange Service Corner is a ledger line with a minus.</p></section>`
}

function insights() {
  const counts = new Map()
  for (const run of allRuns) for (const b of run.battles) for (const id of b.opponents) if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1)
  const top = [...counts].sort((a, b) => b[1] - a[1] || spName(a[0]).localeCompare(spName(b[0]))).slice(0, 10)
  const pairs = new Map()
  for (const b of domeRuns.flatMap((r) => r.battles)) {
    const key = b.pair.slice().sort().join()
    const p = pairs.get(key) ?? { pair: b.pair.slice().sort(), n: 0, w: 0 }
    p.n += 1
    if (b.result === 'W') p.w += 1
    pairs.set(key, p)
  }
  const history = ['dome', 'factory'].map((f) => `<tr><td>${esc(FAC[f].name)}</td><td class="nw">${allRuns.filter((r) => r.facility === f).map((r) => num(r.battles.length)).join('<span class="muted"> · </span>')}</td><td class="r mono">${Math.max(...allRuns.filter((r) => r.facility === f).map(wins))}</td></tr>`).join('')
  return `<section class="three" data-layout="tracker-insights"><div style="grid-area:a" data-layout="insight-history"><p class="sec">Run history</p><table class="t"><thead><tr><th>Facility</th><th>Battles per run</th><th class="r">Best</th></tr></thead><tbody>${history}</tbody></table></div><div style="grid-area:b" data-layout="insight-species"><p class="sec">Most-seen opponents</p><table class="t"><tbody>${top.map(([id, n]) => `<tr><td>${link(id)}</td><td class="r mono">${n}</td></tr>`).join('')}</tbody></table></div><div style="grid-area:c" data-layout="insight-dome-pairs"><p class="sec">Dome: win rate per pair</p><table class="t"><thead><tr><th>Pair</th><th class="r">Won</th></tr></thead><tbody>${[...pairs.values()].map((p) => `<tr><td>${p.pair.map((s) => esc(spName(domeTeam[s]))).join(' + ')}</td><td class="r mono">${p.w} / ${p.n}</td></tr>`).join('')}</tbody></table></div></section>`
}

const opponentCell = (b) => b.opponents.map(link).join('<span class="muted"> · </span>')
function brainCell(run, b) {
  if (!b.brain) return ''
  const brain = BRAIN[run.facility]
  const label = `${esc(brain.name)} · ${b.brain.symbol === 'silver' ? 'Silver' : 'Gold'}`
  if (brain.teamKind === 'generated') return `${label}<br><span class="cap">Generated team: nothing to compare</span>`
  const known = brain.teams[b.brain.symbol].map((m) => m.species_id)
  const match = known.join() === b.opponents.join()
  return `${label}<br><span class="cap">Known team: ${known.map((id) => esc(spName(id))).join(', ')} · ${match ? 'matches' : 'differs'}</span>`
}

function domeLog(run, limit) {
  const battles = limit ? run.battles.slice(0, limit) : run.battles
  return `<section data-layout="run-log"><p class="sec">Battle log</p><div class="tw"><table class="t"><thead><tr><th class="r">#</th><th>Battle</th><th>Opponent</th><th>Dropped</th><th>Your pair</th><th>Result</th><th>Brain</th></tr></thead><tbody>${battles
    .map(
      (b) =>
        `<tr><td class="r mono">${b.n}</td><td class="nw">${esc(battleLabel('dome', b.n))}</td><td class="nw">${opponentCell(b)}</td><td class="nw">${b.dropped ? `<span class="mono">${b.dropped}</span> <span class="muted">${b.opponents[b.dropped - 1] == null ? 'Unknown' : esc(spName(b.opponents[b.dropped - 1]))}</span>` : '—'}</td><td class="nw">${b.pair.map((s) => esc(spName(domeTeam[s]))).join(' + ')}</td><td>${b.result === 'W' ? 'Won' : 'Lost'}</td><td>${brainCell(run, b)}</td></tr>`,
    )
    .join('')}</tbody></table></div></section>`
}

function factoryLog(run) {
  const events = rentalEvents(run)
  const eventAt = new Map(events.map((e) => [e.n, e]))
  const rowsHtml = run.battles
    .map((b) => {
      const e = eventAt.get(b.n)
      const ev = !e
        ? ''
        : e.kind === 'draft'
          ? `<tr class="group"><td colspan="5">${esc(battleLabel('factory', b.n).split(' · ')[0])} rentals: ${e.team.map(link).join(', ')}</td></tr>`
          : `<tr><td></td><td colspan="4" class="cap">Swap before battle ${e.n}: ${e.out.map((id) => esc(spName(id))).join(', ')} out, ${e.in.map(link).join(', ')} in</td></tr>`
      return `${ev}<tr><td class="r mono">${b.n}</td><td class="nw">${esc(battleLabel('factory', b.n))}</td><td class="nw">${opponentCell(b)}</td><td>${b.result === 'W' ? 'Won' : 'Lost'}</td><td>${brainCell(run, b)}</td></tr>`
    })
    .join('')
  return `<section data-layout="run-log"><p class="sec">Battle log · your rentals appear when they change</p><div class="tw"><table class="t"><thead><tr><th class="r">#</th><th>Battle</th><th>Opponent</th><th>Result</th><th>Brain</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></section>`
}

function runHead(run) {
  const symbols = run.symbolsAtEnd
  const done = setsCompleted(run)
  const facts = `${FORMAT[run.format]} · ${LEVEL[run.levelMode]} · ${esc(outcome(run))} (${done} ${run.facility === 'dome' ? 'tournament' : 'set'}${done === 1 ? '' : 's'}) · symbols: ${symbols === 2 ? 'Silver and Gold' : symbols === 1 ? 'Silver' : 'none'}`
  return `<header class="run-head" data-layout="run-head"><a class="link backlink" href="#">All runs</a><h1>${esc(FAC[run.facility].name)} · run ${run.attempt}</h1><span class="facts">${facts}</span></header>`
}

const domeRun = domeRuns[0]
const factoryRun = factoryRuns.find((r) => r.attempt === 4)
const unknownBattle = factoryRuns.flatMap((r) => r.battles.map((b) => ({ r, b }))).find(({ b }) => b.opponents.includes(null))
const tracker = (main, side, head = pageHead('Challenge Tracker', `<button class="ghost" type="button">${icon('plus')}New run</button>`)) =>
  `<div class="tracker" data-layout="tracker">${head}<div class="main" data-layout="tracker-main">${main}</div><aside class="side" data-layout="tracker-side">${side}</aside></div>`
const domeTeamHtml = `<section data-layout="run-team"><p class="sec">Your three</p><p>${domeTeam.map((id, i) => `<span class="muted">${'ABC'[i]}</span> ${link(id)}`).join('<span class="muted"> · </span>')}</p><p class="cap">Each battle records the pair you brought (2 of these 3).</p></section>`

page('frontier-tracker.html', 'Challenge Tracker', 'The main screen. Every run below is the owner’s log after import: the Dome run (40 battles, Tucker at 20 and 40) and the Factory’s five runs (6/3/7/40/7 battles, Noland at battle 21 of run 4).', [
  state(1, 'Tracker home, after the import', 'Runs grouped by facility, newest first; insights from every logged battle; the BP balance is global. Dates: the log has none, so imported runs carry the import date (Q4). Outcome: the log has no W/L column (Q5).', frame('Challenge Tracker', tracker(`${runList()}${insights()}`, bpPanel()), { page: 'frontier-tracker' })),
  state(2, 'Run detail: Battle Dome, run 1 (the log’s 40 battles)', 'Battle number as logged, with the derived label. Brain rows (20, 40) are set by the loader’s nextBrainAt and checked against the log; the known team is shown to compare. “Dropped” is the log’s own column, shown as the slot and the species in it; read here as the opponent’s Pokémon that did not battle, pending Q1.', frame('Challenge Tracker', tracker(`${domeTeamHtml}${domeLog(domeRun)}`, statsPanel('dome', 'singles', 'lv50') + bpPanel(4), runHead(domeRun)), { page: 'frontier-run' })),
  state(3, 'Run detail: Battle Factory, run 4 (the log’s 40 battles)', 'Your rentals are not repeated on every row: a heading line at each new set’s draft (battles 1, 8, 15, 22, 29, 36) and a swap line where one changed inside a set. Noland at battle 21 is generated, so there is no known team to compare.', frame('Challenge Tracker', tracker(factoryLog(factoryRun), statsPanel('factory', 'singles', 'lv50') + bpPanel(4), runHead(factoryRun)), { page: 'frontier-run' })),
  state(
    4,
    'Logging a battle: the species picker, and an unknown Pokémon',
    `Picker search is the Gen 3 Pokédex list (#1–386), in Pokédex order. “Unknown” is the first option, for a Pokémon you did not see; it shows as “Unknown” in the log, as the log’s “-” does at Factory run ${unknownBattle.r.attempt}, battle ${unknownBattle.b.n}.`,
    frame(
      'Challenge Tracker',
      `${runHead(factoryRuns.at(-1))}${areas('log-add-state', [['add', `<div class="picker-room"><div class="addrow" data-layout="log-add"><span class="mono" style="grid-area:n">${factoryRuns.at(-1).battles.length + 1}</span><span style="grid-area:label">${esc(battleLabel('factory', factoryRuns.at(-1).battles.length + 1))}</span><label class="field picker" style="grid-area:s1" data-layout="species-picker"><span class="cap">Opponent 1</span><input class="uf" value="ma" aria-label="Opponent 1"><ul role="listbox"><li aria-selected="true">Unknown (not seen)</li>${[...SPECIES.values()]
        .filter((x) => x.id <= 386 && x.display_name.toLowerCase().startsWith('ma'))
        .map((x) => x.id)
        .slice(0, 6)
        .map((id) => `<li>${esc(spName(id))}</li>`)
        .join('')}</ul></label><label class="field" style="grid-area:s2"><span class="cap">Opponent 2</span><input class="uf" placeholder="Search species" aria-label="Opponent 2"></label><label class="field" style="grid-area:s3"><span class="cap">Opponent 3</span><input class="uf" placeholder="Search species" aria-label="Opponent 3"></label><label class="field" style="grid-area:note"><span class="cap">Note (optional)</span><input class="uf" placeholder="Anything worth remembering about this battle" aria-label="Note"></label><span style="grid-area:result" class="actions"><button class="ghost" type="button">Won</button><button class="ghost" type="button">Lost</button></span></div></div>`], ['example', `<p class="sec">Elsewhere in the log: an unknown Pokémon (Factory run ${unknownBattle.r.attempt})</p><div class="tw" data-layout="run-log"><table class="t"><thead><tr><th class="r">#</th><th>Battle</th><th>Opponent</th><th>Result</th></tr></thead><tbody><tr><td class="r mono">${unknownBattle.b.n}</td><td>${esc(battleLabel("factory", unknownBattle.b.n))} <span class="muted">(run ${unknownBattle.r.attempt})</span></td><td class="nw">${opponentCell(unknownBattle.b)}</td><td>${unknownBattle.b.result === "W" ? "Won" : "Lost"}</td></tr></tbody></table></div><p class="cap">As logged: ${unknownBattle.b.raw.map(esc).join(", ")}.</p>`]])}`,
      { page: 'frontier-run' },
    ),
  ),
  state(5, 'New run', 'Facility, then only the formats it has; level mode; nothing else to start.', frame('Challenge Tracker', `${pageHead('Challenge Tracker')}${areas('new-run', [['form', `<form class="three" data-layout="new-run-form" onsubmit="return false"><label class="field" style="grid-area:a"><span class="cap">Facility</span><select class="uf">${ORDER.map((id) => `<option${id === 'dome' ? ' selected' : ''}>${esc(FAC[id].name)}</option>`).join('')}</select></label><label class="field" style="grid-area:b"><span class="cap">Format</span><select class="uf">${FAC.dome.formats.map((x) => `<option>${FORMAT[x.id]}</option>`).join('')}</select></label><label class="field" style="grid-area:c"><span class="cap">Level</span><select class="uf"><option>Lv50</option><option>Open Level</option></select></label></form>`], ['start', '<button class="ghost" type="button">Start run</button>']])}`, { page: 'frontier-tracker' })),
  state(6, 'Empty: no runs yet', null, frame('Challenge Tracker', `${pageHead('Challenge Tracker', `<button class="ghost" type="button">${icon('plus')}New run</button>`)}<p class="notice" data-layout="tracker-empty">No runs yet. Start one, or import a tracker file from your saved documents.</p>`, { page: 'frontier-tracker' })),
  state(7, 'Any other generation selected', null, frame('Challenge Tracker', `${pageHead('Challenge Tracker', '', '')}${NOTICE}`, { page: 'frontier-tracker' })),
  state(8, 'Narrow viewport (390px): nothing clips', 'The log scrolls inside the scroll area; the side panel stacks under it.', frame('Challenge Tracker', tracker(domeLog(domeRun, 4), statsPanel('dome', 'singles', 'lv50'), runHead(domeRun)), { narrow: true, page: 'frontier-run' })),
])

// ================================================================== 4. SETS & TRAINERS

function setRows(list) {
  return list
    .map(
      (s) =>
        `<tr><td class="r mono">${s.index}</td><td class="nw">${link(s.species_id)}</td><td class="nw">${esc(itemName(s.item_id))}</td><td>${esc(natureName(s.nature_id))}</td><td class="nw">${evHtml(s.evs)}</td><td>${s.moves.map((id) => esc(moveName(id))).join(' · ')}</td><td class="muted nw">${s.openOnly ? 'Open Level only' : ''}</td></tr>`,
    )
    .join('')
}
const setTable = (list) =>
  `<div class="tw"><table class="t"><thead><tr><th class="r">#</th><th>Pokémon</th><th>Item</th><th>Nature</th><th>EVs</th><th>Moves</th><th>Level</th></tr></thead><tbody>${setRows(list)}</tbody></table></div>`
const ivForId = (id) => RULES.trainer_ivs.find((b) => id >= b.from && id <= b.to).iv
function trainerRows(list, expand = null) {
  return list
    .map((t) => {
      const sets = t.setIndices.map((i) => fd.sets()[i])
      const species = [...new Set(sets.map((s) => s.species_id))]
      const row = `<tr><td class="r mono">${t.id}</td><td class="nw">${esc(t.className)}</td><td class="nw">${esc(t.name)}</td><td class="r mono">${ivForId(t.id)}</td><td class="r mono">${sets.length}</td><td>${species.slice(0, 8).map((id) => esc(spName(id))).join(', ')}${species.length > 8 ? ` <span class="muted">+${species.length - 8}</span>` : ''}</td></tr>`
      return expand === t.id
        ? `${row}<tr><td></td><td colspan="5"><p class="cap">${esc(t.name)}’s ${sets.length} sets (${sets.filter((s) => s.openOnly).length} Open Level only)</p>${setTable(sets.slice(0, 8))}<p class="cap">…${sets.length - 8} more</p></td></tr>`
        : row
    })
    .join('')
}
const trainerTable = (list, expand) =>
  `<div class="tw"><table class="t"><thead><tr><th class="r">ID</th><th>Class</th><th>Name</th><th class="r">IVs</th><th class="r">Sets</th><th>Species</th></tr></thead><tbody>${trainerRows(list, expand)}</tbody></table></div>`

function lookup(label, input, facility, levelMode, battle, symbols, extra = {}) {
  const pool = fd.trainerPoolForStreak({ facility, levelMode, streak: loaderStreak(facility, battle), symbols, ...extra })
  const T = fd.trainers()
  const ivSplit =
    pool.ivBand.rule === 'trainer-id'
      ? pool.ivBand.byTrainerId.map((b) => `${num(b.iv)} for IDs ${range(b.from, b.to)}`).join(', ')
      : `${pool.ivBand.min === pool.ivBand.max ? num(pool.ivBand.min) : range(pool.ivBand.min, pool.ivBand.max)} (Factory table, read at your Battle Tower Lv50 streak: ${extra.towerLv50Streak == null ? 'not given' : num(extra.towerLv50Streak)})`
  const draws = pool.draws.length > 1 ? pool.draws.map((d) => `${d.count ? `${num(d.count)} from ` : ''}${range(d.idRange.from, d.idRange.to)}${d.hard ? ' (Hard)' : ''}: ${esc(d.when)}`).join('; ') : ''
  const level = pool.level.mode === 'lv50' ? `Level ${num(pool.level.level)}` : `Your highest level, at least ${num(pool.level.min)}`
  const who = BRAIN[facility]
  const sym = pool.brain?.symbol === 'gold' ? 'Gold' : 'Silver'
  const brain = pool.brain ? (facility === 'dome' ? `${who.name} (${sym}) takes one entrant’s place and waits in this tournament’s final.` : `${who.name} (${sym}) is this battle’s opponent${who.teamKind === 'generated' ? `, with a generated team at IVs ${num(who.ivs[pool.brain.symbol])}` : ''}; the trainer pool does not apply.`) : (() => {
    const n = fd.nextBrainAt({ facility, format: 'singles', levelMode, streak: loaderStreak(facility, battle), symbols })
    return n ? `Not this battle. Next: ${n.symbol === 'silver' ? 'Silver' : 'Gold'} at ${appearanceHtml(n)}` : 'None in this streak'
  })()
  const facts = [
    ['Battle', `${num(battle)} · ${esc(battleLabel(facility, battle))}`],
    ['Trainer IDs', `${range(pool.idRange.from, pool.idRange.to)} (${esc(T[pool.idRange.from].name)} … ${esc(T[pool.idRange.to].name)})`],
    ...(draws ? [['Drawn as', draws]] : []),
    ['Hard 7th battle', pool.hard ? 'Yes' : 'No'],
    ['IVs', ivSplit],
    ['Level', level],
    ...(pool.factorySetRange ? [['Opponent sets', `${range(pool.factorySetRange.from, pool.factorySetRange.to, '#')} (rental range, not the trainer’s list)`]] : []),
    ['Brain', brain],
  ]
  return areas('streak-lookup-result', [
    ['label', `<p class="sec">${esc(label)}</p>`],
    ['input', `<p class="cap">${input}</p>`],
    ['facts', `<dl class="kv">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`],
  ])
}
const lookupForm = `<form class="four" data-layout="streak-lookup-form" onsubmit="return false"><label class="field" style="grid-area:a"><span class="cap">Facility</span><select class="uf"><option>Battle Dome</option></select></label><label class="field" style="grid-area:b"><span class="cap">Level</span><select class="uf"><option>Lv50</option></select></label><label class="field" style="grid-area:c"><span class="cap">Battle number (as you log it)</span><input class="uf num" value="20"></label><label class="field" style="grid-area:d"><span class="cap">Symbols held here</span><select class="uf"><option>None</option><option>Silver</option><option>Silver and Gold</option></select></label></form>`
const lookupPanel = areas('streak-lookup', [
  ['title', '<h2 class="name">Streak lookup</h2>'],
  ['hint', '<p class="cap">Facility, level mode, the battle you are about to fight, and the symbols you hold here (they decide whether the Brain is due).</p>'],
  ['form', lookupForm],
  ['cases', `<p class="sec cases-head">The owner’s three cases, as the lookup answers them</p><div class="three" data-layout="streak-lookup-cases"><div style="grid-area:a">${lookup('Dome battle 20', 'Battle Dome · Lv50 · battle 20 · no symbols', 'dome', 'lv50', 20, 0)}</div><div style="grid-area:b">${lookup('Factory battle 21', 'Battle Factory · Lv50 · battle 21 · no symbols · Tower Lv50 streak 0', 'factory', 'lv50', 21, 0, { towerLv50Streak: 0 })}</div><div style="grid-area:c">${lookup('Streak 49 (battle 50)', 'Battle Tower · Lv50 · 49 won, so battle 50 · Silver held', 'tower', 'lv50', 50, 1)}</div></div>`],
])

const viewTabs = (sel) =>
  `<div class="vtabs" role="tablist" data-layout="sets-views"><button role="tab" aria-selected="${sel === 'sets'}">Sets <span class="mono muted">${fd.sets().length}</span></button><button role="tab" aria-selected="${sel === 'trainers'}">Trainers <span class="mono muted">${fd.trainers().length}</span></button></div>`
const setControls = (q, openOnly) =>
  `<div class="three" data-layout="sets-controls"><label class="field" style="grid-area:a"><span class="cap">Search species, class or held item</span><input class="uf" value="${esc(q)}" placeholder="Search"></label><span style="grid-area:b;align-self:end"><button class="textfilter" type="button" aria-pressed="${openOnly}">${icon(openOnly ? 'check' : 'square')}Open Level only</button></span></div>`

const salamence = fd.resolveSpecies('salamence')
const sets = fd.sets()
const vince = fd.trainers().find((t) => t.setIndices.some((i) => sets[i].openOnly))
page('frontier-sets.html', 'Sets & Trainers', 'Two views of the 882 sets and 300 trainers, and the streak lookup.', [
  state(1, 'Sets (first 30 of 882)', 'Search matches species, a trainer class that draws the set, or the held item. “Open Level only” is a text filter and a text column, never a badge. Selected view tab: the screen’s second accent.', frame('Sets & Trainers', `${pageHead('Sets & Trainers')}${areas('sets-body', [['views', viewTabs('sets')], ['controls', setControls('', false)], ['count', `<p class="cap" data-layout="sets-count">882 sets</p>`], ['list', `<div data-layout="sets-list">${setTable(sets.slice(0, 30))}</div>`]])}`, { page: 'frontier-sets' })),
  state(2, 'Sets: search “salamence”', null, frame('Sets & Trainers', `${pageHead('Sets & Trainers')}${areas('sets-body', [['views', viewTabs('sets')], ['controls', setControls('salamence', false)], ['count', `<p class="cap" data-layout="sets-count">${sets.filter((s) => s.species_id === salamence).length} sets</p>`], ['list', `<div data-layout="sets-list">${setTable(sets.filter((s) => s.species_id === salamence))}</div>`]])}`, { page: 'frontier-sets' })),
  state(3, 'Sets: Open Level only', null, frame('Sets & Trainers', `${pageHead('Sets & Trainers')}${areas('sets-body', [['views', viewTabs('sets')], ['controls', setControls('', true)], ['count', `<p class="cap" data-layout="sets-count">${sets.filter((s) => s.openOnly).length} sets</p>`], ['list', `<div data-layout="sets-list">${setTable(sets.filter((s) => s.openOnly))}</div>`]])}`, { page: 'frontier-sets' })),
  state(4, `Trainers (first 25 of 300, and ${vince.name}, ${vince.id}, opened)`, 'IVs by trainer ID (3 up to ID 99 … 31 from ID 220). A row opens to its sets.', frame('Sets & Trainers', `${pageHead('Sets & Trainers')}${areas('trainers-body', [['views', viewTabs('trainers')], ['search', '<label class="field" data-layout="trainers-search"><span class="cap">Search class or name</span><input class="uf" placeholder="Search"></label>'], ['list', `<div data-layout="trainers-list">${trainerTable([...fd.trainers().slice(0, 25), vince], vince.id)}</div>`]])}`, { page: 'frontier-sets' })),
  state(5, 'Streak lookup: the owner’s three cases', 'Input is the battle number as logged; the derived label is shown, the loader’s streak is not.', frame('Sets & Trainers', `${pageHead('Sets & Trainers')}${lookupPanel}`, { page: 'frontier-sets' })),
  state(6, 'Any other generation selected', null, frame('Sets & Trainers', `${pageHead('Sets & Trainers', '', '')}${NOTICE}`, { page: 'frontier-sets' })),
])
