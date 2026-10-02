/**
 * Generation 2 trainer AI -- Gold/Silver and Crystal, transcribed from pokecrystal
 * engine/battle/ai/{move,scoring,redundant,items,switch}.asm and
 * engine/battle/core.asm (FindMonInOTPartyToSwitchIntoBattle). The bundle's
 * pokegold data feeds Gold/Silver's class table; the routines are shared code.
 *
 * MOVE CHOICE (AIChooseMove): every move starts at 20 (disabled or out of PP 80),
 * the class's layers (TrainerClassAttributes) adjust it, the lowest scores win and
 * one is drawn at random. Random checks are the game's byte thresholds: "X
 * percent" is X*255/100 compared against a random byte, so AI_80_20 skips 50/256
 * of the time and AI_50_50 128/256.
 *
 * BEFORE THE MOVE (AI_SwitchOrTryItem): the class's switch style (often / rarely /
 * sometimes) against CheckAbleToSwitch's verdict, then AI_TryItem -- which only
 * runs for the party's highest-level Pokemon, and reads the class's CONTEXT_USE /
 * ALWAYS_USE / UNKNOWN_USE bits.
 *
 * THE GAME'S BUGS ARE KEPT, each where pokecrystal's docs/bugs_and_glitches.md
 * marks it: Smart encourages Mean Look when its OWN Pokemon is badly poisoned;
 * Conversion2 is discouraged after the first turn; Sunny Day ignores Solar Beam,
 * Flame Wheel and Moonlight; Cautious may fail to discourage residual moves;
 * Nightmare is not discouraged against any status; Future Sight is never seen as
 * already used; FindEnemyMonsWithAtLeastQuarterMaxHP divides where it should
 * multiply.
 */

import { getItem, getMove, getType, resolveTypesForGeneration } from '../../../data'
import type { Gen2Ai } from '../battleData'
import { gameMove, heldEffect } from '../battleData'
import { varietyOfSpec } from '../battler'
import { engineDamage, type Action } from '../engine/turn'
import { activeMon, aliveCount, type BattleState, type MonState } from '../engine/state'
import type { Rng } from '../engine/rng'
import { pct, pickBest, type AiChoice, type AiEnv, type AiTrace, type Contribution } from './types'

const EFFECTIVE = 10

function typesOf(m: MonState): string[] {
  return resolveTypesForGeneration(varietyOfSpec(m.spec), 2).map(
    (t) => getType(t.type_id)?.name ?? '',
  )
}

/** BattleCheckTypeMatchup / CheckTypeMatchup: EFFECTIVE (10) times each matching row, in order. */
function typeMatchup(moveType: string, defTypes: string[], foresight: boolean): number {
  const uniq = defTypes[0] === defTypes[1] ? [defTypes[0]] : defTypes
  let m = EFFECTIVE
  for (const t of uniq) {
    const mult = chart(moveType, t)
    if (
      mult === 0 &&
      foresight &&
      t === 'ghost' &&
      (moveType === 'normal' || moveType === 'fighting')
    )
      continue
    m = Math.floor((m * mult * 10) / 10)
  }
  return m
}

const CHART_CACHE = new Map<string, number>()
function chart(atk: string, def: string): number {
  const key = `${atk}>${def}`
  const hit = CHART_CACHE.get(key)
  if (hit != null) return hit
  let mult = 10
  for (let id = 1; id <= 18; id++) {
    const t = getType(id)
    if (t?.name !== def) continue
    const rel = t.damage_relations_by_generation['2']
    const atkId = [...Array(19).keys()].find((i) => getType(i)?.name === atk)
    if (!rel || atkId == null) break
    if (rel.no_damage_from.includes(atkId)) mult = 0
    else if (rel.double_damage_from.includes(atkId)) mult = 20
    else if (rel.half_damage_from.includes(atkId)) mult = 5
  }
  CHART_CACHE.set(key, mult / 10)
  return mult / 10
}

interface G2 {
  env: AiEnv
  ai: Gen2Ai
  st: BattleState
  enemy: MonState
  player: MonState
  rng: Rng
  scores: number[]
  contrib: Contribution[][]
  slot: number
}

const eff = (id: number, g: G2) => gameMove(g.env.data, id)?.e ?? ''
const power = (id: number, g: G2) => gameMove(g.env.data, id)?.p ?? 0
const mtype = (id: number, g: G2) => gameMove(g.env.data, id)?.t ?? ''
const acc = (id: number, g: G2) => gameMove(g.env.data, id)?.ab ?? 0

function bump(g: G2, d: number, label: string, slot = g.slot) {
  g.scores[slot] += d
  g.contrib[slot].push({ label, delta: d })
}
const discourageMove = (g: G2, label: string, slot = g.slot) =>
  bump(g, 10, `AIDiscourageMove (${label})`, slot)

/** carry = "skip": these return TRUE when the game's `ret c` would skip. */
const r = (g: G2) => g.rng.byte()
const ai50 = (g: G2) => r(g) < pct(50) + 1
const ai80 = (g: G2) => r(g) < pct(20) - 1

const enemyMaxHP = (g: G2) => g.enemy.hp === g.enemy.maxHp
const playerMaxHP = (g: G2) => g.player.hp === g.player.maxHp
/** AICheckEnemyHalfHP: carry when HP*2 > max (above half). */
const enemyAboveHalf = (g: G2) => g.enemy.hp * 2 > g.enemy.maxHp
const enemyAboveQuarter = (g: G2) => g.enemy.hp * 4 > g.enemy.maxHp
const playerAboveHalf = (g: G2) => g.player.hp * 2 > g.player.maxHp
const playerAboveQuarter = (g: G2) => g.player.hp * 4 > g.player.maxHp

function speedOf(g: G2, m: MonState) {
  // The battle stat the game stores (stages, badge, paralysis applied).
  const raw = m.stats.spe
  const T: [number, number][] = [
    [25, 100],
    [28, 100],
    [33, 100],
    [40, 100],
    [50, 100],
    [66, 100],
    [1, 1],
    [15, 10],
    [2, 1],
    [25, 10],
    [3, 1],
    [35, 10],
    [4, 1],
  ]
  const [n, d] = T[m.boosts.spe + 6]
  let s = Math.max(1, Math.min(999, Math.floor((raw * n) / d)))
  if (m === g.player && g.st.badges.includes('plain')) s = Math.min(999, s + (s >> 3))
  if (m.status === 'par') s = Math.max(1, s >> 2)
  return s
}
/** AICompareSpeed: carry when the enemy is faster (strictly). */
const enemyFaster = (g: G2) => speedOf(g, g.enemy) > speedOf(g, g.player)

const hasMoveEffect = (g: G2, e: string) => g.enemy.spec.moves.some((id) => eff(id, g) === e)
const hasMoveIn = (g: G2, list: (number | string)[]) =>
  g.enemy.spec.moves.some((id) => list.includes(id))
const playerUsed = (g: G2) => g.player.volatile.usedMoves
const lastPlayerMove = (g: G2) => g.player.volatile.lastMove

function moveMatchup(g: G2, id: number): number {
  return typeMatchup(mtype(id, g), typesOf(g.player), false)
}

/** AIDamageCalc: no random factor, no crit -- the engine's top roll. */
function aiDamage(g: G2, id: number): number {
  const e = eff(id, g)
  if ((g.ai.lists.constantDamage as string[]).includes(e)) {
    const slug = getMove(id)?.name
    if (slug === 'super-fang') return Math.max(1, Math.floor(g.player.hp / 2))
    if (slug === 'dragon-rage') return 40
    if (slug === 'sonic-boom') return 20
    return g.enemy.spec.level
  }
  const r0 = engineDamage(g.env.ctx, g.st, 'theirs', id, false, 1)
  if (!r0) return 0
  const d = r0.damage
  if (typeof d === 'number') return d
  const rolls = Array.isArray(d[0]) ? (d as number[][])[0] : (d as number[])
  return Math.max(...rolls)
}

// ------------------------------------------------------------- layers

function AI_Redundant(g: G2, id: number): boolean {
  const e = eff(id, g)
  const pv = g.player.volatile
  const ev = g.enemy.volatile
  const enemySide = g.st.sides.theirs
  const playerSide = g.st.sides.mine
  switch (e) {
    case 'EFFECT_DREAM_EATER':
      return g.player.status !== 'slp'
    case 'EFFECT_HEAL':
    case 'EFFECT_MORNING_SUN':
    case 'EFFECT_SYNTHESIS':
    case 'EFFECT_MOONLIGHT':
      return enemyMaxHP(g)
    case 'EFFECT_LIGHT_SCREEN':
      return enemySide.lightScreen > 0
    case 'EFFECT_MIST':
      return enemySide.mist > 0
    case 'EFFECT_FOCUS_ENERGY':
      return ev.focusEnergy
    case 'EFFECT_CONFUSE':
      return pv.confusion > 0 || playerSide.safeguard > 0
    case 'EFFECT_TRANSFORM':
      return ev.transformed
    case 'EFFECT_REFLECT':
      return enemySide.reflect > 0
    case 'EFFECT_SUBSTITUTE':
      return ev.substituteHp > 0
    case 'EFFECT_LEECH_SEED':
      return pv.leechSeed
    case 'EFFECT_DISABLE':
      return pv.disable != null
    case 'EFFECT_ENCORE':
      return pv.encore != null
    case 'EFFECT_SNORE':
    case 'EFFECT_SLEEP_TALK':
      return g.enemy.status !== 'slp'
    case 'EFFECT_MEAN_LOOK':
      return ev.meanLook
    case 'EFFECT_NIGHTMARE':
      // BUG kept: discouraged only when the player has NO status at all.
      return g.player.status === 'healthy' || pv.nightmare
    case 'EFFECT_SPIKES':
      return playerSide.spikes > 0
    case 'EFFECT_FORESIGHT':
      return false
    case 'EFFECT_PERISH_SONG':
      return pv.perishSong > 0
    case 'EFFECT_SANDSTORM':
      return g.st.weather.kind === 'sand'
    case 'EFFECT_ATTRACT':
      return !oppositeGender(g) || pv.attract
    case 'EFFECT_SAFEGUARD':
      return enemySide.safeguard > 0
    case 'EFFECT_RAIN_DANCE':
      return g.st.weather.kind === 'rain'
    case 'EFFECT_SUNNY_DAY':
      return g.st.weather.kind === 'sun'
    case 'EFFECT_TELEPORT':
      return true
    case 'EFFECT_SWAGGER':
      return pv.confusion > 0
    case 'EFFECT_FUTURE_SIGHT':
      // BUG kept: checks an unused screen bit, so never redundant.
      return false
  }
  return false
}

function oppositeGender(g: G2): boolean {
  const a = g.enemy.spec.gender
  const b = g.player.spec.gender
  return a !== 'N' && b !== 'N' && a !== b
}

function AI_Basic(g: G2) {
  g.enemy.spec.moves.forEach((id, i) => {
    g.slot = i
    if (AI_Redundant(g, id)) return discourageMove(g, 'AI_Basic: redundant')
    if ((g.ai.lists.statusOnly as string[]).includes(eff(id, g))) {
      if (g.player.status !== 'healthy')
        return discourageMove(g, 'AI_Basic: target already statused')
      if (g.st.sides.mine.safeguard > 0) return discourageMove(g, 'AI_Basic: Safeguard')
    }
  })
}

function effectIndex(g: G2, e: string) {
  return g.ai.effectOrder.indexOf(e)
}

function AI_Setup(g: G2) {
  const idx = (e: string) => effectIndex(g, e)
  const AU = idx('EFFECT_ATTACK_UP')
  const EU = idx('EFFECT_EVASION_UP')
  const ED = idx('EFFECT_EVASION_DOWN')
  const AU2 = idx('EFFECT_ATTACK_UP_2')
  const EU2 = idx('EFFECT_EVASION_UP_2')
  const ED2 = idx('EFFECT_EVASION_DOWN_2')
  g.enemy.spec.moves.forEach((id, i) => {
    g.slot = i
    const e = idx(eff(id, g))
    let kind: 'up' | 'down' | null = null
    // The game's second `cp` is commented out, so its `jr z` reuses the previous
    // compare: the effect right after EVASION_UP (Always Hit) and after
    // EVASION_UP_2 (Transform) is skipped, never treated as a stat-down.
    if (e >= AU && e <= EU) kind = 'up'
    else if (e > EU + 1 && e <= ED) kind = 'down'
    else if (e >= AU2 && e <= EU2) kind = 'up'
    else if (e > EU2 + 1 && e <= ED2) kind = 'down'
    if (!kind) return
    const firstTurn =
      kind === 'up' ? g.enemy.volatile.turnsOut === 0 : g.player.volatile.turnsOut === 0
    if (firstTurn) {
      if (!ai50(g)) bump(g, -2, `AI_Setup: stat ${kind} on the first turn`)
    } else if (!(r(g) < pct(12))) bump(g, 2, `AI_Setup: stat ${kind} after the first turn`)
  })
}

function AI_Types(g: G2) {
  g.enemy.spec.moves.forEach((id, i) => {
    g.slot = i
    const m = moveMatchup(g, id)
    if (m === 0) return discourageMove(g, 'AI_Types: immune')
    if (m === EFFECTIVE) return
    if (m > EFFECTIVE) {
      if (power(id, g) > 0) bump(g, -1, 'AI_Types: super effective')
      return
    }
    const t = mtype(id, g)
    const other = g.enemy.spec.moves.some((o) => mtype(o, g) !== t && power(o, g) > 0)
    if (other) bump(g, 1, 'AI_Types: not very effective, another damaging type exists')
  })
}

function AI_Offensive(g: G2) {
  g.enemy.spec.moves.forEach((id, i) => {
    g.slot = i
    if (power(id, g) === 0) bump(g, 2, 'AI_Offensive: non-damaging')
  })
}

/** CheckPlayerMoveTypeMatchups -> wEnemyAISwitchScore (base 10). */
function playerMoveTypeMatchups(g: G2): number {
  const BASE = 10
  let score = BASE
  const used = playerUsed(g)
  const enemyTypes = typesOf(g.enemy)
  if (!used.length) {
    for (const t of new Set(typesOf(g.player)))
      if (typeMatchup(t, enemyTypes, false) > EFFECTIVE) score -= 1
  } else {
    let e = 0
    let se = false
    for (const id of used) {
      if (!power(id, g)) continue
      const m = typeMatchup(mtype(id, g), enemyTypes, false)
      if (m > EFFECTIVE) {
        se = true
        break
      }
      if (m === 0) continue
      if (m >= EFFECTIVE) e = 2
      else if (e < 1) e = 1
    }
    if (se) score -= 1
    else if (e !== 2) {
      score += 1
      if (e === 0) score += 1
    }
  }
  // .CheckEnemyMoveMatchups
  let c = 0
  for (const id of g.enemy.spec.moves) {
    if (!power(id, g)) continue
    const m = typeMatchup(mtype(id, g), typesOf(g.player), false)
    if (m === 0) continue
    c += 1
    if (m < EFFECTIVE) continue
    c += 5
    if (m === EFFECTIVE) continue
    c = 100
  }
  if (c === 0) score -= 2
  else if (c < 5) score -= 1
  else if (c >= 100) score += 1
  return score
}

function AI_Smart(g: G2) {
  g.enemy.spec.moves.forEach((id, i) => {
    g.slot = i
    const e = eff(id, g)
    const h = SMART[e]
    if (h) h(g, id)
  })
}

const L = (s: string) => `AI_Smart_${s}`

const SMART: Record<string, (g: G2, id: number) => void> = {
  EFFECT_SLEEP: (g) => {
    if (!hasMoveEffect(g, 'EFFECT_DREAM_EATER') && !hasMoveEffect(g, 'EFFECT_NIGHTMARE')) return
    if (!ai50(g)) bump(g, -2, L('Sleep'))
  },
  EFFECT_LEECH_HIT: (g, id) => {
    const m = moveMatchup(g, id)
    if (m < EFFECTIVE) {
      if (!(r(g) < pct(39) + 1)) bump(g, 1, L('LeechHit: not very effective'))
      return
    }
    if (m === EFFECTIVE) return
    if (enemyMaxHP(g)) return
    if (!ai80(g)) bump(g, -1, L('LeechHit'))
  },
  EFFECT_LOCK_ON: (g) => {
    if (g.player.volatile.lockOn > 0) {
      g.enemy.spec.moves.forEach((o, j) => {
        if (acc(o, g) < pct(71) - 1)
          bump(g, -2, L('LockOn: player locked on, low-accuracy move'), j)
      })
      return discourageMove(g, L('LockOn'))
    }
    if (!enemyAboveQuarter(g)) return bump(g, 1, L('LockOn'))
    if (!enemyAboveHalf(g) && !enemyFaster(g)) return bump(g, 1, L('LockOn'))
    const pe = g.player.boosts.eva
    if (pe >= 3) {
      if (!ai50(g)) bump(g, -2, L('LockOn'))
      return
    }
    if (pe >= 1) return
    const ea = g.enemy.boosts.acc
    if (ea < -2) {
      if (!ai50(g)) bump(g, -2, L('LockOn'))
      return
    }
    if (ea < 0) return
    for (const o of g.enemy.spec.moves) {
      if (acc(o, g) >= pct(71) - 1) continue
      if (moveMatchup(g, o) >= EFFECTIVE) return
    }
    bump(g, 1, L('LockOn'))
  },
  EFFECT_SELFDESTRUCT: (g) => {
    const lastMon = aliveCount(g.st.sides.theirs) <= 1
    if (lastMon && aliveCount(g.st.sides.mine) > 1)
      return bump(g, 3, L('Selfdestruct: own last Pokemon'))
    if (enemyAboveHalf(g)) return bump(g, 3, L('Selfdestruct: above half HP'))
    if (!enemyAboveQuarter(g)) return
    if (!(r(g) < pct(8))) bump(g, 3, L('Selfdestruct'))
  },
  EFFECT_DREAM_EATER: (g) => {
    if (!(r(g) < pct(10))) bump(g, -3, L('DreamEater'))
  },
  EFFECT_EVASION_UP: (g) => smartEvasionLike(g, 'EvasionUp', true),
  EFFECT_ALWAYS_HIT: (g) => {
    if (!(g.enemy.boosts.acc < -2 || g.player.boosts.eva >= 3)) return
    if (!ai80(g)) bump(g, -2, L('AlwaysHit'))
  },
  EFFECT_MIRROR_MOVE: (g) => {
    const last = lastPlayerMove(g)
    if (!last) {
      if (!enemyFaster(g)) return
      return discourageMove(g, L('MirrorMove'))
    }
    if (!(g.ai.lists.useful as number[]).includes(last)) return
    if (ai50(g)) return
    bump(g, -1, L('MirrorMove'))
    if (!enemyFaster(g)) return
    if (!(r(g) < pct(10))) bump(g, -1, L('MirrorMove: faster'))
  },
  EFFECT_ACCURACY_DOWN: (g) => smartEvasionLike(g, 'AccuracyDown', false),
  EFFECT_RESET_STATS: (g) => {
    const e = g.enemy.boosts
    const p = g.player.boosts
    const low = [e.atk, e.def, e.spe, e.spa, e.spd, e.acc].some((v) => v < -2)
    const high = [p.atk, p.def, p.spe, p.spa, p.spd, p.acc].some((v) => v >= 3)
    if (low || high) {
      if (!(r(g) < pct(16))) bump(g, -1, L('ResetStats'))
    } else bump(g, 1, L('ResetStats'))
  },
  EFFECT_BIDE: (g) => {
    if (enemyMaxHP(g)) return
    if (!(r(g) < pct(10))) bump(g, 1, L('Bide'))
  },
  EFFECT_FORCE_SWITCH: (g) => {
    if (playerMoveTypeMatchups(g) < 10) return
    bump(g, 1, L('ForceSwitch'))
  },
  EFFECT_HEAL: (g) => smartHeal(g, 'Heal'),
  EFFECT_MORNING_SUN: (g) => smartHeal(g, 'MorningSun'),
  EFFECT_SYNTHESIS: (g) => smartHeal(g, 'Synthesis'),
  EFFECT_MOONLIGHT: (g) => smartHeal(g, 'Moonlight'),
  EFFECT_TOXIC: (g) => {
    if (!playerAboveHalf(g)) bump(g, 1, L('Toxic'))
  },
  EFFECT_LEECH_SEED: (g) => {
    if (!playerAboveHalf(g)) bump(g, 1, L('LeechSeed'))
  },
  EFFECT_LIGHT_SCREEN: (g) => smartScreen(g, 'LightScreen'),
  EFFECT_REFLECT: (g) => smartScreen(g, 'Reflect'),
  EFFECT_OHKO: (g) => {
    if (g.player.spec.level > g.enemy.spec.level) return discourageMove(g, L('Ohko'))
    if (!playerAboveHalf(g)) bump(g, 1, L('Ohko'))
  },
  EFFECT_RAZOR_WIND: (g) => smartRazorWind(g),
  EFFECT_UNUSED_2B: (g) => smartRazorWind(g),
  EFFECT_SUPER_FANG: (g) => {
    if (!playerAboveQuarter(g)) bump(g, 1, L('SuperFang'))
  },
  EFFECT_TRAP_TARGET: (g) => {
    const pv = g.player.volatile
    const discourage = () => {
      if (!ai50(g)) bump(g, 1, L('TrapTarget'))
    }
    if (pv.trapped) return discourage()
    const enc =
      g.player.status === 'tox' ||
      pv.attract ||
      pv.rollout ||
      pv.nightmare ||
      g.player.volatile.turnsOut === 0
    if (!enc) return discourage()
    if (!enemyAboveQuarter(g)) return
    if (!ai50(g)) bump(g, -2, L('TrapTarget'))
  },
  EFFECT_CONFUSE: (g) => {
    if (playerAboveHalf(g)) return
    if (!(r(g) < pct(10))) bump(g, 1, L('Confuse'))
    if (!playerAboveQuarter(g)) bump(g, 1, L('Confuse: below quarter'))
  },
  EFFECT_SP_DEF_UP_2: (g) => {
    if (!enemyAboveHalf(g)) return bump(g, 1, L('SpDefenseUp2'))
    if (g.enemy.boosts.spd >= 4) return bump(g, 1, L('SpDefenseUp2'))
    if (g.enemy.boosts.spd >= 2) return
    const special = ['fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark']
    if (!typesOf(g.player).some((t) => special.includes(t))) return
    if (!ai80(g)) bump(g, -2, L('SpDefenseUp2'))
  },
  EFFECT_FLY: (g) => {
    if (!g.player.volatile.semiInvulnerable) return
    if (!enemyFaster(g)) return
    bump(g, -3, L('Fly'))
  },
  EFFECT_PARALYZE: (g) => {
    if (!playerAboveQuarter(g)) {
      if (!ai50(g)) bump(g, 1, L('Paralyze: target low'))
      return
    }
    if (enemyFaster(g)) return
    if (!enemyAboveQuarter(g)) return
    if (!ai80(g)) bump(g, -2, L('Paralyze'))
  },
  EFFECT_SPEED_DOWN_HIT: (g, id) => {
    if (getMove(id)?.name !== 'icy-wind') return
    if (!enemyAboveQuarter(g)) return
    if (g.player.volatile.turnsOut !== 0) return
    if (enemyFaster(g)) return
    if (!(r(g) < pct(12))) bump(g, -2, L('SpeedDownHit'))
  },
  EFFECT_SUBSTITUTE: (g) => {
    if (enemyAboveHalf(g)) return
    discourageMove(g, L('Substitute'))
  },
  EFFECT_HYPER_BEAM: (g) => {
    if (enemyAboveHalf(g)) {
      if (r(g) < pct(16)) return
      bump(g, 1, L('HyperBeam'))
      if (!ai50(g)) bump(g, 1, L('HyperBeam'))
      return
    }
    if (enemyAboveQuarter(g)) return
    if (!ai50(g)) bump(g, -1, L('HyperBeam'))
  },
  EFFECT_RAGE: (g) => {
    if (g.enemy.volatile.rage) {
      if (!ai50(g)) bump(g, -1, L('Rage'))
      if (g.enemy.volatile.rageCounter >= 2) bump(g, -1, L('Rage: counter'))
      if (g.enemy.volatile.rageCounter >= 3) bump(g, -1, L('Rage: counter'))
      return
    }
    if (!enemyAboveHalf(g)) return bump(g, 1, L('Rage'))
    if (ai80(g)) bump(g, -1, L('Rage'))
  },
  EFFECT_MIMIC: (g) => {
    const last = lastPlayerMove(g)
    if (!last) {
      if (enemyFaster(g)) return discourageMove(g, L('Mimic'))
      return bump(g, 1, L('Mimic'))
    }
    if (!enemyAboveHalf(g)) return bump(g, 1, L('Mimic'))
    const m = moveMatchup(g, last)
    if (m < EFFECTIVE) return bump(g, 1, L('Mimic'))
    if (m > EFFECTIVE && !ai50(g)) bump(g, -1, L('Mimic'))
    if (!(g.ai.lists.useful as number[]).includes(last)) return
    if (!ai50(g)) bump(g, -1, L('Mimic: useful'))
  },
  EFFECT_COUNTER: (g) => smartCounter(g, 'Counter', false),
  EFFECT_MIRROR_COAT: (g) => smartCounter(g, 'MirrorCoat', true),
  EFFECT_ENCORE: (g) => {
    const discourage = () => bump(g, 3, L('Encore'))
    if (!enemyFaster(g)) return discourage()
    const last = lastPlayerMove(g)
    if (!last) return discourageMove(g, L('Encore'))
    const encourage = () => {
      if (!(r(g) < pct(28) - 1)) bump(g, -2, L('Encore'))
    }
    if (power(last, g) > 0) {
      const m = typeMatchup(mtype(last, g), typesOf(g.enemy), false)
      if (m < EFFECTIVE) {
        if (m !== 0) return
        return encourage()
      }
    }
    if (!(g.ai.lists.encore as number[]).includes(last)) return discourage()
    encourage()
  },
  EFFECT_PAIN_SPLIT: (g) => {
    if (!(g.player.hp < g.enemy.hp * 2)) return
    bump(g, 1, L('PainSplit'))
  },
  EFFECT_SNORE: (g) => smartSnore(g, 'Snore'),
  EFFECT_SLEEP_TALK: (g) => smartSnore(g, 'SleepTalk'),
  EFFECT_DEFROST_OPPONENT: (g) => {
    if (g.enemy.status === 'frz') bump(g, -3, L('DefrostOpponent'))
  },
  EFFECT_SPITE: (g) => {
    const last = lastPlayerMove(g)
    if (!last) {
      if (enemyFaster(g)) return discourageMove(g, L('Spite'))
      if (!ai50(g)) bump(g, 1, L('Spite'))
      return
    }
    const slot = g.player.spec.moves.indexOf(last)
    if (slot < 0) return
    const ppLeft = g.player.pp[slot]
    if (ppLeft < 6) {
      if (!(r(g) < pct(39) + 1)) bump(g, -2, L('Spite: low PP'))
      return
    }
    if (ppLeft >= 15) return bump(g, 1, L('Spite'))
    if (r(g) < pct(39) + 1) return
    bump(g, 1, L('Spite'))
  },
  EFFECT_DESTINY_BOND: (g) => {
    if (enemyAboveQuarter(g)) bump(g, 1, L('DestinyBond'))
  },
  EFFECT_REVERSAL: (g) => {
    if (enemyAboveQuarter(g)) bump(g, 1, L('Reversal'))
  },
  EFFECT_SKULL_BASH: (g) => {
    if (enemyAboveQuarter(g)) bump(g, 1, L('SkullBash'))
  },
  EFFECT_HEAL_BELL: (g) => {
    const any = g.st.sides.theirs.mons.some((m) => !m.fainted && m.status !== 'healthy')
    if (!any) {
      if (g.enemy.status !== 'healthy') return
      return discourageMove(g, L('HealBell'))
    }
    if (g.enemy.status !== 'healthy') bump(g, -1, L('HealBell'))
    if (g.enemy.status !== 'frz' && g.enemy.status !== 'slp') return
    if (!ai50(g)) bump(g, -2, L('HealBell'))
  },
  EFFECT_PRIORITY_HIT: (g, id) => {
    if (enemyFaster(g)) return
    if (g.player.volatile.semiInvulnerable) return discourageMove(g, L('PriorityHit'))
    if (aiDamage(g, id) >= g.player.hp) bump(g, -3, L('PriorityHit: KOs'))
  },
  EFFECT_THIEF: (g) => bump(g, 0x1e, L('Thief')),
  EFFECT_CONVERSION2: (g) => {
    // BUG kept: discourages whenever the player has used a move.
    if (lastPlayerMove(g)) {
      if (!(r(g) < pct(10))) bump(g, 1, L('Conversion2'))
      return
    }
  },
  EFFECT_DISABLE: (g, id) => {
    const discourage = () => {
      if (!(r(g) < pct(8))) bump(g, 1, L('Disable'))
    }
    if (!enemyFaster(g)) return discourage()
    if ((g.ai.lists.useful as number[]).includes(lastPlayerMove(g))) {
      if (!(r(g) < pct(39) + 1)) bump(g, -1, L('Disable'))
      return
    }
    if (power(id, g) !== 0) return
    discourage()
  },
  EFFECT_MEAN_LOOK: (g) => {
    if (!enemyAboveHalf(g)) return bump(g, 1, L('MeanLook'))
    if (aliveCount(g.st.sides.mine) <= 1) return discourageMove(g, L('MeanLook'))
    const pv = g.player.volatile
    // BUG kept: checks the AI's OWN toxic.
    if (g.enemy.status === 'tox' || pv.attract || pv.rollout || pv.nightmare) {
      if (!ai80(g)) bump(g, -3, L('MeanLook'))
      return
    }
    if (playerMoveTypeMatchups(g) >= 11) return
    bump(g, 1, L('MeanLook'))
  },
  EFFECT_NIGHTMARE: (g) => {
    if (!ai50(g)) bump(g, -1, L('Nightmare'))
  },
  EFFECT_FLAME_WHEEL: (g) => {
    if (g.enemy.status === 'frz') bump(g, -5, L('FlameWheel'))
  },
  EFFECT_CURSE: (g) => {
    const ghost = typesOf(g.enemy).includes('ghost')
    if (!ghost) {
      if (!enemyAboveHalf(g)) return bump(g, 1, L('Curse'))
      if (g.enemy.boosts.atk >= 4) return bump(g, 1, L('Curse'))
      if (g.enemy.boosts.atk >= 2) return
      const pt = typesOf(g.player)
      if (pt[0] === 'ghost') return bump(g, 2, L('Curse: vs Ghost'))
      const special = ['fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark']
      if (special.includes(pt[0]) || special.includes(pt[pt.length - 1])) return
      if (!ai80(g)) bump(g, -2, L('Curse'))
      return
    }
    if (g.player.volatile.cursed) return discourageMove(g, L('Curse'))
    const lastEnemy = aliveCount(g.st.sides.theirs) <= 1
    const lastPlayer = aliveCount(g.st.sides.mine) <= 1
    if (lastEnemy) {
      if (!lastPlayer) return bump(g, 4, L('Curse: last Pokemon'))
    } else if (lastPlayer) {
      if (!ai50(g)) bump(g, -2, L('Curse'))
      return
    }
    if (!enemyAboveQuarter(g)) return bump(g, 4, L('Curse: low HP'))
    if (!enemyAboveHalf(g)) return bump(g, 2, L('Curse'))
    if (!enemyMaxHP(g)) return
    if (g.player.volatile.turnsOut !== 0) return
    if (!ai50(g)) bump(g, -2, L('Curse'))
  },
  EFFECT_PROTECT: (g) => {
    const ev = g.enemy.volatile
    const pv = g.player.volatile
    const discourage = (extra: number) => {
      if (extra) bump(g, extra, L('Protect: used last turn'))
      if (!(r(g) < pct(8))) bump(g, 2, L('Protect'))
    }
    if (ev.protectChain > 0) return discourage(1)
    if (pv.lockOn > 0) return discourage(0)
    const encourage = () => {
      if (!ai80(g)) bump(g, -1, L('Protect'))
    }
    if (pv.furyCutter >= 3) return encourage()
    if (pv.charging != null) return encourage()
    if (g.player.status === 'tox' || pv.leechSeed || pv.cursed) return encourage()
    if (!pv.rollout || pv.rollout.count < 3) return discourage(0)
    encourage()
  },
  EFFECT_FORESIGHT: (g) => {
    if (
      g.enemy.boosts.acc < -2 ||
      g.player.boosts.eva >= 3 ||
      typesOf(g.player).includes('ghost')
    ) {
      if (!(r(g) < pct(39) + 1)) bump(g, -2, L('Foresight'))
      return
    }
    if (!(r(g) < pct(8))) bump(g, 1, L('Foresight'))
  },
  EFFECT_PERISH_SONG: (g) => {
    if (aliveCount(g.st.sides.theirs) <= 1) return bump(g, 5, L('PerishSong: last Pokemon'))
    if (g.enemy.volatile.meanLook) {
      if (!ai50(g)) bump(g, -1, L('PerishSong'))
      return
    }
    if (playerMoveTypeMatchups(g) < 10) return
    if (!ai50(g)) bump(g, 1, L('PerishSong'))
  },
  EFFECT_SANDSTORM: (g) => {
    if (typesOf(g.player).some((t) => ['rock', 'ground', 'steel'].includes(t)))
      return bump(g, 2, L('Sandstorm: target immune'))
    if (!playerAboveHalf(g)) return bump(g, 1, L('Sandstorm'))
    if (!ai50(g)) bump(g, -1, L('Sandstorm'))
  },
  EFFECT_ENDURE: (g) => {
    if (g.enemy.volatile.protectChain > 0) return bump(g, 2, L('Endure'))
    if (enemyMaxHP(g)) return bump(g, 2, L('Endure'))
    if (enemyAboveQuarter(g)) return bump(g, 1, L('Endure'))
    if (hasMoveEffect(g, 'EFFECT_REVERSAL')) {
      if (!ai80(g)) bump(g, -3, L('Endure: with Reversal'))
      return
    }
    if (g.enemy.volatile.lockOn <= 0) return
    if (!ai50(g)) bump(g, -2, L('Endure'))
  },
  EFFECT_FURY_CUTTER: (g) => {
    const c = g.enemy.volatile.furyCutter
    if (c > 0) bump(g, -1, L('FuryCutter'))
    if (c >= 2) bump(g, -2, L('FuryCutter'))
    if (c >= 3) bump(g, -3, L('FuryCutter'))
    SMART.EFFECT_ROLLOUT(g, 0)
  },
  EFFECT_ROLLOUT: (g) => {
    const ev = g.enemy.volatile
    const maybeDiscourage = () => {
      if (!ai80(g)) bump(g, 1, L('Rollout'))
    }
    if (ev.attract || ev.confusion > 0 || g.enemy.status === 'par') return maybeDiscourage()
    if (!enemyAboveQuarter(g)) return maybeDiscourage()
    if (g.enemy.boosts.acc < 0) return maybeDiscourage()
    if (g.player.boosts.eva >= 1) return maybeDiscourage()
    if (r(g) < pct(79) - 1) bump(g, -2, L('Rollout'))
  },
  EFFECT_SWAGGER: (g) => smartFirstTurn(g, 'Swagger'),
  EFFECT_ATTRACT: (g) => smartFirstTurn(g, 'Attract'),
  EFFECT_SAFEGUARD: (g) => {
    if (playerAboveHalf(g)) return
    if (!ai80(g)) bump(g, 1, L('Safeguard'))
  },
  EFFECT_MAGNITUDE: (g) => smartEarthquake(g),
  EFFECT_EARTHQUAKE: (g) => smartEarthquake(g),
  EFFECT_BATON_PASS: (g) => {
    if (playerMoveTypeMatchups(g) < 10) return
    bump(g, 1, L('BatonPass'))
  },
  EFFECT_PURSUIT: (g) => {
    if (!playerAboveQuarter(g)) {
      if (!ai50(g)) bump(g, -2, L('Pursuit'))
      return
    }
    if (!ai80(g)) bump(g, 1, L('Pursuit'))
  },
  EFFECT_RAPID_SPIN: (g) => {
    const ev = g.enemy.volatile
    if (!(ev.trapped || ev.leechSeed || g.st.sides.theirs.spikes > 0)) return
    if (!ai80(g)) bump(g, -2, L('RapidSpin'))
  },
  EFFECT_HIDDEN_POWER: (g, id) => {
    // Type and power from the enemy's DVs.
    const hp = hiddenPowerOf(g.enemy)
    const m = typeMatchup(hp.type, typesOf(g.player), false)
    if (m < EFFECTIVE) return bump(g, 1, L('HiddenPower: not very effective'))
    if (hp.power < 50) return bump(g, 1, L('HiddenPower: weak'))
    if (m > EFFECTIVE) return bump(g, -1, L('HiddenPower: super effective'))
    if (hp.power >= 70) bump(g, -1, L('HiddenPower: strong'))
    void id
  },
  EFFECT_RAIN_DANCE: (g) => smartWeather(g, 'rain'),
  EFFECT_SUNNY_DAY: (g) => smartWeather(g, 'sun'),
  EFFECT_BELLY_DRUM: (g) => {
    if (g.enemy.boosts.atk >= 3) return bump(g, 5, L('BellyDrum'))
    if (enemyMaxHP(g)) return
    bump(g, 1, L('BellyDrum'))
    if (enemyAboveHalf(g)) return
    bump(g, 5, L('BellyDrum: below half'))
  },
  EFFECT_PSYCH_UP: (g) => {
    const sum = (m: MonState) =>
      100 +
      m.boosts.atk +
      m.boosts.def +
      m.boosts.spe +
      m.boosts.spa +
      m.boosts.spd +
      m.boosts.acc +
      m.boosts.eva
    if (sum(g.enemy) >= sum(g.player)) return bump(g, 2, L('PsychUp'))
    if (g.player.boosts.acc < -1) return
    if (g.enemy.boosts.eva >= 1) return
    if (!ai80(g)) bump(g, -1, L('PsychUp'))
  },
  EFFECT_TWISTER: (g) => smartGust(g),
  EFFECT_GUST: (g) => smartGust(g),
  EFFECT_FUTURE_SIGHT: (g) => {
    if (!enemyFaster(g)) return
    if (!g.player.volatile.semiInvulnerable) return
    bump(g, -2, L('FutureSight'))
  },
  EFFECT_STOMP: (g) => {
    if (!g.player.volatile.minimized) return
    if (!ai80(g)) bump(g, -1, L('Stomp'))
  },
  EFFECT_SOLARBEAM: (g) => {
    const w = g.st.weather.kind
    if (w === 'sun') {
      if (!ai80(g)) bump(g, -2, L('Solarbeam: sun'))
      return
    }
    if (w !== 'rain') return
    if (!(r(g) < pct(10))) bump(g, 2, L('Solarbeam: rain'))
  },
  EFFECT_THUNDER: (g) => {
    if (g.st.weather.kind !== 'sun') return
    if (!(r(g) < pct(10))) bump(g, 1, L('Thunder: sun'))
  },
}

function smartEvasionLike(g: G2, name: string, evasion: boolean) {
  const pv = g.player.volatile
  if (evasion && g.enemy.boosts.eva >= 6) return discourageMove(g, L(name))
  const greatly = () => bump(g, -2, L(name))
  const full = evasion ? enemyMaxHP(g) : playerMaxHP(g) && enemyAboveHalf(g)
  if (full) {
    if (g.player.status === 'tox') return greatly()
    if (r(g) < pct(70)) return greatly()
  } else {
    const above = evasion ? enemyAboveQuarter(g) : playerAboveQuarter(g)
    if (!above) {
      bump(g, 2, L(`${name}: low HP`))
    } else {
      if (r(g) < pct(4)) return greatly()
      const aboveHalf = evasion ? enemyAboveHalf(g) : playerAboveHalf(g)
      if (aboveHalf) {
        if (ai80(g)) return greatly()
      } else {
        if (!ai50(g)) bump(g, 2, L(name))
      }
    }
  }
  // .not_encouraged: every path that has not returned arrives here.
  if (g.player.status === 'tox') {
    if (!(r(g) < pct(31) + 1)) bump(g, -2, L(`${name}: target badly poisoned`))
    return
  }
  if (pv.leechSeed) {
    if (!ai50(g)) bump(g, -1, L(`${name}: target seeded`))
    return
  }
  if (g.player.boosts.acc < g.enemy.boosts.eva) return bump(g, 1, L(name))
  if (pv.furyCutter > 0 || pv.rollout) return greatly()
  bump(g, 1, L(name))
}

function smartHeal(g: G2, name: string) {
  if (!enemyAboveQuarter(g)) {
    if (!(r(g) < pct(10))) bump(g, -2, L(`${name}: below a quarter`))
    return
  }
  if (!enemyAboveHalf(g)) return
  bump(g, 1, L(`${name}: above half`))
}

function smartScreen(g: G2, name: string) {
  if (enemyMaxHP(g)) return
  if (!(r(g) < pct(8))) bump(g, 1, L(name))
}

function smartRazorWind(g: G2) {
  const ev = g.enemy.volatile
  if (ev.perishSong > 0 && ev.perishSong < 3) return bump(g, 1, L('RazorWind'))
  if (playerUsed(g).some((id) => eff(id, g) === 'EFFECT_PROTECT'))
    return bump(g, 6, L('RazorWind: player knows Protect'))
  if (ev.confusion === 0 && enemyAboveHalf(g)) return
  if (!(r(g) < pct(79) - 1)) bump(g, 1, L('RazorWind'))
}

function smartCounter(g: G2, name: string, special: boolean) {
  const SPECIAL = ['fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark']
  const matches = (id: number) => power(id, g) > 0 && SPECIAL.includes(mtype(id, g)) === special
  const b = playerUsed(g).filter(matches).length
  if (b === 0) return bump(g, 1, L(name))
  const encourage = () => {
    if (!(r(g) < pct(39) + 1)) bump(g, -1, L(name))
  }
  if (b >= 3) return encourage()
  const last = lastPlayerMove(g)
  if (!last || !matches(last)) return
  encourage()
}

function smartSnore(g: G2, name: string) {
  // "fast asleep" = sleep counter exactly 1 in the game's encoding (about to wake).
  if (g.enemy.status === 'slp' && g.enemy.sleep === 1) return bump(g, 3, L(name))
  bump(g, -3, L(name))
}

function smartFirstTurn(g: G2, name: string) {
  if (g.player.volatile.turnsOut === 0) {
    if (r(g) < pct(79) - 1) bump(g, -1, L(name))
    return
  }
  if (!ai80(g)) bump(g, 1, L(name))
}

function smartEarthquake(g: G2) {
  if (lastPlayerMove(g) !== moveIdOf('dig')) return
  if (g.player.volatile.semiInvulnerable === 'dig') {
    if (enemyFaster(g)) bump(g, -2, L('Earthquake: target underground'))
    return
  }
  if (enemyFaster(g)) return
  if (!ai50(g)) bump(g, -1, L('Earthquake: may dig'))
}

function smartGust(g: G2) {
  if (lastPlayerMove(g) !== moveIdOf('fly')) return
  if (g.player.volatile.semiInvulnerable === 'fly') {
    if (enemyFaster(g)) bump(g, -2, L('Gust: target flying'))
    return
  }
  if (enemyFaster(g)) return
  if (!ai50(g)) bump(g, -1, L('Gust: may fly'))
}

function smartWeather(g: G2, kind: 'rain' | 'sun') {
  const pt = typesOf(g.player)
  const [bad, good] = kind === 'rain' ? ['water', 'fire'] : ['fire', 'water']
  const badWeather = () =>
    bump(
      g,
      3,
      L(kind === 'rain' ? 'RainDance: favours the player' : 'SunnyDay: favours the player'),
    )
  const goodWeather = () => {
    if (!playerAboveHalf(g)) return
    if (g.player.volatile.turnsOut === 0 || g.enemy.volatile.turnsOut === 0)
      bump(g, -2, L(kind === 'rain' ? 'RainDance: hurts the player' : 'SunnyDay: hurts the player'))
  }
  for (const t of [pt[0], pt[pt.length - 1]]) {
    if (t === bad) return badWeather()
    if (t === good) return goodWeather()
  }
  const list = (kind === 'rain' ? g.ai.lists.rainDance : g.ai.lists.sunnyDay) as number[]
  if (!hasMoveIn(g, list)) return badWeather()
  if (!playerAboveHalf(g)) return badWeather()
  if (!ai50(g)) bump(g, -1, L(kind === 'rain' ? 'RainDance' : 'SunnyDay'))
}

function hiddenPowerOf(m: MonState): { type: string; power: number } {
  // pokecrystal HiddenPowerDamage, from the DVs.
  const dv = m.spec.spread.individual
  const a = dv.attack?.max ?? 15
  const d = dv.defense?.max ?? 15
  const s = dv.speed?.max ?? 15
  const c = dv.special?.max ?? 15
  const msb = (((a >> 3) & 1) << 3) | (((d >> 3) & 1) << 2) | (((s >> 3) & 1) << 1) | ((c >> 3) & 1)
  const power = Math.floor((5 * msb + (c & 3)) / 2) + 31
  const TYPES = [
    'fighting',
    'flying',
    'poison',
    'ground',
    'rock',
    'bug',
    'ghost',
    'steel',
    'fire',
    'water',
    'grass',
    'electric',
    'psychic',
    'ice',
    'dragon',
    'dark',
  ]
  return { type: TYPES[((a & 3) << 2) | (d & 3)], power }
}

const MOVE_IDS = new Map<string, number>()
function moveIdOf(slug: string): number {
  if (!MOVE_IDS.size)
    for (let i = 1; i < 470; i++) {
      const m = getMove(i)
      if (m) MOVE_IDS.set(m.name, i)
    }
  return MOVE_IDS.get(slug) ?? -1
}

function AI_Opportunist(g: G2) {
  if (enemyAboveHalf(g)) return
  if (enemyAboveQuarter(g) && ai50(g)) return
  g.enemy.spec.moves.forEach((id, i) => {
    if ((g.ai.lists.stall as number[]).includes(id))
      bump(g, 1, 'AI_Opportunist: stall move at low HP', i)
  })
}

function AI_Aggressive(g: G2) {
  let best = -1
  let bestDmg = 0
  g.enemy.spec.moves.forEach((id, i) => {
    if (!power(id, g)) return
    const d = aiDamage(g, id)
    if (d >= bestDmg) {
      bestDmg = d
      best = i
    }
  })
  if (best < 0) return
  g.enemy.spec.moves.forEach((id, i) => {
    if (i === best) return
    if (power(id, g) < 2) return
    if ((g.ai.lists.reckless as string[]).includes(eff(id, g))) return
    bump(g, 1, 'AI_Aggressive: not the strongest move', i)
  })
}

function AI_Cautious(g: G2) {
  if (g.enemy.volatile.turnsOut === 0) return
  g.enemy.spec.moves.forEach((id, i) => {
    if (!(g.ai.lists.residual as number[]).includes(id)) return
    // BUG kept: one draw, and the loop stops when it fails.
    if (!(r(g) < pct(90) + 1)) return
    bump(g, 1, 'AI_Cautious: residual move after the first turn', i)
  })
}

function AI_Status(g: G2) {
  g.enemy.spec.moves.forEach((id, i) => {
    g.slot = i
    const e = eff(id, g)
    const pt = typesOf(g.player)
    if ((e === 'EFFECT_TOXIC' || e === 'EFFECT_POISON') && pt.includes('poison'))
      return discourageMove(g, 'AI_Status: poison-type target')
    if (
      e === 'EFFECT_TOXIC' ||
      e === 'EFFECT_POISON' ||
      e === 'EFFECT_SLEEP' ||
      e === 'EFFECT_PARALYZE' ||
      power(id, g) > 0
    ) {
      if (moveMatchup(g, id) === 0) discourageMove(g, 'AI_Status: target immune')
    }
  })
}

function AI_Risky(g: G2) {
  g.enemy.spec.moves.forEach((id, i) => {
    if (!power(id, g)) return
    if ((g.ai.lists.risky as string[]).includes(eff(id, g))) {
      if (enemyMaxHP(g)) return
      if (r(g) < pct(79) - 1) return
    }
    if (aiDamage(g, id) >= g.player.hp) bump(g, -5, 'AI_Risky: KOs', i)
  })
}

const LAYERS: Record<string, (g: G2) => void> = {
  basic: AI_Basic,
  setup: AI_Setup,
  types: AI_Types,
  offensive: AI_Offensive,
  smart: AI_Smart,
  opportunist: AI_Opportunist,
  aggressive: AI_Aggressive,
  cautious: AI_Cautious,
  status: AI_Status,
  risky: AI_Risky,
}
const ORDER = [
  'basic',
  'setup',
  'types',
  'offensive',
  'smart',
  'opportunist',
  'aggressive',
  'cautious',
  'status',
  'risky',
]

// ---------------------------------------------------------- switch / items

/** CheckAbleToSwitch -> wEnemySwitchMonParam: high nibble the urgency, low the target. */
function checkAbleToSwitch(g: G2): { param: number; to: number } {
  const sd = g.st.sides.theirs
  const others = sd.mons.map((m, i) => ({ m, i })).filter((x) => x.i !== sd.active && !x.m.fainted)
  if (!others.length) return { param: 0, to: -1 }
  const se = (m: MonState) =>
    m.spec.moves.some(
      (id) => power(id, g) > 0 && typeMatchup(mtype(id, g), typesOf(g.player), false) > EFFECTIVE,
    )
  const resists = (m: MonState) => {
    const last = lastPlayerMove(g)
    const t = typesOf(m)
    if (last && power(last, g) > 0) return typeMatchup(mtype(last, g), t, false) <= EFFECTIVE
    return typesOf(g.player).every((pt) => typeMatchup(pt, t, false) <= EFFECTIVE)
  }
  // BUG kept: the "at least a quarter" test divides HP by 4 instead of multiplying.
  const quarterBug = (m: MonState) => Math.floor(m.hp / 4) >= m.maxHp
  if (g.enemy.volatile.perishSong === 1) {
    const pick = others.find((x) => quarterBug(x.m) && resists(x.m) && se(x.m)) ?? others[0]
    return { param: 0x30, to: pick.i }
  }
  const score = playerMoveTypeMatchups(g)
  if (score >= 11) return { param: 0, to: -1 }
  const last = lastPlayerMove(g)
  if (last && power(last, g) > 0) {
    const immune = others.filter((x) => typeMatchup(mtype(last, g), typesOf(x.m), false) === 0)
    if (immune.length) {
      const withSe = immune.find((x) => se(x.m)) ?? immune[0]
      return { param: score < 10 ? 0x20 : 0x10, to: withSe.i }
    }
  }
  if (score >= 10) return { param: 0, to: -1 }
  const cand = others.filter((x) => quarterBug(x.m) && resists(x.m) && se(x.m))
  if (!cand.length) return { param: 0, to: -1 }
  return { param: 0x10, to: cand[0].i }
}

function switchDecision(g: G2, style: string[], trace: AiTrace): Action | null {
  if (g.enemy.volatile.meanLook || g.enemy.volatile.trapped) return null
  const { param, to } = checkAbleToSwitch(g)
  const level = param & 0xf0
  if (!level || to < 0) return null
  const b = r(g)
  let go = false
  if (style.includes('SWITCH_OFTEN'))
    go = level === 0x10 ? b < pct(50) + 1 : level === 0x20 ? b < pct(79) - 1 : !(b < pct(4))
  else if (style.includes('SWITCH_RARELY'))
    go = level === 0x10 ? b < pct(8) : level === 0x20 ? b < pct(12) : !(b < pct(79) - 1)
  else if (style.includes('SWITCH_SOMETIMES'))
    go = level === 0x10 ? b < pct(20) - 1 : level === 0x20 ? b < pct(50) + 1 : !(b < pct(20) - 1)
  if (!go) return null
  trace.pre = {
    kind: 'switch',
    label: `AI_Switch (${style.find((s) => s.startsWith('SWITCH')) ?? ''}, urgency $${level.toString(16)})`,
    to,
  }
  return { kind: 'switch', to }
}

function tryItem(g: G2, cls: Gen2Ai['classes'][string], trace: AiTrace): Action | null {
  const bag = g.st.sides.theirs.bag
  if (!bag.length) return null
  // Only the party's highest-level Pokemon uses items (AI_TryItem .IsHighestLevel).
  const maxLv = Math.max(...g.st.sides.theirs.mons.map((m) => m.spec.level))
  if (g.enemy.spec.level < maxLv) return null
  const ctxUse = cls.itemSwitch.includes('CONTEXT_USE')
  const always = cls.itemSwitch.includes('ALWAYS_USE')
  const unknown = cls.itemSwitch.includes('UNKNOWN_USE')
  const slugOf = (id: number) => getItem(id)?.name ?? ''
  const status = (): boolean => {
    if (g.enemy.status === 'healthy') return false
    if (ctxUse) {
      if (g.enemy.status === 'tox' && g.enemy.toxic >= 4 && r(g) < pct(50) + 1) return true
      return g.enemy.status === 'frz' || g.enemy.status === 'slp'
    }
    if (always) return true
    return r(g) < pct(20) - 1
  }
  const healItem = (): boolean => {
    if (ctxUse) {
      if (enemyAboveHalf(g)) return false
      if (!enemyAboveQuarter(g)) return true
      return r(g) < pct(20) - 1
    }
    if (enemyAboveHalf(g)) return false
    if (unknown) {
      if (enemyAboveQuarter(g)) return false
      return !(r(g) < pct(20) - 1)
    }
    if (!enemyAboveQuarter(g)) return true
    return r(g) < pct(50) + 1
  }
  const xItem = (): boolean => {
    if (g.enemy.volatile.turnsOut === 0) {
      if (always) return true
      if (r(g) < pct(50) + 1) return false
      if (ctxUse) return true
      return !(r(g) < pct(50) + 1)
    }
    if (!always) return false
    return r(g) < pct(20) - 1
  }
  const ORDER_ITEMS = [
    'full-restore',
    'max-potion',
    'hyper-potion',
    'super-potion',
    'potion',
    'x-accuracy',
    'full-heal',
    'guard-spec',
    'dire-hit',
    'x-attack',
    'x-defense',
    'x-speed',
    'x-sp-atk',
  ]
  for (const slug of ORDER_ITEMS) {
    const id = bag.find((i) => slugOf(i) === slug)
    if (id == null) continue
    let wants: boolean
    if (slug === 'full-heal') wants = status()
    else if (slug === 'full-restore') wants = healItem() || (ctxUse && status())
    else if (['max-potion', 'hyper-potion', 'super-potion', 'potion'].includes(slug))
      wants = healItem()
    else wants = xItem()
    if (wants) {
      trace.pre = { kind: 'item', label: `AI_TryItem: ${slug}`, itemId: id }
      return { kind: 'item', itemId: id }
    }
  }
  return null
}

export function gen2Ai(env: AiEnv): AiChoice {
  const ai = env.data.ai as Gen2Ai
  const st = env.st
  const enemy = activeMon(st, 'theirs')
  const player = activeMon(st, 'mine')
  const cls = ai.classes[st.trainer?.classId ?? ''] ?? Object.values(ai.classes)[0]
  const moves = enemy.spec.moves
  const g: G2 = {
    env,
    ai,
    st,
    enemy,
    player,
    rng: env.rng,
    scores: moves.map((id, i) =>
      enemy.volatile.disable?.moveId === id || enemy.pp[i] <= 0 ? 80 : 20,
    ),
    contrib: moves.map(() => []),
    slot: 0,
  }
  const trace: AiTrace = { moves: [], pre: null, lowConfidence: [], better: 'lower' }
  // A Pokemon locked into a move makes no choice (CheckEnemyLockedIn).
  const locked =
    enemy.volatile.rampage ||
    enemy.volatile.charging != null ||
    enemy.volatile.rollout ||
    enemy.volatile.bide ||
    enemy.volatile.recharging
  let pre: Action | null = null
  if (!locked) {
    pre = switchDecision(g, cls?.itemSwitch ?? [], trace)
    if (!pre && cls) pre = tryItem(g, cls, trace)
  }
  const layers = cls?.layers ?? ['basic']
  for (const name of ORDER) if (layers.includes(name)) LAYERS[name](g)
  trace.moves = moves.map((id, i) => ({
    slot: i,
    moveId: id,
    score: g.scores[i],
    contributions: g.contrib[i],
  }))
  if (pre) return { action: pre, trace }
  const slot = pickBest(g.scores, 'lower', env.rng)
  return { action: { kind: 'move', slot }, trace }
}

/** P4, Gen 2: FindMonInOTPartyToSwitchIntoBattle + ScoreMonTypeMatchups. */
export function gen2SendOut(env: AiEnv): number {
  const st = env.st
  const sd = st.sides.theirs
  const player = activeMon(st, 'mine')
  const pt = typesOf(player)
  const enemyGood: boolean[] = []
  const playerGood: boolean[] = []
  sd.mons.forEach((m, b) => {
    if (b === sd.active || m.fainted) {
      enemyGood[b] = false
      playerGood[b] = true
      return
    }
    const se = m.spec.moves.some((id) => {
      const gm = gameMove(env.data, id)
      return gm && gm.p > 0 && typeMatchup(gm.t, pt, false) > EFFECTIVE
    })
    enemyGood[b] = se
    playerGood[b] = false
    const mt = typesOf(m)
    const playerSe =
      typeMatchup(pt[0], mt, false) > EFFECTIVE ||
      typeMatchup(pt[pt.length - 1], mt, false) > EFFECTIVE
    if (playerSe) {
      if (enemyGood[b]) enemyGood[b] = false
      else playerGood[b] = true
    }
  })
  if (playerGood.every((x) => x)) {
    const alive = sd.mons
      .map((m, i) => (m.fainted || i === sd.active ? -1 : i))
      .filter((i) => i >= 0)
    return alive[env.rng.int(alive.length)] ?? sd.mons.findIndex((m) => !m.fainted)
  }
  const firstEnemy = enemyGood.findIndex((x) => x)
  if (firstEnemy >= 0) return firstEnemy
  return playerGood.findIndex((x) => !x)
}

export { heldEffect }
