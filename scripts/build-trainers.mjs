/**
 * Builds the Trainer Dex bundle: public/data/trainers/<version-group>.json.
 *
 * TWO SOURCES, JOINED (owner's decision, 2026-09-26):
 *   - the pret disassemblies for WHAT each trainer carries -- species, levels,
 *     moves, held items, IVs/DVs, AI, and what the game derives from them
 *     (default moves, nature, ability slot, gender);
 *   - Bulbapedia's per-game walkthroughs for WHERE the player meets them and in
 *     what order.
 * See scripts/trainers/ for each piece; this file only runs them in order and
 * writes the result.
 *
 * FAILS RATHER THAN GUESSES, like build-supplement.mjs: an unresolved species,
 * move or item stops the build with the full list. Unmatched walkthrough
 * sightings and trainers no sighting claims are REPORTED (they are expected --
 * unused trainers, rematches the walkthrough does not repeat), with counts
 * written into the bundle's own `coverage` block so the numbers travel with it.
 *
 * Usage: node scripts/build-trainers.mjs [--only <vg>] [--refresh-wiki]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { locationPages, pageWikitext, walkthrough } from './trainers/bulbapedia.mjs'
import { makeCompleter } from './trainers/complete.mjs'
import { emeraldBrains, gen4Brains, parseFacilities } from './trainers/facilities.mjs'
import { completeFacilities } from './trainers/facility-complete.mjs'
import { parseGen1, parseGen2 } from './trainers/gen12.mjs'
import { parseGen3 } from './trainers/gen3.mjs'
import { parseGen4 } from './trainers/gen4.mjs'
import { joinSightings } from './trainers/join.mjs'
import { loadNames, squash } from './trainers/names.mjs'
import { REPOS, ensureSources } from './trainers/sources.mjs'
import { plain, sightings as readSightings } from './trainers/wikitext.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = join(ROOT, 'public', 'data')
const OUT = join(BUNDLE, 'trainers')
const CACHE = join(ROOT, '.cache', 'trainers')
const WIKI_CACHE = join(CACHE, 'bulbapedia')

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const refresh = args.includes('--refresh-wiki')

/** Which disassembly each version group reads, and the regions its walkthrough covers. */
const GAMES = {
  'red-blue': { repo: 'pokered', gen: 1, regions: ['kanto'] },
  yellow: { repo: 'pokeyellow', gen: 1, regions: ['kanto'] },
  'gold-silver': { repo: 'pokegold', gen: 2, regions: ['johto', 'kanto'] },
  crystal: { repo: 'pokecrystal', gen: 2, regions: ['johto', 'kanto'] },
  'ruby-sapphire': { repo: 'pokeruby', gen: 3, regions: ['hoenn'] },
  emerald: { repo: 'pokeemerald', gen: 3, regions: ['hoenn'] },
  'firered-leafgreen': { repo: 'pokefirered', gen: 3, regions: ['kanto'] },
  'diamond-pearl': { repo: 'pokediamond', gen: 4, regions: ['sinnoh'] },
  platinum: { repo: 'pokeplatinum', gen: 4, regions: ['sinnoh'] },
  'heartgold-soulsilver': { repo: 'pokeheartgold', gen: 4, regions: ['johto', 'kanto'] },
}

const read = (f) => JSON.parse(readFileSync(join(BUNDLE, f), 'utf8'))

function main() {
  return (async () => {
    console.log('sources')
    const dirs = ensureSources(CACHE)
    const names = loadNames(BUNDLE)
    const speciesAll = read('species.json')
    const speciesById = new Map(Object.values(speciesAll).map((s) => [s.id, s]))
    const natures = read('natures.json')
    const locations = read('locations.json').locations
    const completer = makeCompleter({ names, natures, speciesById })
    mkdirSync(OUT, { recursive: true })

    const summary = []
    for (const [vg, game] of Object.entries(GAMES)) {
      if (only && only !== vg) continue
      console.log(`\n== ${vg}`)
      let trainers
      if (game.gen === 4) {
        const raw = parseGen4(vg, dirs[game.repo])
        trainers = raw.trainers.map((t) => completer.gen4Trainer(t, vg, raw.learnset))
      } else if (game.gen <= 2) {
        const raw = game.gen === 1 ? parseGen1(vg, dirs[game.repo]) : parseGen2(vg, dirs[game.repo])
        trainers = raw.trainers.map((t) => completer.gen12Trainer(t, vg, raw))
      } else if (game.gen === 3) {
        const raw = parseGen3(vg, dirs[game.repo])
        trainers = raw.trainers.map((t) => completer.gen3Trainer(t, vg, raw.learnsetBySpecies))
      }

      // Walkthrough sightings, in play order across every part.
      const pages = await walkthrough(WIKI_CACHE, vg, { refresh })
      const seen = []
      pages.forEach((p, i) => {
        for (const s of readSightings(p.wikitext)) seen.push({ ...s, part: i + 1, page: p.title })
      })
      // `or = yes` pairs (the rival who is Brendan or May) list one party for both.
      for (let i = 1; i < seen.length; i += 1) {
        if (seen[i].pairing === 'or' && !seen[i].party.length && seen[i - 1].pairing === 'or') {
          seen[i].party = seen[i - 1].party
        }
      }
      const speciesIdFor = (m) => {
        if (m.ndex && speciesById.has(m.ndex)) return m.ndex
        const sp = names.speciesBySlug(
          squash(m.species.replace('♂', 'm').replace('♀', 'f')) === 'nidoranm'
            ? 'nidoran-m'
            : squash(m.species.replace('♀', 'f')) === 'nidoranf'
              ? 'nidoran-f'
              : m.species.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        )
        return sp?.id ?? null
      }
      const { unmatched } = joinSightings(trainers, seen, speciesIdFor)
      inheritRematches(trainers)
      const fromPages = await placeFromLocationPages(vg, game, trainers, speciesIdFor)
      inheritRematches(trainers)
      console.log(`  location pages placed ${fromPages}`)
      const unclaimed = trainers.filter((t) => !t.sightings.length && !t.rematchOf)

      const out = assemble(vg, game, trainers, seen, locations)
      out.sources = {
        disassembly: `pret/${game.repo}@${REPOS[game.repo].sha.slice(0, 12)}`,
        walkthrough: pages.map((p) => ({ title: p.title, revid: p.revid })),
      }
      const unusedCount = out.trainers.filter((t) => t.unused).length
      out.coverage = {
        trainers: trainers.length,
        unused: unusedCount,
        unplaced_in_use: unclaimed.length - unusedCount,
        placed: trainers.length - unclaimed.length,
        unplaced: unclaimed.length,
        sightings: seen.length,
        sightings_unmatched: unmatched.length,
      }
      out.checks = crossCheck(trainers, names)
      const rawFacilities = parseFacilities(vg, dirs)
      await attachBrains(vg, rawFacilities, dirs)
      const facilities = completeFacilities(vg, rawFacilities, {
        names,
        natureId: completer.natureId,
        speciesById,
        classNames: Object.fromEntries(Object.values(out.classes).map((c) => [c.id, c.name])),
        dirs,
      })
      if (facilities.dpCheck) {
        out.checks.dp_vs_platinum = facilities.dpCheck
        console.log(`  DP tower vs Platinum pool: ${JSON.stringify(facilities.dpCheck)}`)
      }
      out.facilities = [...facilities]
      for (const f of out.facilities)
        console.log(`  facility ${f.id}: ${f.sets.length} sets, ${f.trainers.length} trainers`)
      writeFileSync(join(OUT, `${vg}.json`), JSON.stringify(out))
      summary.push({ vg, ...out.coverage })
      report(vg, unmatched, unclaimed, trainers)
    }

    names.assertClean()
    console.log('\nsummary')
    console.table(summary)
  })()
}

/**
 * A rematch is the same NPC in the same place with a stronger party, so a
 * trainer no sighting claimed, sharing class and name with one that is placed,
 * takes that one's location and is marked a rematch of it. Only named trainers:
 * two nameless Gen 1 Youngsters are not one person.
 */
function inheritRematches(trainers) {
  const key = (t) => (t.name ? `${t.class_const}|${squash(t.name)}` : null)
  const placed = new Map()
  for (const t of [...trainers].sort((a, b) => a.source_index - b.source_index)) {
    if (t.sightings.length && key(t) && !placed.has(key(t))) placed.set(key(t), t)
  }
  for (const t of trainers) {
    if (t.sightings.length || !key(t)) continue
    const base = placed.get(key(t))
    if (!base) continue
    t.rematchOf = base.source_id
    const n = /REMATCH_?(\d+)$/.exec(t.source_id)?.[1]
    t.rematchLabel = n ? `Rematch ${n}` : 'Rematch'
  }
}

/**
 * Which location-page headings belong to which game: the game's own name or
 * its generation, and never the remake that shares a word with it. The exact
 * party match is the real guard; this only keeps the candidates to one game.
 */
const PAGE_GAME = {
  'red-blue': [/\b(Red|Blue|Generation I)\b/, /FireRed|Let's Go/],
  yellow: [/\b(Yellow|Generation I)\b/, /Let's Go/],
  'gold-silver': [/\b(Gold|Silver|Generation II)\b/, /HeartGold|SoulSilver/],
  crystal: [/\b(Crystal|Generation II)\b/, /HeartGold|SoulSilver/],
  'ruby-sapphire': [/\b(Ruby|Sapphire|Generation III)\b/, /Omega|Alpha/],
  emerald: [/\b(Emerald|Generation III)\b/, /Omega|Alpha/],
  'firered-leafgreen': [/\b(FireRed|LeafGreen|Generation III)\b/, /Let's Go/],
  'diamond-pearl': [/\b(Diamond|Pearl|Generation IV)\b/, /Brilliant|Shining/],
  platinum: [/\b(Platinum|Generation IV)\b/, /Brilliant|Shining/],
  'heartgold-soulsilver': [/\b(HeartGold|SoulSilver|Generation IV)\b/, /Brilliant|Shining/],
}

/**
 * The second witness: Bulbapedia's location pages, for the trainers the
 * walkthrough never shows (optional areas, post-game, rematch-only). Only
 * still-unplaced trainers take part, only against the page's "Trainers" section
 * for their own generation, and only on an exact party match (the same join as
 * the walkthrough's, so a name still decides between identical parties). A match
 * is placed at the page's location with no walkthrough order.
 */
async function placeFromLocationPages(vg, game, trainers, speciesIdFor) {
  const open = trainers.filter((t) => !t.sightings.length && !t.rematchOf && !t.placeholder)
  if (!open.length) return 0
  const [yes, no] = PAGE_GAME[vg]
  const seen = []
  for (const region of game.regions) {
    for (const page of await locationPages(WIKI_CACHE, region, { refresh })) {
      const place = page.title.replace(/^(Kanto|Johto|Hoenn|Sinnoh)\s+/, '')
      for (const s of readSightings(page.wikitext)) {
        // Under a "Trainers" heading, then under this game's (or generation's).
        const path = s.path ?? []
        const t = path.indexOf('Trainers')
        if (t < 0) continue
        const below = path.slice(t + 1)
        const gameHead = below.find((h) => yes.test(h) && !no.test(h))
        if (!gameHead) continue
        // What is left under the game heading is the area within the place.
        const area = below.slice(below.indexOf(gameHead) + 1).join(' · ') || null
        seen.push({ ...s, location: place, sublocation: area, part: null, fromPage: page.title })
      }
    }
  }
  joinSightings(open, seen, speciesIdFor)
  let placed = 0
  for (const t of open) {
    if (!t.sightings.length) continue
    placed += 1
    t.sightings = t.sightings.map((s) => ({
      ...s,
      order: null,
      part: null,
      fromLocationPage: true,
    }))
  }
  return placed
}

/**
 * Gen 1's classes that are one person -- the class name is the person's name
 * (BROCK, LORELEI) -- and the rival's three. The walkthrough writes these as
 * {{Party}} with a name and no class, so they get the title the later games
 * print, and the name comes from the walkthrough.
 */
const PERSON_CLASS = {
  BROCK: 'Leader',
  MISTY: 'Leader',
  LT_SURGE: 'Leader',
  ERIKA: 'Leader',
  KOGA: 'Leader',
  SABRINA: 'Leader',
  BLAINE: 'Leader',
  GIOVANNI: 'Boss',
  LORELEI: 'Elite Four',
  BRUNO: 'Elite Four',
  AGATHA: 'Elite Four',
  LANCE: 'Elite Four',
  RIVAL1: 'Rival',
  RIVAL2: 'Rival',
  RIVAL3: 'Champion',
  PROF_OAK: 'Professor',
}

/** Rival classes carry the name the player types; the data holds a placeholder. */
const PLAYER_NAMED = /RIVAL|PKMN_TRAINER|PLAYER/

/** The Frontier Brains join their facility's trainer list (see facilities.mjs). */
async function attachBrains(vg, facilities, dirs) {
  const frontier = facilities.find(
    (f) => f.id === 'battle-frontier' || (vg === 'diamond-pearl' && f.id === 'battle-tower'),
  )
  if (!frontier) return
  if (vg === 'emerald') {
    frontier.trainers.push(...emeraldBrains(dirs.pokeemerald))
    return
  }
  if (!['diamond-pearl', 'platinum', 'heartgold-soulsilver'].includes(vg)) return
  const pages = []
  for (const name of ['Palmer', 'Dahlia', 'Darach']) {
    const p = await pageWikitext(join(WIKI_CACHE, 'brains'), name, { refresh })
    pages.push([name, readSightings(p.wikitext)])
  }
  frontier.trainers.push(...gen4Brains(vg, pages))
}

/** The partition as the app reads it. */
function assemble(vg, game, trainers, seen, locations) {
  const regionLocs = Object.values(locations).filter((l) => game.regions.includes(l.region))
  const locKey = (s) =>
    squash((s ?? '').replace(/^(Kanto|Johto|Hoenn|Sinnoh)\s+/i, '').replace(/\(.*?\)/g, ''))
  const locByKey = new Map(regionLocs.map((l) => [locKey(l.display_name), l.id]))

  // Class display names: the walkthrough's spelling, by majority, per class constant.
  const votes = new Map()
  for (const t of trainers) {
    for (const s of t.sightings) {
      if (!s.className) continue
      const v = votes.get(t.class_const) ?? new Map()
      v.set(s.className, (v.get(s.className) ?? 0) + 1)
      votes.set(t.class_const, v)
    }
  }
  const classes = {}
  for (const t of trainers) {
    if (classes[t.class_const]) continue
    const v = votes.get(t.class_const)
    const name = v
      ? [...v.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : (PERSON_CLASS[t.class_const] ?? prettyClass(t.class_const))
    classes[t.class_const] = { id: t.class_const, name }
  }

  const bySource = new Map(trainers.map((t) => [t.source_id, t]))
  const records = trainers.map((t) => {
    const base = t.rematchOf ? bySource.get(t.rematchOf) : null
    const sightings = t.sightings.length ? t.sightings : (base?.sightings.slice(0, 1) ?? [])
    const first = sightings[0]
    const prize = t.prize ?? t.sightings[0]?.prize ?? null
    const wikiName = t.nameMismatch?.wiki ?? null
    // Gen 1 trainers carry no name at all; a boss's comes from the walkthrough
    // ("Brock"), an ordinary Youngster stays nameless, as in the game.
    const name =
      (wikiName && PLAYER_NAMED.test(t.class_const) ? wikiName : t.name) ??
      (PERSON_CLASS[t.class_const]
        ? (t.sightings[0]?.name ?? base?.sightings[0]?.name ?? null)
        : null)
    return {
      id: t.source_id,
      index: t.source_index,
      class_id: t.class_const,
      name,
      game_name: name !== t.name ? t.name : undefined,
      rematch_of: t.rematchOf ?? undefined,
      // In the data but not in the game: dummy slots, Gen 1 lines the disassembly
      // marks unused, FRLG's Ruby/Sapphire leftovers. Kept for completeness.
      unused:
        !sightings.length && (t.placeholder || t.unused_hint || /DUMMY|UNUSED/.test(t.source_id))
          ? true
          : undefined,
      versions: versionsOf(t.sightings),
      battle: t.double ? 'double' : first?.pairing === 'tag' ? 'tag' : 'single',
      prize,
      items: t.items,
      ai: t.ai,
      party: t.party,
      appearances: sightings.map((s) => ({
        inherited: t.sightings.length ? undefined : true,
        // Where the placement came from: the walkthrough (with play order) or a
        // location page (the trainer is there, the walkthrough just skips it).
        source: s.fromLocationPage ? 'location-page' : 'walkthrough',
        order: s.order,
        part: s.part,
        location: s.location,
        area: s.sublocation && s.sublocation !== s.location ? s.sublocation : null,
        location_id: locByKey.get(locKey(s.location)) ?? null,
        variant: t.sightings.length
          ? (s.variant ?? (s.caption && s.kind !== 'entry' ? s.caption : null))
          : t.rematchLabel,
        note: s.note ?? null,
      })),
    }
  })
  records.sort(
    (a, b) =>
      (a.appearances[0]?.order ?? 1e9) - (b.appearances[0]?.order ?? 1e9) || a.index - b.index,
  )

  // The walkthrough's location sequence, for a game-order view.
  const route = []
  for (const s of seen) {
    const last = route.at(-1)
    if (last && last.location === s.location) continue
    route.push({
      part: s.part,
      location: s.location,
      location_id: locByKey.get(locKey(s.location)) ?? null,
    })
  }

  return { version_group: vg, generation: game.gen, classes, trainers: records, route }
}

/** Version-exclusive fights, from the walkthrough's `game =` tag (Ruby/Sapphire bosses). */
function versionsOf(sightings) {
  const tags = new Set(sightings.map((s) => (s.game ?? '').trim().toLowerCase()))
  const out = new Set()
  for (const t of tags) {
    if (['ru', 'r', 'ruby'].includes(t)) out.add('ruby')
    else if (['sa', 's', 'sapphire'].includes(t)) out.add('sapphire')
    else return undefined
  }
  return out.size ? [...out] : undefined
}

function prettyClass(c) {
  return c
    .replace(/^TRAINER_?CLASS_/, '')
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

/**
 * The walkthrough as an independent witness for what the build DERIVES: prize
 * money (a formula over class and level), gender (from the personality or the
 * Attack DV), the moves of every boss the wiki writes out -- which covers the
 * level-up default wherever a boss has no scripted set -- and held items.
 * Counts go into the bundle; mismatches are printed.
 */
function crossCheck(trainers, names) {
  const c = { prize: [0, 0], gender: [0, 0], moves: [0, 0], items: [0, 0] }
  const bad = { prize: [], gender: [], moves: [], items: [] }
  const G = { '♂': 'M', '♀': 'F', male: 'M', female: 'F', m: 'M', f: 'F' }
  for (const t of trainers) {
    for (const s of t.sightings.slice(0, 1)) {
      if (s.prize != null && t.prize != null) {
        c.prize[1] += 1
        if (s.prize === t.prize) c.prize[0] += 1
        else bad.prize.push(`${t.source_id} wiki ${s.prize} vs ${t.prize}`)
      }
      // Pair each wiki Pokemon with ours by species and level, not position:
      // the wiki sometimes lists a party in a different order than the game.
      const pool = [...t.party]
      s.party.forEach((w, i) => {
        const wid =
          w.ndex ?? names.speciesBySlug(w.species.toLowerCase().replace(/[^a-z0-9]+/g, '-'))?.id
        let k = pool.findIndex((m) => m && m.species_id === wid && m.level === w.level)
        if (k < 0) k = pool.findIndex((m) => m && m.species_id === wid)
        const m = k >= 0 ? pool[k] : null
        if (k >= 0) pool[k] = null
        if (!m) return
        const wg = G[(w.gender ?? '').trim().toLowerCase()] ?? G[(w.gender ?? '').trim()]
        if (wg && m.gender) {
          c.gender[1] += 1
          if (wg === m.gender) c.gender[0] += 1
          else bad.gender.push(`${t.source_id} #${i + 1} wiki ${wg} vs ${m.gender}`)
        }
        if (w.moves && w.moves.length) {
          const want = w.moves.map((x) => names.moveQuiet(x)?.id ?? x)
          c.moves[1] += 1
          if (JSON.stringify([...want].sort()) === JSON.stringify([...m.moves].sort()))
            c.moves[0] += 1
          else
            bad.moves.push(
              `${t.source_id} #${i + 1} ${m.moves_explicit ? 'set' : 'default'} wiki [${w.moves}] vs [${m.moves.map((id) => names.moveById(id)?.name)}]`,
            )
        }
        if (w.item && !/^(no|none|-)$/i.test(w.item.trim())) {
          const wi = names.itemQuiet(w.item)?.id
          c.items[1] += 1
          if (wi === m.item_id || (m.item_name && squash(m.item_name) === squash(w.item)))
            c.items[0] += 1
          else
            bad.items.push(
              `${t.source_id} #${i + 1} wiki ${w.item} vs ${m.item_name ?? names.itemById?.(m.item_id)?.name ?? m.item_id}`,
            )
        }
      })
    }
  }
  for (const k of Object.keys(c)) {
    const [ok, n] = c[k]
    if (n)
      console.log(
        `  check ${k}: ${ok}/${n}${bad[k].length ? '  e.g. ' + bad[k].slice(0, 3).join(' | ') : ''}`,
      )
  }
  return Object.fromEntries(
    Object.entries(c).map(([k, [ok, n]]) => [k, { agree: ok, compared: n }]),
  )
}

function report(vg, unmatched, unclaimed, trainers) {
  const placed = trainers.length - unclaimed.length
  console.log(
    `  trainers ${trainers.length}, placed ${placed}, unplaced ${unclaimed.length}; sightings unmatched ${unmatched.length}`,
  )
  const mism = trainers.filter((t) => t.nameMismatch)
  if (mism.length)
    console.log(
      `  name differs (wiki vs game): ${mism
        .slice(0, 8)
        .map((t) => `${t.nameMismatch.wiki}/${t.nameMismatch.game}`)
        .join(', ')}${mism.length > 8 ? ' ...' : ''}`,
    )
  for (const u of unmatched.slice(0, 12)) {
    console.log(
      `  ? ${u.reason}: ${u.className ?? ''} ${u.name ?? ''} @ ${u.location} [${u.party.map((m) => `${m.species} ${m.level}`).join(', ')}] (part ${u.part})`,
    )
  }
  if (unmatched.length > 12) console.log(`  ... ${unmatched.length - 12} more unmatched`)
}

export { plain }

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
