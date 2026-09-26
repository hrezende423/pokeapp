/**
 * Bulbapedia walkthroughs: where each trainer stands, and in what order.
 *
 * The disassemblies say exactly what a trainer carries but not where the player
 * meets them in play order. Bulbapedia's per-game walkthroughs (namespace 108,
 * "Walkthrough:Pokémon Platinum/Part 2" and so on) are written in that order:
 * one `==Location==` section after another, each with its trainer table. So a
 * walkthrough gives three things at once -- the location, the order within it,
 * and the order of locations through the game.
 *
 * CACHED, then offline. Each page's wikitext is written to
 * .cache/trainers/bulbapedia/ on first fetch and read from there afterwards, so
 * a rebuild does not touch the wiki. `--refresh-wiki` refetches.
 *
 * ETIQUETTE, the same courtesy recon-bulbapedia.mjs and build-supplement.mjs
 * extend: one request at a time, a delay between them, a User-Agent naming the
 * project. Content is CC BY-NC-SA; the app credits Bulbapedia where it shows it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const API = 'https://bulbapedia.bulbagarden.net/w/api.php'
const UA =
  'pokeapp-data-recon/0.1 (personal, non-commercial learning project; https://github.com/hrezende423/pokeapp)'
const DELAY_MS = 1200
const WALKTHROUGH_NS = 108
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The wiki's walkthrough title for each version group in scope. */
export const WALKTHROUGH_GAMES = {
  'red-blue': 'Red and Blue',
  yellow: 'Yellow',
  'gold-silver': 'Gold and Silver',
  crystal: 'Crystal',
  'ruby-sapphire': 'Ruby and Sapphire',
  emerald: 'Emerald',
  'firered-leafgreen': 'FireRed and LeafGreen',
  'diamond-pearl': 'Diamond and Pearl',
  platinum: 'Platinum',
  'heartgold-soulsilver': 'HeartGold and SoulSilver',
}

let last = 0
async function api(params) {
  const wait = last + DELAY_MS - Date.now()
  if (wait > 0) await sleep(wait)
  last = Date.now()
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) return res.json()
    if (attempt >= 4) throw new Error(`Bulbapedia ${res.status} for ${url}`)
    await sleep(DELAY_MS * attempt * 2)
  }
}

const safe = (title) => title.replace(/[^A-Za-z0-9._-]+/g, '_')

/** Wikitext for one page, from the cache when present. */
export async function pageWikitext(cacheDir, title, { refresh = false } = {}) {
  mkdirSync(cacheDir, { recursive: true })
  const file = join(cacheDir, `${safe(title)}.json`)
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const d = await api({ action: 'parse', page: title, prop: 'wikitext|revid', redirects: '1' })
  if (d.error) throw new Error(`Bulbapedia: ${title}: ${d.error.info}`)
  const page = { title: d.parse.title, revid: d.parse.revid, wikitext: d.parse.wikitext }
  writeFileSync(file, JSON.stringify(page))
  return page
}

/** "Part 10" sorts after "Part 9"; the extra chapters (Underground, ...) go last. */
function partRank(title) {
  const m = /\/Part (\d+)$/.exec(title)
  return m ? Number(m[1]) : 1000
}

/**
 * Every walkthrough part for one version group, in play order, with wikitext.
 * The part list itself is cached too, so an offline rebuild needs no network.
 */
export async function walkthrough(cacheDir, versionGroup, opts = {}) {
  const game = WALKTHROUGH_GAMES[versionGroup]
  if (!game) throw new Error(`no walkthrough known for ${versionGroup}`)
  mkdirSync(cacheDir, { recursive: true })
  const listFile = join(cacheDir, `_parts_${versionGroup}.json`)
  let titles
  if (!opts.refresh && existsSync(listFile)) {
    titles = JSON.parse(readFileSync(listFile, 'utf8'))
  } else {
    const d = await api({
      action: 'query',
      list: 'allpages',
      apnamespace: String(WALKTHROUGH_NS),
      apprefix: `Pokémon ${game}/`,
      aplimit: '200',
    })
    titles = d.query.allpages.map((p) => p.title).sort((a, b) => partRank(a) - partRank(b))
    writeFileSync(listFile, JSON.stringify(titles))
  }
  const pages = []
  for (const title of titles) pages.push(await pageWikitext(cacheDir, title, opts))
  return pages
}

/**
 * Location pages, the second witness: each lists every trainer at that place,
 * per game, including the ones a walkthrough passes over (optional areas,
 * rematch-only trainers, post-game). Used only for trainers the walkthrough
 * join left unplaced. Membership comes from the region's location category.
 */
export async function locationPages(cacheDir, region, opts = {}) {
  mkdirSync(cacheDir, { recursive: true })
  const listFile = join(cacheDir, `_locations_${region}.json`)
  let titles
  if (!opts.refresh && existsSync(listFile)) {
    titles = JSON.parse(readFileSync(listFile, 'utf8'))
  } else {
    titles = []
    let cont = null
    do {
      const d = await api({
        action: 'query',
        list: 'categorymembers',
        cmtitle: `Category:${region.charAt(0).toUpperCase()}${region.slice(1)} locations`,
        cmnamespace: '0',
        cmlimit: '500',
        ...(cont ? { cmcontinue: cont } : {}),
      })
      titles.push(...d.query.categorymembers.map((m) => m.title))
      cont = d.continue?.cmcontinue ?? null
    } while (cont)
    writeFileSync(listFile, JSON.stringify(titles))
  }
  const pages = []
  for (const title of titles) {
    try {
      pages.push(await pageWikitext(join(cacheDir, 'locations'), title, opts))
    } catch (e) {
      console.warn(`  skip ${title}: ${e.message}`)
    }
  }
  return pages
}
