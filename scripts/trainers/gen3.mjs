/**
 * Generation 3 trainers: Ruby/Sapphire, Emerald, FireRed/LeafGreen.
 *
 *   gTrainers[]        src/data/trainers.h (Emerald, FRLG) / trainers_en.h (Ruby)
 *   parties            src/data/trainer_parties.h -- C initializer arrays, some
 *                      FRLG ones spelled through #define macros (expanded here)
 *   level-up lists     src/data/pokemon/level_up_learnsets.h + the pointer table;
 *                      Ruby's pointer table is positional, so it is matched to
 *                      species by include/constants/species.h's numbering
 *   money              gTrainerMoneyTable (src/battle_main.c; Ruby
 *                      data/trainer_money.inc)
 *   name hash          charmap.txt + species_names(_en).h: the personality value is
 *                      built from the in-game character codes (see personality())
 *
 * Personality -- CreateNPCTrainerParty, identical in all three games:
 *   base = 0x80 for a double battle, 0x78 for a female trainer, else 0x88
 *   nameHash += the trainer's name codes, then the species' name codes, and is
 *   NEVER reset between party members, so each Pokemon's value carries every
 *   earlier one; personality = base + (nameHash << 8), mod 2^32.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p) => readFileSync(p, 'utf8')

/** Drop comments; keep line structure. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/**
 * #define macros, expanded textually: object-like ones (FRLG's
 * DUMMY_TRAINER_MON) and function-like ones with `##` pasting (Emerald's
 * FRONTIER_MONS_BUG_CATCHER_1_EXTRA(species1, species2) builds
 * FRONTIER_MON_##species1). Multi-line bodies with backslashes are joined first.
 */
function expandMacros(src) {
  const objects = new Map()
  const functions = new Map()
  const joined = src.replace(/\\r?\n/g, ' ')
  const body = joined.replace(
    /^#define\s+(\w+)(\(([^)]*)\))?([^\n]*)$/gm,
    (_, name, _p, params, value) => {
      const text = value.trim()
      if (params != null)
        functions.set(name, {
          params: params
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          text,
        })
      else objects.set(name, text)
      return ''
    },
  )
  let out = body
  for (let pass = 0; pass < 4; pass += 1) {
    for (const [name, { params, text }] of functions) {
      out = out.replace(new RegExp(`\\b${name}\\s*\\(([^()]*)\\)`, 'g'), (_, argText) => {
        const args = argText.split(',').map((x) => x.trim())
        let r = text
        params.forEach((p, i) => {
          r = r.replace(new RegExp(`\\b${p}\\b`, 'g'), args[i] ?? '')
        })
        return r.replace(/\s*##\s*/g, '')
      })
    }
    if (objects.size) {
      const re = new RegExp(`\\b(${[...objects.keys()].join('|')})\\b`, 'g')
      out = out.replace(re, (m) => objects.get(m))
    }
  }
  return out
}

/** Top-level `{ ... }` groups inside a string, as their inner text. */
function braceGroups(s) {
  const out = []
  let depth = 0
  let start = -1
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '{') {
      if (depth === 0) start = i + 1
      depth += 1
    } else if (s[i] === '}') {
      depth -= 1
      if (depth === 0) out.push(s.slice(start, i))
    }
  }
  return out
}

/** `.field = value` pairs of one initializer (values may be `{...}` groups). */
function fields(s) {
  const out = {}
  const re = /\.(\w+)\s*=\s*/g
  let m
  while ((m = re.exec(s))) {
    let i = re.lastIndex
    let depth = 0
    let paren = 0
    let j = i
    for (; j < s.length; j += 1) {
      const c = s[j]
      if (c === '{') depth += 1
      else if (c === '}') {
        if (depth === 0) break
        depth -= 1
      } else if (c === '(') paren += 1
      else if (c === ')') paren -= 1
      else if (c === ',' && depth === 0 && paren === 0) break
    }
    // Ruby elides the braces around a move list (`.moves = A, B, C, D`), so an
    // unbraced value runs on to the next designator rather than the next comma.
    if (s[i] !== '{' && m[1] === 'moves') {
      const next = s.slice(i).search(/\.\w+\s*=/)
      j = next < 0 ? s.length : i + next
    }
    out[m[1]] = s.slice(i, j).trim().replace(/,$/, '')
    re.lastIndex = j
  }
  return out
}

const list = (v) =>
  (v ?? '')
    .replace(/^\{|\}$/g, '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
const cString = (v) => /_\("(.*)"\)/.exec(v ?? '')?.[1] ?? null

/** charmap.txt -> Map(character -> byte codes). */
function charmap(path) {
  const map = new Map()
  for (const line of read(path).split(/\r?\n/)) {
    const m = /^'((?:\\.|[^'])+)'\s*=\s*([0-9A-Fa-f ]+)/.exec(line)
    if (!m) continue
    const ch = m[1].replace(/^\\(.)$/, '$1')
    if (!map.has(ch))
      map.set(
        ch,
        m[2]
          .trim()
          .split(/\s+/)
          .map((h) => parseInt(h, 16)),
      )
  }
  return map
}

function encode(text, cmap) {
  const codes = []
  for (const ch of text) {
    const c = cmap.get(ch)
    if (!c)
      throw new Error(`charmap has no code for ${JSON.stringify(ch)} in ${JSON.stringify(text)}`)
    codes.push(...c)
  }
  return codes
}

const FILES = {
  'ruby-sapphire': {
    trainers: 'src/data/trainers_en.h',
    speciesNames: 'src/data/text/species_names_en.h',
    money: 'data/trainer_money.inc',
  },
  emerald: {
    trainers: 'src/data/trainers.h',
    speciesNames: 'src/data/text/species_names.h',
    money: 'src/battle_main.c',
  },
  'firered-leafgreen': {
    trainers: 'src/data/trainers.h',
    speciesNames: 'src/data/text/species_names.h',
    money: 'src/battle_main.c',
  },
}

export function parseGen3(vg, dir) {
  const f = FILES[vg]
  const cmap = charmap(join(dir, 'charmap.txt'))

  // ------------------------------------------------------------- parties
  const rawParties = stripComments(read(join(dir, 'src/data/trainer_parties.h')))
  // FRLG fills the Ruby/Sapphire classes it never uses with DUMMY_TRAINER_* macro
  // parties; those trainers are placeholders, recorded before the macros expand.
  const placeholders = new Set(
    [...rawParties.matchAll(/(\w+)\s*\[\s*\]\s*=\s*\{\s*DUMMY_TRAINER_\w+\s*\}/g)].map((m) => m[1]),
  )
  const partySrc = expandMacros(rawParties)
  const parties = new Map()
  for (const m of partySrc.matchAll(
    /const\s+struct\s+(TrainerMon\w+)\s+(\w+)\s*\[\s*\]\s*=\s*\{([\s\S]*?)\};/g,
  )) {
    parties.set(
      m[2],
      braceGroups(m[3]).map((g) => {
        const x = fields(g)
        const moves = x.moves ? list(x.moves).filter((mv) => mv !== 'MOVE_NONE') : null
        return {
          species: x.species,
          level: Number(x.lvl ?? x.level),
          iv: Number(x.iv ?? 0),
          item: x.heldItem && x.heldItem !== 'ITEM_NONE' ? x.heldItem : null,
          moves: m[1].includes('CustomMoves') ? moves : null,
        }
      }),
    )
  }

  // ------------------------------------------------------------ trainers
  const tsrc = stripComments(read(join(dir, f.trainers)))
  const table = tsrc.slice(tsrc.indexOf('gTrainers'))
  const trainers = []
  const entryRe = /\[(TRAINER_\w+)\]\s*=\s*\{/g
  let m
  let index = -1
  while ((m = entryRe.exec(table))) {
    // The initializer runs to its matching brace.
    let depth = 1
    let j = entryRe.lastIndex
    for (; j < table.length && depth; j += 1) {
      if (table[j] === '{') depth += 1
      else if (table[j] === '}') depth -= 1
    }
    const x = fields(table.slice(entryRe.lastIndex, j - 1))
    entryRe.lastIndex = j
    index += 1
    if (m[1] === 'TRAINER_NONE') continue
    const partyName =
      /\((\w+)\)/.exec(x.party ?? '')?.[1] ?? /=\s*(\w+)\s*\}?\s*$/.exec(x.party ?? '')?.[1] ?? null
    const party = partyName ? parties.get(partyName) : null
    if (!party) throw new Error(`${vg}: ${m[1]} party ${partyName} not found`)
    const gender = x.encounterMusic_gender ?? ''
    // Ruby spells the flags as one hex byte (0x80 = female, low bits = music).
    const hex = /^0x[0-9a-f]+$/i.test(gender.trim()) ? Number(gender.trim()) : 0
    const female = /F_TRAINER_FEMALE/.test(gender) || (hex & 0x80) !== 0
    const name = cString(x.trainerName) ?? ''
    trainers.push({
      id: index,
      srcId: m[1],
      placeholder: placeholders.has(partyName),
      classConst: x.trainerClass,
      name,
      double: /TRUE|1/.test(x.doubleBattle ?? ''),
      female,
      items: list(x.items).filter((i) => i !== 'ITEM_NONE'),
      aiRaw: x.aiFlags ?? '0',
      party: party.map((p) => ({ ...p })),
    })
  }

  // ------------------------------------------------------ species names
  const names = new Map()
  for (const mm of read(join(dir, f.speciesNames)).matchAll(
    /\[(SPECIES_\w+)\]\s*=\s*_\("([^"]*)"\)/g,
  )) {
    names.set(mm[1], mm[2])
  }
  const hashOf = (text) => encode(text, cmap).reduce((a, b) => a + b, 0)

  // Personality in party order, the running hash never reset (see header).
  for (const t of trainers) {
    let hash = 0
    const base = t.double ? 0x80 : t.female ? 0x78 : 0x88
    for (const p of t.party) {
      hash = (hash + hashOf(t.name)) >>> 0
      const sn = names.get(p.species)
      if (sn == null) throw new Error(`${vg}: no species name for ${p.species}`)
      hash = (hash + hashOf(sn)) >>> 0
      p.personality = (base + ((hash << 8) >>> 0)) >>> 0
    }
  }

  // --------------------------------------------------------------- money
  const money = new Map()
  const msrc = read(join(dir, f.money))
  for (const mm of msrc.matchAll(/\{\s*(TRAINER_CLASS_\w+)\s*,\s*(\d+)\s*\}/g))
    money.set(mm[1], Number(mm[2]))
  for (const mm of msrc.matchAll(/(?:\.byte|trainer_money)\s+(TRAINER_CLASS_\w+)\s*,\s*(\d+)/g))
    money.set(mm[1], Number(mm[2]))
  // The table's 0xFF sentinel row is what an unlisted class falls through to.
  const fallback =
    /\{\s*0xFF\s*,\s*(\d+)\s*\}/.exec(msrc)?.[1] ?? /0xFF\s*,\s*(\d+)/.exec(msrc)?.[1]

  // ----------------------------------------------------------- learnsets
  const lsrc = stripComments(read(join(dir, 'src/data/pokemon/level_up_learnsets.h')))
  const arrays = new Map()
  for (const mm of lsrc.matchAll(/u16\s+(\w+)\s*\[\s*\]\s*=\s*\{([\s\S]*?)\};/g)) {
    arrays.set(
      mm[1],
      [...mm[2].matchAll(/LEVEL_UP_MOVE\(\s*(\d+)\s*,\s*(MOVE_\w+)\s*\)/g)].map((x) => [
        Number(x[1]),
        x[2],
      ]),
    )
  }
  const psrc = stripComments(read(join(dir, 'src/data/pokemon/level_up_learnset_pointers.h')))
  const learnsetBySpecies = new Map()
  const keyed = [...psrc.matchAll(/\[(SPECIES_\w+)\]\s*=\s*(\w+)/g)]
  if (keyed.length) {
    for (const k of keyed) learnsetBySpecies.set(k[1], arrays.get(k[2]))
  } else {
    // Positional (Ruby): the n-th pointer belongs to the species numbered n.
    const order = new Map()
    for (const d of read(join(dir, 'include/constants/species.h')).matchAll(
      /#define\s+(SPECIES_\w+)\s+(\d+)/g,
    )) {
      if (!order.has(Number(d[2]))) order.set(Number(d[2]), d[1])
    }
    const body = psrc.slice(psrc.indexOf('{') + 1, psrc.lastIndexOf('}'))
    body
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((ptr, i) => {
        const sp = order.get(i)
        if (sp) learnsetBySpecies.set(sp, arrays.get(ptr))
      })
  }

  const aiNames = aiFlagNames(dir)
  return {
    generation: 3,
    trainers: trainers.map((t) => ({
      ...t,
      ai: decodeAi(t.aiRaw, aiNames),
      prizeValue: money.get(t.classConst) ?? (fallback != null ? Number(fallback) : null),
    })),
    learnsetBySpecies: (speciesConst) => learnsetBySpecies.get(speciesConst) ?? null,
  }
}

/** Emerald's AI_SCRIPT_* bit names; Ruby's sources carry only the hex. */
const AI_BITS_EMERALD = [
  'AI_SCRIPT_CHECK_BAD_MOVE',
  'AI_SCRIPT_TRY_TO_FAINT',
  'AI_SCRIPT_CHECK_VIABILITY',
  'AI_SCRIPT_SETUP_FIRST_TURN',
  'AI_SCRIPT_RISKY',
  'AI_SCRIPT_PREFER_POWER_EXTREMES',
  'AI_SCRIPT_PREFER_BATON_PASS',
  'AI_SCRIPT_DOUBLE_BATTLE',
  'AI_SCRIPT_HP_AWARE',
  'AI_SCRIPT_TRY_SUNNY_DAY_START',
]

function aiFlagNames(dir) {
  const path = join(dir, 'include/constants/battle_ai.h')
  const bits = Object.fromEntries(AI_BITS_EMERALD.map((n, i) => [i, n]))
  if (existsSync(path)) {
    for (const m of read(path).matchAll(/#define\s+(AI_SCRIPT_\w+)\s+\(1\s*<<\s*(\d+)\)/g))
      bits[Number(m[2])] = m[1]
  }
  return bits
}

function decodeAi(raw, bits) {
  const names = raw
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean)
  if (names.every((n) => /^AI_SCRIPT_/.test(n))) return names
  const n = Number(raw)
  if (!Number.isFinite(n)) return names
  const out = []
  for (let b = 0; b < 32; b += 1) if (n & (1 << b)) out.push(bits[b] ?? `AI_SCRIPT_BIT_${b}`)
  return out
}

export { braceGroups, cString, expandMacros, fields, list, read, stripComments }
