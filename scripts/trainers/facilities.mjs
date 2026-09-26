/**
 * Battle facilities: the trainers you meet in a Battle Tower, Frontier, Tent,
 * Trainer Tower or Trainer Hill, and the pools of prepared sets they draw from.
 *
 * ONE SHAPE FOR ALL OF THEM. A facility has `sets` (a species with its moves,
 * item, nature and EVs -- the game picks the level and, from the streak, the
 * IVs) and `trainers`, each either drawing from named sets (`set_ids`) or
 * carrying a fixed `party` (FRLG Trainer Tower, Emerald Trainer Hill, where every
 * Pokemon is spelled out). `rules` says in one paragraph how the game chooses,
 * because a pool without its rule reads as a party the trainer does not have.
 *
 *   crystal              data/battle_tower/parties.asm + classes.asm
 *   ruby-sapphire        src/data/battle_tower/{trainers,level_50_mons,level_100_mons}.h
 *   emerald              src/data/battle_frontier/*: the shared Frontier pool, the
 *                        three Battle Tents, and the Trainer Hill
 *   firered-leafgreen    src/trainer_tower_sets.c
 *   diamond-pearl        files/battle/b_tower/btdtr, btdpm -- raw NARC members,
 *                        FrontierPokemonBase (16 bytes) and trainer records
 *   platinum             res/trainers/frontier/{data,pokemon}/*.json
 *   heartgold-soulsilver the Platinum pool (see heartgoldFrontier)
 *
 * EVS FROM FLAGS (CreateMonWithEVSpreadNatureOTID, and Gen 4's equivalent): each
 * flagged stat gets 510 / (number of flags), stored in a byte.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { braceGroups, cString, expandMacros, fields, list, read, stripComments } from './gen3.mjs'

const STAT_KEYS = ['hp', 'attack', 'defense', 'speed', 'special-attack', 'special-defense']

/** EV amounts from a list of flagged stat keys (510 / count, as a u8). */
export function evsFromFlags(keys) {
  if (!keys.length) return null
  const each = Math.floor(510 / keys.length) & 0xff
  return Object.fromEntries(keys.map((k) => [k, each]))
}

const GEN3_EV_BITS = {
  F_EV_SPREAD_HP: 'hp',
  F_EV_SPREAD_ATTACK: 'attack',
  F_EV_SPREAD_DEFENSE: 'defense',
  F_EV_SPREAD_SPEED: 'speed',
  F_EV_SPREAD_SP_ATTACK: 'special-attack',
  F_EV_SPREAD_SP_DEFENSE: 'special-defense',
}
const gen3Evs = (v) =>
  evsFromFlags(
    (v ?? '')
      .split('|')
      .map((x) => GEN3_EV_BITS[x.trim()])
      .filter(Boolean),
  )

/** BATTLE_TOWER_ITEM_X / BATTLE_FRONTIER_ITEM_X index the game's own ITEM_X table. */
const facilityItem = (v) => {
  const m = /(?:BATTLE_TOWER_ITEM_|BATTLE_FRONTIER_ITEM_)(\w+)/.exec(v ?? '')
  return m && m[1] !== 'NONE' ? `ITEM_${m[1]}` : null
}

// ------------------------------------------------------------- Crystal

function crystal(dir) {
  const lines = read(join(dir, 'data/battle_tower/parties.asm')).split(/\r?\n/)
  const sets = []
  let group = 0
  let cur = null
  let statExp = []
  for (const raw of lines) {
    const g = /BattleTowerMons group (\d+)/.exec(raw)
    if (g) {
      group = Number(g[1])
      continue
    }
    const c = raw.replace(/;.*$/, '').trim()
    if (!c) continue
    // Digits too: PORYGON2 is a species constant.
    if (/^db\s+[A-Z0-9_]+$/.test(c) && !cur) {
      cur = { species: c.split(/\s+/)[1], group }
      statExp = []
      continue
    }
    if (!cur) continue
    if (!cur.item && /^db\s+[A-Z0-9_]+$/.test(c)) {
      cur.item = c.split(/\s+/)[1]
      continue
    }
    if (!cur.moves && /^db\s+[A-Z_]+,/.test(c)) {
      cur.moves = c
        .replace(/^db\s+/, '')
        .split(',')
        .map((x) => x.trim())
        .filter((m) => m && m !== 'NO_MOVE' && m !== '0')
      continue
    }
    const bw = /^bigdw\s+(\d+)/.exec(c)
    if (bw && statExp.length < 5 && !cur.statExp) {
      statExp.push(Number(bw[1]))
      if (statExp.length === 5) cur.statExp = statExp
      continue
    }
    const dv = /^dn\s+(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/.exec(c)
    if (dv && !cur.dvs) {
      cur.dvs = { attack: +dv[1], defense: +dv[2], speed: +dv[3], special: +dv[4] }
      continue
    }
    if (/^dname\b/.test(c)) {
      sets.push(cur)
      cur = null
    }
  }
  const trainers = [
    ...read(join(dir, 'data/battle_tower/classes.asm')).matchAll(
      /bt_trainer\s+(\w+),\s*"([^"]*)"/g,
    ),
  ].map((m, i) => ({
    key: `BT_${i + 1}`,
    class_const: m[1],
    name: m[2],
    set_group: 'any',
  }))
  return [
    {
      id: 'battle-tower',
      name: 'Battle Tower',
      rules:
        'Choose a level bracket (10 to 100). Each of seven trainers brings three Pokémon drawn at random from that bracket’s 21 sets, raised to the bracket level. DVs and Stat Exp are the set’s own.',
      sets: sets.map((s, i) => ({
        key: `${s.group}-${i + 1}`,
        group: s.group,
        level: s.group * 10,
        species: s.species,
        item: s.item && s.item !== 'NO_ITEM' ? s.item : null,
        moves: s.moves ?? [],
        dvs: s.dvs ?? null,
        stat_exp: s.statExp
          ? {
              hp: s.statExp[0],
              attack: s.statExp[1],
              defense: s.statExp[2],
              speed: s.statExp[3],
              special: s.statExp[4],
            }
          : null,
      })),
      trainers,
    },
  ]
}

// ------------------------------------------------------- Ruby/Sapphire

function rubySapphire(dir) {
  const parseMons = (file) => {
    const src = stripComments(read(join(dir, 'src/data/battle_tower', file)))
    const body = src.slice(src.indexOf('{') + 1)
    return braceGroups(body).map((g) => {
      const x = fields(g)
      return {
        species: x.species,
        item: facilityItem(x.heldItem),
        teamFlags: Number(x.teamFlags ?? 0),
        moves: list(x.moves).filter((m) => m !== 'MOVE_NONE'),
        evs: gen3Evs(x.evSpread),
        nature: x.nature,
      }
    })
  }
  const lv50 = parseMons('level_50_mons.h')
  const lv100 = parseMons('level_100_mons.h')
  const tsrc = stripComments(read(join(dir, 'src/data/battle_tower/trainers.h')))
  const trainers = braceGroups(tsrc.slice(tsrc.indexOf('{') + 1)).map((g, i) => {
    const x = fields(g)
    return {
      key: `BT_${i + 1}`,
      class_const: x.trainerClass,
      name: cString(x.name),
      teamFlags: Number(x.teamFlags ?? 0),
    }
  })
  // A set is eligible when it carries every one of the trainer's team flags
  // (battle_tower.c: `(mon.teamFlags & teamFlags) == teamFlags`, or no flags).
  const eligible = (t, pool, prefix) =>
    pool
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => t.teamFlags === 0 || (m.teamFlags & t.teamFlags) === t.teamFlags)
      .map(({ i }) => `${prefix}-${i + 1}`)
  const setRows = (pool, prefix, level) =>
    pool.map((m, i) => ({
      key: `${prefix}-${i + 1}`,
      level,
      species: m.species,
      item: m.item,
      moves: m.moves,
      evs: m.evs,
      nature: m.nature,
    }))
  return [
    {
      id: 'battle-tower',
      name: 'Battle Tower',
      rules:
        'Level 50 or Level 100. Each trainer brings three Pokémon chosen at random from the sets sharing all of its team flags, with IVs that rise with the win streak.',
      sets: [...setRows(lv50, 'L50', 50), ...setRows(lv100, 'L100', 100)],
      trainers: trainers.map((t) => ({
        key: t.key,
        class_const: t.class_const,
        name: t.name,
        set_keys: [...eligible(t, lv50, 'L50'), ...eligible(t, lv100, 'L100')],
      })),
    },
  ]
}

// --------------------------------------------------------------- Emerald

/** gBattleFrontierMons-style FacilityMon tables, keyed by their designator. */
function facilityMons(src, tableName) {
  const at = src.indexOf(tableName)
  const open = src.indexOf('{', at)
  const close = src.indexOf('};', open)
  const body = src.slice(open + 1, close)
  const out = []
  const re = /\[(\w+)\]\s*=\s*\{/g
  let m
  while ((m = re.exec(body))) {
    let depth = 1
    let j = re.lastIndex
    for (; j < body.length && depth; j += 1) {
      if (body[j] === '{') depth += 1
      else if (body[j] === '}') depth -= 1
    }
    const x = fields(body.slice(re.lastIndex, j - 1))
    re.lastIndex = j
    out.push({
      key: m[1],
      species: x.species,
      item: facilityItem(x.itemTableId),
      moves: list(x.moves).filter((mv) => mv !== 'MOVE_NONE'),
      evs: gen3Evs(x.evSpread),
      nature: x.nature,
    })
  }
  return out
}

/** Designated trainer tables: [TRAINER] = { .facilityClass, .trainerName, .monSet }. */
function facilityTrainers(src, tableName, monSets) {
  const at = src.indexOf(tableName)
  const open = src.indexOf('{', at)
  const close = src.indexOf('};', open)
  return braceGroups(src.slice(open + 1, close)).map((g, i) => {
    const x = fields(g)
    const setName = (x.monSet ?? '').trim()
    return {
      key: `T${i + 1}`,
      class_const: x.facilityClass,
      name: cString(x.trainerName),
      set_keys: monSets.get(setName) ?? [],
    }
  })
}

/** `const u16 gXTrainerMons_Name[] = { FRONTIER_MON_A, ..., -1 };` pools (macros expanded). */
function monSetArrays(src) {
  const out = new Map()
  for (const m of src.matchAll(/const\s+u16\s+(\w+)\s*\[\s*\]\s*=\s*\{([\s\S]*?)\};/g)) {
    out.set(
      m[1],
      m[2]
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x && x !== '-1'),
    )
  }
  return out
}

function emerald(dir) {
  const base = join(dir, 'src/data/battle_frontier')
  const monsSrc = stripComments(read(join(base, 'battle_frontier_mons.h')))
  const sets = facilityMons(monsSrc, 'gBattleFrontierMons')
  const poolSrc = expandMacros(stripComments(read(join(base, 'battle_frontier_trainer_mons.h'))))
  const pools = monSetArrays(poolSrc)
  const trainers = facilityTrainers(
    stripComments(read(join(base, 'battle_frontier_trainers.h'))),
    'gBattleFrontierTrainers',
    pools,
  )

  const tentSrc = expandMacros(stripComments(read(join(base, 'battle_tent.h'))))
  const tentPools = monSetArrays(tentSrc)
  const tents = [
    [
      'slateport',
      'Slateport Battle Tent',
      'gSlateportBattleTent',
      'Factory rules: rent three of six offered Pokémon, then face trainers using sets from this pool.',
    ],
    [
      'verdanturf',
      'Verdanturf Battle Tent',
      'gVerdanturfBattleTent',
      'Palace rules: the Pokémon act on their own, guided by nature.',
    ],
    [
      'fallarbor',
      'Fallarbor Battle Tent',
      'gFallarborBattleTent',
      'Arena rules: three turns each, then judged on Mind, Skill and Body.',
    ],
  ].map(([id, name, prefix, rules]) => ({
    id: `${id}-battle-tent`,
    name,
    rules: `Level 30. ${rules}`,
    sets: facilityMons(tentSrc, `${prefix}Mons`),
    trainers: facilityTrainers(tentSrc, `${prefix}Trainers`, tentPools),
  }))

  return [
    {
      id: 'battle-frontier',
      name: 'Battle Frontier',
      rules:
        'Shared by the Tower, Dome, Palace, Arena, Factory and Pike (and the Pyramid’s trainers). Level 50 or Open Level. Each trainer draws its Pokémon at random from its own list of sets; which trainers appear, and their IVs, rise with the win streak.',
      sets,
      trainers,
    },
    ...tents,
    trainerHill(dir),
  ]
}

/** Emerald's Trainer Hill: fixed teams, floor by floor, in four modes. */
function trainerHill(dir) {
  const src = stripComments(read(join(dir, 'src/data/battle_frontier/trainer_hill.h')))
  const modes = [
    ['Normal', 'sFloors_Normal'],
    ['Variety', 'sFloors_Variety'],
    ['Unique', 'sFloors_Unique'],
    ['Expert', 'sFloors_Expert'],
  ]
  const trainers = []
  for (const [mode, table] of modes) {
    const at = src.indexOf(table)
    const open = src.indexOf('{', at)
    // The floors array ends where the next top-level declaration begins.
    const next = src.indexOf('\nstatic const', open)
    const floors = braceGroups(
      src.slice(open + 1, next < 0 ? src.length : next).replace(/\};\s*$/, ''),
    )
    floors.forEach((floor, fi) => {
      const trainersBlock = /\.trainers\s*=\s*\{([\s\S]*)\}\s*,\s*\.map/.exec(floor)?.[1] ?? floor
      braceGroups(trainersBlock).forEach((tg, ti) => {
        const x = fields(tg)
        if (!x.mons) return
        const mons = braceGroups(x.mons.replace(/^\{|\}$/g, ''))
          .map((mg) => explicitMon(fields(mg)))
          .filter((m) => m.species && m.species !== 'SPECIES_NONE')
        if (!mons.length) return
        trainers.push({
          key: `${mode}-${fi + 1}-${ti + 1}`,
          class_const: x.facilityClass,
          name:
            cString(x.name)
              ?.replace(/\$+.*$/, '')
              .trim() || null,
          group: `${mode} · Floor ${fi + 1}`,
          party: mons,
        })
      })
    })
  }
  return {
    id: 'trainer-hill',
    name: 'Trainer Hill',
    rules:
      'Four floors per mode, two trainers per floor, each with a fixed team. Levels follow the challenger’s party.',
    sets: [],
    trainers,
  }
}

/** A fully specified Gen 3 facility Pokemon (Trainer Tower, Trainer Hill). */
function explicitMon(x) {
  const ev = (k) => Number(x[k] ?? 0)
  const iv = (k) => (x[k] != null ? Number(x[k]) : null)
  const personality = x.personality != null ? Number(x.personality) : null
  return {
    species: x.species,
    item: x.heldItem && x.heldItem !== 'ITEM_NONE' ? x.heldItem : null,
    moves: list(x.moves).filter((m) => m !== 'MOVE_NONE'),
    evs: {
      hp: ev('hpEV'),
      attack: ev('attackEV'),
      defense: ev('defenseEV'),
      speed: ev('speedEV'),
      'special-attack': ev('spAttackEV'),
      'special-defense': ev('spDefenseEV'),
    },
    ivs: {
      hp: iv('hpIV'),
      attack: iv('attackIV'),
      defense: iv('defenseIV'),
      speed: iv('speedIV'),
      'special-attack': iv('spAttackIV'),
      'special-defense': iv('spDefenseIV'),
    },
    ability_slot: x.abilityNum != null ? Number(x.abilityNum) : null,
    personality,
  }
}

// ----------------------------------------------------- FireRed/LeafGreen

function trainerTower(dir) {
  const src = stripComments(read(join(dir, 'src/trainer_tower_sets.c')))
  const floors = new Map()
  for (const m of src.matchAll(/static const struct TrainerTowerFloor (\w+)\s*=\s*\{/g)) {
    let depth = 1
    let j = m.index + m[0].length
    for (; j < src.length && depth; j += 1) {
      if (src[j] === '{') depth += 1
      else if (src[j] === '}') depth -= 1
    }
    floors.set(m[1], src.slice(m.index + m[0].length, j - 1))
  }
  const table = /gTrainerTowerFloors[\s\S]*?=\s*\{([\s\S]*?)\};/.exec(src)?.[1] ?? ''
  const trainers = []
  for (const block of table.matchAll(/\[CHALLENGE_TYPE_(\w+)\]\s*=\s*\{([\s\S]*?)\}/g)) {
    const type = block[1].charAt(0) + block[1].slice(1).toLowerCase()
    ;[...block[2].matchAll(/&(\w+)/g)].forEach((f, fi) => {
      const body = floors.get(f[1])
      if (!body) return
      const tb = (fields(body).trainers ?? '').replace(/^\{|\}$/g, '')
      braceGroups(tb).forEach((tg, ti) => {
        const x = fields(tg)
        if (!x.mons) return
        const mons = braceGroups(x.mons.replace(/^\{|\}$/g, ''))
          .map((mg) => explicitMon(fields(mg)))
          .filter((m) => m.species && m.species !== 'SPECIES_NONE')
        if (!mons.length || !cString(x.name)) return
        trainers.push({
          key: `${type}-${fi + 1}-${ti + 1}`,
          class_const: x.facilityClass,
          name: cString(x.name),
          group: `${type} · Floor ${fi + 1}`,
          party: mons,
        })
      })
    })
  }
  return [
    {
      id: 'trainer-tower',
      name: 'Trainer Tower',
      rules:
        'Sevii Islands, after the Hall of Fame. Eight floors per mode (Single, Double, Knockout, Mixed); every trainer’s team is fixed, with levels set from the challenger’s party.',
      sets: [],
      trainers,
    },
  ]
}

// ----------------------------------------------------------------- Gen 4

/** Platinum's frontier: one JSON per trainer and per set. */
function platinumFrontier(dir) {
  const base = join(dir, 'res/trainers/frontier')
  const setOrder = readFileSync(join(base, 'frontier_pokemon.order'), 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  const sets = setOrder
    .filter((k) => k !== 'none_1')
    .map((k) => {
      const s = JSON.parse(readFileSync(join(base, 'pokemon', `${k}.json`), 'utf8'))
      const flags = s.evFlags ?? {}
      const keyMap = {
        hp: 'hp',
        attack: 'attack',
        defense: 'defense',
        speed: 'speed',
        special_attack: 'special-attack',
        special_defense: 'special-defense',
      }
      return {
        key: k,
        species: s.species,
        form: s.form ?? 0,
        item: s.item && s.item !== 'ITEM_NONE' ? s.item : null,
        moves: (s.moves ?? []).filter((m) => m !== 'MOVE_NONE'),
        evs: evsFromFlags(
          Object.entries(flags)
            .filter(([, v]) => v)
            .map(([k2]) => keyMap[k2]),
        ),
        nature: s.nature,
      }
    })
  const trainerOrder = readFileSync(join(base, 'frontier_trainers.order'), 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  const trainers = trainerOrder.map((k, i) => {
    const t = JSON.parse(readFileSync(join(base, 'data', `${k}.json`), 'utf8'))
    // none_1 is the pool's index-0 placeholder, not a set anyone draws.
    return {
      key: `T${i + 1}`,
      class_const: t.class,
      name: t.name,
      set_keys: (t.availableSets ?? []).filter((k) => k !== 'none_1'),
    }
  })
  return { sets, trainers, setOrder }
}

const PT_RULES =
  'Shared by the Battle Tower, Factory, Hall, Castle and Arcade. Level 50 or Open Level. Each trainer draws its Pokémon at random from its own list of sets; stronger trainers and higher IVs come with the streak.'

function platinum(dir) {
  const { sets, trainers } = platinumFrontier(dir)
  return [{ id: 'battle-frontier', name: 'Battle Frontier', rules: PT_RULES, sets, trainers }]
}

/**
 * Diamond/Pearl's Battle Tower, from the raw NARC members: btdpm/narc_NNNN.bin
 * is one FrontierPokemonBase (species, four moves, EV flags, nature, item, form);
 * btdtr/narc_NNNN.bin is a trainer (class, count, set indices); names are message
 * bank 16 (files/msgdata/msg/narc_0016.gmm), one row per trainer. Platinum
 * revised this pool, so it is DP's own; the build counts how much survived.
 */
function diamondPearl(dir, platinumDir) {
  const pm = join(dir, 'files/battle/b_tower/btdpm')
  const tr = join(dir, 'files/battle/b_tower/btdtr')
  const files = (d) =>
    readdirSync(d)
      .filter((f) => f.endsWith('.bin'))
      .sort()
  const EV = ['hp', 'attack', 'defense', 'speed', 'special-attack', 'special-defense']
  const raw = files(pm).map((f) => {
    const b = readFileSync(join(pm, f))
    const flags = b.readUInt8(10)
    return {
      species: b.readUInt16LE(0),
      moves: [2, 4, 6, 8].map((o) => b.readUInt16LE(o)).filter(Boolean),
      evs: evsFromFlags(EV.filter((_, i) => flags & (1 << i))),
      nature: b.readUInt8(11),
      item: b.readUInt16LE(12),
      form: b.readUInt16LE(14),
    }
  })
  const sets = raw.slice(1).map((s, i) => ({
    index: i + 1,
    speciesId: s.species,
    moveIds: s.moves,
    itemIndex: s.item,
    natureIndex: s.nature,
    form: s.form,
    evs: s.evs,
  }))
  // Trainer names: message bank 16, one row per btdtr member, in order.
  const names = [
    ...readFileSync(join(dir, 'files/msgdata/msg/narc_0016.gmm'), 'utf8').matchAll(
      /<language name="English">([^<]*)</g,
    ),
  ].map((m) => m[1])
  const trainers = files(tr).map((f, i) => {
    const b = readFileSync(join(tr, f))
    const n = b.readUInt16LE(2)
    const ids = []
    for (let k = 0; k < n; k += 1) ids.push(b.readUInt16LE(4 + k * 2))
    return { key: `T${i + 1}`, classIndex: b.readUInt16LE(0), name: names[i] ?? null, set_ids: ids }
  })
  if (names.length !== trainers.length)
    throw new Error(`DP tower: ${names.length} names for ${trainers.length} trainers`)
  return [
    {
      id: 'battle-tower',
      name: 'Battle Tower',
      rules:
        'Level 50 or Open Level. Each trainer draws three Pokémon at random from its own list of sets; stronger trainers and higher IVs come with the streak.',
      binary: true,
      sets,
      trainers,
      platinum: platinumFrontier(platinumDir),
    },
  ]
}

export function parseFacilities(vg, dirs) {
  switch (vg) {
    case 'crystal':
      return crystal(dirs.pokecrystal)
    case 'ruby-sapphire':
      return rubySapphire(dirs.pokeruby)
    case 'emerald':
      return emerald(dirs.pokeemerald)
    case 'firered-leafgreen':
      return trainerTower(dirs.pokefirered)
    case 'diamond-pearl':
      return diamondPearl(dirs.pokediamond, dirs.pokeplatinum)
    case 'platinum':
      return platinum(dirs.pokeplatinum)
    case 'heartgold-soulsilver':
      return heartgoldFrontier(dirs.pokeplatinum)
    default:
      return []
  }
}

/**
 * HeartGold/SoulSilver's Battle Frontier pool is not extracted in its
 * disassembly (the archive ships prebuilt). Bulbapedia documents its trainers
 * and sets as Platinum's, so Platinum's pool stands in -- marked with
 * `source_note` in the bundle so nobody mistakes it for HGSS's own bytes.
 */
function heartgoldFrontier(platinumDir) {
  const { sets, trainers } = platinumFrontier(platinumDir)
  return [
    {
      id: 'battle-frontier',
      name: 'Battle Frontier',
      rules: PT_RULES,
      source_note:
        'Platinum’s pool: HeartGold/SoulSilver’s own frontier data is not extracted in its disassembly.',
      sets,
      trainers,
    },
  ]
}

export { STAT_KEYS }

// ----------------------------------------------------------- Frontier Brains

const EMERALD_BRAINS = {
  TOWER: ['Salon Maiden', 'Anabel', 'Battle Tower'],
  DOME: ['Dome Ace', 'Tucker', 'Battle Dome'],
  PALACE: ['Palace Maven', 'Spenser', 'Battle Palace'],
  ARENA: ['Arena Tycoon', 'Greta', 'Battle Arena'],
  FACTORY: ['Factory Head', 'Noland', 'Battle Factory'],
  PIKE: ['Pike Queen', 'Lucy', 'Battle Pike'],
  PYRAMID: ['Pyramid King', 'Brandon', 'Battle Pyramid'],
}

/**
 * Emerald's Frontier Brains (src/frontier_util.c): two fixed teams each, the
 * Silver and the Gold Symbol, with IVs, EVs (Gen 3 order: HP Atk Def Spe SpA
 * SpD), nature and moves; the streak each appears at is
 * sFrontierBrainStreakAppearances. Noland's entry is the exception the source
 * itself notes -- the Factory Head uses rentals, and the table's team is the one
 * Steven brings to the Mossdeep multi battle.
 */
export function emeraldBrains(dir) {
  const src = stripComments(read(join(dir, 'src/frontier_util.c')))
  const streaks = {}
  for (const m of src.matchAll(/\[FRONTIER_FACILITY_(\w+)\]\s*=\s*\{\s*(\d+),\s*(\d+),/g)) {
    if (!streaks[m[1]]) streaks[m[1]] = [Number(m[2]), Number(m[3])]
  }
  const at = src.indexOf('sFrontierBrainsMons')
  const body = src.slice(src.indexOf('{', at) + 1, src.indexOf('};', at))
  const trainers = []
  const re = /\[FRONTIER_FACILITY_(\w+)\]\s*=\s*\{/g
  let m
  while ((m = re.exec(body))) {
    let depth = 1
    let j = re.lastIndex
    for (; j < body.length && depth; j += 1) {
      if (body[j] === '{') depth += 1
      else if (body[j] === '}') depth -= 1
    }
    const [cls, name, place] = EMERALD_BRAINS[m[1]] ?? [m[1], m[1], m[1]]
    braceGroups(body.slice(re.lastIndex, j - 1)).forEach((team, symbol) => {
      const party = braceGroups(team).map((g) => {
        const x = fields(g)
        const evs = list(x.evs).map(Number)
        const iv = x.fixedIV === 'MAX_PER_STAT_IVS' ? 31 : Number(x.fixedIV)
        return {
          species: x.species,
          item: x.heldItem && x.heldItem !== 'ITEM_NONE' ? x.heldItem : null,
          moves: list(x.moves).filter((mv) => mv !== 'MOVE_NONE'),
          nature: x.nature,
          evs: {
            hp: evs[0],
            attack: evs[1],
            defense: evs[2],
            speed: evs[3],
            'special-attack': evs[4],
            'special-defense': evs[5],
          },
          ivs: Object.fromEntries(STAT_KEYS.map((k) => [k, iv])),
        }
      })
      const streak = streaks[m[1]]?.[symbol]
      trainers.push({
        key: `brain-${m[1].toLowerCase()}-${symbol ? 'gold' : 'silver'}`,
        class_name_override: cls,
        name,
        group: `Frontier Brain · ${place} · ${symbol ? 'Gold' : 'Silver'} Symbol${streak ? ` (${ordinal(streak)} challenge)` : ''}`,
        note:
          m[1] === 'FACTORY'
            ? 'Noland uses rental Pokémon; this entry is the team Steven brings to the Mossdeep City multi battle.'
            : undefined,
        party,
      })
    })
    re.lastIndex = j
  }
  return trainers
}

function ordinal(n) {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
  return `${n}${suffix}`
}

/**
 * Gen 4 Frontier Brains, from their Bulbapedia pages: Platinum and HGSS wire the
 * teams into code rather than data, so the wiki is the readable source. Each
 * page's {{Party}} blocks carry the game (`DP` or `PtHGSS`) and sit under a
 * heading naming the streak ("On 49th consecutive battle"). Thorton (rentals)
 * and Argenta (Battle Hall pools matched to the challenger) have no fixed team.
 */
export function gen4Brains(vg, pages) {
  const want = vg === 'diamond-pearl' ? 'dp' : 'pthgss'
  const out = []
  const PLACES = {
    Palmer: ['Tower Tycoon', 'Battle Tower'],
    Dahlia: ['Arcade Star', 'Battle Arcade'],
    Darach: ['Castle Valet', 'Battle Castle'],
  }
  for (const [name, sightings] of pages) {
    const [cls, place] = PLACES[name] ?? [null, null]
    if (!cls) continue
    const mine = sightings.filter((s) => (s.game ?? '').toLowerCase() === want && s.party.length)
    if (vg === 'diamond-pearl' && name !== 'Palmer') continue
    mine.forEach((s, i) => {
      // Darach's page gives each print two variant teams ("Team 1", "Team 2").
      const teams = new Map()
      for (const p of s.party) {
        const k = p.team ?? ''
        if (!teams.has(k)) teams.set(k, [])
        teams.get(k).push(p)
      }
      const label =
        s.heading && !/^pok/i.test(s.heading) ? s.heading : i === 0 ? 'Silver Print' : 'Gold Print'
      ;[...teams.entries()].forEach(([team, party], ti) => {
        out.push({
          key: `brain-${name.toLowerCase()}-${i + 1}${teams.size > 1 ? `-${ti + 1}` : ''}`,
          class_name_override: cls,
          name,
          group: `Frontier Brain · ${place} · ${label}${team ? ` · ${team}` : ''}`,
          wikiParty: party,
        })
      })
    })
  }
  if (vg !== 'diamond-pearl') {
    out.push(
      {
        key: 'brain-thorton',
        class_name_override: 'Factory Head',
        name: 'Thorton',
        group: 'Frontier Brain · Battle Factory',
        note: 'Uses rental Pokémon drawn from the Factory pool; no fixed team.',
        party: [],
      },
      {
        key: 'brain-argenta',
        class_name_override: 'Hall Matron',
        name: 'Argenta',
        group: 'Frontier Brain · Battle Hall',
        note: 'Uses a Battle Hall Pokémon matched to the challenger’s base stat total; no fixed team.',
        party: [],
      },
    )
  }
  return out
}
