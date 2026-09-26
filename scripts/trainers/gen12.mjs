/**
 * Generations 1 and 2: Red/Blue, Yellow, Gold/Silver, Crystal.
 *
 * GEN 1 (pokered, pokeyellow)
 *   data/trainers/parties.asm   one line per trainer, grouped by class in
 *                               TrainerDataPointers order; the `; Route 3` comments
 *                               above the lines are the disassembly's own record of
 *                               where each is fought. No names: a Gen 1 trainer is
 *                               its class and its number within the class.
 *   moves                       the level-up list (WriteMonMoves: base moves, then
 *                               every move at or below the level), then the special
 *                               moves ReadTrainer writes over them -- Red/Blue's
 *                               LoneMoves (one per Gym Leader), TeamMoves (Elite
 *                               Four) and the Champion's starter move; Yellow's
 *                               per-trainer SpecialTrainerMoves table.
 *   DVs                         every trainer Pokemon is Atk 9 / Def 8 / Spd 8 / Spc 8.
 *   prize                       the class's base money (hundredths) x last level.
 *
 * GEN 2 (pokegold, pokecrystal)
 *   data/trainers/parties.asm   named trainers, grouped by class; TRAINERTYPE_*
 *                               says whether each line carries an item and moves.
 *   dvs.asm, attributes.asm     per class: the DVs, the bag items, the base
 *                               reward and the AI flags.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p) => readFileSync(p, 'utf8')
const code = (line) => line.replace(/;.*$/, '').trim()
const comment = (line) => (/;\s*(.*)$/.exec(line)?.[1] ?? '').trim()
const dbArgs = (line) =>
  code(line)
    .replace(/^db\s+/, '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

/** `db 7, LEECH_SEED` rows after an evolution block, per species label: [[level, 'MOVE']]. */
function evosMoves(path, suffix) {
  const out = new Map()
  let label = null
  let phase = 0 // 0 evolutions, 1 learnset, 2 done
  for (const raw of read(path).split(/\r?\n/)) {
    const lm = new RegExp(`^(\\w+)${suffix}:`).exec(raw)
    if (lm) {
      label = lm[1]
      phase = 0
      out.set(label, [])
      continue
    }
    if (!label || phase === 2) continue
    const c = code(raw)
    if (!c.startsWith('db')) continue
    const a = dbArgs(raw)
    if (a.length === 1 && a[0] === '0') {
      phase += 1
      continue
    }
    if (phase === 1 && a.length === 2) out.get(label).push([Number(a[0]), a[1]])
  }
  return out
}

/** Gen 1 base moves: `db TACKLE, GROWL, NO_MOVE, NO_MOVE ; level 1 learnset`. */
function baseMoves(dir, speciesFile) {
  const p = join(dir, 'data/pokemon/base_stats', `${speciesFile}.asm`)
  if (!existsSync(p)) return null
  const line = read(p)
    .split(/\r?\n/)
    .find((l) => /level 1 learnset/i.test(l))
  return line ? dbArgs(line).filter((m) => m !== 'NO_MOVE') : []
}

// ----------------------------------------------------------------- Gen 1

export function parseGen1(vg, dir) {
  const partiesSrc = read(join(dir, 'data/trainers/parties.asm')).split(/\r?\n/)
  // Class order from the pointer table.
  const order = []
  for (const l of partiesSrc) {
    const m = /^\s*dw\s+(\w+)Data\b/.exec(l)
    if (m) order.push(m[1])
    if (/assert_table_length/.test(l)) break
  }
  const classConsts = []
  // Line-anchored: the file's own `MACRO trainer_const` definition is not a class.
  for (const m of read(join(dir, 'constants/trainer_constants.asm')).matchAll(
    /^\s*trainer_const\s+(\w+)/gm,
  )) {
    classConsts.push(m[1])
  }
  // classConsts[0] is NOBODY; classConsts[i] is the class of order[i - 1].
  const classNames = [
    ...read(join(dir, 'data/trainers/names.asm')).matchAll(/li\s+"([^"]*)"/g),
  ].map((m) => m[1])
  const money = [
    ...read(join(dir, 'data/trainers/pic_pointers_money.asm')).matchAll(
      /pic_money\s+\w+,\s*(\d+)/g,
    ),
  ].map((m) => Number(m[1]))

  const trainers = []
  let cls = -1
  let number = 0
  let location = null
  for (const raw of partiesSrc) {
    const lm = /^(\w+)Data:/.exec(raw)
    if (lm) {
      cls = order.indexOf(lm[1])
      number = 0
      location = null
      continue
    }
    if (cls < 0) continue
    if (/^\s*;/.test(raw)) {
      location = comment(raw)
      continue
    }
    if (!/^\s*db\b/.test(raw)) continue
    const a = dbArgs(raw)
    number += 1
    const party = []
    if (a[0] === '$FF') {
      for (let i = 1; i + 1 < a.length; i += 2)
        party.push({ level: Number(a[i]), species: a[i + 1] })
    } else {
      const level = Number(a[0])
      for (const s of a.slice(1)) if (s !== '0') party.push({ level, species: s })
    }
    const classConst = classConsts[cls + 1]
    trainers.push({
      id: trainers.length + 1,
      srcId: `${classConst}_${number}`,
      classConst,
      className: classNames[cls] ?? classConst,
      classNumber: number,
      name: null,
      double: false,
      items: [],
      ai: [],
      sourceLocation: location,
      unusedHint: /unused/i.test(location ?? ''),
      baseMoney: money[cls] ?? null,
      party,
    })
  }

  // Learnsets: base moves + evos_moves, keyed by the label's species name.
  const learn = evosMoves(join(dir, 'data/pokemon/evos_moves.asm'), 'EvosMoves')

  // Special moves.
  const specialsSrc = read(join(dir, 'data/trainers/special_moves.asm'))
  const specials = []
  if (/SpecialTrainerMoves/.test(specialsSrc)) {
    // Yellow: db CLASS, number / db mon, slot, MOVE ... / db 0
    let cur = null
    for (const l of specialsSrc.split(/\r?\n/)) {
      const a = /^\s*db\b/.test(l) ? dbArgs(l) : null
      if (!a) continue
      if (a.length === 2) cur = { classConst: a[0], number: Number(a[1]), moves: [] }
      else if (a.length === 3 && cur)
        cur.moves.push({ mon: Number(a[0]) - 1, slot: Number(a[1]) - 1, move: a[2] })
      else if (a.length === 1 && a[0] === '0' && cur) {
        specials.push(cur)
        cur = null
      }
    }
  } else {
    // Red/Blue: LoneMoves by Gym Leader (in badge order), TeamMoves by class,
    // and the Champion's starter move (ReadTrainer.ChampionRival).
    const lone = [...specialsSrc.split('TeamMoves')[0].matchAll(/db\s+(\d+),\s*(\w+)/g)].map(
      (m) => ({ mon: Number(m[1]), move: m[2] }),
    )
    const leaders = ['BROCK', 'MISTY', 'LT_SURGE', 'ERIKA', 'KOGA', 'SABRINA', 'BLAINE', 'GIOVANNI']
    lone.forEach((l, i) => {
      // Giovanni's is the Gym fight: his third party (Viridian Gym).
      specials.push({
        classConst: leaders[i],
        number: leaders[i] === 'GIOVANNI' ? 3 : 1,
        moves: [{ mon: l.mon, slot: 2, move: l.move }],
      })
    })
    const team = [...specialsSrc.split('TeamMoves')[1].matchAll(/db\s+([A-Z_]+),\s*(\w+)/g)].map(
      (m) => ({ classConst: m[1], move: m[2] }),
    )
    for (const t of team)
      specials.push({
        classConst: t.classConst,
        number: null,
        moves: [{ mon: 4, slot: 2, move: t.move }],
      })
    specials.push({ classConst: 'RIVAL3', number: null, champion: true })
  }

  return {
    generation: 1,
    trainers,
    learnsetFor: (speciesConst) => {
      const label = [...learn.keys()].find((k) => squash(k) === squash(speciesConst))
      return label ? learn.get(label) : null
    },
    baseMovesFor: (speciesConst) => baseMoves(dir, speciesConst.toLowerCase().replace(/_/g, '')),
    specials,
  }
}

// ----------------------------------------------------------------- Gen 2

export function parseGen2(vg, dir) {
  const groupsSrc = read(join(dir, 'data/trainers/party_pointers.asm'))
  const groups = [...groupsSrc.matchAll(/dw\s+(\w+)Group/g)].map((m) => m[1])
  // Class constants and each class's trainer constants, in order.
  const classes = []
  for (const l of read(join(dir, 'constants/trainer_constants.asm')).split(/\r?\n/)) {
    const cm = /^\s*trainerclass\s+(\w+)/.exec(l)
    if (cm) {
      classes.push({ constant: cm[1], trainers: [] })
      continue
    }
    const tm = /^\s*const\s+(\w+)/.exec(l)
    if (tm && classes.length) classes.at(-1).trainers.push(tm[1])
  }
  const dvRows = [
    ...read(join(dir, 'data/trainers/dvs.asm')).matchAll(/dn\s+(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/g),
  ].map((m) => ({
    attack: Number(m[1]),
    defense: Number(m[2]),
    speed: Number(m[3]),
    special: Number(m[4]),
  }))
  const attrSrc = read(join(dir, 'data/trainers/attributes.asm')).split(/\r?\n/)
  const attrs = []
  for (let i = 0; i < attrSrc.length; i += 1) {
    const items = /^\s*db\s+(\w+),\s*(\w+)\s*;\s*items/.exec(attrSrc[i])
    if (!items) continue
    const reward = /^\s*db\s+(\d+)/.exec(attrSrc[i + 1] ?? '')
    const ai = /^\s*dw\s+(.*)$/.exec(attrSrc[i + 2] ?? '')
    attrs.push({
      items: [items[1], items[2]].filter((x) => x !== 'NO_ITEM'),
      reward: reward ? Number(reward[1]) : null,
      ai: ai
        ? code(ai[0])
            .replace(/^dw\s+/, '')
            .split('|')
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
    })
  }

  const src = read(join(dir, 'data/trainers/parties.asm')).split(/\r?\n/)
  const trainers = []
  let cls = -1
  let number = 0
  let cur = null
  for (const raw of src) {
    const gm = /^(\w+)Group:/.exec(raw)
    if (gm) {
      cls = groups.indexOf(gm[1])
      number = 0
      continue
    }
    if (cls < 0) continue
    const nm = /^\s*db\s+"([^"]*)@",\s*(TRAINERTYPE_\w+)/.exec(raw)
    if (nm) {
      number += 1
      // classes[0] is TRAINER_NONE; the group table starts at class 1.
      const klass = classes[cls + 1]
      cur = {
        id: trainers.length + 1,
        srcId: `${klass.constant}_${klass.trainers[number - 1] ?? number}`,
        classConst: klass.constant,
        classNumber: number,
        name: nm[1],
        type: nm[2],
        double: false,
        items: attrs[cls]?.items ?? [],
        ai: attrs[cls]?.ai ?? [],
        dvs: dvRows[cls] ?? null,
        reward: attrs[cls]?.reward ?? null,
        className: null,
        party: [],
      }
      trainers.push(cur)
      continue
    }
    if (!cur || !/^\s*db\b/.test(raw)) continue
    const a = dbArgs(raw)
    if (a[0] === '-1') {
      cur = null
      continue
    }
    const hasItem = /ITEM/.test(cur.type)
    const hasMoves = /MOVES/.test(cur.type)
    const mon = { level: Number(a[0]), species: a[1], item: null, moves: null }
    let k = 2
    if (hasItem) {
      mon.item = a[k] && a[k] !== 'NO_ITEM' ? a[k] : null
      k += 1
    }
    if (hasMoves) mon.moves = a.slice(k, k + 4).filter((m) => m !== 'NO_MOVE')
    cur.party.push(mon)
  }

  const learn = evosMoves(join(dir, 'data/pokemon/evos_attacks.asm'), 'EvosAttacks')
  return {
    generation: 2,
    trainers,
    learnsetFor: (speciesConst) => {
      const label = [...learn.keys()].find((k) => squash(k) === squash(speciesConst))
      return label ? learn.get(label) : null
    },
  }
}

const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
