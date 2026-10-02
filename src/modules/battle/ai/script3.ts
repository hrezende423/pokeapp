/**
 * Generation 3 trainer AI -- an interpreter for the game's own AI script
 * (data/battle_ai_scripts.s of pokeruby / pokeemerald / pokefirered, assembled by
 * scripts/build-battle-data.mjs) with every command implemented as
 * src/battle_ai_script_commands.c implements it, and the pre-move switch / item
 * routines and the replacement choice from src/battle_ai_switch_items.c.
 *
 * Opcodes are the game's numbers; the semantics are Emerald's command table,
 * which Ruby/Sapphire and FireRed/LeafGreen share opcode for opcode. Where the
 * three differ in a way that changes a decision, the difference is reproduced:
 * Ruby and FireRed test "greater" before "equal" when collecting the best moves,
 * so the move that raises the best score is entered twice and is drawn twice as
 * often in a tie -- Emerald fixed the order.
 *
 * KEPT BUGS: Cmd_score wraps a signed byte and floors at 0; get_weather leaves the
 * previous result when there is no weather; if_cant_faint has no minimum 1;
 * if_has_move_with_effect for the TARGET tests the AI's own move slots;
 * if_status_not_in_party never early-returns; GetMostSuitableMonToSwitchInto
 * prefers the typing that takes the MOST damage and keeps its best damage in a
 * byte.
 */

import {
  getAbility,
  getItem,
  getMove,
  getType,
  resolveAbilitiesForGeneration,
  resolveTypesForGeneration,
} from '../../../data'
import type { Gen3Ai, Gen3Arg } from '../battleData'
import { gameMove, heldEffect } from '../battleData'
import { varietyOfSpec } from '../battler'
import { engineDamage, typeMult, type Action } from '../engine/turn'
import {
  activeMon,
  aliveCount,
  abilitySlugOf,
  battlerOrder,
  monAt,
  onField,
  samePos,
  slotIndex,
  type Pos,
  type Slot,
  type BattleState,
  type MonState,
  type Side,
} from '../engine/state'
import { effectiveSpeed } from '../speed'
import { quickClawChance } from '../chance'
import type { AiChoice, AiEnv, AiTrace, Contribution } from './types'
import { aiDamageAt, aiView, partners } from './view'

/** Emerald's AI_SCRIPT_* bit order -- the names the trainer bundle decoded every game's flags with. */
export const EMERALD_FLAGS = [
  'check_bad_move',
  'try_to_faint',
  'check_viability',
  'setup_first_turn',
  'risky',
  'prefer_power_extremes',
  'prefer_baton_pass',
  'double_battle',
  'hp_aware',
  'try_sunny_day_start',
]

// Battler arguments: AI_TARGET is 0, AI_USER 1 (include/constants/battle_ai.h).
const AI_USER = 1

// pokeemerald include/constants/battle.h bit layouts.
const S1 = { SLEEP: 0x7, POISON: 0x8, BURN: 0x10, FREEZE: 0x20, PARALYSIS: 0x40, TOXIC: 0x80 }

type Val = number | string

function unwrap(a: Gen3Arg): Val {
  if (a == null) return 0
  if (typeof a === 'number') return a
  if ('m' in a) return a.m
  if ('e' in a) return a.e
  if ('t' in a) return a.t
  if ('a' in a) return a.a
  if ('i' in a) return a.i
  if ('h' in a) return a.h
  return 0
}

interface VM {
  env: AiEnv
  prog: Gen3Ai
  st: BattleState
  user: MonState
  target: MonState
  /** Doubles: AI_USER_PARTNER / AI_TARGET_PARTNER (null in singles), and if_target_is_ally. */
  userPartner: MonState | null
  targetPartner: MonState | null
  targetIsAlly: boolean
  scores: number[]
  contrib: Contribution[][]
  slot: number
  moveConsidered: number
  funcResult: Val
  simulatedRNG: number[]
  stack: number[]
  pc: number
  done: boolean
  flee: boolean
  label: string
}

const s8 = (n: number) => ((n + 128) & 0xff) - 128

function types(m: MonState): string[] {
  return resolveTypesForGeneration(varietyOfSpec(m.spec), 3).map(
    (t) => getType(t.type_id)?.name ?? '',
  )
}

function status1(m: MonState): number {
  let s = 0
  if (m.status === 'slp') s |= Math.min(7, Math.max(1, m.sleep))
  if (m.status === 'psn') s |= S1.POISON
  if (m.status === 'brn') s |= S1.BURN
  if (m.status === 'frz') s |= S1.FREEZE
  if (m.status === 'par') s |= S1.PARALYSIS
  if (m.status === 'tox') s |= S1.TOXIC | (Math.min(15, m.toxic) << 8)
  return s
}

function status2(m: MonState): number {
  const v = m.volatile
  let s = 0
  s |= Math.min(7, v.confusion)
  if (v.flinch) s |= 1 << 3
  if (v.bide) s |= 1 << 8
  if (v.rampage) s |= 1 << 10
  if (v.charging != null || v.rampage) s |= 1 << 12
  if (v.trapped) s |= 1 << 13
  if (v.attract) s |= 1 << 16
  if (v.focusEnergy) s |= 1 << 20
  if (v.transformed) s |= 1 << 21
  if (v.recharging) s |= 1 << 22
  if (v.rage) s |= 1 << 23
  if (v.substituteHp > 0) s |= 1 << 24
  if (v.destinyBond) s |= 1 << 25
  if (v.meanLook) s |= 1 << 26
  if (v.nightmare) s |= 1 << 27
  if (v.cursed) s |= 1 << 28
  if (v.defenseCurl) s |= 1 << 30
  return s >>> 0
}

function status3(m: MonState): number {
  const v = m.volatile
  let s = 0
  if (v.leechSeed) s |= 1 << 2
  if (v.lockOn > 0) s |= 1 << 3
  if (v.perishSong > 0) s |= 1 << 5
  if (v.semiInvulnerable === 'fly' || v.semiInvulnerable === 'bounce') s |= 1 << 6
  if (v.semiInvulnerable === 'dig') s |= 1 << 7
  if (v.minimized) s |= 1 << 8
  if (v.charge) s |= 1 << 9
  if (v.ingrain) s |= 1 << 10
  if (v.yawn > 0) s |= 1 << 11
  if (v.semiInvulnerable === 'dive') s |= 1 << 18
  return s
}

function sideStatus(st: BattleState, side: Side): number {
  const sd = st.sides[side]
  let s = 0
  if (sd.reflect > 0) s |= 1 << 0
  if (sd.lightScreen > 0) s |= 1 << 1
  if (sd.spikes > 0) s |= 1 << 4
  if (sd.safeguard > 0) s |= 1 << 5
  if (sd.futureSight) s |= 1 << 6
  if (sd.mist > 0) s |= 1 << 8
  return s
}

// BattleAI_GetWantedBattler: AI_TARGET 0, AI_USER 1, AI_TARGET_PARTNER 2, AI_USER_PARTNER 3.
// In a single battle no script reaches a partner (only AI_DoubleBattle names one).
const battler = (vm: VM, b: number): MonState =>
  b === AI_USER
    ? vm.user
    : b === 3
      ? (vm.userPartner ?? vm.target)
      : b === 2
        ? (vm.targetPartner ?? vm.target)
        : vm.target
const sideOf = (b: number): Side => (b === AI_USER || b === 3 ? 'theirs' : 'mine')

/** TypeCalc on a 40 seed: STAB x1.5, then each defending type -- and the four remaps. */
function aiEffectiveness(vm: VM, moveId: number): number {
  const gm = gameMove(vm.env.data, moveId)
  if (!gm) return 40
  let dmg = 40
  if (types(vm.user).includes(gm.t)) dmg = Math.floor((dmg * 15) / 10)
  const defTypes = types(vm.target)
  const typeIds = resolveTypesForGeneration(varietyOfSpec(vm.target.spec), 3).map((t) => t.type_id)
  for (let i = 0; i < typeIds.length; i++) {
    const mult = typeMult(gm.t, [typeIds[i]], 3)
    if (mult !== 1) dmg = Math.floor((dmg * mult * 10) / 10)
    void defTypes
  }
  if (dmg === 120) dmg = 80
  if (dmg === 240) dmg = 160
  if (dmg === 30) dmg = 20
  if (dmg === 15) dmg = 10
  return dmg
}

/** AI_CalcDmg + TypeCalc for a move, at the simulated roll: the engine's roll index (rng - 85). */
function aiDamage(vm: VM, moveId: number, rng: number): number {
  const at = aiDamageAt(vm.env, vm.st, 'theirs', moveId)
  const r = engineDamage(vm.env.ctx, vm.st, 'theirs', moveId, false, 1, false, at)
  if (!r || r.noDamageReason) return 0
  const d = r.damage
  if (typeof d === 'number') return d
  const rolls = Array.isArray(d[0]) ? (d as number[][])[0] : (d as number[])
  return rolls[Math.max(0, Math.min(rolls.length - 1, rng - 85))]
}

const IGNORED_POWER_EFFECTS = [
  'EFFECT_EXPLOSION',
  'EFFECT_DREAM_EATER',
  'EFFECT_RAZOR_WIND',
  'EFFECT_SKY_ATTACK',
  'EFFECT_RECHARGE',
  'EFFECT_SKULL_BASH',
  'EFFECT_SOLAR_BEAM',
  'EFFECT_SPIT_UP',
  'EFFECT_FOCUS_PUNCH',
  'EFFECT_SUPERPOWER',
  'EFFECT_ERUPTION',
  'EFFECT_OVERHEAT',
]

function knownAbility(vm: VM, b: number): string {
  const m = battler(vm, b)
  // Cmd_get_ability: "The AI knows its own or partner's ability."
  if (b === AI_USER || b === 3) return abilitySlugOf(m)
  const real = abilitySlugOf(m)
  if (['shadow-tag', 'magnet-pull', 'arena-trap'].includes(real)) return real
  if (m.volatile.abilityRevealed) return real
  const slots = resolveAbilitiesForGeneration(varietyOfSpec(m.spec), 3).filter((a) => !a.is_hidden)
  if (slots.length >= 2) return (vm.env.rng.next() < 0.5 ? slots[0] : slots[1]).ability.name
  return slots[0]?.ability.name ?? ''
}

function whoStrikesFirst(vm: VM): number {
  const { ctx, data } = vm.env
  const sp = (m: MonState) =>
    effectiveSpeed(
      ctx,
      data,
      { ...m.spec, itemId: m.itemId, abilityId: m.abilityId },
      'high',
      {
        stage: m.boosts.spe,
        paralyzed: m.status === 'par',
        statused: m.status !== 'healthy',
        weather: vm.st.weather.kind,
        tailwind: false,
      },
      new Set(vm.st.badges),
    )
  let a = sp(vm.user)
  let b = sp(vm.target)
  // One roll per turn decides every Quick Claw.
  const qa = quickClawChance(ctx, data, vm.user.itemId)
  const qb = quickClawChance(ctx, data, vm.target.itemId)
  if (qa || qb) {
    const roll = vm.env.rng.next()
    if (qa && roll < qa) a = Number.MAX_SAFE_INTEGER
    if (qb && roll < qb) b = Number.MAX_SAFE_INTEGER
  }
  if (a === b) return vm.env.rng.next() < 0.5 ? 0 : 1
  return a > b ? 0 : 1
}

function holdEffectOf(vm: VM, m: MonState): string {
  return heldEffect(vm.env.data, m.itemId)?.h ?? 'HOLD_EFFECT_NONE'
}

function step(vm: VM) {
  const ins = vm.prog.code[vm.pc]
  const [op, ...raw] = ins as [number, ...Gen3Arg[]]
  const arg = (i: number) => unwrap(raw[i])
  const jump = (i: number) => {
    const t = raw[i]
    vm.pc = t && typeof t === 'object' && 'L' in t ? t.L : vm.pc + 1
  }
  const table = (i: number): Val[] => {
    const t = raw[i]
    const name = t && typeof t === 'object' && 'T' in t ? t.T : ''
    return (vm.prog.tables[name] ?? []).map((x) => unwrap(x))
  }
  const next = () => vm.pc++
  const cond = (ok: boolean, jumpArg: number) => (ok ? jump(jumpArg) : next())
  const { env, user, target } = vm
  const data = env.data
  const gm = (id: number) => gameMove(data, id)
  const hpPct = (m: MonState) => Math.floor((100 * m.hp) / m.maxHp)
  switch (op) {
    case 0x00:
      return cond(env.rng.byte() < (arg(0) as number), 1)
    case 0x01:
      return cond(env.rng.byte() > (arg(0) as number), 1)
    case 0x02:
      return cond(env.rng.byte() === (arg(0) as number), 1)
    case 0x03:
      return cond(env.rng.byte() !== (arg(0) as number), 1)
    case 0x04: {
      const d = s8(arg(0) as number)
      let s = s8(vm.scores[vm.slot] + d)
      if (s < 0) s = 0
      vm.contrib[vm.slot].push({ label: vm.label, delta: d })
      vm.scores[vm.slot] = s
      return next()
    }
    case 0x05:
      return cond(hpPct(battler(vm, arg(0) as number)) < (arg(1) as number), 2)
    case 0x06:
      return cond(hpPct(battler(vm, arg(0) as number)) > (arg(1) as number), 2)
    case 0x07:
      return cond(hpPct(battler(vm, arg(0) as number)) === (arg(1) as number), 2)
    case 0x08:
      return cond(hpPct(battler(vm, arg(0) as number)) !== (arg(1) as number), 2)
    case 0x09:
      return cond((status1(battler(vm, arg(0) as number)) & (arg(1) as number)) !== 0, 2)
    case 0x0a:
      return cond((status1(battler(vm, arg(0) as number)) & (arg(1) as number)) === 0, 2)
    case 0x0b:
      return cond((status2(battler(vm, arg(0) as number)) & (arg(1) as number)) !== 0, 2)
    case 0x0c:
      return cond((status2(battler(vm, arg(0) as number)) & (arg(1) as number)) === 0, 2)
    case 0x0d:
      return cond((status3(battler(vm, arg(0) as number)) & (arg(1) as number)) !== 0, 2)
    case 0x0e:
      return cond((status3(battler(vm, arg(0) as number)) & (arg(1) as number)) === 0, 2)
    case 0x0f:
      return cond((sideStatus(vm.st, sideOf(arg(0) as number)) & (arg(1) as number)) !== 0, 2)
    case 0x10:
      return cond((sideStatus(vm.st, sideOf(arg(0) as number)) & (arg(1) as number)) === 0, 2)
    case 0x11:
      return cond((vm.funcResult as number) < (arg(0) as number), 1)
    case 0x12:
      return cond((vm.funcResult as number) > (arg(0) as number), 1)
    case 0x13:
    case 0x26:
      return cond(vm.funcResult === arg(0), 1)
    case 0x14:
    case 0x27:
      return cond(vm.funcResult !== arg(0), 1)
    case 0x19:
      return cond(vm.moveConsidered === arg(0), 1)
    case 0x1a:
      return cond(vm.moveConsidered !== arg(0), 1)
    case 0x1b:
    case 0x1d:
      return cond(table(0).includes(vm.funcResult), 1)
    case 0x1c:
    case 0x1e:
      return cond(!table(0).includes(vm.funcResult), 1)
    case 0x1f:
      return cond(
        user.spec.moves.some((id) => (gm(id)?.p ?? 0) !== 0),
        0,
      )
    case 0x20:
      return cond(!user.spec.moves.some((id) => (gm(id)?.p ?? 0) !== 0), 0)
    case 0x21:
      vm.funcResult = vm.st.turn
      return next()
    case 0x22: {
      const which = arg(0) as number
      const ut = types(user)
      const tt = types(target)
      vm.funcResult =
        which === 1
          ? ut[0]
          : which === 0
            ? tt[0]
            : which === 3
              ? ut[ut.length - 1]
              : which === 2
                ? tt[tt.length - 1]
                : (gm(vm.moveConsidered)?.t ?? '')
      return next()
    }
    case 0x23:
      vm.funcResult = gm(vm.moveConsidered)?.p ?? 0
      return next()
    case 0x24: {
      const e = gm(vm.moveConsidered)?.e ?? ''
      if ((gm(vm.moveConsidered)?.p ?? 0) > 1 && !IGNORED_POWER_EFFECTS.includes(e)) {
        const dmgs = user.spec.moves.map((id, i) => {
          const g = gm(id)
          if (!id || !g || g.p <= 1 || IGNORED_POWER_EFFECTS.includes(g.e)) return 0
          return Math.max(1, aiDamage(vm, id, vm.simulatedRNG[i]))
        })
        vm.funcResult = dmgs.some((d) => d > dmgs[vm.slot]) ? 1 : 2
      } else vm.funcResult = 0
      return next()
    }
    case 0x25:
      vm.funcResult = battler(vm, arg(0) as number).volatile.lastMove
      return next()
    case 0x28:
      return cond(whoStrikesFirst(vm) === arg(0), 1)
    case 0x29:
      return cond(whoStrikesFirst(vm) !== arg(0), 1)
    case 0x2a:
    case 0x2b:
    case 0x32:
    case 0x33:
    case 0x52:
    case 0x53:
    case 0x54:
    case 0x55:
    case 0x56:
    case 0x57:
      return next()
    case 0x2c: {
      const sd = vm.st.sides[sideOf(arg(0) as number)]
      // Cmd_count_usable_party_mons: both battlers on the field are left out in doubles.
      vm.funcResult = sd.mons.filter((m, i) => !onField(sd, i) && !m.fainted).length
      return next()
    }
    case 0x2d:
      vm.funcResult = vm.moveConsidered
      return next()
    case 0x2e:
      vm.funcResult = gm(vm.moveConsidered)?.e ?? ''
      return next()
    case 0x2f:
      vm.funcResult = knownAbility(vm, arg(0) as number)
      return next()
    case 0x30: {
      vm.funcResult = Math.max(0, ...user.spec.moves.map((id) => aiEffectiveness(vm, id)))
      return next()
    }
    case 0x31:
      return cond(aiEffectiveness(vm, vm.moveConsidered) === arg(0), 1)
    case 0x34:
    case 0x35: {
      const sd = vm.st.sides[sideOf(arg(0) as number)]
      const want = arg(1) as number
      const found = sd.mons.some((m) => !m.fainted && status1(m) === want)
      return op === 0x34 ? cond(found, 2) : cond(!found, 2)
    }
    case 0x36: {
      const w = vm.st.weather.kind
      // BUG kept: no weather leaves the previous result.
      if (w === 'rain') vm.funcResult = 1
      if (w === 'sand') vm.funcResult = 2
      if (w === 'sun') vm.funcResult = 0
      if (w === 'hail') vm.funcResult = 3
      return next()
    }
    case 0x37:
      return cond((gm(vm.moveConsidered)?.e ?? '') === arg(0), 1)
    case 0x38:
      return cond((gm(vm.moveConsidered)?.e ?? '') !== arg(0), 1)
    case 0x39:
    case 0x3a:
    case 0x3b:
    case 0x3c: {
      const m = battler(vm, arg(0) as number)
      const keys = ['hp', 'atk', 'def', 'spe', 'spa', 'spd', 'acc', 'eva'] as const
      const k = keys[arg(1) as number]
      const stage = k === 'hp' ? 6 : m.boosts[k] + 6
      const v = arg(2) as number
      const ok =
        op === 0x39 ? stage < v : op === 0x3a ? stage > v : op === 0x3b ? stage === v : stage !== v
      return cond(ok, 3)
    }
    case 0x3d:
    case 0x3e: {
      if ((gm(vm.moveConsidered)?.p ?? 0) < 2) return next()
      let dmg = aiDamage(vm, vm.moveConsidered, vm.simulatedRNG[vm.slot])
      if (op === 0x3d && dmg === 0) dmg = 1
      return op === 0x3d ? cond(target.hp <= dmg, 0) : cond(target.hp > dmg, 0)
    }
    case 0x3f:
    case 0x40: {
      const who = arg(0) as number
      const move = arg(1) as number
      // Cmd_if_has_move reads the partner's own moves (none when it has fainted);
      // Cmd_if_doesnt_have_move reads the user's for both (UB kept).
      const partner = vm.userPartner
      const has =
        op === 0x3f && who === 3
          ? !!partner && !partner.fainted && partner.spec.moves.includes(move)
          : who === AI_USER || who === 3
            ? user.spec.moves.includes(move)
            : target.volatile.usedMoves.includes(move)
      return op === 0x3f ? cond(has, 2) : cond(!has, 2)
    }
    case 0x41:
    case 0x42: {
      const who = arg(0) as number
      const e = arg(1)
      let has: boolean
      if (who === AI_USER || who === 3) has = user.spec.moves.some((id) => id && gm(id)?.e === e)
      else if (op === 0x41)
        has = user.spec.moves.some((id, i) => id && gm(target.volatile.usedMoves[i] ?? 0)?.e === e) // BUG kept
      else has = target.volatile.usedMoves.some((id) => id && gm(id)?.e === e)
      return op === 0x41 ? cond(has, 2) : cond(!has, 2)
    }
    case 0x43: {
      const m = battler(vm, arg(0) as number)
      const which = arg(1) as number
      return cond(
        which === 0 ? m.volatile.disable != null : which === 1 ? m.volatile.encore != null : false,
        2,
      )
    }
    case 0x44: {
      const which = arg(0) as number
      return cond(
        which === 0
          ? user.volatile.disable?.moveId === vm.moveConsidered
          : which === 1
            ? user.volatile.encore?.moveId === vm.moveConsidered
            : false,
        1,
      )
    }
    case 0x45:
    case 0x47:
      vm.flee = true
      vm.done = true
      return
    case 0x46:
      return next()
    case 0x48: {
      const m = battler(vm, arg(0) as number)
      const revealed = m.volatile.itemRevealed
      vm.funcResult = m === user || revealed ? holdEffectOf(vm, m) : 'HOLD_EFFECT_NONE'
      return next()
    }
    case 0x49: {
      const g = battler(vm, arg(0) as number).spec.gender
      vm.funcResult = g === 'M' ? 0 : g === 'F' ? 0xfe : 0xff
      return next()
    }
    case 0x4a:
      vm.funcResult = battler(vm, arg(0) as number).volatile.firstTurn ? 1 : 0
      return next()
    case 0x4b:
      vm.funcResult = battler(vm, arg(0) as number).volatile.stockpile
      return next()
    case 0x4c:
      vm.funcResult = 0
      return next()
    case 0x4d:
      vm.funcResult = battler(vm, arg(0) as number).consumedItem ?? 0
      return next()
    case 0x4e:
      vm.funcResult = gm(vm.funcResult as number)?.t ?? ''
      return next()
    case 0x4f:
      vm.funcResult = gm(vm.funcResult as number)?.p ?? 0
      return next()
    case 0x50:
      vm.funcResult = gm(vm.funcResult as number)?.e ?? ''
      return next()
    case 0x51:
      vm.funcResult = battler(vm, arg(0) as number).volatile.protectChain
      return next()
    case 0x58: {
      vm.stack.push(vm.pc + 1)
      const t = raw[0]
      vm.pc = t && typeof t === 'object' && 'L' in t ? t.L : vm.pc + 1
      return
    }
    case 0x59:
      return jump(0)
    case 0x5a:
      if (vm.stack.length) vm.pc = vm.stack.pop()!
      else vm.done = true
      return
    case 0x5b: {
      const c = arg(0) as number
      const a = user.spec.level
      const b = target.spec.level
      return cond(c === 0 ? a > b : c === 1 ? a < b : a === b, 1)
    }
    case 0x5c:
      return cond(target.volatile.taunt > 0, 0)
    case 0x5d:
      return cond(target.volatile.taunt === 0, 0)
    case 0x5e:
      return cond(vm.targetIsAlly, 0)
    case 0x5f: {
      vm.funcResult = types(battler(vm, arg(0) as number)).includes(arg(1) as string) ? 1 : 0
      return next()
    }
    case 0x60: {
      const who = arg(0) as number
      const want = arg(1) as string
      const m = battler(vm, who)
      let ab: string
      if (who === AI_USER || who === 3) ab = abilitySlugOf(m)
      else {
        const real = abilitySlugOf(m)
        const slots = resolveAbilitiesForGeneration(varietyOfSpec(m.spec), 3)
          .filter((a) => !a.is_hidden)
          .map((a) => a.ability.name)
        if (['shadow-tag', 'magnet-pull', 'arena-trap'].includes(real)) ab = real
        else if (slots.length >= 2) ab = slots[0] !== want && slots[1] !== want ? slots[0] : ''
        else ab = slots[0] ?? ''
      }
      vm.funcResult = !ab ? 2 : ab === want ? 1 : 0
      return next()
    }
    case 0x61:
      return cond(battler(vm, arg(0) as number).volatile.flashFire, 1)
    case 0x62: {
      const m = battler(vm, arg(0) as number)
      const want = (arg(1) as number) | (arg(2) as number)
      return cond((m.itemId ?? 0) === want, 3)
    }
    default:
      return next()
  }
}

function runScript(vm: VM, entry: number, label: string, budget = 4000) {
  vm.pc = entry
  vm.done = false
  vm.stack = []
  vm.label = label
  let n = 0
  while (!vm.done && n++ < budget) {
    const before = vm.pc
    const ins = vm.prog.code[vm.pc]
    if (!ins) break
    // Label the contributions with the routine they come from (nearest entry label).
    // Shared tails (Score_Minus10, Score_Plus1...) keep the routine that jumped to them.
    const here = labelFor(vm.prog, before)
    if (here && !/^Score_/.test(here)) vm.label = here
    step(vm)
  }
}

const LABEL_CACHE = new WeakMap<Gen3Ai, [number, string][]>()
function labelFor(prog: Gen3Ai, pc: number): string | undefined {
  let list = LABEL_CACHE.get(prog)
  if (!list) {
    list = Object.entries(prog.labels ?? {})
      .map(([k, v]) => [v, k] as [number, string])
      .sort((a, b) => a[0] - b[0])
    LABEL_CACHE.set(prog, list)
  }
  let best: string | undefined
  for (const [at, name] of list) {
    if (at > pc) break
    best = name
  }
  return best
}

export function gen3MoveScores(env: AiEnv): {
  scores: number[]
  contrib: Contribution[][]
  flee: boolean
} {
  const prog = env.data.ai as Gen3Ai
  const st = env.st
  const user = activeMon(st, 'theirs')
  const target = activeMon(st, 'mine')
  const moves = user.spec.moves
  const vm: VM = {
    env,
    prog,
    st,
    user,
    target,
    ...partners(st),
    scores: moves.map((_, i) =>
      user.pp[i] > 0 && user.volatile.disable?.moveId !== moves[i] ? 100 : 0,
    ),
    contrib: moves.map(() => []),
    slot: 0,
    moveConsidered: 0,
    funcResult: 0,
    simulatedRNG: moves.map(() => 100 - env.rng.int(16)),
    stack: [],
    pc: 0,
    done: false,
    flee: false,
    label: '',
  }
  // Emerald ORs AI_SCRIPT_DOUBLE_BATTLE into every double battle's flags
  // (BattleAI_SetupAIData); Ruby and FireRed do not.
  const flags = [
    ...(st.trainer?.aiFlags ?? []),
    ...(st.doubles && prog.quirk !== 'ruby-tie-order' ? ['double_battle'] : []),
  ]
  const bits = [...new Set(flags)]
    .map((f) => EMERALD_FLAGS.indexOf(f))
    .filter((b) => b >= 0)
    .sort((a, b) => a - b)
  for (const bit of bits) {
    const entry = prog.entries[bit]
    if (!entry || entry.at == null) continue
    for (let i = 0; i < moves.length; i++) {
      vm.slot = i
      if (user.pp[i] === 0) {
        vm.scores[i] = 0
        continue
      }
      vm.moveConsidered = moves[i]
      runScript(vm, entry.at, entry.label)
      if (vm.flee) break
    }
  }
  return { scores: vm.scores, contrib: vm.contrib, flee: vm.flee }
}

// ------------------------------------------------- switching and items

function aiTypeFlags(
  env: AiEnv,
  moveId: number,
  def: MonState,
): { se: boolean; nve: boolean; immune: boolean } {
  const gm = gameMove(env.data, moveId)
  if (!gm || gm.p === 0) return { se: false, nve: false, immune: false }
  const ids = resolveTypesForGeneration(varietyOfSpec(def.spec), 3).map((t) => t.type_id)
  const m = typeMult(gm.t, ids, 3)
  const ab = abilitySlugOf(def)
  const immune =
    m === 0 || (ab === 'levitate' && gm.t === 'ground') || (ab === 'wonder-guard' && m <= 1)
  return { se: m > 1 && !immune, nve: m < 1 && m > 0, immune }
}

function hasSeAgainst(env: AiEnv, m: MonState, opp: MonState, noRng: boolean): boolean {
  for (const id of m.spec.moves) {
    if (!id) continue
    if (aiTypeFlags(env, id, opp).se) {
      if (noRng) return true
      if (env.rng.int(10) !== 0) return true
    }
  }
  return false
}

function lastLanded(st: BattleState): number {
  const me = activeMon(st, 'theirs')
  return me.volatile.lastDamageTaken?.moveId ?? 0
}

function shouldSwitch(env: AiEnv, trace: AiTrace): number | null {
  const st = env.st
  const me = activeMon(st, 'theirs')
  const opp = activeMon(st, 'mine')
  const sd = st.sides.theirs
  if (me.volatile.trapped || me.volatile.meanLook || me.volatile.ingrain) return null
  const oppAb = abilitySlugOf(opp)
  // ABILITY_ON_OPPOSING_FIELD: either foe in a double battle.
  const foeAbs = st.doubles ? foesOnField(st).map(abilitySlugOf) : [oppAb]
  if (foeAbs.includes('shadow-tag') || foeAbs.includes('arena-trap')) return null
  if (foeAbs.includes('magnet-pull') && types(me).includes('steel')) return null
  const others = sd.mons
    .map((m, i) => ({ m, i }))
    .filter((x) => !onField(sd, x.i) && !reserved(env).includes(x.i) && !x.m.fainted)
  if (!others.length) return null
  // Perish Song at 0: switch to the most suitable.
  if (me.volatile.perishSong === 1) {
    trace.pre = { kind: 'switch', label: 'ShouldSwitchIfPerishSong', to: -1 }
    return -1
  }
  // Wonder Guard.
  // ShouldSwitchIfWonderGuard returns FALSE in a double battle.
  if (!st.doubles && oppAb === 'wonder-guard' && !hasSeAgainst(env, me, opp, true)) {
    for (const { m, i } of others) {
      for (const id of m.spec.moves)
        if (id && aiTypeFlags(env, id, opp).se && env.rng.int(3) < 2) {
          trace.pre = { kind: 'switch', label: 'ShouldSwitchIfWonderGuard', to: i }
          return i
        }
    }
  }
  // Absorbing ability.
  const last = lastLanded(st)
  if (
    !(hasSeAgainstOpponents(env, me, true) && env.rng.int(3) !== 0) &&
    last &&
    (gameMove(env.data, last)?.p ?? 0) > 0
  ) {
    const t = gameMove(env.data, last)?.t
    const absorb =
      t === 'fire'
        ? 'flash-fire'
        : t === 'water'
          ? 'water-absorb'
          : t === 'electric'
            ? 'volt-absorb'
            : null
    if (absorb && abilitySlugOf(me) !== absorb) {
      for (const { m, i } of others) {
        if (abilitySlugOf(m) === absorb && env.rng.next() < 0.5) {
          trace.pre = { kind: 'switch', label: 'FindMonThatAbsorbsOpponentsMove', to: i }
          return i
        }
      }
    }
  }
  // Natural Cure.
  if (me.status === 'slp' && abilitySlugOf(me) === 'natural-cure' && me.hp >= me.maxHp / 2) {
    if (
      (!last && env.rng.next() < 0.5) ||
      (last && (gameMove(env.data, last)?.p ?? 0) === 0 && env.rng.next() < 0.5)
    ) {
      trace.pre = { kind: 'switch', label: 'ShouldSwitchIfNaturalCure', to: -1 }
      return -1
    }
    const f = findWithFlags(env, 'immune', 1) ?? findWithFlags(env, 'nve', 1)
    if (f != null) {
      trace.pre = { kind: 'switch', label: 'ShouldSwitchIfNaturalCure', to: f }
      return f
    }
    if (env.rng.next() < 0.5) {
      trace.pre = { kind: 'switch', label: 'ShouldSwitchIfNaturalCure', to: -1 }
      return -1
    }
  }
  if (hasSeAgainstOpponents(env, me, false)) return null
  const raised = Object.values(me.boosts).reduce((s, v) => s + Math.max(0, v), 0)
  if (raised > 3) return null
  const f = findWithFlags(env, 'immune', 2) ?? findWithFlags(env, 'nve', 3)
  if (f != null) {
    trace.pre = { kind: 'switch', label: 'FindMonWithFlagsAndSuperEffective', to: f }
    return f
  }
  return null
}

function findWithFlags(env: AiEnv, flag: 'immune' | 'nve', modulo: number): number | null {
  const st = env.st
  const last = lastLanded(st)
  if (!last || (gameMove(env.data, last)?.p ?? 0) === 0) return null
  const sd = st.sides.theirs
  const opp = activeMon(st, 'mine')
  for (let i = 0; i < sd.mons.length; i++) {
    const m = sd.mons[i]
    if (m.fainted || onField(sd, i) || reserved(env).includes(i)) continue
    const fl = aiTypeFlags(env, last, m)
    if (!(flag === 'immune' ? fl.immune : fl.nve)) continue
    for (const id of m.spec.moves) {
      if (id && aiTypeFlags(env, id, opp).se && env.rng.int(modulo) === 0) return i
    }
  }
  return null
}

const HEAL_AMOUNT: Record<string, number> = {
  potion: 20,
  'super-potion': 50,
  'hyper-potion': 200,
  'max-potion': 255,
  'fresh-water': 50,
  'soda-pop': 60,
  lemonade: 80,
  'moomoo-milk': 100,
}

function shouldUseItem(env: AiEnv, trace: AiTrace): Action | null {
  const st = env.st
  const me = activeMon(st, 'theirs')
  const bag = st.sides.theirs.bag
  const valid = aliveCount(st.sides.theirs)
  const itemsNo = bag.length
  for (let i = 0; i < bag.length; i++) {
    if (i !== 0 && valid > itemsNo - i + 1) continue
    const id = bag[i]
    const slug = getItem(id)?.name ?? ''
    let wants: boolean
    if (slug === 'full-restore') wants = me.hp < me.maxHp / 4 && me.hp > 0
    else if (slug in HEAL_AMOUNT)
      wants = me.hp > 0 && (me.hp < me.maxHp / 4 || me.maxHp - me.hp > HEAL_AMOUNT[slug])
    else if (
      ['full-heal', 'antidote', 'burn-heal', 'ice-heal', 'awakening', 'paralyze-heal'].includes(
        slug,
      )
    ) {
      const cures: Record<string, string[]> = {
        'full-heal': ['slp', 'psn', 'tox', 'brn', 'frz', 'par'],
        antidote: ['psn', 'tox'],
        'burn-heal': ['brn'],
        'ice-heal': ['frz'],
        awakening: ['slp'],
        'paralyze-heal': ['par'],
      }
      wants = cures[slug].includes(me.status) || (slug === 'full-heal' && me.volatile.confusion > 0)
    } else if (slug.startsWith('x-') || slug === 'dire-hit') wants = me.volatile.firstTurn
    else if (slug === 'guard-spec') wants = me.volatile.firstTurn && st.sides.theirs.mist === 0
    else return null
    if (wants) {
      trace.pre = { kind: 'item', label: `ShouldUseItem: ${slug}`, itemId: id }
      return { kind: 'item', itemId: id }
    }
  }
  return null
}

/** GetMostSuitableMonToSwitchInto (also the replacement after a faint). */
export function gen3SendOut(env: AiEnv): number {
  const st = env.st
  const sd = st.sides.theirs
  // Doubles: the foe is picked at random (Random() & BIT_FLANK), the other one when absent.
  let opp = activeMon(st, 'mine')
  if (st.doubles) {
    const ms = st.sides.mine
    const flank = [ms.active, ms.active2]
    let pick = env.rng.int(2)
    if (flank[pick] == null || ms.mons[flank[pick]!].fainted) pick ^= 1
    opp = ms.mons[flank[pick] ?? ms.active]
  }
  const oppTypes = types(opp)
  const invalid = new Set<number>()
  sd.mons.forEach(
    (m, i) => (m.fainted || onField(sd, i) || reserved(env).includes(i)) && invalid.add(i),
  )
  while (invalid.size < sd.mons.length) {
    let bestDmg = 0
    let best = -1
    for (let i = 0; i < sd.mons.length; i++) {
      if (invalid.has(i)) continue
      const m = sd.mons[i]
      const ids = resolveTypesForGeneration(varietyOfSpec(m.spec), 3).map((t) => t.type_id)
      let typeDmg = 10
      for (const t of new Set(oppTypes)) typeDmg = Math.floor(typeDmg * typeMult(t, ids, 3))
      // "Possible bug": the typing that takes the MOST damage wins.
      if (bestDmg < typeDmg) {
        bestDmg = typeDmg
        best = i
      }
    }
    if (best < 0) break
    const m = sd.mons[best]
    if (m.spec.moves.some((id) => id && aiTypeFlags(env, id, opp).se)) return best
    invalid.add(best)
  }
  // Fallback: the most damage -- the game calculates a stale move with the
  // active Pokemon's stats and keeps the best in a byte; ranked here by each
  // candidate move's STAB and effectiveness against the target (low confidence).
  let bestDmg = 0
  let best = -1
  const active = sd.mons[sd.active]
  sd.mons.forEach((m, i) => {
    if (m.fainted || onField(sd, i) || reserved(env).includes(i)) return
    for (const id of m.spec.moves) {
      const gm = gameMove(env.data, id)
      if (!gm || gm.p === 1) continue
      const ids = resolveTypesForGeneration(varietyOfSpec(opp.spec), 3).map((t) => t.type_id)
      const d =
        Math.floor(100 * (types(active).includes(gm.t) ? 1.5 : 1) * typeMult(gm.t, ids, 3)) & 0xff
      if (bestDmg < d) {
        bestDmg = d
        best = i
      }
    }
  })
  return best >= 0
    ? best
    : sd.mons.findIndex((m, i) => !m.fainted && !onField(sd, i) && !reserved(env).includes(i))
}

/** Party slots the partner already chose to send in this turn (monToSwitchIntoId). */
const reserved = (env: AiEnv): number[] => env.reserved ?? []

/** The player's battlers standing on the field (the view's target side). */
function foesOnField(st: BattleState): MonState[] {
  const sd = st.sides.mine
  return [sd.active, sd.active2]
    .filter((i): i is number => i != null && !sd.mons[i].fainted)
    .map((i) => sd.mons[i])
}

/**
 * HasSuperEffectiveMoveAgainstOpponents: the battler opposite, then -- in a
 * double battle -- the opposite's partner, each only when present.
 */
function hasSeAgainstOpponents(env: AiEnv, me: MonState, noRng: boolean): boolean {
  const st = env.st
  if (!st.doubles) return hasSeAgainst(env, me, activeMon(st, 'mine'), noRng)
  for (const opp of foesOnField(st)) if (hasSeAgainst(env, me, opp, noRng)) return true
  return false
}

export function gen3Ai(env: AiEnv): AiChoice {
  const prog = env.data.ai as Gen3Ai
  const trace: AiTrace = { moves: [], pre: null, lowConfidence: [], better: 'higher' }
  const me = activeMon(env.st, 'theirs')
  let pre: Action | null = null
  const sw = shouldSwitch(env, trace)
  if (sw != null) {
    const to = sw >= 0 ? sw : gen3SendOut(env)
    if (to >= 0) {
      pre = { kind: 'switch', to }
      if (trace.pre) trace.pre.to = to
    }
  } else pre = shouldUseItem(env, trace)
  const { scores, contrib } = gen3MoveScores(env)
  trace.moves = me.spec.moves.map((id, i) => ({
    slot: i,
    moveId: id,
    score: scores[i],
    contributions: contrib[i],
  }))
  if (pre) return { action: pre, trace }
  // Choose: Emerald collects ties "equal, then greater"; Ruby/FireRed "greater, then equal".
  const quirk = prog.quirk
  const best: number[] = [0]
  let top = scores[0]
  for (let i = 1; i < scores.length; i++) {
    if (!me.spec.moves[i]) continue
    if (quirk === 'ruby-tie-order') {
      if (top < scores[i]) {
        best.length = 0
        best.push(i)
        top = scores[i]
      }
      if (top === scores[i]) best.push(i)
    } else {
      if (top === scores[i]) best.push(i)
      if (top < scores[i]) {
        best.length = 0
        best.push(i)
        top = scores[i]
      }
    }
  }
  const slot = best[env.rng.int(best.length)]
  void getMove
  void getAbility
  return { action: { kind: 'move', slot }, trace }
}

// ------------------------------------------------------------------ doubles

/**
 * One AI battler's choice in a DOUBLE battle (S6).
 *
 * First AI_TrySwitchOrUseItem, judged against the battler opposite (its doubles
 * branches are in shouldSwitch / gen3SendOut). Then the move and its target:
 *   Emerald ChooseMoveOrAction_Doubles: the scripts run once per other battler as
 *     the target (fresh scores and simulated rolls each time), the best move per
 *     target keeps its score, the ALLY only when that score is 100 or more, and the
 *     best-scoring target wins (ties at random).
 *   Ruby / Sapphire / FireRed / LeafGreen have no doubles routine: the target is a
 *     random foe (Random() & BIT_FLANK, the other when absent) and the single-battle
 *     choice runs against it.
 */
export function gen3AiDoubles(env: AiEnv, slot: Slot): AiChoice {
  const st = env.st
  const prog = env.data.ai as Gen3Ai
  const trace: AiTrace = { moves: [], pre: null, lowConfidence: [], better: 'higher' }
  const pre = aiView(st, slot, { side: 'mine', slot })
  const preEnv = { ...env, st: pre }
  const sw = shouldSwitch(preEnv, trace)
  if (sw != null) {
    const to = sw >= 0 ? sw : gen3SendOut(preEnv)
    if (to >= 0) {
      if (trace.pre) trace.pre.to = to
      return { action: { kind: 'switch', to }, trace }
    }
  } else {
    const item = shouldUseItem(preEnv, trace)
    if (item) return { action: item, trace }
  }
  const me = monAt(st, { side: 'theirs', slot })!
  const u8 = (n: number) => n & 0xff
  const emerald = prog.quirk === 'emerald-tie-order'
  const pickMove = (scores: number[]) => {
    const best: number[] = [0]
    let top = u8(scores[0])
    for (let j = 1; j < scores.length; j++) {
      if (!me.spec.moves[j]) continue
      if (emerald) {
        if (top === scores[j]) best.push(j)
        if (top < scores[j]) {
          best.length = 0
          best.push(j)
          top = u8(scores[j])
        }
      } else {
        if (top < scores[j]) {
          best.length = 0
          best.push(j)
          top = u8(scores[j])
        }
        if (top === scores[j]) best.push(j)
      }
    }
    return { slot: best[env.rng.int(best.length)], points: top }
  }
  const record = (scores: number[], contrib: Contribution[][]) => {
    trace.moves = me.spec.moves.map((id, i) => ({
      slot: i,
      moveId: id,
      score: scores[i],
      contributions: contrib[i],
    }))
  }
  if (!emerald) {
    const ms = st.sides.mine
    let flank: Slot = env.rng.int(2) === 0 ? 0 : 1
    const absent = (s: Slot) => {
      const i = slotIndex(ms, s)
      return i == null || ms.mons[i].fainted
    }
    if (absent(flank)) flank = flank === 0 ? 1 : 0
    const target: Pos = { side: 'mine', slot: flank }
    const { scores, contrib } = gen3MoveScores({ ...env, st: aiView(st, slot, target) })
    record(scores, contrib)
    const pick = pickMove(scores)
    trace.targets = [{ target, points: pick.points, slot: pick.slot }]
    return { action: { kind: 'move', slot: pick.slot, target }, trace }
  }
  const self: Pos = { side: 'theirs', slot }
  const options: {
    target: Pos
    points: number
    slot: number
    scores: number[]
    contrib: Contribution[][]
  }[] = []
  for (const p of battlerOrder(st)) {
    const m = monAt(st, p)
    if (samePos(p, self) || !m || m.fainted) {
      options.push({ target: p, points: -1, slot: -1, scores: [], contrib: [] })
      continue
    }
    const { scores, contrib } = gen3MoveScores({ ...env, st: aiView(st, slot, p) })
    const pick = pickMove(scores)
    // "Don't use a move against ally if it has less than 100 points."
    const points = p.side === 'theirs' && pick.points < 100 ? -1 : pick.points
    options.push({ target: p, points, slot: pick.slot, scores, contrib })
  }
  let top = options[0].points
  let tied: number[] = [0]
  for (let i = 1; i < options.length; i++) {
    if (top === options[i].points) tied.push(i)
    if (top < options[i].points) {
      top = options[i].points
      tied = [i]
    }
  }
  const chosen = options[tied[env.rng.int(tied.length)]]
  record(chosen.scores, chosen.contrib)
  trace.targets = options
    .filter((o) => o.slot >= 0)
    .map((o) => ({ target: o.target, points: o.points, slot: o.slot }))
  return { action: { kind: 'move', slot: Math.max(0, chosen.slot), target: chosen.target }, trace }
}
