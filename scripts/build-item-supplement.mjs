/**
 * Generates public/data/item-supplement.json: each Gen 1-4 item's buy/sell
 * price and its acquisition methods, per game, from Bulbapedia.
 *
 * WHY THIS EXISTS. PokeAPI's snapshot prices 13 of the 563 in-scope items and
 * carries no item locations at all, so the Itemdex's price column and its
 * acquisition table had no source. Bulbapedia's item pages carry both, in two
 * templates that are regular enough to parse: `{{ItemPrice|games|buy|sell}}`
 * and the `{{ItemAvailability/head}}` table (games | finite | repeatable, or
 * games | methods for a key item). A TM's page has neither and uses
 * `{{TMtable/row|games|location|buy|sell}}` instead, which gives both at once.
 *
 * READS A CACHE, NEVER THE NETWORK. Bulbapedia's Cloudflare challenge refuses
 * scripts, so the download is a browser snippet (scripts/bulbapedia/
 * fetch-items.browser.js) and this file parses what it saved at
 * .cache/bulbapedia/items.json. Re-running this is free and offline.
 *
 * GENERATED, COMMITTED, PRECACHED -- the same reasoning as build-supplement.mjs:
 * offline-first means no runtime wiki, and the output is in EAGER_DATA_FILES so
 * the Itemdex's price column works on a plane.
 *
 * ONLY GEN 1-4 GAMES SURVIVE. A row whose games are all Gen 5+ (or a side game
 * this app does not model: Stadium, Pokéwalker, Pokémon GO...) is dropped; a
 * row naming both kinds keeps only the in-scope games. Colosseum and XD are kept:
 * they are version groups in the bundle.
 *
 * IT REPORTS RATHER THAN GUESSES. A games cell it cannot read is printed and
 * the row dropped; a template it does not know is printed with its count, so a
 * new one shows up as a line in the log rather than as a silently mangled cell.
 *
 * Usage: node scripts/build-item-supplement.mjs           (writes the file)
 *        node scripts/build-item-supplement.mjs --titles  (prints the fetch list)
 */

import { readFileSync, writeFileSync } from 'node:fs'

const items = Object.values(JSON.parse(readFileSync('public/data/items.json', 'utf8')))
const inScope = items.filter((i) => i.generation_ids.some((g) => g <= 4))

if (process.argv.includes('--titles')) {
  console.log(JSON.stringify(inScope.map((i) => i.display_name)))
  process.exit(0)
}

const dump = JSON.parse(readFileSync('.cache/bulbapedia/items.json', 'utf8'))

// ------------------------------------------------------------ games cells

/*
  Bulbapedia writes games as `{{gameabbrevN|CODES}}`, N being the generation and
  CODES the run of each game's initial(s): RSEFRLG is Ruby, Sapphire, Emerald,
  FireRed, LeafGreen. The per-generation token lists below are matched longest
  first, which is what keeps "FR" from reading as an unknown F.
*/
const GEN_TOKENS = {
  1: { R: 'red-blue', G: 'red-blue', B: 'red-blue', Y: 'yellow' },
  2: { G: 'gold-silver', S: 'gold-silver', C: 'crystal' },
  3: {
    FR: 'firered-leafgreen',
    LG: 'firered-leafgreen',
    R: 'ruby-sapphire',
    S: 'ruby-sapphire',
    E: 'emerald',
  },
  4: {
    Pt: 'platinum',
    HG: 'heartgold-soulsilver',
    SS: 'heartgold-soulsilver',
    D: 'diamond-pearl',
    P: 'diamond-pearl',
  },
}
const SIDE_GAMES = { Colo: ['colosseum'], XD: ['xd'], ColoXD: ['colosseum', 'xd'] }

/** Every version group named by a games cell, in release order; null when unreadable. */
function gamesOf(cell, unreadable) {
  const out = new Set()
  let recognised = false
  for (const m of cell.matchAll(/\{\{gameabbrev(\d|ss)\|([^}|]+)[^}]*\}\}/g)) {
    recognised = true
    const [, gen, codes] = m
    if (gen === 'ss') {
      for (const vg of SIDE_GAMES[codes.trim()] ?? []) out.add(vg)
      continue
    }
    const table = GEN_TOKENS[gen]
    if (!table) continue // Gen 5+: out of scope, not unreadable
    const tokens = Object.keys(table).sort((a, b) => b.length - a.length)
    let rest = codes.trim()
    while (rest) {
      const t = tokens.find((tok) => rest.startsWith(tok))
      if (!t) {
        unreadable.push(`gameabbrev${gen}|${codes}`)
        break
      }
      out.add(table[t])
      rest = rest.slice(t.length)
    }
  }
  if (!recognised) return null
  return ORDER.filter((vg) => out.has(vg))
}

const ORDER = [
  'red-blue',
  'yellow',
  'gold-silver',
  'crystal',
  'ruby-sapphire',
  'emerald',
  'firered-leafgreen',
  'colosseum',
  'xd',
  'diamond-pearl',
  'platinum',
  'heartgold-soulsilver',
]

// ------------------------------------------------------------ wikitext -> text

const unknownTemplates = new Map()

/** Split a template's inner text on top-level pipes. */
function splitArgs(inner) {
  const args = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < inner.length; i += 1) {
    const two = inner.slice(i, i + 2)
    if (two === '{{' || two === '[[') {
      depth += 1
      cur += two
      i += 1
    } else if (two === '}}' || two === ']]') {
      depth -= 1
      cur += two
      i += 1
    } else if (inner[i] === '|' && depth === 0) {
      args.push(cur)
      cur = ''
    } else cur += inner[i]
  }
  args.push(cur)
  return args
}

const positional = (args) => args.filter((a) => !/^\s*[a-z_0-9]+\s*=/i.test(a))

/*
  The templates these tables actually use, read as what they DISPLAY. Measured on
  the dump: anything else is counted into `unknownTemplates` and printed, and
  falls back to its last positional argument (which is the display text for
  every link-like template on the wiki).
*/
const TEMPLATES = {
  pdollar: () => '₽',
  rt: (a) => `Route ${a[0]}`,
  rtn: (a) => a[0],
  wild: (a) => a[a.length > 1 ? 1 : 0],
  p: (a) => a[1] ?? a[0],
  pkmn: (a) => (a[1] ? a[1] : `Pokémon ${a[0]}`),
  pkmn2: (a) => a[1] ?? a[0],
  m: (a) => a[1] ?? a[0],
  a: (a) => a[1] ?? a[0],
  i: (a) => a[1] ?? a[0],
  t: (a) => a[1] ?? a[0],
  type: (a) => a[1] ?? a[0],
  tc: (a) => a[1] ?? a[0],
  al: (a) => a[1] ?? a[0],
  pw: (a) => a[1] ?? a[0],
  ga: (a) => a[1] ?? a[0],
  stat: (a) => a[1] ?? a[0],
  dl: (a) => a[2] ?? a[1] ?? a[0],
  obp: (a) => a[0],
  game: (a) => `Pokémon ${a.join(' and ')}`,
  game2: (a) => `Pokémon ${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`,
  tt: (a) => a[0],
  sup: () => '',
  color: (a) => a[1] ?? a[0],
  color2: (a) => a[2] ?? a[1] ?? a[0],
  '-': () => '',
  sc: (a) => a[0],
  scpkmn: () => 'Pokémon',
  pokemon: () => 'Pokémon',
  pokémon: () => 'Pokémon',
  player: () => 'player',
  cat: (a) => a[1] ?? a[0],
  wp: (a) => a[1] ?? a[0],
  ball: (a) => `${a[0]} Ball`,
  item: (a) => a[a.length - 1],
  bag: (a) => a[a.length - 1],
  mart: (a) => a[a.length - 1],
  ci: (a) => `${a[0]} City`,
  to: (a) => `${a[0]} Town`,
  isl: (a) => `${a[0]} Island`,
  safari: () => 'Safari Zone',
  prof: (a) => `Professor ${a[0]}`,
  shadow: (a) => `Shadow ${a[0]}`,
  badge: (a) => `${a[0]} Badge`,
  gdis: (a) => a[2] ?? a[0],
  si: (a) => a[1] ?? a[0],
  ka: (a) => a[1] ?? a[0],
  jo: (a) => a[1] ?? a[0],
  ho: (a) => a[1] ?? a[0],
  fb: (a) => (a[0] === 'Team' ? `Team ${a[1]}` : (a[1] ?? a[0])),
  game3: (a) => a[1] ?? a[0],
  v2: (a) => `Pokémon ${a[0]}`,
  // A marker pair, not text: a run of days becomes one "(Monday, Saturday)" below.
  dotw: (a) =>
    `⟦${{ Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday' }[a[0]] ?? a[0]}⟧`,
}

/*
  Game initials as words, for a games code met INSIDE prose ("{{sup/3|E}}" after
  a clause that is Emerald-only, or a bare {{gameabbrev4|Pt}} in a sentence).
*/
const GAME_WORDS = {
  1: { R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow' },
  2: { G: 'Gold', S: 'Silver', C: 'Crystal' },
  3: {
    FR: 'FireRed',
    LG: 'LeafGreen',
    Ru: 'Ruby',
    Sa: 'Sapphire',
    R: 'Ruby',
    S: 'Sapphire',
    E: 'Emerald',
  },
  4: { Pt: 'Platinum', HG: 'HeartGold', SS: 'SoulSilver', D: 'Diamond', P: 'Pearl' },
}
function gameWords(gen, codes) {
  const table = GAME_WORDS[gen]
  if (!table) return codes
  const tokens = Object.keys(table).sort((a, b) => b.length - a.length)
  const words = []
  let rest = codes.trim()
  while (rest) {
    const t = tokens.find((tok) => rest.startsWith(tok))
    if (!t) return codes
    words.push(table[t])
    rest = rest.slice(t.length)
  }
  return words.join('/')
}

/** The suffix that a superscript like {{sup/3|E}} marks: which game a clause is for. */
function supText(name, args) {
  const m = name.match(/^sup\/(\w+)$/i)
  if (!m) return null
  const codes = (positional(args)[0] ?? '').trim()
  return ` (${/^\d$/.test(m[1]) ? gameWords(Number(m[1]), codes) : codes})`
}

function textOf(wiki) {
  let s = wiki
  // Innermost templates first, until none are left.
  for (let guard = 0; guard < 20 && s.includes('{{'); guard += 1) {
    s = s.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => {
      const [rawName, ...rest] = splitArgs(inner)
      const name = rawName.trim()
      const sup = supText(name, rest)
      if (sup != null) return sup
      const key = name.toLowerCase()
      const fn = TEMPLATES[key]
      const args = positional(rest).map((x) => x.trim())
      if (fn) return fn(args) ?? ''
      const abbrev = key.match(/^gameabbrev(\d)$/)
      if (abbrev) return gameWords(Number(abbrev[1]), args[0] ?? '')
      unknownTemplates.set(name, (unknownTemplates.get(name) ?? 0) + 1)
      // A template with no arguments names itself ({{Daisy}}, {{Steven}}).
      return args.length ? args[args.length - 1] : name
    })
  }
  s = s
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1') // [[target|display]] -> display
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<sup>([^<]*)<\/sup>/gi, ' ($1)')
    .replace(/<\/?(small|span|sc|nowiki|b|i)[^>]*>/gi, '')
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    // Day-of-week markers from {{dotw}}: a run of them becomes one "(Monday, Saturday)".
    .replace(
      /(?:⟦[^⟧]*⟧)+/g,
      (run) =>
        ` (${run
          .match(/⟦([^⟧]*)⟧/g)
          .map((d) => d.slice(1, -1))
          .join(', ')})`,
    )
    .replace(/'''?/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ \(/g, ' (')
    .replace(/\s+\)/g, ')')
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

// ------------------------------------------------------------ the tables

/** The core-series part of a page: everything before the side/spin-off games. */
const coreOf = (t) => t.split(/\n==\s*In (the )?(side series|spin-off|other)/i)[0]

/** Parses every `{{ItemPrice|games|buy|sell}}` row. */
function pricesOf(core, unreadable) {
  const out = {}
  for (const m of core.matchAll(/\{\{ItemPrice\|/g)) {
    const inner = balancedFrom(core, m.index)
    if (!inner) continue
    const [, games, buy, sell] = splitArgs(inner)
    const vgs = gamesOf(games ?? '', unreadable) ?? []
    const pair = [money(buy), money(sell)]
    // N/A both ways says nothing a missing entry does not.
    if (pair[0] == null && pair[1] == null) continue
    for (const vg of vgs) out[vg] = pair
  }
  return out
}

/** The text of a template starting at `at`, without its braces. */
function balancedFrom(s, at) {
  let depth = 0
  for (let i = at; i < s.length - 1; i += 1) {
    if (s.startsWith('{{', i)) {
      depth += 1
      i += 1
    } else if (s.startsWith('}}', i)) {
      depth -= 1
      i += 1
      if (depth === 0) return s.slice(at + 2, i - 1)
    }
  }
  return null
}

/** "{{PDollar}}1,500" -> 1500; "N/A" or empty -> null. */
/*
  Prices in ANOTHER currency are not prices here. A Gen 4 TM bought at the
  Battle Tower costs "48 BP", Game Corner prizes cost coins and Colosseum/XD's
  Poké Coupons are their own money; reading the leading number of those as
  Pokédollars printed TM04 at ₽48 (found 2026-10-11). They are acquisition
  facts -- the location column keeps them -- not a buy price.
*/
const OTHER_CURRENCY = /Battle Point|\bBP\b|Coin|Coupon|League Point|Sphere|Poké currency|MDBag/i

function money(cell) {
  if (cell == null) return null
  if (OTHER_CURRENCY.test(cell)) return null
  const text = textOf(cell)
  const n = text.replace(/[₽,\s]/g, '').match(/^\d+/)
  return n ? Number(n[0]) : null
}

/**
 * Every row of every `{{ItemAvailability/...head}}` table in the core part.
 * Returns the rows and whether the table had a repeatable column.
 */
function availabilityOf(core, unreadable) {
  const rows = []
  let split = false
  for (const m of core.matchAll(/\{\{ItemAvailability\/(key)?head[^}]*\}\}/gi)) {
    const isKey = !!m[1]
    if (!isKey) split = true
    const start = m.index + m[0].length
    const end = core.indexOf('\n|}', start)
    const body = core.slice(start, end < 0 ? undefined : end)
    let carryGames = null
    let carryLeft = 0
    for (const rowText of body.split(/\n\|-[^\n]*/)) {
      // A cell is a line starting with "|" (not "|-" or "|}"); a line that does
      // not start with one continues the previous cell.
      const cells = []
      for (const line of rowText.split('\n')) {
        if (/^\|(?![-}])/.test(line)) cells.push(line.slice(1))
        else if (cells.length && line.trim()) cells[cells.length - 1] += `\n${line}`
      }
      if (cells.length === 0) continue
      // `rowspan=2 | games`: the attribute part is dropped, the span remembered.
      const parsed = cells.map((c) => {
        const attr = c.match(/^\s*((?:rowspan|colspan|style|class)\s*=[^|]*)\|(?!\|)/i)
        return attr
          ? {
              span: Number(attr[1].match(/rowspan\s*=\s*"?(\d+)/i)?.[1] ?? 1),
              text: c.slice(attr[0].length),
            }
          : { span: 1, text: c }
      })
      let gamesCell
      let rest
      if (carryLeft > 0 && gamesOf(parsed[0].text, []) == null) {
        gamesCell = carryGames
        rest = parsed
        carryLeft -= 1
      } else {
        gamesCell = parsed[0].text
        rest = parsed.slice(1)
        if (parsed[0].span > 1) {
          carryGames = gamesCell
          carryLeft = parsed[0].span - 1
        }
      }
      const games = gamesOf(gamesCell, unreadable)
      if (games == null) {
        unreadable.push(`row: ${gamesCell.trim().slice(0, 60)}`)
        continue
      }
      if (games.length === 0) continue
      const finite = textOf(rest[0]?.text ?? '')
      const repeatable = isKey ? '' : textOf(rest[1]?.text ?? '')
      if (!finite && !repeatable) continue
      rows.push({ games, finite, repeatable })
    }
  }
  return { rows, split }
}

/** A TM page: `{{TMtable/row|games|location|buy|sell|...}}`. */
function tmTableOf(core, unreadable) {
  const rows = []
  const prices = {}
  for (const m of core.matchAll(/\{\{TMtable\/row\|/g)) {
    const inner = balancedFrom(core, m.index)
    if (!inner) continue
    const [, games, where, buy, sell] = splitArgs(inner)
    const vgs = gamesOf(games ?? '', unreadable)
    if (!vgs || vgs.length === 0) continue
    const finite = textOf(where ?? '')
    if (finite) rows.push({ games: vgs, finite, repeatable: '' })
    const pair = [money(buy), money(sell)]
    if (pair[0] != null || pair[1] != null) for (const vg of vgs) prices[vg] = pair
  }
  return { rows, prices }
}

// ------------------------------------------------------------ run

const out = {}
const unreadable = []
const report = { pages: 0, missingPage: [], withPrice: 0, withAcquisition: 0, rows: 0 }

for (const item of inScope) {
  const page = dump.pages[item.display_name]
  if (!page?.wikitext) {
    report.missingPage.push(item.display_name)
    continue
  }
  report.pages += 1
  const core = coreOf(page.wikitext)
  const isTm = /\{\{TMtable\/row\|/.test(core)
  let prices
  let acquisition
  if (isTm) {
    const tm = tmTableOf(core, unreadable)
    prices = tm.prices
    acquisition = { split: false, rows: tm.rows }
  } else {
    prices = pricesOf(core, unreadable)
    acquisition = availabilityOf(core, unreadable)
  }
  if (Object.keys(prices).length) report.withPrice += 1
  if (acquisition.rows.length) report.withAcquisition += 1
  report.rows += acquisition.rows.length
  out[item.name] = { title: page.title, prices, acquisition }
}

const file = {
  source: {
    site: 'bulbapedia.bulbagarden.net',
    fetched: dump.fetched,
    license: 'CC BY-NC-SA 2.5',
    generator: 'scripts/build-item-supplement.mjs',
  },
  items: out,
}
writeFileSync('public/data/item-supplement.json', `${JSON.stringify(file)}\n`)

console.log(
  `pages ${report.pages}/${inScope.length} · priced ${report.withPrice} · with acquisition ${report.withAcquisition} (${report.rows} rows)`,
)
if (report.missingPage.length) console.log(`no page: ${report.missingPage.join(', ')}`)
if (unreadable.length) {
  const counts = new Map()
  for (const u of unreadable) counts.set(u, (counts.get(u) ?? 0) + 1)
  console.log(`unreadable games cells (${unreadable.length}):`)
  for (const [u, n] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 30))
    console.log(`  ${n}× ${u}`)
}
if (unknownTemplates.size) {
  console.log('templates read by fallback (last positional arg):')
  for (const [t, n] of [...unknownTemplates].sort((a, b) => b[1] - a[1]).slice(0, 40))
    console.log(`  ${n}× ${t}`)
}
