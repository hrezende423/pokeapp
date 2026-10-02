/**
 * Build the battle-data partitions: public/data/battle/<version-group>.json.
 *
 * WHAT THE TEAM MATCHUP ENGINE NEEDS THAT THE POKEAPI BUNDLE DOES NOT CARRY, read
 * from the same pinned pret disassemblies the Trainer Dex is built from
 * (trainers/sources.mjs). Nothing here is hand-typed and nothing is guessed:
 *
 *   - THE GAME'S OWN MOVE TABLE, per generation: the move EFFECT constant
 *     (EFFECT_SLEEP, BATTLE_EFFECT_HIGH_CRITICAL...), power, type, accuracy, PP,
 *     effect chance, priority and flags exactly as the game stores them. Every AI
 *     routine branches on the effect constant, and PokeAPI has no such field.
 *       Gen 1 pokered/pokeyellow data/moves/moves.asm
 *       Gen 2 pokegold/pokecrystal data/moves/moves.asm
 *       Gen 3 pokeruby/pokeemerald/pokefirered src/data/battle_moves.h
 *       Gen 4 pokeplatinum res/moves/<move>/data.json (all Gen 4 games)
 *   - HELD-ITEM EFFECTS (HELD_* / HOLD_EFFECT_* and their parameter): Quick Claw's
 *     chance, Leftovers, the type boosters. The AI reads these by effect.
 *   - THE TRAINER AI, per game:
 *       Gen 1 the class move-choice modifications and the class AI routine +
 *             its per-Pokemon use count (data/trainers/move_choices.asm,
 *             ai_pointers.asm). The routines themselves are code and are
 *             transcribed in src/modules/battle/ai/gen1.ts.
 *       Gen 2 TrainerClassAttributes (items, AI layers, item/switch style) and the
 *             AI's data lists (data/battle/ai/*.asm). The layers are code and are
 *             transcribed in src/modules/battle/ai/gen2.ts.
 *       Gen 3 THE AI SCRIPT ITSELF, assembled from data/battle_ai_scripts.s with
 *             that repo's own macro file, into an instruction list the
 *             interpreter in src/modules/battle/ai/script3.ts executes.
 *       Gen 4 the same for pokeplatinum's src/battle/trainer_ai/script.s, and the
 *             assembly is CHECKED WORD FOR WORD against the game's own binary
 *             (res/prebuilt/battle/tr_ai/tr_ai_seq.narc) -- and Diamond/Pearl's
 *             binary (pokediamond files/battle/tr_ai/tr_ai_seq/narc_0000.bin) is
 *             compared against it too. It is byte-identical, which is what lets
 *             one script serve both. HeartGold/SoulSilver's script binary is not
 *             located in its disassembly; HGSS uses the Platinum script and the
 *             file says so (`ai.source_note`), which the UI shows as lower
 *             confidence.
 *
 * CONSTANTS ARE KEPT SYMBOLIC where the runtime already has a vocabulary for them
 * -- a move is a PokeAPI move id, a type its bundle name, an ability its slug, an
 * item its PokeAPI id, an effect its constant name -- and NUMERIC where the game
 * compares bits (status words, side statuses, stat stage indexes, weather enums).
 * Every constant is resolved from the repo's own headers; one that resolves to
 * nothing throws with the whole list, never a silent zero.
 *
 * Usage: node scripts/build-battle-data.mjs
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPOS, ensureSources } from './trainers/sources.mjs'
import { loadNames, squash } from './trainers/names.mjs'
import { narcFiles } from './trainers/gen4.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.cache/trainers')
const BUNDLE = join(ROOT, 'public/data')
const OUT = join(ROOT, 'public/data/battle')

const names = loadNames(BUNDLE)
const typesJson = JSON.parse(readFileSync(join(BUNDLE, 'types.json'), 'utf8'))
const abilitiesJson = JSON.parse(readFileSync(join(BUNDLE, 'abilities.json'), 'utf8'))
const TYPE_SLUGS = new Map(Object.values(typesJson).map((t) => [squash(t.name), t.name]))
const ABILITY_SLUGS = new Map(Object.values(abilitiesJson).map((a) => [squash(a.name), a.name]))

const misses = []
const miss = (what) => {
  misses.push(what)
  return null
}

// ------------------------------------------------------------------ sources

/** A file at the repo's pinned commit. Blobs are fetched once and kept by git. */
function show(repo, path, { binary = false } = {}) {
  // The sparse checkout (sources.mjs BATTLE_PATHS) puts what this build reads on
  // disk in one batched fetch; `git show` is the fallback for anything else.
  const onDisk = join(CACHE, repo, path)
  if (existsSync(onDisk)) return readFileSync(onDisk, binary ? undefined : 'utf8')
  const { sha } = REPOS[repo]
  const r = spawnSync('git', ['-c', 'core.longpaths=true', 'show', `${sha}:${path}`], {
    cwd: join(CACHE, repo),
    maxBuffer: 1 << 28,
    encoding: binary ? 'buffer' : 'utf8',
  })
  if (r.status !== 0) throw new Error(`git show ${repo}:${path} failed: ${r.stderr}`)
  return r.stdout
}

function listTree(repo, path) {
  const onDisk = join(CACHE, repo, path)
  if (existsSync(onDisk)) return readdirSync(onDisk)
  const { sha } = REPOS[repo]
  const r = spawnSync(
    'git',
    ['-c', 'core.longpaths=true', 'ls-tree', '--name-only', `${sha}:${path}`],
    {
      cwd: join(CACHE, repo),
      maxBuffer: 1 << 26,
      encoding: 'utf8',
    },
  )
  if (r.status !== 0) throw new Error(`git ls-tree ${repo}:${path} failed: ${r.stderr}`)
  return r.stdout.split('\n').filter(Boolean)
}

const stripAsmComment = (line) =>
  line
    .replace(/;.*$/, '')
    .replace(/@.*$/, '')
    .replace(/\/\/.*$/, '')

// ---------------------------------------------------------------- constants

/**
 * #define / .set / .equ / .equiv / enum_start+enum / `NAME = value` from the
 * given texts, as unevaluated expressions. Function-like macros are skipped.
 */
function harvestDefines(texts) {
  const defs = new Map()
  for (const text of texts) {
    let enumNext = null
    for (const raw of text.split('\n')) {
      const line = raw
        .replace(/\/\/.*$/, '')
        .replace(/@.*$/, '')
        .trim()
      let m
      if ((m = /^#define\s+([A-Za-z_]\w*)\s+(.+)$/.exec(line))) {
        defs.set(m[1], m[2].replace(/\/\*.*?\*\//g, '').trim())
      } else if ((m = /^\.(?:set|equ|equiv)\s+([A-Za-z_]\w*)\s*,\s*(.+)$/.exec(line))) {
        defs.set(m[1], m[2].trim())
      } else if ((m = /^enum_start\s*(.*)$/.exec(line))) {
        enumNext = m[1] ? Number(evalExpr(m[1], defs)) : 0
      } else if ((m = /^enum\s+([A-Za-z_]\w*)$/.exec(line)) && enumNext != null) {
        defs.set(m[1], String(enumNext++))
      }
    }
  }
  return defs
}

/** C enum bodies: `enum X { A, B = 4, C };` -- sequential values. */
function harvestEnums(text, defs) {
  for (const body of text.matchAll(/enum\s*\w*\s*\{([^}]*)\}/g)) {
    let next = 0
    for (const part of body[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .split(',')) {
      const p = part.trim()
      if (!p) continue
      const m = /^([A-Za-z_]\w*)(?:\s*=\s*(.+))?$/.exec(p)
      if (!m) continue
      if (m[2] != null) next = Number(evalExpr(m[2], defs))
      defs.set(m[1], String(next))
      next += 1
    }
  }
}

function evalExpr(expr, defs, depth = 0) {
  if (depth > 40) throw new Error(`define loop at ${expr}`)
  const sub = String(expr).replace(/\b[A-Za-z_]\w*\b/g, (name) => {
    if (/^0x[0-9a-fA-F]+$/.test(name)) return name
    if (!defs.has(name)) throw new Error(`undefined constant ${name} in "${expr}"`)
    return `(${evalExpr(defs.get(name), defs, depth + 1)})`
  })
  const clean = sub.replace(/\$([0-9a-fA-F]+)/g, '0x$1')
  if (!/^[\s\d()xa-fA-F|&<>+\-*/~^%]*$/.test(clean))
    throw new Error(`cannot evaluate ${expr} -> ${clean}`)
  const v = Function(`"use strict"; return (${clean})`)()
  return v >>> 0 === v ? v : v | 0
}

// ---------------------------------------------------------------- symbolic

const TYPE_ALIAS = {
  psychictype: 'psychic',
  psychicm: 'psychic',
  curse: '???',
  cursetype: '???',
  mystery: '???',
  unknown: '???',
  bird: 'normal',
}

function typeName(raw) {
  const k = squash(String(raw).replace(/^TYPE_/, ''))
  if (TYPE_ALIAS[k]) return TYPE_ALIAS[k]
  return TYPE_SLUGS.get(k) ?? miss(`type ${raw}`)
}

const ABILITY_ALIAS = { compoundeyes: 'compound-eyes', lightningrod: 'lightning-rod' }
function abilitySlug(raw) {
  const k = squash(String(raw).replace(/^ABILITY_/, ''))
  if (k === 'none') return ''
  return ABILITY_ALIAS[k] ?? ABILITY_SLUGS.get(k) ?? miss(`ability ${raw}`)
}

function moveId(raw, ctx = '') {
  const k = String(raw).replace(/^MOVE_/, '')
  if (k === 'NONE') return 0
  const m = names.move(raw, ctx)
  return m ? m.id : miss(`move ${raw}`)
}

function itemId(raw, ctx = '') {
  const k = String(raw).replace(/^ITEM_/, '')
  if (k === 'NONE' || k === 'NO_ITEM') return 0
  const m = names.item(raw, ctx)
  return m ? m.id : miss(`item ${raw}`)
}

/**
 * One script argument: a symbolic family (move/type/ability/item/effect/hold
 * effect) or a number evaluated from the repo's defines. `defs` is the repo's.
 */
function resolveArg(token, defs) {
  const t = String(token).trim()
  if (/^-?(0x[0-9a-fA-F]+|\d+)$/.test(t)) return Number(t)
  if (
    /^MOVE_/.test(t) &&
    !/^MOVE_(POWER|NOT|MOST|STATUS|RESULT|TARGET|LIMITATION|EFFECT|CLASS|SUBSCRIPT)/.test(t)
  )
    return { m: moveId(t) }
  if (/^(BATTLE_)?EFFECT_/.test(t)) return { e: t }
  if (/^TYPE_/.test(t) && !/^TYPE_MULTI_|^TYPE_EFFECTIVENESS/.test(t)) {
    if (/^TYPE_(NONE)$/.test(t)) return { t: '' }
    return { t: typeName(t) }
  }
  if (/^ABILITY_/.test(t)) return { a: abilitySlug(t) }
  if (/^ITEM_/.test(t)) return { i: itemId(t) }
  if (/^HOLD_EFFECT_|^HELD_/.test(t)) return { h: t }
  try {
    return evalExpr(t, defs)
  } catch (err) {
    return miss(`constant ${t}: ${err.message}`)
  }
}

// -------------------------------------------------------------- move tables

const pct = (n) => Math.floor((n * 255) / 100)

function gen12Moves(repo, withChance) {
  const text = show(repo, 'data/moves/moves.asm')
  const out = {}
  for (const raw of text.split('\n')) {
    const line = stripAsmComment(raw).trim()
    const m = /^move\s+(.+)$/.exec(line)
    if (!m) continue
    const [name, effect, power, type, acc, pp, chance] = m[1].split(',').map((s) => s.trim())
    const id = moveId(name, `${repo} moves.asm`)
    if (!id) continue
    out[id] = {
      e: effect,
      p: Number(power),
      t: typeName(type),
      a: Number(acc),
      ab: pct(Number(acc)),
      pp: Number(pp),
      ...(withChance ? { c: Number(chance), cb: pct(Number(chance)) } : {}),
    }
  }
  return out
}

function gen3Moves(repo) {
  const text = show(
    repo,
    repo === 'pokeruby' ? 'src/data/battle_moves.c' : 'src/data/battle_moves.h',
  )
  const out = {}
  for (const block of text.matchAll(/\[(MOVE_\w+)\]\s*=\s*\{([\s\S]*?)\n\s*\},/g)) {
    const [, name, body] = block
    if (name === 'MOVE_NONE') continue
    const field = (f) => new RegExp(`\\.${f}\\s*=\\s*([^,\\n]+)`).exec(body)?.[1].trim()
    const id = moveId(name, `${repo} battle_moves.h`)
    if (!id) continue
    const flags = (field('flags') ?? '0')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s && s !== '0')
    out[id] = {
      e: field('effect'),
      p: Number(field('power')),
      t: typeName(field('type')),
      a: Number(field('accuracy')),
      pp: Number(field('pp')),
      c: Number(field('secondaryEffectChance')),
      tg: field('target'),
      pr: Number(field('priority')),
      fl: flags,
    }
  }
  return out
}

function gen4Moves() {
  const out = {}
  for (const dir of listTree('pokeplatinum', 'res/moves')) {
    let json
    try {
      json = JSON.parse(show('pokeplatinum', `res/moves/${dir}/data.json`))
    } catch {
      continue
    }
    if (dir === 'none' || !json.name || json.name === '-') continue
    const id = moveId(dir.toUpperCase(), 'platinum res/moves') ?? null
    if (!id) continue
    out[id] = {
      e: json.effect?.type,
      p: json.power,
      t: typeName(json.type),
      a: json.accuracy,
      pp: json.pp,
      c: json.effect?.chance ?? 0,
      cl: String(json.class)
        .replace(/^CLASS_/, '')
        .toLowerCase(),
      tg: json.range,
      pr: json.priority,
      fl: json.flags ?? [],
    }
  }
  return out
}

// ---------------------------------------------------------- held item effects

function gen2HeldEffects(repo) {
  const text = show(repo, 'data/items/attributes.asm')
  const out = {}
  let current = null
  for (const raw of text.split('\n')) {
    const c = /^;\s*([A-Z0-9_]+)\s*$/.exec(raw.trim())
    if (c) {
      current = c[1]
      continue
    }
    const m = /^\s*item_attribute\s+([^,]+),\s*([A-Z_]+),\s*(\$?\w+)/.exec(raw)
    if (!m || !current) continue
    const [, , held, param] = m
    if (held === 'HELD_NONE') continue
    const item = names.itemQuiet(current)
    if (!item) continue
    out[item.id] = { h: held, v: Number(param.replace('$', '0x')) }
  }
  return out
}

function gen3HeldEffects(repo) {
  const out = {}
  if (repo === 'pokefirered') {
    for (const it of JSON.parse(show(repo, 'src/data/items.json')).items) {
      if (!it.holdEffect || it.holdEffect === 'HOLD_EFFECT_NONE') continue
      const item = names.itemQuiet(it.itemId.replace(/^ITEM_/, ''))
      if (item) out[item.id] = { h: it.holdEffect, v: Number(it.holdEffectParam) || 0 }
    }
    return out
  }
  const text = show(repo, repo === 'pokeruby' ? 'src/data/items_en.h' : 'src/data/items.h')
  for (const block of text.matchAll(/\{([^{}]*?\.itemId\s*=\s*(ITEM_\w+)[^{}]*?)\}/g)) {
    const [, body, name] = block
    const h = /\.holdEffect\s*=\s*(\w+)/.exec(body)?.[1]
    if (!h || h === 'HOLD_EFFECT_NONE') continue
    const v = Number(/\.holdEffectParam\s*=\s*(\d+)/.exec(body)?.[1] ?? 0)
    const item = names.itemQuiet(name.replace(/^ITEM_/, ''))
    if (!item) continue
    out[item.id] = { h, v }
  }
  return out
}

function gen4HeldEffects() {
  const out = {}
  for (const file of listTree('pokeplatinum', 'res/items/data')) {
    const json = JSON.parse(show('pokeplatinum', `res/items/data/${file}`))
    if (!json.holdEffect || json.holdEffect === 'HOLD_EFFECT_NONE') continue
    const item = names.itemQuiet(file.replace(/\.json$/, '')) ?? names.itemQuiet(json.name)
    if (!item) continue
    out[item.id] = { h: json.holdEffect, v: json.effectParam ?? 0, fp: json.flingPower ?? 0 }
  }
  return out
}

// -------------------------------------------------------------- Gen 1 / 2 AI

function gen1Ai(repo) {
  const choices = show(repo, 'data/trainers/move_choices.asm')
  const pointers = show(repo, 'data/trainers/ai_pointers.asm')
  const classes = {}
  for (const raw of choices.split('\n')) {
    const m = /^\s*move_choices\s*([\d,\s]*);\s*(\w+)/.exec(raw)
    if (!m) continue
    classes[m[2]] = {
      mods: m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number),
    }
  }
  for (const raw of pointers.split('\n')) {
    const m = /^\s*dbw\s+(\d+),\s*(\w+)\s*;\s*(\w+)/.exec(raw)
    if (!m) continue
    classes[m[3]] = { ...(classes[m[3]] ?? { mods: [] }), count: Number(m[1]), routine: m[2] }
  }
  const effects = show(repo, 'constants/move_effect_constants.asm')
  const effectOrder = []
  for (const raw of effects.split('\n')) {
    const line = stripAsmComment(raw).trim()
    let m
    if (/^const_def/.test(line)) continue
    if ((m = /^const\s+(\w+)/.exec(line))) effectOrder.push(m[1])
    else if (/^const_skip/.test(line)) effectOrder.push(null)
  }
  const highCrit = show(repo, 'data/battle/critical_hit_moves.asm')
    .split('\n')
    .map((l) => stripAsmComment(l).trim())
    .map((l) => /^db\s+(\w+)/.exec(l)?.[1])
    .filter((x) => x && x !== '-1')
    .map((x) => moveId(x, `${repo} critical_hit_moves`))
  // The AI's own type check (AIGetTypeEffectiveness) takes the FIRST matching row
  // of this table rather than the product, so its order is data, not detail.
  const typeMatchups = show(repo, 'data/types/type_matchups.asm')
    .split('\n')
    .map((l) => stripAsmComment(l).trim())
    .map((l) => /^db\s+(\w+),\s*(\w+),\s*(\w+)/.exec(l))
    .filter(Boolean)
    .map((m) => [
      typeName(m[1]),
      typeName(m[2]),
      { SUPER_EFFECTIVE: 20, NOT_VERY_EFFECTIVE: 5, NO_EFFECT: 0, EFFECTIVE: 10 }[m[3]] ??
        Number(m[3]),
    ])
  return { classes, effectOrder, highCritMoves: highCrit, typeMatchups }
}

function asmList(repo, path, kind) {
  return show(repo, path)
    .split('\n')
    .map((l) => stripAsmComment(l).trim())
    .map((l) => /^db\s+(\w+)/.exec(l)?.[1])
    .filter((x) => x && x !== '-1')
    .map((x) => (kind === 'move' ? moveId(x, path) : x))
}

function gen2Ai(repo) {
  const text = show(repo, 'data/trainers/attributes.asm')
  const classes = {}
  let current = null
  let line = 0
  for (const raw of text.split('\n')) {
    const c = /^;\s*(.+?)\s*$/.exec(raw.trim())
    if (c && !/items|base reward/.test(c[1]) && !raw.trim().startsWith('; entries')) {
      current = { name: c[1] }
      line = 0
      continue
    }
    if (!current) continue
    const body = stripAsmComment(raw).trim()
    if (!body) continue
    if (line === 0 && /^db\s/.test(body)) {
      current.items = body
        .replace(/^db\s+/, '')
        .split(',')
        .map((s) => s.trim())
        .map((s) => itemId(s, 'gen2 attributes'))
        .filter(Boolean)
    } else if (line === 1) {
      current.reward = Number(body.replace(/^db\s+/, ''))
    } else if (line === 2) {
      current.layers = body
        .replace(/^dw\s+/, '')
        .split('|')
        .map((s) => s.trim().replace(/^AI_/, '').toLowerCase())
        .filter((s) => s !== '0')
    } else if (line === 3) {
      current.itemSwitch = body
        .replace(/^dw\s+/, '')
        .split('|')
        .map((s) => s.trim())
        .filter((s) => s !== '0')
      classes[current.name] = current
      current = null
    }
    line += 1
  }
  // The attribute comments are display names ("Falkner", "Cooltrainer M"); the
  // trainer bundle keys classes by the constant. Index order is the join.
  const consts = show(repo, 'constants/trainer_constants.asm')
  const order = []
  for (const raw of consts.split('\n')) {
    const m = /^\s*trainerclass\s+(\w+)/.exec(raw)
    if (m) order.push(m[1])
  }
  const list = Object.values(classes)
  const byConst = {}
  // trainer_constants starts with TRAINER_NONE (index 0); attributes start at 1.
  const real = order.filter((c) => c !== 'TRAINER_NONE')
  real.forEach((c, i) => {
    if (list[i]) byConst[c] = { ...list[i], name: list[i].name }
  })
  const dir = 'data/battle/ai'
  const lists = {
    constantDamage: asmList(repo, `${dir}/constant_damage_effects.asm`, 'effect'),
    encore: asmList(repo, `${dir}/encore_moves.asm`, 'move'),
    rainDance: asmList(repo, `${dir}/rain_dance_moves.asm`, 'move'),
    reckless: asmList(repo, `${dir}/reckless_moves.asm`, 'effect'),
    residual: asmList(repo, `${dir}/residual_moves.asm`, 'move'),
    risky: asmList(repo, `${dir}/risky_effects.asm`, 'effect'),
    stall: asmList(repo, `${dir}/stall_moves.asm`, 'move'),
    statusOnly: asmList(repo, `${dir}/status_only_effects.asm`, 'effect'),
    sunnyDay: asmList(repo, `${dir}/sunny_day_moves.asm`, 'move'),
    useful: asmList(repo, `${dir}/useful_moves.asm`, 'move'),
  }
  const effects = show(repo, 'constants/move_effect_constants.asm')
  const effectOrder = []
  for (const raw of effects.split('\n')) {
    const m = /^\s*const\s+(\w+)/.exec(stripAsmComment(raw))
    if (m) effectOrder.push(m[1])
  }
  return { classes: byConst, lists, effectOrder }
}

// ------------------------------------------------------------- Gen 3 script

/**
 * Parse a GAS macro file: name -> { op, params: [{name, size}] } for primitives
 * (first body line `.byte 0xNN`), or { alias: [lines] } for macros that expand
 * into other macros.
 */
function parseGasMacros(text) {
  const macros = new Map()
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const head = /^\s*\.macro\s+(\w+)\s*(.*)$/.exec(stripAsmComment(lines[i]))
    if (!head) continue
    const params = head[2]
      .split(',')
      .map((p) => p.trim().replace(/:req$/, '').replace(/=.*$/, ''))
      .filter(Boolean)
    const body = []
    for (i += 1; i < lines.length && !/^\s*\.endm/.test(lines[i]); i++) {
      const b = stripAsmComment(lines[i]).trim()
      if (b) body.push(b)
    }
    macros.set(head[1].toLowerCase(), { params, body })
  }
  return macros
}

/** Expand one macro invocation into primitive directives: [{dir, expr}] */
function expandMacro(macros, name, args, depth = 0) {
  const mac = macros.get(name.toLowerCase())
  if (!mac) throw new Error(`unknown macro ${name}`)
  if (depth > 10) throw new Error(`macro loop ${name}`)
  const bind = new Map(mac.params.map((p, i) => [p, args[i] ?? '']))
  const subst = (s) => s.replace(/\\(\w+)/g, (_, p) => bind.get(p) ?? '')
  const out = []
  for (const line of mac.body) {
    const l = subst(line)
    const d = /^\.(byte|2byte|4byte|long|hword|word)\s+(.+)$/.exec(l)
    if (d) {
      for (const part of splitArgs(d[2])) out.push({ dir: d[1], expr: part })
      continue
    }
    if (/^\.(if|ifdef|ifndef|else|endif|set|equ)/.test(l)) continue
    const inv = /^(\w+)\s*(.*)$/.exec(l)
    out.push(...expandMacro(macros, inv[1], splitArgs(inv[2]), depth + 1))
  }
  return out
}

function splitArgs(s) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/**
 * Every macro in these scripts expands to exactly one command, so a command is
 * the macro's whole primitive list with the first byte as the opcode. Aliases
 * that expand to TWO commands (if_ability = check_ability + if_equal) are split
 * at the second macro's opcode, which this marks.
 */
function expandMarked(macros, name, args, depth = 0) {
  const mac = macros.get(name.toLowerCase())
  if (!mac) throw new Error(`unknown macro ${name}`)
  const first = mac.body[0] ?? ''
  if (/^\.byte\s+0x[0-9a-fA-F]+$/.test(first) || /^\.byte\s+\d+$/.test(first)) {
    const prims = expandMacro(macros, name, args, depth)
    prims[0].isOp = true
    return prims
  }
  // Alias: expand each line through the marked expander.
  const bind = new Map(mac.params.map((p, i) => [p, args[i] ?? '']))
  const subst = (s) => s.replace(/\\(\w+)/g, (_, p) => bind.get(p) ?? '')
  const out = []
  for (const line of mac.body) {
    const l = subst(line)
    const inv = /^(\w+)\s*(.*)$/.exec(l)
    out.push(...expandMarked(macros, inv[1], splitArgs(inv[2]), depth + 1))
  }
  return out
}

/** Opcode -> command name, from the repo's own C command table. */
function gen3OpNames(repo) {
  const c = show(repo, 'src/battle_ai_script_commands.c')
  const table =
    /sBattleAICmdTable\[\]\s*=\s*\{([\s\S]*?)\};/.exec(c) ??
    /gBattleAICmdTable\[\]\s*=\s*\{([\s\S]*?)\};/.exec(c)
  if (!table) throw new Error(`${repo}: no AI command table`)
  return table[1]
    .split('\n')
    .map((l) => /^\s*(\w+),/.exec(l.replace(/\/\/.*$/, ''))?.[1])
    .filter(Boolean)
    .map((n) => n.replace(/^(Cmd_|BattleAICmd_)/, ''))
}

function gen3Program(repo) {
  const paths = {
    pokeemerald: {
      macros: 'asm/macros/battle_ai_script.inc',
      headers: [
        'include/constants/battle.h',
        'include/constants/battle_ai.h',
        'include/constants/pokemon.h',
        'include/constants/battle_script_commands.h',
      ],
    },
    pokefirered: {
      macros: 'asm/macros/battle_ai_script.inc',
      headers: [
        'include/constants/battle.h',
        'include/constants/battle_ai.h',
        'include/constants/pokemon.h',
      ],
    },
    pokeruby: {
      macros: 'include/macros/battle_ai_script.inc',
      headers: [
        'constants/battle.inc',
        'constants/misc_constants.inc',
        'include/constants/battle.h',
        'include/constants/species.h',
      ],
    },
  }[repo]
  const texts = []
  for (const h of paths.headers) {
    try {
      texts.push(show(repo, h))
    } catch {
      /* a header a repo does not have */
    }
  }
  const defs = harvestDefines(texts)
  for (const t of texts) harvestEnums(t, defs)
  defs.set('TRUE', '1')
  defs.set('FALSE', '0')
  const macroText = show(repo, paths.macros)
  const opNames = gen3OpNames(repo)
  const program = assembleGen3Marked(repo, 'data/battle_ai_scripts.s', macroText, defs)
  // The script table: the first data block, one pointer per AI flag bit.
  const text = show(repo, 'data/battle_ai_scripts.s')
  const lines = text.split('\n')
  const start = lines.findIndex((l) => /^(gBattleAI_ScriptsTable|BattleAIs)::?/.test(l.trim()))
  if (start < 0) throw new Error(`${repo}: no AI script table`)
  const entryLabels = []
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^\.4byte\s+(\w+)/.exec(stripAsmComment(lines[i]).trim())
    if (m) entryLabels.push(m[1])
    else if (stripAsmComment(lines[i]).trim()) break
  }
  const entries = entryLabels.map((label) => ({
    label,
    at: program.labels[label] ?? miss(`${repo} entry ${label}`),
  }))
  return { ...program, entries, opNames }
}

function assembleGen3Marked(repo, scriptPath, macroText, defs) {
  const macros = parseGasMacros(macroText)
  const text = show(repo, scriptPath)
  const items = []
  let skip = 0
  for (const raw of text.split('\n')) {
    let line = stripAsmComment(raw).trim()
    if (!line) continue
    if (/^#ifdef\s+(BUGFIX|UBFIX)/.test(line)) {
      skip++
      continue
    }
    if (/^#else/.test(line) && skip) {
      skip--
      continue
    }
    if (/^#endif/.test(line)) {
      if (skip) skip--
      continue
    }
    if (skip) continue
    if (/^#|^\.(include|section|align|global|text|set|equ)\b/.test(line)) continue
    const lab = /^([A-Za-z_]\w*):{1,2}\s*(.*)$/.exec(line)
    if (lab) {
      items.push({ label: lab[1] })
      line = lab[2].trim()
      if (!line) continue
    }
    const d = /^\.(byte|2byte|4byte|hword|word|long)\s+(.+)$/.exec(line)
    if (d) {
      items.push({ data: d[1], values: splitArgs(d[2]) })
      continue
    }
    const inv = /^(\w+)\s*(.*)$/.exec(line)
    if (inv) items.push({ mac: inv[1], args: splitArgs(inv[2]) })
  }
  const dataLabels = new Set()
  for (let i = 0; i < items.length; i++) {
    if (!items[i].label) continue
    let j = i + 1
    while (j < items.length && items[j].label) j++
    if (items[j]?.data) dataLabels.add(items[i].label)
  }
  const raw = []
  const labels = {}
  const tables = {}
  let pending = []
  let table = null
  for (const it of items) {
    if (it.label) {
      pending.push(it.label)
      continue
    }
    if (it.data) {
      for (const l of pending) {
        if (dataLabels.has(l)) {
          table = l
          tables[l] = []
        }
      }
      pending = []
      if (table) tables[table].push(...it.values)
      continue
    }
    table = null
    for (const l of pending) labels[l] = raw.length
    pending = []
    const prims = expandMarked(macros, it.mac, it.args)
    let cur = null
    for (const p of prims) {
      if (p.isOp) {
        cur = { op: Number(p.expr), args: [] }
        raw.push(cur)
      } else cur.args.push(p)
    }
  }
  for (const l of pending) labels[l] = raw.length
  const ptr = (expr) =>
    expr in labels
      ? { L: labels[expr] }
      : expr in tables
        ? { T: expr }
        : miss(`${repo} label ${expr}`)
  const code = raw.map((c) => [
    c.op,
    ...c.args.map((a) =>
      (a.dir === '4byte' || a.dir === 'word' || a.dir === 'long') &&
      /^[A-Za-z_]\w*$/.test(a.expr) &&
      (a.expr in labels || a.expr in tables)
        ? ptr(a.expr)
        : resolveArg(a.expr, defs),
    ),
  ])
  const outTables = {}
  for (const [name, vals] of Object.entries(tables)) {
    const out = []
    for (const v of vals) {
      if (v in labels) {
        out.push({ L: labels[v] })
        continue
      }
      const r = resolveArg(v, defs)
      if (r === -1 || r === 0xff || r === 0xffff || r === 0xffffffff || r === 4294967295) break
      out.push(r)
    }
    outTables[name] = out
  }
  return { code, labels, tables: outTables }
}

// ------------------------------------------------------------- Gen 4 script

/**
 * Assemble pokeplatinum's AI script to 32-bit words AND to an instruction list,
 * and prove the words are the game's own binary before trusting the list.
 */
function gen4Program() {
  const repo = 'pokeplatinum'
  const macroText = show(repo, 'asm/macros/aicmd.inc')
  const script = show(repo, 'src/battle/trainer_ai/script.s')
  const defs = new Map()
  // Opcodes: an X-macro list, ScriptCommand(AICMD_NAME, Handler), numbered in order.
  const aicmd = show(repo, 'include/data/scripts/aicmd.h')
  const opNames = []
  for (const m of aicmd.matchAll(/ScriptCommand\((AICMD_\w+)\s*,/g)) {
    defs.set(m[1], String(opNames.length))
    opNames.push(m[1].replace(/^AICMD_/, ''))
  }
  if (opNames.length < 100) throw new Error(`gen4: only ${opNames.length} AI commands parsed`)
  const texts = [
    show(repo, 'include/constants/battle.h'),
    show(repo, 'include/constants/battle/condition.h'),
    show(repo, 'include/constants/battle/trainer_ai.h'),
    show(repo, 'include/constants/pokemon.h'),
  ]
  for (const f of listTree(repo, 'include/constants/battle')) {
    if (f.endsWith('.h') && !['condition.h', 'trainer_ai.h'].includes(f))
      texts.push(show(repo, `include/constants/battle/${f}`))
  }
  for (const t of texts) {
    for (const [k, v] of harvestDefines([t])) defs.set(k, v)
    harvestEnums(t, defs)
  }
  // The generated lists. Masks are 1 << index; enums are the index. The symbolic
  // families are exported as numbering tables so the runtime can speak the game's
  // numbers; everything else joins `defs`.
  const lists = {}
  const MASKS = new Set(['ai_flags', 'move_flags', 'move_ranges'])
  for (const f of listTree(repo, 'generated')) {
    if (!f.endsWith('.txt')) continue
    const base = f.replace(/\.txt$/, '')
    const text = show(repo, `generated/${f}`)
    const list = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[A-Z][A-Z0-9_]*$/.test(l))
    if (!list.length) continue
    lists[base] = list
    if (
      /^(abilities|pokemon_types|moves|items|species|move_battle_effects|item_hold_effects)$/.test(
        base,
      )
    )
      continue
    list.forEach((n, i) => defs.set(n, String(MASKS.has(base) ? (i === 0 ? 0 : 2 ** (i - 1)) : i)))
  }
  defs.set('TRUE', '1')
  defs.set('FALSE', '0')

  // Macro layouts: the words after the opcode, and which are relative jumps or tables.
  const macros = new Map()
  const layout = []
  {
    const lines = macroText.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const head = /^\s*\.macro\s+(\w+)\s*(.*)$/.exec(lines[i].replace(/\/\/.*$/, ''))
      if (!head) continue
      const params = head[2]
        .split(',')
        .map((p) => p.trim().replace(/:req$/, ''))
        .filter(Boolean)
      const body = []
      for (i += 1; i < lines.length && !/^\s*\.endm/.test(lines[i]); i++) {
        const b = lines[i].replace(/\/\/.*$/, '').trim()
        if (b) body.push(b)
      }
      macros.set(head[1].toLowerCase(), { name: head[1], params, body })
      const ws = body.map((b) => /^\.long\s+(.+)$/.exec(b)?.[1]).filter(Boolean)
      const first = ws[0]
      const op = /^AICMD_\w+$/.test(first)
        ? Number(defs.get(first))
        : /^\d+$/.test(first)
          ? Number(first)
          : null
      if (op == null) continue
      layout[op] = {
        macro: head[1],
        args: ws
          .slice(1)
          .map((w) =>
            /\(\\jump-\.\)/.test(w) ? 'jump' : /\(\\table-\.\)/.test(w) ? 'table' : 'value',
          ),
      }
    }
  }
  for (let op = 0; op < opNames.length; op++) {
    if (!layout[op]) throw new Error(`gen4: no macro layout for opcode ${op} (${opNames[op]})`)
  }

  // THE PROGRAM IS THE GAME'S BINARY. pokeplatinum ships the AI script as a
  // prebuilt NARC (res/prebuilt/battle/tr_ai/tr_ai_seq.narc) and its build never
  // assembles script.s, so script.s is not proven by the ROM checksum -- and it
  // does not match the binary: see `scriptDiff`.
  const narc = narcFiles(
    show(repo, 'res/prebuilt/battle/tr_ai/tr_ai_seq.narc', { binary: true }),
  )[0]
  const dp = show('pokediamond', 'files/battle/tr_ai/tr_ai_seq/narc_0000.bin', { binary: true })
  const dpIdentical = Buffer.compare(dp, narc) === 0
  const words = []
  for (let i = 0; i + 4 <= narc.length; i += 4) words.push(narc.readUInt32LE(i))
  const FLAGS = 32
  const entries = words.slice(0, FLAGS)

  // Walk the binary from every flag entry: instruction boundaries, jump targets
  // and where the tables start.
  const isInstr = new Map()
  const tableAt = new Set()
  const toVisit = [...new Set(entries)]
  const seen = new Set()
  while (toVisit.length) {
    let pc = toVisit.pop()
    while (pc < words.length && !seen.has(pc)) {
      seen.add(pc)
      const op = words[pc]
      const lay = layout[op]
      if (!lay) throw new Error(`gen4: word ${pc} is not an opcode (${op})`)
      isInstr.set(pc, op)
      lay.args.forEach((kind, k) => {
        const at = pc + 1 + k
        const v = words[at] | 0
        if (kind === 'jump') toVisit.push(at + v + 1)
        if (kind === 'table') tableAt.add(at + v + 2)
      })
      const name = opNames[op]
      if (name === 'GOTO' || name === 'POPOREND' || name === 'ESCAPE') break
      pc += 1 + lay.args.length
    }
  }
  for (const t of tableAt) {
    if (isInstr.has(t)) throw new Error(`gen4: word ${t} is both a table and an instruction`)
  }

  // Labels for display only: align script.s's instruction stream with the
  // binary's by opcode (longest common subsequence) and name each binary offset
  // after the script.s label in front of the instruction it aligned with.
  const srcInstr = []
  {
    let pending = []
    for (const raw of script.split('\n')) {
      let line = raw.replace(/\/\/.*$/, '').trim()
      if (!line || /^#|^\.(include|text|global|ifndef|set|endif|if|else)\b/.test(line)) continue
      const lab = /^([A-Za-z_]\w*):\s*(.*)$/.exec(line)
      if (lab) {
        pending.push(lab[1])
        line = lab[2].trim()
        if (!line) continue
      }
      const inv = /^(\w+)/.exec(line)
      if (!inv) continue
      const mac = macros.get(inv[1].toLowerCase())
      if (!mac || /^(tableentry|labeldistance)$/.test(mac.name.toLowerCase())) {
        pending = []
        continue
      }
      const first = /^\.long\s+(.+)$/.exec(mac.body[0])?.[1]
      const op = /^AICMD_/.test(first) ? Number(defs.get(first)) : Number(first)
      srcInstr.push({ op, labels: pending, text: line })
      pending = []
    }
  }
  const binInstr = [...isInstr.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([addr, op]) => ({ addr, op }))
  const n = srcInstr.length
  const m = binInstr.length
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        srcInstr[i].op === binInstr[j].op
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const labels = {}
  const onlyInSource = []
  const onlyInBinary = []
  let i = 0
  let j = 0
  let lastLabel = null
  while (i < n && j < m) {
    if (srcInstr[i].op === binInstr[j].op && lcs[i][j] === lcs[i + 1][j + 1] + 1) {
      for (const l of srcInstr[i].labels) {
        labels[binInstr[j].addr] = l
        lastLabel = l
      }
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      if (srcInstr[i].labels.length) lastLabel = srcInstr[i].labels.at(-1)
      onlyInSource.push(`${lastLabel ?? '?'}: ${srcInstr[i].text}`)
      i++
    } else {
      onlyInBinary.push(`${lastLabel ?? '?'}: word ${binInstr[j].addr} ${opNames[binInstr[j].op]}`)
      j++
    }
  }
  for (; i < n; i++) onlyInSource.push(`${lastLabel ?? '?'}: ${srcInstr[i].text}`)
  for (; j < m; j++) onlyInBinary.push(`word ${binInstr[j].addr} ${opNames[binInstr[j].op]}`)
  const flagNames = (lists.ai_flags ?? []).filter(
    (x) => x !== 'AI_FLAG_NONE' && x !== 'AI_FLAG_ALL',
  )
  flagNames.forEach((f, bit) => {
    if (entries[bit] != null && !labels[entries[bit]]) labels[entries[bit]] = f
  })

  // Numbering tables: the game's index -> the bundle's vocabulary.
  const numbering = {
    abilities: (lists.abilities ?? []).map((a) =>
      a === 'ABILITY_NONE' ? '' : (abilitySlug(a) ?? ''),
    ),
    types: (lists.pokemon_types ?? [])
      .filter((t) => !t.startsWith('NUM_'))
      .map((t) => (t === 'TYPE_MYSTERY' ? '???' : (typeName(t) ?? ''))),
    items: (lists.items ?? []).map((it) =>
      it === 'ITEM_NONE' ? 0 : (names.itemQuiet(it.replace(/^ITEM_/, ''))?.id ?? 0),
    ),
    moveEffects: lists.move_battle_effects ?? [],
    holdEffects: lists.item_hold_effects ?? [],
  }
  const constPrefixes =
    /^(MON_CONDITION|VOLATILE_CONDITION|SIDE_CONDITION|FIELD_CONDITION|MOVE_STATUS|BATTLE_STAT|STAT_|AI_|COMPARE_SPEED|LOAD_|CLASS_|BATTLE_TYPE|GENDER_|CHECK_|TYPE_MULTI|MOVE_EFFECT_|USE_MAX|ROLL_FOR)/
  const constants = {}
  for (const k of defs.keys()) {
    if (!constPrefixes.test(k)) continue
    try {
      constants[k] = evalExpr(k, defs)
    } catch {
      /* function-like or unresolvable: not needed at runtime */
    }
  }
  return {
    words,
    entries,
    flagNames,
    layout: layout.map((l) => ({ macro: l.macro, args: l.args })),
    opNames,
    labels,
    numbering,
    constants,
    scriptDiff: { onlyInSource, onlyInBinary },
    verified: {
      words: words.length,
      instructions: binInstr.length,
      tables: tableAt.size,
      dpIdentical,
    },
  }
}

// --------------------------------------------------------------- the build

const GAMES = [
  { vg: 'red-blue', gen: 1, repo: 'pokered' },
  { vg: 'yellow', gen: 1, repo: 'pokeyellow' },
  { vg: 'gold-silver', gen: 2, repo: 'pokegold' },
  { vg: 'crystal', gen: 2, repo: 'pokecrystal' },
  { vg: 'ruby-sapphire', gen: 3, repo: 'pokeruby' },
  { vg: 'emerald', gen: 3, repo: 'pokeemerald' },
  { vg: 'firered-leafgreen', gen: 3, repo: 'pokefirered' },
  { vg: 'diamond-pearl', gen: 4, repo: 'pokediamond' },
  { vg: 'platinum', gen: 4, repo: 'pokeplatinum' },
  { vg: 'heartgold-soulsilver', gen: 4, repo: 'pokeheartgold' },
]

function main() {
  ensureSources(CACHE)
  mkdirSync(OUT, { recursive: true })
  let gen4 = null
  const summary = []
  for (const g of GAMES) {
    const doc = {
      version_group: g.vg,
      generation: g.gen,
      source: { repo: g.repo, sha: REPOS[g.repo].sha },
    }
    if (g.gen === 1) {
      doc.moves = gen12Moves(g.repo, false)
      doc.ai = { kind: 'gen1', ...gen1Ai(g.repo) }
    } else if (g.gen === 2) {
      doc.moves = gen12Moves(g.repo, true)
      doc.held = gen2HeldEffects(g.repo)
      doc.ai = { kind: 'gen2', ...gen2Ai(g.repo) }
    } else if (g.gen === 3) {
      doc.moves = gen3Moves(g.repo)
      doc.held = gen3HeldEffects(g.repo)
      const p = gen3Program(g.repo)
      doc.ai = {
        kind: 'gen3',
        code: p.code,
        tables: p.tables,
        entries: p.entries,
        labels: p.labels,
        opNames: gen3OpNames('pokeemerald'),
        quirk: g.repo === 'pokeemerald' ? 'emerald-tie-order' : 'ruby-tie-order',
      }
    } else {
      gen4 ??= { moves: gen4Moves(), held: gen4HeldEffects(), program: gen4Program() }
      doc.moves = gen4.moves
      doc.held = gen4.held
      doc.source.moves = { repo: 'pokeplatinum', sha: REPOS.pokeplatinum.sha }
      const p = gen4.program
      doc.ai = {
        kind: 'gen4',
        words: p.words,
        entries: p.entries,
        flagNames: p.flagNames,
        layout: p.layout,
        opNames: p.opNames,
        labels: p.labels,
        numbering: p.numbering,
        constants: p.constants,
        source: {
          repo: 'pokeplatinum',
          sha: REPOS.pokeplatinum.sha,
          file: 'res/prebuilt/battle/tr_ai/tr_ai_seq.narc',
        },
        verified: p.verified,
        scriptDiff: p.scriptDiff,
        ...(g.vg === 'diamond-pearl'
          ? p.verified.dpIdentical
            ? {
                source_note:
                  'Diamond/Pearl ship this exact binary (pokediamond tr_ai_seq/narc_0000.bin, compared byte for byte).',
              }
            : { source_note: 'Diamond/Pearl AI binary differs from Platinum.', lowConfidence: true }
          : {}),
        ...(g.vg === 'heartgold-soulsilver'
          ? {
              source_note:
                "HeartGold/SoulSilver's AI script binary is not located in its disassembly; this is the Diamond/Pearl/Platinum binary.",
              lowConfidence: true,
            }
          : {}),
      }
    }
    const file = join(OUT, `${g.vg}.json`)
    writeFileSync(file, JSON.stringify(doc))
    summary.push(
      `${g.vg}: ${Object.keys(doc.moves).length} moves, ${Object.keys(doc.held ?? {}).length} held effects, ai ${doc.ai.kind}${doc.ai.code ? ` ${doc.ai.code.length} instr, ${Object.keys(doc.ai.tables).length} tables` : ''}${doc.ai.words ? ` ${doc.ai.words.length} words` : ''}`,
    )
  }
  if (misses.length) {
    const uniq = [...new Set(misses)]
    throw new Error(`unresolved (${uniq.length}):\n  ${uniq.slice(0, 80).join('\n  ')}`)
  }
  console.log(summary.join('\n'))
  if (gen4) {
    const v = gen4.program.verified
    const d = gen4.program.scriptDiff
    console.log(
      `gen4 AI: ${v.instructions} instructions, ${v.tables} tables decoded from tr_ai_seq.narc; DP identical: ${v.dpIdentical}; script.s-only instructions: ${d.onlyInSource.length}, binary-only: ${d.onlyInBinary.length}`,
    )
  }
}

if (existsSync(CACHE)) main()
else throw new Error(`no ${CACHE}: run npm run build:trainers first`)
