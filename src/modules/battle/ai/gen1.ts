/**
 * Generation 1 trainer AI -- Red/Blue and Yellow, transcribed from
 * pokered/pokeyellow engine/battle/trainer_ai.asm.
 *
 * TWO PARTS, IN THE GAME'S ORDER:
 *
 * 1. TrainerAI, before the move: the class routine from data/trainers/
 *    ai_pointers.asm (Lance's Hyper Potion, Koga's X Attack, Agatha's switch...)
 *    draws one random byte and may use a bag item or switch instead of attacking.
 *    Each Pokemon gets the class's use count (wAICount, reset on send-out); an
 *    item use spends one, a switch does not. Yellow skips the routine while the
 *    Pokemon is locked into Thrash, a charge, Bide or Rage; Red/Blue do not.
 *
 * 2. AIEnemyTrainerChooseMoves: every move starts at 10, a disabled move at 80,
 *    and the class's modification layers (data/trainers/move_choices.asm) add or
 *    subtract; the lowest entries survive and one is picked at random.
 *      Mod 1  +5 to a status-only move (sleep, poison, paralysis) when the player
 *             already has a status.
 *      Mod 2  -1 to stat-changing and "in-between" effects on the Pokemon's second
 *             turn out (wAILayer2Encouragement == 1).
 *      Mod 3  -1 to a super-effective move; +1 to a not-very-effective one when
 *             any other damaging move of another type (or Super Fang, a fixed-
 *             damage move, Fly) exists. Its type check is AIGetTypeEffectiveness,
 *             which takes the FIRST matching row of the type table, not the
 *             product of both types -- reproduced.
 */

import { getItem, getMove, getType, resolveTypesForGeneration } from '../../../data'
import type { Gen1Ai } from '../battleData'
import { gameMove } from '../battleData'
import { varietyOfSpec } from '../battler'
import type { Action } from '../engine/turn'
import { activeMon, aliveCount, type MonState } from '../engine/state'
import { pct, pickBest, type AiChoice, type AiEnv, type AiTrace, type Contribution } from './types'

const STATUS_AILMENT_EFFECTS = ['EFFECT_01', 'SLEEP_EFFECT', 'POISON_EFFECT', 'PARALYZE_EFFECT']

function typesOf(m: MonState): string[] {
  return resolveTypesForGeneration(varietyOfSpec(m.spec), 1).map(
    (t) => getType(t.type_id)?.name ?? '',
  )
}

/** AIGetTypeEffectiveness: $10 if no row matches, else the FIRST matching row's multiplier. */
function aiTypeEffectiveness(ai: Gen1Ai, moveType: string, defTypes: string[]): number {
  for (const [atk, def, mult] of ai.typeMatchups) {
    if (atk !== moveType) continue
    if (def === defTypes[0] || def === defTypes[defTypes.length - 1]) return mult
  }
  return 0x10
}

function chooseMove(env: AiEnv, ai: Gen1Ai, classId: string, trace: AiTrace): number {
  const { data, st } = env
  const m = activeMon(st, 'theirs')
  const player = activeMon(st, 'mine')
  const moves = m.spec.moves
  const buf = moves.map(() => 10)
  const contrib: Contribution[][] = moves.map(() => [])
  const bump = (i: number, d: number, label: string) => {
    buf[i] += d
    contrib[i].push({ label, delta: d })
  }
  moves.forEach((id, i) => {
    if (m.volatile.disable?.moveId === id) {
      buf[i] = 0x50
      contrib[i].push({ label: 'Disabled', delta: 0x50 - 10 })
    }
  })
  const mods = ai.classes[classId]?.mods ?? []
  const effectIndex = (e: string) => ai.effectOrder.indexOf(e)
  for (const mod of mods) {
    if (mod === 1 && player.status !== 'healthy') {
      moves.forEach((id, i) => {
        const gm = gameMove(data, id)
        if (gm && gm.p === 0 && STATUS_AILMENT_EFFECTS.includes(gm.e))
          bump(i, 5, 'AIMoveChoiceModification1: status move vs a statused target')
      })
    }
    if (mod === 2 && st.aiLayer2 === 1) {
      const A1 = effectIndex('ATTACK_UP1_EFFECT')
      const BIDE = effectIndex('BIDE_EFFECT')
      const A2 = effectIndex('ATTACK_UP2_EFFECT')
      const PSN = effectIndex('POISON_EFFECT')
      moves.forEach((id, i) => {
        const e = effectIndex(gameMove(data, id)?.e ?? '')
        if ((e >= A1 && e < BIDE) || (e >= A2 && e < PSN))
          bump(i, -1, 'AIMoveChoiceModification2: second turn, stat/utility move')
      })
    }
    if (mod === 3) {
      const defTypes = typesOf(player)
      moves.forEach((id, i) => {
        const gm = gameMove(data, id)
        if (!gm) return
        const eff = aiTypeEffectiveness(ai, gm.t, defTypes)
        if (eff === 0x10) return
        if (eff > 0x10) {
          bump(i, -1, 'AIMoveChoiceModification3: effective move')
          return
        }
        const better = moves.some((other) => {
          const o = gameMove(data, other)
          if (!o) return false
          if (['SUPER_FANG_EFFECT', 'SPECIAL_DAMAGE_EFFECT', 'FLY_EFFECT'].includes(o.e))
            return true
          if (o.t === gm.t) return false
          return o.p !== 0
        })
        if (better) bump(i, 1, 'AIMoveChoiceModification3: not effective, a better move exists')
      })
    }
  }
  trace.moves = moves.map((id, i) => ({
    slot: i,
    moveId: id,
    score: buf[i],
    contributions: contrib[i],
  }))
  // useOriginalMoveSet when the class has no layers: every move equally likely.
  return pickBest(buf, 'lower', env.rng)
}

/** The class routine. Returns an action when it uses an item or switches. */
function trainerAi(env: AiEnv, ai: Gen1Ai, classId: string, trace: AiTrace): Action | null {
  const { st, rng, ctx } = env
  const m = activeMon(st, 'theirs')
  const cls = ai.classes[classId]
  if (!cls || cls.routine === 'GenericAI') return null
  if (
    ctx.versionGroup === 'yellow' &&
    (m.volatile.charging != null || m.volatile.rampage || m.volatile.rage || m.volatile.bide)
  )
    return null
  if (m.aiCount <= 0) return null
  const a = rng.byte()
  const below = (n: number) => m.hp < Math.floor(m.maxHp / n)
  const enoughMons = () => aliveCount(st.sides.theirs) >= 2
  const itemNamed = (slug: string): Action => {
    const id = itemId(slug)
    return { kind: 'item', itemId: id }
  }
  const spend = (slug: string, why: string): Action => {
    trace.pre = { kind: 'item', label: `${cls.routine}: ${why}`, itemId: itemId(slug) }
    return itemNamed(slug)
  }
  const sw = (why: string): Action | null => {
    if (!enoughMons()) return null
    const sd = st.sides.theirs
    const to = sd.mons.findIndex((x, i) => i !== sd.active && !x.fainted)
    if (to < 0) return null
    trace.pre = { kind: 'switch', label: `${cls.routine}: ${why}`, to }
    return { kind: 'switch', to }
  }
  const red = ctx.versionGroup !== 'yellow'
  switch (cls.routine) {
    case 'JugglerAI':
      return a < pct(25) + 1 ? sw('25% to switch') : null
    case 'BlackbeltAI':
      return a < pct(13) - 1 ? spend('x-attack', '~12.5% X Attack') : null
    case 'GiovanniAI':
      return a < pct(25) + 1 ? spend('guard-spec', '25% Guard Spec') : null
    case 'CooltrainerMAI':
      return a < pct(25) + 1 ? spend('x-attack', '25% X Attack') : null
    case 'CooltrainerFAI':
      // The 25% gate's `ret nc` is commented out in the game: it always continues.
      if (below(10)) return spend('hyper-potion', 'HP below 1/10')
      if (below(5)) return sw('HP below 1/5')
      return null
    case 'BrockAI':
      return m.status !== 'healthy' ? spend('full-heal', 'statused') : null
    case 'MistyAI':
      return a < pct(25) + 1 ? spend('x-defense', '25% X Defend') : null
    case 'LtSurgeAI':
      return a < pct(25) + 1 ? spend('x-speed', '25% X Speed') : null
    case 'ErikaAI':
      return a < pct(50) + 1 && below(10) ? spend('super-potion', '50% and HP below 1/10') : null
    case 'KogaAI':
      return a < (red ? pct(25) + 1 : pct(13) - 1) ? spend('x-attack', 'X Attack') : null
    case 'BlaineAI':
      if (red)
        return a < pct(25) + 1 ? spend('super-potion', '25% Super Potion (no HP check)') : null
      return a < pct(25) + 1 && below(10) ? spend('super-potion', '25% and HP below 1/10') : null
    case 'SabrinaAI':
      if (red)
        return a < pct(25) + 1 && below(10) ? spend('hyper-potion', '25% and HP below 1/10') : null
      return a < pct(25) + 1 ? spend('x-defense', '25% X Defend') : null
    case 'Rival2AI':
      return a < pct(13) - 1 && below(5) ? spend('potion', '~12.5% and HP below 1/5') : null
    case 'Rival3AI':
      return a < pct(13) - 1 && below(5) ? spend('full-restore', '~12.5% and HP below 1/5') : null
    case 'LoreleiAI':
      return a < pct(50) + 1 && below(5) ? spend('super-potion', '50% and HP below 1/5') : null
    case 'BrunoAI':
      return a < pct(25) + 1 ? spend('x-defense', '25% X Defend') : null
    case 'AgathaAI':
      if (a < pct(8)) return sw('8% to switch')
      return a < pct(50) + 1 && below(4) ? spend('super-potion', '50% and HP below 1/4') : null
    case 'LanceAI':
      return a < pct(50) + 1 && below(5) ? spend('hyper-potion', '50% and HP below 1/5') : null
  }
  return null
}

const ITEM_IDS = new Map<string, number>()
function itemId(slug: string): number {
  if (!ITEM_IDS.size) {
    for (let id = 1; id < 800; id++) {
      const it = getItem(id)
      if (it) ITEM_IDS.set(it.name, id)
    }
  }
  return ITEM_IDS.get(slug) ?? 0
}

export function gen1Ai(env: AiEnv): AiChoice {
  const ai = env.data.ai as Gen1Ai
  const classId = env.st.trainer?.classId ?? ''
  const trace: AiTrace = { moves: [], pre: null, lowConfidence: [], better: 'lower' }
  const pre = trainerAi(env, ai, classId, trace)
  if (pre) {
    // The move scores are still computed for the breakdown. The use count is
    // spent by the engine when the item is actually used (turn.ts applyItem).
    chooseMove(env, ai, classId, trace)
    return { action: pre, trace }
  }
  const slot = chooseMove(env, ai, classId, trace)
  return { action: { kind: 'move', slot }, trace }
}

/** P4, Gen 1: the next Pokemon in party order (pokered EnemySendOut). */
export function gen1SendOut(env: AiEnv): number {
  const sd = env.st.sides.theirs
  return sd.mons.findIndex((m) => !m.fainted)
}

export const moveName = (id: number) => getMove(id)?.display_name ?? `#${id}`
