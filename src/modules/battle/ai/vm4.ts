/**
 * Generation 4 trainer AI -- a virtual machine for the game's AI script BINARY
 * (tr_ai_seq.narc; Diamond/Pearl ship the identical file, compared byte for byte
 * by scripts/build-battle-data.mjs), each command implemented as pokeplatinum's
 * src/battle/trainer_ai/trainer_ai.c implements it, plus the routines around it:
 * TrainerAI_ShouldSwitch, TrainerAI_ShouldUseItem and BattleAI_PostKOSwitchIn
 * (src/battle/battle_lib.c).
 *
 * THE PROGRAM IS THE GAME'S BYTES, not the decompiled script.s: pokeplatinum ships
 * the AI as a prebuilt binary and its script.s carries instructions the game does
 * not have (three type-effectiveness checks in Expert_SpeedDownOnHit among them).
 * Constants compare in the game's own numbering -- move effects, abilities, types,
 * items and hold effects are mapped to their indexes in the game's generated
 * lists, so a script table that names a hold effect by number means exactly what
 * it means in the game.
 *
 * CONFIDENCE. Platinum's routines are decompiled C: high confidence. Diamond/
 * Pearl run the same script binary, but their switch/item C is not decompiled and
 * is assumed to be Platinum's. HeartGold/SoulSilver's script binary is not located
 * at all and this binary stands in for it. Both are flagged low confidence.
 *
 * KEPT BUGS: moveScore is a signed byte (wraps above 127, floors at 0);
 * TrainerAI_ShouldUseItem keeps looping after it decides, so every later eligible
 * item is consumed and the LAST one is the item used; the post-KO scores are bytes
 * (BUG: "Post-KO Switch-In AI Scoring Overflow").
 */

import {
  getItem,
  getMove,
  getType,
  resolveAbilitiesForGeneration,
  resolveTypesForGeneration,
} from '../../../data'
import type { Gen4Ai } from '../battleData'
import { gameMove, heldEffect } from '../battleData'
import { varietyOfSpec } from '../battler'
import { quickClawChance } from '../chance'
import { engineDamage, typeMult, type Action } from '../engine/turn'
import {
  abilitySlugOf,
  activeMon,
  aliveCount,
  type BattleState,
  type MonState,
} from '../engine/state'
import { effectiveSpeed } from '../speed'
import type { AiChoice, AiEnv, AiTrace, Contribution } from './types'

const s8 = (n: number) => ((n + 128) & 0xff) - 128

interface VM {
  env: AiEnv
  ai: Gen4Ai
  st: BattleState
  attacker: MonState
  defender: MonState
  scores: number[]
  contrib: Contribution[][]
  slot: number
  move: number
  calcTemp: number
  rolls: number[]
  cursor: number
  stack: number[]
  flags: { done: boolean; escape: boolean; brk: boolean }
  label: string
}

const NULL_PARTNER: MonState | null = null

function C(vm: VM, name: string): number {
  const v = vm.ai.constants[name]
  if (v == null) throw new Error(`gen4 constant ${name} missing`)
  return v
}

function battlerOf(vm: VM, inBattler: number): MonState | null {
  if (inBattler === 1) return vm.attacker
  if (inBattler === 3 || inBattler === 2) return NULL_PARTNER // no partner in singles
  return vm.defender
}

const typeIndex = (vm: VM, t: string) => vm.ai.numbering.types.indexOf(t)
const abilityIndex = (vm: VM, slug: string) => (slug ? vm.ai.numbering.abilities.indexOf(slug) : 0)
const itemIndex = (vm: VM, id: number | null) =>
  id ? Math.max(0, vm.ai.numbering.items.indexOf(id)) : 0
const effectIndex = (vm: VM, e: string) => vm.ai.numbering.moveEffects.indexOf(e)
const holdIndex = (vm: VM, h: string | undefined) =>
  h ? Math.max(0, vm.ai.numbering.holdEffects.indexOf(h)) : 0

function monTypes(m: MonState): string[] {
  const t = resolveTypesForGeneration(varietyOfSpec(m.spec), 4).map(
    (x) => getType(x.type_id)?.name ?? '',
  )
  return t.length === 1 ? [t[0], t[0]] : t
}

function monStatus(vm: VM, m: MonState | null): number {
  if (!m) return 0
  let s = 0
  if (m.status === 'slp') s |= Math.min(7, Math.max(1, m.sleep))
  if (m.status === 'psn') s |= C(vm, 'MON_CONDITION_POISON')
  if (m.status === 'brn') s |= C(vm, 'MON_CONDITION_BURN')
  if (m.status === 'frz') s |= C(vm, 'MON_CONDITION_FREEZE')
  if (m.status === 'par') s |= C(vm, 'MON_CONDITION_PARALYSIS')
  if (m.status === 'tox') s |= C(vm, 'MON_CONDITION_TOXIC') | (Math.min(15, m.toxic) << 8)
  return s
}

function volatileWord(vm: VM, m: MonState | null): number {
  if (!m) return 0
  const v = m.volatile
  let s = Math.min(7, v.confusion)
  const set = (name: string) => (s |= C(vm, name))
  if (v.flinch) set('VOLATILE_CONDITION_FLINCH')
  if (v.bide) set('VOLATILE_CONDITION_BIDE_0')
  if (v.rampage) set('VOLATILE_CONDITION_THRASH_0')
  if (v.charging != null || v.rampage || v.rollout) set('VOLATILE_CONDITION_MOVE_LOCKED')
  if (v.trapped) set('VOLATILE_CONDITION_BIND_0')
  if (v.attract) set('VOLATILE_CONDITION_ATTRACT_0')
  if (v.focusEnergy) set('VOLATILE_CONDITION_FOCUS_ENERGY')
  if (v.transformed) set('VOLATILE_CONDITION_TRANSFORM')
  if (v.recharging) set('VOLATILE_CONDITION_RECHARGING')
  if (v.rage) set('VOLATILE_CONDITION_RAGE')
  if (v.substituteHp > 0) set('VOLATILE_CONDITION_SUBSTITUTE')
  if (v.destinyBond) set('VOLATILE_CONDITION_DESTINY_BOND')
  if (v.meanLook) set('VOLATILE_CONDITION_MEAN_LOOK')
  if (v.nightmare) set('VOLATILE_CONDITION_NIGHTMARE')
  if (v.cursed) set('VOLATILE_CONDITION_CURSE')
  if (v.defenseCurl) set('VOLATILE_CONDITION_DEFENSE_CURL')
  return s >>> 0
}

function moveEffectsWord(vm: VM, m: MonState | null): number {
  if (!m) return 0
  const v = m.volatile
  let s = 0
  const set = (name: string) => (s |= C(vm, name))
  if (v.leechSeed) set('MOVE_EFFECT_LEECH_SEED')
  if (v.lockOn > 0) set('MOVE_EFFECT_LOCK_ON_0')
  if (v.perishSong > 0) set('MOVE_EFFECT_PERISH_SONG')
  if (v.semiInvulnerable === 'fly' || v.semiInvulnerable === 'bounce') set('MOVE_EFFECT_AIRBORNE')
  if (v.semiInvulnerable === 'dig') set('MOVE_EFFECT_UNDERGROUND')
  if (v.semiInvulnerable === 'dive') set('MOVE_EFFECT_UNDERWATER')
  if (v.semiInvulnerable === 'shadow-force') set('MOVE_EFFECT_SHADOW_FORCE')
  if (v.minimized) set('MOVE_EFFECT_MINIMIZE')
  if (v.charge) set('MOVE_EFFECT_CHARGE')
  if (v.ingrain) set('MOVE_EFFECT_INGRAIN')
  if (v.yawn > 0) set('MOVE_EFFECT_YAWN_0')
  if (v.aquaRing) set('MOVE_EFFECT_AQUA_RING')
  if (v.magnetRise > 0) set('MOVE_EFFECT_MAGNET_RISE')
  return s >>> 0
}

function sideWord(vm: VM, side: 'mine' | 'theirs'): number {
  const sd = vm.st.sides[side]
  let s = 0
  const set = (name: string) => (s |= C(vm, name))
  if (sd.reflect > 0) set('SIDE_CONDITION_REFLECT')
  if (sd.lightScreen > 0) set('SIDE_CONDITION_LIGHT_SCREEN')
  if (sd.spikes > 0) set('SIDE_CONDITION_SPIKES')
  if (sd.safeguard > 0) set('SIDE_CONDITION_SAFEGUARD')
  if (sd.futureSight) set('SIDE_CONDITION_FUTURE_SIGHT')
  if (sd.wish) set('SIDE_CONDITION_WISH')
  if (sd.mist > 0) set('SIDE_CONDITION_MIST')
  if (sd.stealthRock) set('SIDE_CONDITION_STEALTH_ROCK')
  if (sd.tailwind > 0) set('SIDE_CONDITION_TAILWIND_0')
  if (sd.toxicSpikes > 0) set('SIDE_CONDITION_TOXIC_SPIKES')
  if (sd.luckyChant > 0) set('SIDE_CONDITION_LUCKY_CHANT_0')
  return s >>> 0
}

function fieldWord(vm: VM): number {
  let s = 0
  const w = vm.st.weather
  const perm = w.turns < 0
  if (w.kind === 'rain')
    s |= C(vm, perm ? 'FIELD_CONDITION_RAINING_PERM' : 'FIELD_CONDITION_RAINING_TEMP')
  if (w.kind === 'sand')
    s |= C(vm, perm ? 'FIELD_CONDITION_SANDSTORM_PERM' : 'FIELD_CONDITION_SANDSTORM_TEMP')
  if (w.kind === 'sun')
    s |= C(vm, perm ? 'FIELD_CONDITION_SUNNY_PERM' : 'FIELD_CONDITION_SUNNY_TEMP')
  if (w.kind === 'hail')
    s |= C(vm, perm ? 'FIELD_CONDITION_HAILING_PERM' : 'FIELD_CONDITION_HAILING_TEMP')
  if (vm.st.gravity > 0) s |= C(vm, 'FIELD_CONDITION_GRAVITY_0')
  if (vm.st.trickRoom > 0) s |= C(vm, 'FIELD_CONDITION_TRICK_ROOM_0')
  return s >>> 0
}

const stageIndex: ('hp' | 'atk' | 'def' | 'spe' | 'spa' | 'spd' | 'acc' | 'eva')[] = [
  'hp',
  'atk',
  'def',
  'spe',
  'spa',
  'spd',
  'acc',
  'eva',
]
const stage = (m: MonState | null, stat: number) => {
  if (!m) return 6
  const k = stageIndex[stat]
  return k === 'hp' ? 6 : m.boosts[k] + 6
}

/** BattleSystem_ApplyTypeChart on a TYPE_MULTI seed: STAB, each type, the remaps and immunities. */
function typeChart(
  vm: VM,
  moveId: number,
  attacker: MonState,
  defender: MonState,
  seed = 40,
): { damage: number; se: boolean; nve: boolean; immune: boolean } {
  const gm = gameMove(vm.env.data, moveId)
  if (!gm) return { damage: seed, se: false, nve: false, immune: false }
  let dmg = seed
  const ab = abilitySlugOf(attacker)
  if (monTypes(attacker).includes(gm.t))
    dmg = ab === 'adaptability' ? dmg * 2 : Math.floor((dmg * 15) / 10)
  const ids = resolveTypesForGeneration(varietyOfSpec(defender.spec), 4).map((t) => t.type_id)
  let se = false
  let nve = false
  let immune = false
  for (const id of ids) {
    const m = typeMult(gm.t, [id], 4)
    if (m === 0) immune = true
    if (m === 2) se = true
    if (m === 0.5) nve = true
    dmg = Math.floor(dmg * m)
  }
  const dab = abilitySlugOf(defender)
  if (gm.t === 'ground' && (dab === 'levitate' || defender.volatile.magnetRise > 0)) immune = true
  if (dab === 'wonder-guard' && !se && gm.p > 0) immune = true
  if (se && nve) {
    se = false
    nve = false
  }
  if (dmg === 120) dmg = 80
  else if (dmg === 240) dmg = 160
  else if (dmg === 30) dmg = 20
  else if (dmg === 15) dmg = 10
  if (immune) dmg = 0
  return { damage: dmg, se, nve, immune }
}

const NO_CALC = new Set([
  'BATTLE_EFFECT_HALVE_DEFENSE',
  'BATTLE_EFFECT_RECOVER_DAMAGE_SLEEP',
  'BATTLE_EFFECT_CHARGE_TURN_HIGH_CRIT',
  'BATTLE_EFFECT_CHARGE_TURN_HIGH_CRIT_FLINCH',
  'BATTLE_EFFECT_RECHARGE_AFTER',
  'BATTLE_EFFECT_CHARGE_TURN_DEF_UP',
  'BATTLE_EFFECT_SKIP_CHARGE_TURN_IN_SUN',
  'BATTLE_EFFECT_SPIT_UP',
  'BATTLE_EFFECT_HIT_LAST_WHIFF_IF_HIT',
  'BATTLE_EFFECT_LOWER_OWN_ATK_AND_DEF',
  'BATTLE_EFFECT_DECREASE_POWER_WITH_LESS_USER_HP',
  'BATTLE_EFFECT_HIT_FIRST_IF_TARGET_ATTACKING',
  'BATTLE_EFFECT_RECOIL_HALF',
])
const ALT_POWER = new Set([
  'BATTLE_EFFECT_RANDOM_POWER_BASED_ON_IVS',
  'BATTLE_EFFECT_POWER_BASED_ON_LOW_SPEED',
  'BATTLE_EFFECT_NATURAL_GIFT',
  'BATTLE_EFFECT_JUDGEMENT',
  'BATTLE_EFFECT_40_DAMAGE_FLAT',
  'BATTLE_EFFECT_LEVEL_DAMAGE_FLAT',
  'BATTLE_EFFECT_RANDOM_DAMAGE_1_TO_150_LEVEL',
  'BATTLE_EFFECT_POWER_BASED_ON_FRIENDSHIP',
  'BATTLE_EFFECT_POWER_BASED_ON_LOW_FRIENDSHIP',
  'BATTLE_EFFECT_20_DAMAGE_FLAT',
  'BATTLE_EFFECT_INCREASE_POWER_WITH_WEIGHT',
])

function calcEligible(vm: VM, moveId: number): boolean {
  const gm = gameMove(vm.env.data, moveId)
  if (!moveId || !gm) return false
  return ALT_POWER.has(gm.e) || (gm.p > 1 && !NO_CALC.has(gm.e))
}

/** TrainerAI_CalcDamage: the unrandomised damage (the engine's top roll) x variance / 100. */
function calcDamage(
  vm: VM,
  moveId: number,
  variance: number,
  attackerSide: 'theirs' | 'mine' = 'theirs',
): number {
  const slug = getMove(moveId)?.name
  const attacker = attackerSide === 'theirs' ? vm.attacker : vm.defender
  const defender = attackerSide === 'theirs' ? vm.defender : vm.attacker
  let flat = 0
  if (slug === 'dragon-rage') flat = 40
  else if (slug === 'sonic-boom') flat = 20
  else if (slug === 'seismic-toss' || slug === 'night-shade') flat = attacker.spec.level
  else if (slug === 'psywave')
    flat = Math.floor((attacker.spec.level * (vm.env.rng.int(11) + 5)) / 10)
  if (flat) {
    const tc = typeChart(vm, moveId, attacker, defender)
    return tc.immune ? 0 : Math.floor((flat * variance) / 100)
  }
  const r = engineDamage(vm.env.ctx, vm.st, attackerSide, moveId, false, 1)
  if (!r || r.noDamageReason) return 0
  const d = r.damage
  const rolls =
    typeof d === 'number' ? [d] : Array.isArray(d[0]) ? (d as number[][])[0] : (d as number[])
  return Math.floor((rolls[rolls.length - 1] * variance) / 100)
}

function calcAllDamage(vm: VM, vary: boolean): number[] {
  return vm.attacker.spec.moves.map((id, i) =>
    calcEligible(vm, id) ? calcDamage(vm, id, vary ? vm.rolls[i] : 100) : 0,
  )
}

function knownAbility(vm: VM, m: MonState, inBattler: number): number {
  if (inBattler === 1) return abilityIndex(vm, abilitySlugOf(m))
  if (m.volatile.abilityRevealed) return abilityIndex(vm, abilitySlugOf(m))
  const real = abilitySlugOf(m)
  if (['shadow-tag', 'magnet-pull', 'arena-trap'].includes(real)) return abilityIndex(vm, real)
  const slots = resolveAbilitiesForGeneration(varietyOfSpec(m.spec), 4).filter((a) => !a.is_hidden)
  if (slots.length >= 2)
    return abilityIndex(vm, (vm.env.rng.next() < 0.5 ? slots[0] : slots[1]).ability.name)
  return abilityIndex(vm, slots[0]?.ability.name ?? '')
}

function compareSpeed(vm: VM): number {
  const { ctx, data } = vm.env
  const sp = (m: MonState, side: 'mine' | 'theirs') =>
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
        tailwind: vm.st.sides[side].tailwind > 0,
        unburden: m.volatile.unburden,
        slowStart: m.volatile.slowStartTurns > 0,
      },
      new Set(vm.st.badges),
    )
  const a = sp(vm.attacker, 'theirs')
  const b = sp(vm.defender, 'mine')
  const qa = quickClawChance(ctx, data, vm.attacker.itemId) > 0 && vm.env.rng.int(5) === 0
  const qb = quickClawChance(ctx, data, vm.defender.itemId) > 0 && vm.env.rng.int(5) === 0
  const FASTER = 0
  const SLOWER = 1
  const TIE = 2
  if (qa && !qb) return FASTER
  if (qb && !qa) return SLOWER
  const tr = vm.st.trickRoom > 0
  if (a === b) return vm.env.rng.next() < 0.5 ? TIE : FASTER
  return a > b !== tr ? FASTER : SLOWER
}

function step(vm: VM) {
  const w = vm.ai.words
  const op = w[vm.cursor]
  const name = vm.ai.opNames[op]
  vm.cursor += 1
  const read = () => w[vm.cursor++] | 0
  const iter = (n: number) => (vm.cursor += n)
  const { env, attacker, defender } = vm
  const gm = (id: number) => gameMove(env.data, id)
  const hpPct = (m: MonState | null) => (m ? Math.floor((m.hp * 100) / m.maxHp) : 0)
  const jumpIf = (ok: boolean, jump: number) => ok && iter(jump)
  switch (name) {
    case 'IFRANDOMLESSTHAN': {
      const v = read()
      const j = read()
      return jumpIf(env.rng.byte() < v, j)
    }
    case 'IFRANDOMGREATERTHAN': {
      const v = read()
      const j = read()
      return jumpIf(env.rng.byte() > v, j)
    }
    case 'IFRANDOMEQUALTO': {
      const v = read()
      const j = read()
      return jumpIf(env.rng.byte() === v, j)
    }
    case 'IFRANDOMNOTEQUALTO': {
      const v = read()
      const j = read()
      return jumpIf(env.rng.byte() !== v, j)
    }
    case 'ADDTOMOVESCORE': {
      const v = read()
      let s = s8(vm.scores[vm.slot] + v)
      if (s < 0) s = 0
      vm.scores[vm.slot] = s
      vm.contrib[vm.slot].push({ label: vm.label, delta: v })
      return
    }
    case 'IFHPPERCENTLESSTHAN':
    case 'IFHPPERCENTGREATERTHAN':
    case 'IFHPPERCENTEQUALTO':
    case 'IFHPPERCENTNOTEQUALTO': {
      const b = battlerOf(vm, read())
      const p = read()
      const j = read()
      const h = hpPct(b)
      const ok =
        name === 'IFHPPERCENTLESSTHAN'
          ? h < p
          : name === 'IFHPPERCENTGREATERTHAN'
            ? h > p
            : name === 'IFHPPERCENTEQUALTO'
              ? h === p
              : h !== p
      return jumpIf(ok, j)
    }
    case 'IFSTATUS':
    case 'IFNOTSTATUS': {
      const b = battlerOf(vm, read())
      const mask = read() >>> 0
      const j = read()
      const has = (monStatus(vm, b) & mask) !== 0
      return jumpIf(name === 'IFSTATUS' ? has : !has, j)
    }
    case 'IFVOLATILESTATUS':
    case 'IFNOTVOLATILESTATUS': {
      const b = battlerOf(vm, read())
      const mask = read() >>> 0
      const j = read()
      const has = (volatileWord(vm, b) & mask) !== 0
      return jumpIf(name === 'IFVOLATILESTATUS' ? has : !has, j)
    }
    case 'IFMOVEEFFECT':
    case 'IFNOTMOVEEFFECT': {
      const b = battlerOf(vm, read())
      const mask = read() >>> 0
      const j = read()
      const has = (moveEffectsWord(vm, b) & mask) !== 0
      return jumpIf(name === 'IFMOVEEFFECT' ? has : !has, j)
    }
    case 'IFSIDECONDITION':
    case 'IFNOTSIDECONDITION': {
      const inB = read()
      const mask = read() >>> 0
      const j = read()
      const side = inB === 1 || inB === 3 ? 'theirs' : 'mine'
      const has = (sideWord(vm, side) & mask) !== 0
      return jumpIf(name === 'IFSIDECONDITION' ? has : !has, j)
    }
    case 'IFLOADEDLESSTHAN': {
      const v = read()
      const j = read()
      return jumpIf(vm.calcTemp < v, j)
    }
    case 'IFLOADEDGREATERTHAN': {
      const v = read()
      const j = read()
      return jumpIf(vm.calcTemp > v, j)
    }
    case 'IFLOADEDEQUALTO':
    case 'IFTEMPEQUALTO': {
      const v = read()
      const j = read()
      return jumpIf(vm.calcTemp === v, j)
    }
    case 'IFLOADEDNOTEQUALTO':
    case 'IFTEMPNOTEQUALTO': {
      const v = read()
      const j = read()
      return jumpIf(vm.calcTemp !== v, j)
    }
    case 'IFLOADEDMASK': {
      const m = read()
      const j = read()
      return jumpIf((vm.calcTemp & m) !== 0, j)
    }
    case 'IFLOADEDNOTMASK': {
      const m = read()
      const j = read()
      return jumpIf((vm.calcTemp & m) === 0, j)
    }
    case 'IFMOVEEQUALTO': {
      const v = read()
      const j = read()
      return jumpIf(vm.move === v, j)
    }
    case 'IFMOVENOTEQUALTO': {
      const v = read()
      const j = read()
      return jumpIf(vm.move !== v, j)
    }
    case 'IFLOADEDINTABLE':
    case 'IFLOADEDNOTINTABLE': {
      let ofs = read()
      const j = read()
      let found = false
      while (w[vm.cursor + ofs] >>> 0 !== 0xffffffff) {
        if ((w[vm.cursor + ofs] | 0) === vm.calcTemp) {
          found = true
          break
        }
        ofs++
      }
      return jumpIf(name === 'IFLOADEDINTABLE' ? found : !found, j)
    }
    case 'IFATTACKERHASDAMAGINGMOVES':
    case 'IFATTACKERHASNODAMAGINGMOVES': {
      const j = read()
      const has = attacker.spec.moves.some((id) => id && (gm(id)?.p ?? 0) > 0)
      return jumpIf(name === 'IFATTACKERHASDAMAGINGMOVES' ? has : !has, j)
    }
    case 'LOADTURNCOUNT':
      vm.calcTemp = vm.st.turn
      return
    case 'LOADTYPEFROM': {
      const p = read()
      const at = monTypes(attacker)
      const dt = monTypes(defender)
      vm.calcTemp =
        p === 1
          ? typeIndex(vm, at[0])
          : p === 0
            ? typeIndex(vm, dt[0])
            : p === 3
              ? typeIndex(vm, at[1])
              : p === 2
                ? typeIndex(vm, dt[1])
                : p === 4
                  ? typeIndex(vm, gm(vm.move)?.t ?? 'normal')
                  : 0
      return
    }
    case 'FLAGBATTLERISTYPE': {
      const b = battlerOf(vm, read())
      const t = read()
      vm.calcTemp = b && monTypes(b).some((x) => typeIndex(vm, x) === t) ? 1 : 0
      return
    }
    case 'LOADMOVEPOWER':
      vm.calcTemp = gm(vm.move)?.p ?? 0
      return
    case 'FLAGMOVEDAMAGESCORE': {
      const vary = read() === 1
      if (calcEligible(vm, vm.move) || ALT_POWER.has(gm(vm.move)?.e ?? '')) {
        const dmg = calcAllDamage(vm, vary)
        vm.calcTemp = dmg.some((d) => d > dmg[vm.slot])
          ? C(vm, 'AI_NOT_HIGHEST_DAMAGE')
          : C(vm, 'AI_MOVE_IS_HIGHEST_DAMAGE')
      } else vm.calcTemp = C(vm, 'AI_NO_COMPARISON_MADE')
      return
    }
    case 'LOADBATTLERPREVIOUSMOVE': {
      const b = battlerOf(vm, read())
      vm.calcTemp = b?.volatile.lastMove ?? 0
      return
    }
    case 'IFSPEEDCOMPAREEQUALTO': {
      const v = read()
      const j = read()
      return jumpIf(compareSpeed(vm) === v, j)
    }
    case 'IFSPEEDCOMPARENOTEQUALTO': {
      const v = read()
      const j = read()
      return jumpIf(compareSpeed(vm) !== v, j)
    }
    case 'COUNTALIVEPARTYBATTLERS': {
      const inB = read()
      const sd = vm.st.sides[inB === 1 || inB === 3 ? 'theirs' : 'mine']
      vm.calcTemp = sd.mons.filter((m, i) => i !== sd.active && !m.fainted).length
      return
    }
    case 'LOADCURRENTMOVE':
      vm.calcTemp = vm.move
      return
    case 'LOADCURRENTMOVEEFFECT':
      vm.calcTemp = effectIndex(vm, gm(vm.move)?.e ?? '')
      return
    case 'LOADBATTLERABILITY': {
      const inB = read()
      const b = battlerOf(vm, inB)
      vm.calcTemp = b ? knownAbility(vm, b, inB) : 0
      return
    }
    case 'CHECKBATTLERABILITY': {
      const inB = read()
      const expected = read()
      const b = battlerOf(vm, inB)
      let tmp = 0
      if (b) {
        if (inB === 0 || inB === 2) {
          if (b.volatile.abilityRevealed) tmp = abilityIndex(vm, abilitySlugOf(b))
          else {
            const real = abilitySlugOf(b)
            if (['shadow-tag', 'magnet-pull', 'arena-trap'].includes(real))
              tmp = abilityIndex(vm, real)
            else {
              const slots = resolveAbilitiesForGeneration(varietyOfSpec(b.spec), 4)
                .filter((a) => !a.is_hidden)
                .map((a) => abilityIndex(vm, a.ability.name))
              if (slots.length >= 2)
                tmp = slots[0] !== expected && slots[1] !== expected ? slots[0] : 0
              else tmp = slots[0] ?? 0
            }
          }
        } else tmp = abilityIndex(vm, abilitySlugOf(b))
      }
      vm.calcTemp =
        tmp === 0 ? C(vm, 'AI_UNKNOWN') : tmp === expected ? C(vm, 'AI_HAVE') : C(vm, 'AI_NOT_HAVE')
      return
    }
    case 'CALCMAXEFFECTIVENESS': {
      vm.calcTemp = 0
      for (const id of attacker.spec.moves) {
        if (!id) continue
        const d = typeChart(vm, id, attacker, defender).damage
        if (vm.calcTemp < d) vm.calcTemp = d
      }
      return
    }
    case 'IFMOVEEFFECTIVENESSEQUALS': {
      const exp = read()
      const j = read()
      return jumpIf(typeChart(vm, vm.move, attacker, defender).damage === exp, j)
    }
    case 'IFPARTYMEMBERSTATUS':
    case 'IFPARTYMEMBERNOTSTATUS': {
      const inB = read()
      const mask = read() >>> 0
      const j = read()
      const sd = vm.st.sides[inB === 1 || inB === 3 ? 'theirs' : 'mine']
      const hit = sd.mons.some(
        (m, i) =>
          i !== sd.active &&
          !m.fainted &&
          (name === 'IFPARTYMEMBERSTATUS'
            ? (monStatus(vm, m) & mask) !== 0
            : (monStatus(vm, m) & mask) === 0),
      )
      return jumpIf(hit, j)
    }
    case 'LOADCURRENTWEATHER': {
      const k = vm.st.weather.kind
      vm.calcTemp =
        k === 'rain'
          ? C(vm, 'AI_WEATHER_RAINING')
          : k === 'sand'
            ? C(vm, 'AI_WEATHER_SANDSTORM')
            : k === 'sun'
              ? C(vm, 'AI_WEATHER_SUNNY')
              : k === 'hail'
                ? C(vm, 'AI_WEATHER_HAILING')
                : C(vm, 'AI_WEATHER_CLEAR')
      return
    }
    case 'IFCURRENTMOVEEFFECTEQUALTO': {
      const e = read()
      const j = read()
      return jumpIf(effectIndex(vm, gm(vm.move)?.e ?? '') === e, j)
    }
    case 'IFCURRENTMOVEEFFECTNOTEQUALTO': {
      const e = read()
      const j = read()
      return jumpIf(effectIndex(vm, gm(vm.move)?.e ?? '') !== e, j)
    }
    case 'IFSTATSTAGELESSTHAN':
    case 'IFSTATSTAGEGREATERTHAN':
    case 'IFSTATSTAGEEQUALTO':
    case 'IFSTATSTAGENOTEQUALTO': {
      const b = battlerOf(vm, read())
      const s = read()
      const v = read()
      const j = read()
      const g = stage(b, s)
      const ok =
        name === 'IFSTATSTAGELESSTHAN'
          ? g < v
          : name === 'IFSTATSTAGEGREATERTHAN'
            ? g > v
            : name === 'IFSTATSTAGEEQUALTO'
              ? g === v
              : g !== v
      return jumpIf(ok, j)
    }
    case 'IFCURRENTMOVEKILLS':
    case 'IFCURRENTMOVEDOESNOTKILL': {
      const useRoll = read() === 1
      const j = read()
      if (!calcEligible(vm, vm.move)) return
      const dmg = calcDamage(vm, vm.move, useRoll ? vm.rolls[vm.slot] : 100)
      return jumpIf(name === 'IFCURRENTMOVEKILLS' ? defender.hp <= dmg : defender.hp > dmg, j)
    }
    case 'IFMOVEKNOWN':
    case 'IFMOVENOTKNOWN': {
      const inB = read()
      const mv = read()
      const j = read()
      let known: boolean | null = null
      if (inB === 1) known = attacker.spec.moves.includes(mv)
      else if (inB === 0) known = defender.volatile.usedMoves.includes(mv)
      if (known == null) return
      return jumpIf(name === 'IFMOVEKNOWN' ? known : !known, j)
    }
    case 'IFMOVEEFFECTKNOWN':
    case 'IFMOVEEFFECTNOTKNOWN': {
      const inB = read()
      const e = read()
      const j = read()
      const list = inB === 1 ? attacker.spec.moves : inB === 0 ? defender.volatile.usedMoves : null
      if (!list) return
      const known = list.some((id) => id && effectIndex(vm, gm(id)?.e ?? '') === e)
      return jumpIf(name === 'IFMOVEEFFECTKNOWN' ? known : !known, j)
    }
    case 'IFBATTLERUNDEREFFECT': {
      const b = battlerOf(vm, read())
      const check = read()
      const j = read()
      return jumpIf(
        !!b &&
          (check === 0
            ? b.volatile.disable != null
            : check === 1
              ? b.volatile.encore != null
              : false),
        j,
      )
    }
    case 'IFCURRENTMOVEMATCHESEFFECT': {
      const check = read()
      const j = read()
      return jumpIf(
        check === 0
          ? attacker.volatile.disable?.moveId === vm.move
          : check === 1
            ? attacker.volatile.encore?.moveId === vm.move
            : false,
        j,
      )
    }
    case 'ESCAPE':
      vm.flags.done = vm.flags.escape = vm.flags.brk = true
      return
    case 'DUMMY3E':
    case 'DUMMY3F':
      // The game's handlers do not even advance the cursor; the script never reaches them in battle.
      vm.flags.done = true
      return
    case 'LOADHELDITEM': {
      const b = battlerOf(vm, read())
      vm.calcTemp = b ? itemIndex(vm, b.itemId) : 0
      return
    }
    case 'LOADHELDITEMEFFECT': {
      const b = battlerOf(vm, read())
      if (!b) vm.calcTemp = 0
      else if (b !== attacker)
        vm.calcTemp = b.volatile.itemRevealed ? holdIndex(vm, heldEffect(env.data, b.itemId)?.h) : 0
      else vm.calcTemp = holdIndex(vm, heldEffect(env.data, b.itemId)?.h)
      return
    }
    case 'IFHELDITEMEQUALTO': {
      const inB = read()
      const exp = read()
      const j = read()
      const b = battlerOf(vm, inB)
      const item = !b
        ? 0
        : inB === 1 || inB === 3
          ? itemIndex(vm, b.itemId)
          : b.volatile.itemRevealed
            ? itemIndex(vm, b.itemId)
            : 0
      return jumpIf(item === exp, j)
    }
    case 'IFFIELDCONDITIONSMASK': {
      const m = read() >>> 0
      const j = read()
      return jumpIf((fieldWord(vm) & m) !== 0, j)
    }
    case 'LOADSPIKESLAYERS': {
      const inB = read()
      const cond = read()
      const sd = vm.st.sides[inB === 1 || inB === 3 ? 'theirs' : 'mine']
      vm.calcTemp =
        cond === C(vm, 'SIDE_CONDITION_SPIKES')
          ? sd.spikes
          : cond === C(vm, 'SIDE_CONDITION_TOXIC_SPIKES')
            ? sd.toxicSpikes
            : vm.calcTemp
      return
    }
    case 'IFANYPARTYMEMBERISWOUNDED': {
      const inB = read()
      const j = read()
      const sd = vm.st.sides[inB === 1 || inB === 3 ? 'theirs' : 'mine']
      return jumpIf(
        sd.mons.some((m, i) => i !== sd.active && m.hp !== m.maxHp),
        j,
      )
    }
    case 'IFANYPARTYMEMBERUSEDPP': {
      const inB = read()
      const j = read()
      const sd = vm.st.sides[inB === 1 || inB === 3 ? 'theirs' : 'mine']
      return jumpIf(
        sd.mons.some(
          (m, i) =>
            i !== sd.active &&
            m.pp.some((pp, k) => pp !== (gameMove(env.data, m.spec.moves[k])?.pp ?? pp)),
        ),
        j,
      )
    }
    case 'LOADFLINGPOWER': {
      const b = battlerOf(vm, read())
      vm.calcTemp = b?.itemId
        ? (heldEffect(env.data, b.itemId)?.fp ?? getItem(b.itemId)?.fling_power ?? 0)
        : 0
      return
    }
    case 'LOADCURRENTMOVEPP':
      vm.calcTemp = attacker.pp[vm.slot] ?? 0
      return
    case 'IFCANUSELASTRESORT': {
      read()
      const j = read()
      void j
      return
    }
    case 'LOADCURRENTMOVECLASS':
      vm.calcTemp = classIndex(gm(vm.move)?.cl)
      return
    case 'LOADDEFENDERLASTUSEDMOVECLASS':
      vm.calcTemp = classIndex(gm(defender.volatile.lastMove)?.cl)
      return
    case 'LOADBATTLERSPEEDRANK': {
      const inB = read()
      const first = compareSpeed(vm) === 0
      vm.calcTemp = inB === 1 ? (first ? 0 : 1) : first ? 1 : 0
      return
    }
    case 'LOADBATTLERTURNCOUNT': {
      const b = battlerOf(vm, read())
      vm.calcTemp = b ? b.volatile.turnsOut : 0
      return
    }
    case 'IFPARTYMEMBERDEALSMOREDAMAGE': {
      const vary = read() === 1
      const j = read()
      const active = Math.max(0, ...calcAllDamage(vm, vary))
      const sd = vm.st.sides.theirs
      for (let i = 0; i < sd.mons.length; i++) {
        const m = sd.mons[i]
        if (i === sd.active || m.fainted) continue
        // The game computes the bench Pokemon's moves FROM THE ACTIVE BATTLER (its stats).
        const d = Math.max(
          0,
          ...m.spec.moves.map((id, k) =>
            calcEligible(vm, id) ? calcDamage(vm, id, vary ? vm.rolls[k] : 100) : 0,
          ),
        )
        if (d > active) return iter(j)
      }
      return
    }
    case 'IFHASSUPEREFFECTIVEMOVE': {
      const j = read()
      return jumpIf(
        attacker.spec.moves.some((id) => id && typeChart(vm, id, attacker, defender).se),
        j,
      )
    }
    case 'IFBATTLERDEALSMOREDAMAGE': {
      const inB = read()
      const vary = read() === 1
      const j = read()
      const ai = Math.max(0, ...calcAllDamage(vm, vary))
      const b = battlerOf(vm, inB)
      const prev = b?.volatile.lastMove ?? 0
      const theirs =
        b === defender && prev ? calcDamage(vm, prev, vary ? vm.rolls[vm.slot] : 100, 'mine') : 0
      return jumpIf(theirs > ai, j)
    }
    case 'SUMPOSITIVESTATSTAGES': {
      const b = battlerOf(vm, read())
      vm.calcTemp = 0
      for (let s = 0; s < 8; s++) if (stage(b, s) > 6) vm.calcTemp += stage(b, s) - 6
      return
    }
    case 'DIFFSTATSTAGES': {
      const b = battlerOf(vm, read())
      const s = read()
      vm.calcTemp = stage(b, s) - stage(attacker, s)
      return
    }
    case 'IFBATTLERHASHIGHERSTAT':
    case 'IFBATTLERHASLOWERSTAT':
    case 'IFBATTLERHASEQUALSTAT': {
      const b = battlerOf(vm, read())
      const s = read()
      const j = read()
      const val = (m: MonState | null) =>
        !m ? 0 : s === 0 ? m.hp : m.stats[(['hp', 'atk', 'def', 'spe', 'spa', 'spd'] as const)[s]]
      const a = val(attacker)
      const o = val(b)
      const ok =
        name === 'IFBATTLERHASHIGHERSTAT'
          ? a < o
          : name === 'IFBATTLERHASLOWERSTAT'
            ? a > o
            : a === o
      return jumpIf(ok, j)
    }
    case 'CHECKIFHIGHESTDAMAGEWITHPARTNER': {
      const vary = read() === 1
      if (calcEligible(vm, vm.move) || ALT_POWER.has(gm(vm.move)?.e ?? '')) {
        const dmg = calcAllDamage(vm, vary)
        vm.calcTemp = dmg.some((d) => d > dmg[vm.slot])
          ? C(vm, 'AI_NOT_HIGHEST_DAMAGE')
          : C(vm, 'AI_MOVE_IS_HIGHEST_DAMAGE')
      } else vm.calcTemp = C(vm, 'AI_NO_COMPARISON_MADE')
      return
    }
    case 'IFBATTLERFAINTED':
    case 'IFBATTLERNOTFAINTED': {
      read()
      const j = read()
      return jumpIf(name === 'IFBATTLERNOTFAINTED', j)
    }
    case 'LOADGENDER': {
      const b = battlerOf(vm, read())
      const g = b?.spec.gender
      vm.calcTemp =
        g === 'M' ? C(vm, 'GENDER_MALE') : g === 'F' ? C(vm, 'GENDER_FEMALE') : C(vm, 'GENDER_NONE')
      return
    }
    case 'LOADISFIRSTTURNINBATTLE': {
      const b = battlerOf(vm, read())
      vm.calcTemp = b && b.volatile.turnsOut === 0 ? 1 : 0
      return
    }
    case 'LOADSTOCKPILECOUNT': {
      const b = battlerOf(vm, read())
      vm.calcTemp = b?.volatile.stockpile ?? 0
      return
    }
    case 'LOADBATTLETYPE':
      vm.calcTemp = C(vm, 'BATTLE_TYPE_TRAINER')
      return
    case 'LOADRECYCLEITEM': {
      const b = battlerOf(vm, read())
      vm.calcTemp = b ? itemIndex(vm, b.consumedItem) : 0
      return
    }
    case 'LOADTYPEOFLOADEDMOVE':
      vm.calcTemp = typeIndex(vm, gm(vm.calcTemp)?.t ?? 'normal')
      return
    case 'LOADPOWEROFLOADEDMOVE':
      vm.calcTemp = gm(vm.calcTemp)?.p ?? 0
      return
    case 'LOADEFFECTOFLOADEDMOVE':
      vm.calcTemp = effectIndex(vm, gm(vm.calcTemp)?.e ?? '')
      return
    case 'LOADPROTECTCHAIN': {
      const b = battlerOf(vm, read())
      const last = b?.volatile.lastMove ? getMove(b.volatile.lastMove)?.name : ''
      vm.calcTemp =
        b && ['protect', 'detect', 'endure'].includes(last ?? '') ? b.volatile.protectChain : 0
      return
    }
    case 'PUSHANDGOTO': {
      const j = read()
      vm.stack.push(vm.cursor)
      return iter(j)
    }
    case 'GOTO': {
      const j = read()
      return iter(j)
    }
    case 'POPOREND':
      if (vm.stack.length) vm.cursor = vm.stack.pop()!
      else vm.flags.done = true
      return
    case 'IFLEVEL': {
      const opc = read()
      const j = read()
      const a = attacker.spec.level
      const b = defender.spec.level
      return jumpIf(opc === 0 ? a > b : opc === 1 ? a < b : opc === 2 ? a === b : false, j)
    }
    case 'IFTARGETISTAUNTED': {
      const j = read()
      return jumpIf(defender.volatile.taunt > 0, j)
    }
    case 'IFTARGETISNOTTAUNTED': {
      const j = read()
      return jumpIf(defender.volatile.taunt === 0, j)
    }
    case 'IFTARGETISPARTNER':
      read()
      return
    case 'IFACTIVATEDFLASHFIRE': {
      const b = battlerOf(vm, read())
      const j = read()
      return jumpIf(!!b?.volatile.flashFire, j)
    }
    case 'LOADABILITY': {
      const b = battlerOf(vm, read())
      vm.calcTemp = b ? abilityIndex(vm, abilitySlugOf(b)) : 0
      return
    }
    default: {
      // Unknown opcode: skip its declared arguments so the stream stays aligned.
      const lay = vm.ai.layout[op]
      if (!lay) {
        vm.flags.done = true
        return
      }
      iter(lay.args.length)
    }
  }
}

function classIndex(cl?: string) {
  return cl === 'physical' ? 0 : cl === 'special' ? 1 : 2
}

function labelAt(ai: Gen4Ai, cursor: number): string | undefined {
  let best: string | undefined
  let bestAt = -1
  for (const [k, v] of Object.entries(ai.labels)) {
    const at = Number(k)
    if (at <= cursor && at > bestAt) {
      bestAt = at
      best = v
    }
  }
  return best
}

const LABEL_INDEX = new WeakMap<Gen4Ai, [number, string][]>()
function routineAt(ai: Gen4Ai, cursor: number): string {
  let idx = LABEL_INDEX.get(ai)
  if (!idx) {
    idx = Object.entries(ai.labels)
      .map(([k, v]) => [Number(k), v] as [number, string])
      .sort((a, b) => a[0] - b[0])
    LABEL_INDEX.set(ai, idx)
  }
  let lo = 0
  let hi = idx.length - 1
  let best = ''
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (idx[m][0] <= cursor) {
      best = idx[m][1]
      lo = m + 1
    } else hi = m - 1
  }
  return best || (labelAt(ai, cursor) ?? '')
}

export function gen4MoveScores(env: AiEnv): {
  scores: number[]
  contrib: Contribution[][]
  escape: boolean
} {
  const ai = env.data.ai as Gen4Ai
  const st = env.st
  const attacker = activeMon(st, 'theirs')
  const defender = activeMon(st, 'mine')
  const moves = attacker.spec.moves
  const vm: VM = {
    env,
    ai,
    st,
    attacker,
    defender,
    scores: moves.map((id, i) =>
      attacker.pp[i] > 0 && attacker.volatile.disable?.moveId !== id ? 100 : 0,
    ),
    contrib: moves.map(() => []),
    slot: 0,
    move: 0,
    calcTemp: 0,
    rolls: moves.map(() => 100 - env.rng.int(16)),
    cursor: 0,
    stack: [],
    flags: { done: false, escape: false, brk: false },
    label: '',
  }
  const flags = st.trainer?.aiFlags ?? []
  const bits = flags
    .map((f) => ai.flagNames.indexOf(`AI_FLAG_${f.toUpperCase()}`))
    .filter((b) => b >= 0)
    .sort((a, b) => a - b)
  for (const bit of bits) {
    for (let i = 0; i < moves.length && !vm.flags.brk; i++) {
      vm.slot = i
      vm.move = attacker.pp[i] > 0 ? moves[i] : 0
      if (!vm.move) {
        vm.scores[i] = 0
        continue
      }
      vm.cursor = ai.entries[bit]
      vm.label = ai.flagNames[bit] ?? ''
      vm.stack = []
      vm.flags.done = false
      let n = 0
      while (!vm.flags.done && n++ < 6000) {
        const here = routineAt(ai, vm.cursor)
        // Shared tails (ScoreMinus10, ScorePlus1...) keep the routine that jumped to them.
        if (here && !/^Score(Minus|Plus)/.test(here)) vm.label = here
        step(vm)
      }
    }
  }
  return { scores: vm.scores, contrib: vm.contrib, escape: vm.flags.escape }
}

// ------------------------------------------------- switching and items

function effOf(env: AiEnv, moveId: number, def: MonState, att: MonState) {
  const vm = { env, ai: env.data.ai as Gen4Ai } as VM
  return typeChart(vm, moveId, att, def)
}

function hasSe(env: AiEnv, m: MonState, opp: MonState, noRng: boolean): boolean {
  for (const id of m.spec.moves) {
    if (!id) continue
    if (effOf(env, id, opp, m).se) {
      if (noRng || env.rng.int(10) !== 0) return true
    }
  }
  return false
}

/** TrainerAI_ShouldSwitch. Returns a party slot, -1 for "post-KO logic", or null. */
function shouldSwitch(env: AiEnv, trace: AiTrace): number | null {
  const st = env.st
  const me = activeMon(st, 'theirs')
  const opp = activeMon(st, 'mine')
  const sd = st.sides.theirs
  if (me.volatile.trapped || me.volatile.meanLook || me.volatile.ingrain) return null
  const oab = abilitySlugOf(opp)
  if (oab === 'shadow-tag' || oab === 'arena-trap') return null
  if (oab === 'magnet-pull' && monTypes(me).includes('steel')) return null
  const bench = sd.mons.map((m, i) => ({ m, i })).filter((x) => x.i !== sd.active && !x.m.fainted)
  if (!bench.length) return null
  const say = (label: string, to: number) => {
    trace.pre = { kind: 'switch', label, to }
    return to
  }
  // AI_PerishSongKO: never fires (the counter is read before it ticks) -- reproduced by its condition.
  if (
    me.volatile.perishSong === 0 &&
    (me.volatile as { perishSongActive?: boolean }).perishSongActive
  )
    return say('AI_PerishSongKO', -1)
  // Wonder Guard.
  if (oab === 'wonder-guard' && !me.spec.moves.some((id) => id && effOf(env, id, opp, me).se)) {
    for (const { m, i } of bench)
      for (const id of m.spec.moves)
        if (id && effOf(env, id, opp, m).se && env.rng.int(3) < 2)
          return say('AI_CannotDamageWonderGuard', i)
  }
  // Only ineffective moves.
  const damaging = me.spec.moves.filter((id) => id && (gameMove(env.data, id)?.p ?? 0) > 0)
  if (
    damaging.length &&
    damaging.every((id) => effOf(env, id, opp, me).immune) &&
    damaging.length >= 2
  ) {
    for (const { m, i } of bench)
      for (const id of m.spec.moves)
        if (
          id &&
          (gameMove(env.data, id)?.p ?? 0) > 0 &&
          effOf(env, id, opp, m).se &&
          env.rng.int(3) < 2
        )
          return say('AI_OnlyIneffectiveMoves', i)
    for (const { m, i } of bench)
      for (const id of m.spec.moves)
        if (id && (gameMove(env.data, id)?.p ?? 0) > 0) {
          const e = effOf(env, id, opp, m)
          if (!e.se && !e.nve && !e.immune && env.rng.int(2) === 0)
            return say('AI_OnlyIneffectiveMoves', i)
        }
  }
  // Absorbing ability on the bench.
  const hit = me.volatile.lastDamageTaken?.moveId ?? 0
  if (
    !(hasSe(env, me, opp, true) && env.rng.int(3) !== 0) &&
    hit &&
    (gameMove(env.data, hit)?.p ?? 0) > 0
  ) {
    const t = gameMove(env.data, hit)?.t
    const absorb =
      t === 'fire'
        ? 'flash-fire'
        : t === 'water'
          ? 'water-absorb'
          : t === 'electric'
            ? 'volt-absorb'
            : null
    if (absorb && abilitySlugOf(me) !== absorb) {
      for (const { m, i } of bench)
        if (abilitySlugOf(m) === absorb && env.rng.next() < 0.5)
          return say('AI_HasAbsorbAbilityInParty', i)
    }
  }
  // Natural Cure while asleep.
  if (
    me.status === 'slp' &&
    abilitySlugOf(me) === 'natural-cure' &&
    me.hp >= Math.floor(me.maxHp / 2)
  ) {
    if (!hit && env.rng.next() < 0.5) return say('AI_IsAsleepWithNaturalCure', -1)
    if (hit && (gameMove(env.data, hit)?.p ?? 0) === 0 && env.rng.next() < 0.5)
      return say('AI_IsAsleepWithNaturalCure', -1)
    const f = partyWithSe(env, 'immune', 1) ?? partyWithSe(env, 'nve', 1)
    if (f != null) return say('AI_IsAsleepWithNaturalCure', f)
    if (env.rng.next() < 0.5) return say('AI_IsAsleepWithNaturalCure', -1)
  }
  if (hasSe(env, me, opp, false)) return null
  const boosts = Object.values(me.boosts).reduce((s, v) => s + Math.max(0, v), 0)
  if (boosts >= 4) return null
  const f = partyWithSe(env, 'immune', 2) ?? partyWithSe(env, 'nve', 3)
  if (f != null) return say('AI_HasPartyMemberWithSuperEffectiveMove', f)
  return null
}

function partyWithSe(env: AiEnv, flag: 'immune' | 'nve', rand: number): number | null {
  const st = env.st
  const me = activeMon(st, 'theirs')
  const opp = activeMon(st, 'mine')
  const hit = me.volatile.lastDamageTaken?.moveId ?? 0
  if (!hit || (gameMove(env.data, hit)?.p ?? 0) === 0) return null
  const sd = st.sides.theirs
  for (let i = 0; i < sd.mons.length; i++) {
    const m = sd.mons[i]
    if (m.fainted || i === sd.active) continue
    const e = effOf(env, hit, m, opp)
    if (!(flag === 'immune' ? e.immune : e.nve)) continue
    for (const id of m.spec.moves)
      if (id && effOf(env, id, opp, m).se && env.rng.int(rand) === 0) return i
  }
  return null
}

const HP_RESTORE: Record<string, number> = {
  potion: 20,
  'super-potion': 50,
  'hyper-potion': 200,
  'max-potion': 255,
  'fresh-water': 50,
  'soda-pop': 60,
  lemonade: 80,
  'moomoo-milk': 100,
  'energy-powder': 50,
  'energy-root': 200,
  'berry-juice': 20,
  'sweet-heart': 20,
}

/** TrainerAI_ShouldUseItem -- with the loop that keeps going after it decides. */
function shouldUseItem(env: AiEnv, trace: AiTrace): Action | null {
  const st = env.st
  const me = activeMon(st, 'theirs')
  const bag = st.sides.theirs.bag
  const alive = aliveCount(st.sides.theirs)
  const count = bag.length
  let result = false
  let used: number | null = null
  const slugOf = (id: number) => getItem(id)?.name ?? ''
  for (let i = 0; i < Math.min(4, bag.length); i++) {
    if (!(i === 0 || alive <= count - i + 1)) continue
    const id = bag[i]
    if (!id) continue
    const slug = slugOf(id)
    if (slug === 'full-restore') {
      if (me.hp < Math.floor(me.maxHp / 4) && me.hp) result = true
    } else if (slug in HP_RESTORE) {
      if (me.hp && (me.hp < Math.floor(me.maxHp / 4) || me.maxHp - me.hp > HP_RESTORE[slug]))
        result = true
    } else if (
      ['awakening', 'antidote', 'burn-heal', 'ice-heal', 'paralyze-heal', 'full-heal'].includes(
        slug,
      )
    ) {
      const cures: Record<string, string[]> = {
        awakening: ['slp'],
        antidote: ['psn', 'tox'],
        'burn-heal': ['brn'],
        'ice-heal': ['frz'],
        'paralyze-heal': ['par'],
        'full-heal': ['slp', 'psn', 'tox', 'brn', 'frz', 'par'],
      }
      if (cures[slug].includes(me.status)) result = true
    } else if (me.volatile.turnsOut === 0) {
      if (slug.startsWith('x-') || slug === 'dire-hit') result = true
      else if (slug === 'guard-spec' && st.sides.theirs.mist === 0) result = true
    }
    if (result) used = id
  }
  if (!result || used == null) return null
  trace.pre = { kind: 'item', label: `TrainerAI_ShouldUseItem: ${slugOf(used)}`, itemId: used }
  return { kind: 'item', itemId: used }
}

/** BattleAI_PostKOSwitchIn: type matchup with a super-effective move, else the most damage (in a byte). */
export function gen4SendOut(env: AiEnv): number {
  const st = env.st
  const sd = st.sides.theirs
  const opp = activeMon(st, 'mine')
  const vm = {
    env,
    ai: env.data.ai as Gen4Ai,
    st,
    attacker: sd.mons[sd.active],
    defender: opp,
  } as VM
  const oppTypes = monTypes(opp)
  const disregarded = new Set<number>()
  const valid = (i: number) => !sd.mons[i].fainted && i !== sd.active
  while (disregarded.size < sd.mons.length) {
    let max = 0
    let picked = -1
    for (let i = 0; i < sd.mons.length; i++) {
      if (!valid(i) || disregarded.has(i)) {
        disregarded.add(i)
        continue
      }
      const [t1, t2] = monTypes(sd.mons[i])
      const mult = (t: string) => {
        let m = 40
        const ids = resolveTypesForGeneration(varietyOfSpec(opp.spec), 4).map((x) => x.type_id)
        for (const id of new Set(ids)) m = Math.floor((m * typeMult(t, [id], 4) * 10) / 10)
        return m
      }
      const score = (mult(t1) + mult(t2)) & 0xff
      if (max < score) {
        max = score
        picked = i
      }
    }
    if (picked < 0) break
    if (sd.mons[picked].spec.moves.some((id) => id && effOf(env, id, opp, sd.mons[picked]).se))
      return picked
    disregarded.add(picked)
  }
  void oppTypes
  let max = 0
  let picked = -1
  for (let i = 0; i < sd.mons.length; i++) {
    if (!valid(i)) continue
    for (const id of sd.mons[i].spec.moves) {
      if (!id || gameMove(env.data, id)?.p === 1) continue
      // The game scores each candidate move as if the FAINTED battler used it.
      const score = calcDamage(vm, id, 100) & 0xff
      if (max < score) {
        max = score
        picked = i
      }
    }
  }
  return picked >= 0 ? picked : sd.mons.findIndex((m, i) => !m.fainted && i !== sd.active)
}

export function gen4Ai(env: AiEnv): AiChoice {
  const ai = env.data.ai as Gen4Ai
  const trace: AiTrace = { moves: [], pre: null, lowConfidence: [], better: 'higher' }
  if (ai.lowConfidence)
    trace.lowConfidence.push(ai.source_note ?? "Script binary not this game's own.")
  if (env.ctx.versionGroup !== 'platinum')
    trace.lowConfidence.push(
      `${env.ctx.label}'s switch and item routines are not decompiled; Platinum's are used.`,
    )
  const me = activeMon(env.st, 'theirs')
  let pre: Action | null = null
  const sw = shouldSwitch(env, trace)
  if (sw != null) {
    const to = sw >= 0 ? sw : gen4SendOut(env)
    if (to >= 0) {
      pre = { kind: 'switch', to }
      if (trace.pre) trace.pre.to = to
    }
  } else pre = shouldUseItem(env, trace)
  const { scores, contrib } = gen4MoveScores(env)
  trace.moves = me.spec.moves.map((id, i) => ({
    slot: i,
    moveId: id,
    score: scores[i],
    contributions: contrib[i],
  }))
  if (pre) return { action: pre, trace }
  const best: number[] = [0]
  let top = scores[0]
  for (let i = 1; i < scores.length; i++) {
    if (!me.spec.moves[i]) continue
    if (top === scores[i]) best.push(i)
    if (top < scores[i]) {
      best.length = 0
      best.push(i)
      top = scores[i]
    }
  }
  return { action: { kind: 'move', slot: best[env.rng.int(best.length)] }, trace }
}

export type { BattleState }
