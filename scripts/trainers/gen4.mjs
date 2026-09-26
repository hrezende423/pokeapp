/**
 * Generation 4 trainers: Diamond/Pearl, Platinum, HeartGold/SoulSilver.
 *
 *   platinum            res/trainers/data/<id>.json, one file per trainer, ordered
 *                       by generated/trainers.txt (line index = trainer id)
 *   diamond-pearl       files/poketool/trainer/trdata.json, `index` = trainer id
 *   heartgold-soulsilver files/poketool/trainer/trainers.json, position = trainer id
 *
 * Each returns the shared raw shape (see build-trainers.mjs); personality, nature,
 * ability, gender and default moves are filled in by the common completion step,
 * which needs the bundle's species data.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const lines = (p) =>
  readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
const trName = (s) => (s ?? '').replace(/\{TRNAME\}/g, '').trim() || null

// Table rows in any of the three spellings the sources use -- `[CONST] = VALUE,`,
// a leading block comment naming CONST, or `VALUE, // CONST` -- in order.
function tableRows(source, tableName) {
  const start = source.indexOf(tableName)
  if (start < 0) throw new Error(`table ${tableName} not found`)
  const open = source.indexOf('{', start)
  const close = source.indexOf('};', open)
  const body = source.slice(open + 1, close)
  const rows = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    let m = /^\[(\w+)\]\s*=\s*([\w-]+)/.exec(line)
    if (m) {
      rows.push({ key: m[1], value: m[2] })
      continue
    }
    m = /^\/\*\s*(\w+)\s*\*\/\s*([\w-]+)/.exec(line)
    if (m) {
      rows.push({ key: m[1], value: m[2] })
      continue
    }
    m = /^([\w-]+)\s*,\s*\/\/\s*(\w+)/.exec(line)
    if (m) {
      rows.push({ key: m[2], value: m[1] })
      continue
    }
  }
  return rows
}

/** `#define NAME 12` constants from a header, as { NAME: 12 }. */
function defines(path, prefix) {
  const out = {}
  for (const m of readFileSync(path, 'utf8').matchAll(/#define\s+(\w+)\s+(\d+)/g)) {
    if (!prefix || m[1].startsWith(prefix)) out[m[1]] = Number(m[2])
  }
  return out
}

const isFemale = (v) => v === 'GENDER_FEMALE' || v === 'TRAINER_FEMALE' || v === '1'
const isPair = (v) => v === 'TRAINER_DOUBLE' || v === 'GENDER_NONE' || v === '2'

/** Minimal NARC reader: the member files of a Nintendo archive, as Buffers. */
export function narcFiles(buf) {
  if (buf.toString('latin1', 0, 4) !== 'NARC') throw new Error('not a NARC')
  let off = buf.readUInt16LE(12)
  const sections = {}
  for (let i = 0; i < 3; i += 1) {
    const magic = buf.toString('latin1', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    sections[magic] = { off, size }
    off += size
  }
  const fat = sections.BTAF
  const count = buf.readUInt16LE(fat.off + 8)
  const gmif = sections.GMIF.off + 8
  const files = []
  for (let i = 0; i < count; i += 1) {
    const s = buf.readUInt32LE(fat.off + 12 + i * 8)
    const e = buf.readUInt32LE(fat.off + 16 + i * 8)
    files.push(buf.subarray(gmif + s, gmif + e))
  }
  return files
}

/** Learnsets keyed by national dex number: [[level, 'MOVE_X' | moveId], ...] in game order. */
function learnsets(vg, dir, speciesOrder) {
  const out = new Map()
  if (vg === 'platinum') {
    const byConst = new Map(speciesOrder.map((c, i) => [c, i]))
    for (const d of readdirSync(join(dir, 'res/pokemon'))) {
      let data
      try {
        data = readJson(join(dir, 'res/pokemon', d, 'data.json'))
      } catch {
        continue
      }
      const id = byConst.get(`SPECIES_${d.toUpperCase()}`)
      if (id == null || !data.learnset?.by_level) continue
      out.set(
        id,
        data.learnset.by_level.map(([lv, mv]) => [lv, mv]),
      )
    }
  } else if (vg === 'diamond-pearl') {
    const rows = readJson(join(dir, 'files/poketool/personal/wotbl.json')).wotbl
    rows.forEach((r, i) =>
      out.set(
        i,
        r.moves.map((m) => [m.level, `MOVE_${m.move}`]),
      ),
    )
  } else {
    const files = narcFiles(readFileSync(join(dir, 'files/poketool/personal/wotbl.narc')))
    files.forEach((f, i) => {
      const list = []
      for (let o = 0; o + 1 < f.length; o += 2) {
        const v = f.readUInt16LE(o)
        if (v === 0xffff) break
        list.push([v >> 9, v & 0x1ff])
      }
      out.set(i, list)
    })
  }
  return out
}

export function parseGen4(vg, dir) {
  let trainers
  let classIndex
  let classGender
  let prizeMul = null
  let aiNames = null

  if (vg === 'platinum') {
    // The generated lists end with a MAX_ / NUM_ sentinel that is not an entry.
    const order = lines(join(dir, 'generated/trainers.txt')).filter((l) => l.startsWith('TRAINER_'))
    const classes = lines(join(dir, 'generated/trainer_classes.txt')).filter((l) =>
      l.startsWith('TRAINER_CLASS_'),
    )
    classIndex = Object.fromEntries(classes.map((c, i) => [c, i]))
    classGender = Object.fromEntries(
      tableRows(
        readFileSync(join(dir, 'include/data/trainer_class_genders.h'), 'utf8'),
        'sTrainerClassGender',
      ).map((r) => [r.key, r.value]),
    )
    prizeMul = Object.fromEntries(
      tableRows(
        readFileSync(join(dir, 'include/data/trainer_class_prize_mul.h'), 'utf8'),
        'sTrainerClassPrizeMul',
      ).map((r) => [r.key, Number(r.value)]),
    )
    aiNames = lines(join(dir, 'generated/ai_flags.txt'))
    trainers = order.map((constant, id) => {
      if (id === 0) return null
      const t = readJson(
        join(dir, 'res/trainers/data', `${constant.replace(/^TRAINER_/, '').toLowerCase()}.json`),
      )
      return {
        id,
        srcId: constant,
        classConst: t.class,
        name: t.name || null,
        double: !!t.double_battle,
        items: (t.items ?? []).filter((x) => x && x !== 'ITEM_NONE'),
        ai: t.ai_flags ?? [],
        party: t.party.map((m) => ({
          species: m.species,
          form: m.form ?? 0,
          level: m.level,
          item: m.item && m.item !== 'ITEM_NONE' ? m.item : null,
          moves: m.moves ? m.moves.filter((x) => x !== 'MOVE_NONE') : null,
          difficulty: m.iv_scale,
          genderOverride: 0,
          abilityOverride: 0,
        })),
      }
    })
  } else if (vg === 'diamond-pearl') {
    classIndex = defines(join(dir, 'include/constants/trainer_classes.h'), 'TRAINER_CLASS_')
    const src = readFileSync(join(dir, 'arm9/src/trainer_data.c'), 'utf8')
    classGender = Object.fromEntries(
      tableRows(src, 'sTrainerClassGenderCountTbl').map((r) => [r.key, r.value]),
    )
    const consts = Object.fromEntries(
      Object.entries(defines(join(dir, 'include/constants/trainers.h'), 'TRAINER_')).map(
        ([k, v]) => [v, k],
      ),
    )
    trainers = readJson(join(dir, 'files/poketool/trainer/trdata.json')).trdata.map((t) => {
      if (t.index === 0) return null
      return {
        id: t.index,
        srcId: consts[t.index] ?? `TRAINER_${t.index}`,
        classConst: t.class,
        name: trName(t.name),
        double: !!t.doubleBattle,
        items: (t.items ?? []).filter((x) => x && x !== 'ITEM_NONE'),
        ai: t.unkC ?? 0,
        party: t.party.map((m) => ({
          species: m.species,
          form: 0,
          level: m.level,
          item: m.item && m.item !== 'ITEM_NONE' ? m.item : null,
          moves: m.moves ? m.moves.filter((x) => x !== 'MOVE_NONE') : null,
          difficulty: m.difficulty,
          genderOverride: 0,
          abilityOverride: 0,
        })),
      }
    })
  } else {
    classIndex = defines(join(dir, 'include/constants/trainer_class.h'), 'TRAINERCLASS_')
    const src = readFileSync(join(dir, 'src/trainer_data.c'), 'utf8')
    classGender = Object.fromEntries(tableRows(src, 'sTrainerGenders').map((r) => [r.key, r.value]))
    const consts = Object.fromEntries(
      Object.entries(defines(join(dir, 'include/constants/trainers.h'), 'TRAINER_')).map(
        ([k, v]) => [v, k],
      ),
    )
    const G = {
      TRPOKE_GENDER_OVERRIDE_OFF: 0,
      TRPOKE_GENDER_OVERRIDE_MALE: 1,
      TRPOKE_GENDER_OVERRIDE_FEMALE: 2,
    }
    const A = {
      TRPOKE_ABILITY_OVERRIDE_OFF: 0,
      TRPOKE_ABILITY_OVERRIDE_FIRST: 1,
      TRPOKE_ABILITY_OVERRIDE_SECOND: 2,
    }
    trainers = readJson(join(dir, 'files/poketool/trainer/trainers.json')).trainers.map((t, id) => {
      if (id === 0) return null
      return {
        id,
        srcId: consts[id] ?? `TRAINER_${id}`,
        classConst: t.class,
        name: trName(t.name),
        double: !!t.double,
        items: (t.items ?? []).filter((x) => x && x !== 'ITEM_NONE'),
        ai: t.ai_flags ?? 0,
        party: t.party.map((m) => {
          const g = G[m.genderOverride] ?? 0
          const a = A[m.abilityOverride] ?? 0
          if (m.genderOverride && !(m.genderOverride in G))
            throw new Error(`HGSS gender override ${m.genderOverride}`)
          if (m.abilityOverride && !(m.abilityOverride in A))
            throw new Error(`HGSS ability override ${m.abilityOverride}`)
          return {
            species: m.species,
            form: m.form ?? 0,
            level: m.level,
            item: m.item && m.item !== 'ITEM_NONE' ? m.item : null,
            moves: m.moves ? m.moves.filter((x) => x !== 'MOVE_NONE') : null,
            difficulty: m.difficulty,
            genderOverride: g,
            abilityOverride: a,
          }
        }),
      }
    })
  }

  // Numeric AI flags (DP, HGSS) decode against Platinum's flag names, which are
  // the same bit layout across the generation.
  const decodeAi = (ai) => {
    if (Array.isArray(ai)) return ai
    const names = aiNames ?? AI_BITS
    const out = []
    for (let b = 0; b < 30; b += 1) if (ai & (1 << b)) out.push(names[b + 1] ?? `AI_BIT_${b}`)
    return out
  }

  const speciesOrder = vg === 'platinum' ? lines(join(dir, 'generated/species.txt')) : null
  const moves = learnsets(vg, dir, speciesOrder ?? [])

  return {
    generation: 4,
    trainers: trainers.filter(Boolean).map((t) => {
      if (!(t.classConst in classIndex)) throw new Error(`${vg}: unknown class ${t.classConst}`)
      const g = classGender[t.classConst]
      return {
        ...t,
        ai: decodeAi(t.ai),
        classIndex: classIndex[t.classConst],
        classGender: isPair(g) ? 'pair' : isFemale(g) ? 'female' : 'male',
        prizeMultiplier: prizeMul ? (prizeMul[t.classConst] ?? null) : null,
      }
    }),
    /** Look up a species' level-up list by national dex number. */
    learnset: (nationalId) => moves.get(nationalId) ?? null,
  }
}

/** Platinum's generated/ai_flags.txt, for the games whose sources carry only the bitfield. */
const AI_BITS = [
  'AI_FLAG_NONE',
  'AI_FLAG_BASIC',
  'AI_FLAG_EVAL_ATTACK',
  'AI_FLAG_EXPERT',
  'AI_FLAG_SETUP_FIRST_TURN',
  'AI_FLAG_RISKY',
  'AI_FLAG_PRIORITIZE_EXTREMES',
  'AI_FLAG_BATON_PASS',
  'AI_FLAG_TAG_STRATEGY',
  'AI_FLAG_CHECK_HP',
  'AI_FLAG_WEATHER',
  'AI_FLAG_HARRASSMENT',
]
