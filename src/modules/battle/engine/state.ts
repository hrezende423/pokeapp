/**
 * The battle state the turn engine resolves and the AI reads.
 *
 * PLAIN DATA, CLONED PER STEP. The sandbox keeps every turn's state for undo and
 * branching (P2), the search walks trees of them (O1), and the Monte Carlo runs
 * thousands -- so a state is a JSON-shaped value the engine never mutates in
 * place: `resolveTurn` clones and returns a new one.
 */

import { getAbility, getItem, getMove } from '../../../data'
import type { StatusId, Weather } from '../../calculators/damage'
import type { BattleData } from '../battleData'
import { gameMove } from '../battleData'
import { badgeBoostsFor, resolveAt, statAt, type BattlerSpec, type StatId } from '../battler'
import type { GameContext } from '../game'

export type Side = 'mine' | 'theirs'
export const other = (s: Side): Side => (s === 'mine' ? 'theirs' : 'mine')

export type BoostKey = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'acc' | 'eva'

export interface Volatile {
  confusion: number
  flinch: boolean
  focusEnergy: boolean
  leechSeed: boolean
  substituteHp: number
  protectChain: number
  protecting: boolean
  recharging: boolean
  /** Two-turn move charging (Solar Beam, Fly, Dig, Skull Bash, Sky Attack, Razor Wind). */
  charging: number | null
  semiInvulnerable: 'fly' | 'dig' | 'dive' | 'bounce' | 'shadow-force' | null
  /** Thrash / Outrage / Petal Dance turns left, and the move. */
  rampage: { moveId: number; turns: number } | null
  /** Rollout / Ice Ball. */
  rollout: { moveId: number; count: number } | null
  furyCutter: number
  choiceLock: number | null
  encore: { moveId: number; turns: number } | null
  disable: { moveId: number; turns: number } | null
  taunt: number
  perishSong: number
  yawn: number
  destinyBond: boolean
  cursed: boolean
  nightmare: boolean
  trapped: { turns: number; moveId: number } | null
  meanLook: boolean
  ingrain: boolean
  aquaRing: boolean
  magnetRise: number
  rage: boolean
  rageCounter: number
  minimized: boolean
  defenseCurl: boolean
  charge: boolean
  flashFire: boolean
  lockOn: number
  bide: { turns: number; damage: number } | null
  stockpile: number
  attract: boolean
  transformed: boolean
  /** The move this Pokemon last used (0 = none), and what hit it last. */
  lastMove: number
  lastDamageTaken: { amount: number; category: string; moveId: number } | null
  /** Damage taken THIS turn, for Counter / Mirror Coat (reset every turn). */
  counterDamage: { amount: number; category: string } | null
  /** Turns since it came in (0 = the turn it entered). */
  turnsOut: number
  /** Gen 3+ "first turn" flag for Fake Out / AI. */
  firstTurn: boolean
  slowStartTurns: number
  unburden: boolean
  /** Gen 1 X Accuracy / Gen 1-2 Mist / Guard Spec (as set). */
  xAccuracy: boolean
  /** Moves the opponent has SEEN this Pokemon use (Gen 3 BATTLE_HISTORY, Gen 4 likewise). */
  usedMoves: number[]
  /** The opponent has seen this Pokemon's ability / held item act (BATTLE_HISTORY). */
  abilityRevealed: boolean
  itemRevealed: boolean
}

export interface MonState {
  key: string
  spec: BattlerSpec
  maxHp: number
  hp: number
  status: StatusId
  /** Turns of sleep left (a move cannot be used while > 0). */
  sleep: number
  toxic: number
  boosts: Record<BoostKey, number>
  pp: number[]
  itemId: number | null
  /** Item consumed this battle (berries, Gems), for Recycle / Unburden. */
  consumedItem: number | null
  abilityId: number | null
  /** Raw stats as computed for this battle (the spread's chosen corner). */
  stats: Record<StatId, number>
  volatile: Volatile
  fainted: boolean
  /** Gen 1 AI: item/switch uses left for this Pokemon (wAICount), set on send-out. */
  aiCount: number
}

export interface SideState {
  mons: MonState[]
  active: number
  reflect: number
  lightScreen: number
  safeguard: number
  mist: number
  spikes: number
  toxicSpikes: number
  stealthRock: boolean
  tailwind: number
  luckyChant: number
  /** The opponent's bag (trainer items), remaining. */
  bag: number[]
  futureSight: { turns: number; damage: number } | null
  wish: { turns: number; hp: number } | null
}

export interface BattleState {
  turn: number
  weather: { kind: Weather | null; turns: number }
  trickRoom: number
  gravity: number
  sides: Record<Side, SideState>
  /** Badges the player owns (badge boosts). */
  badges: string[]
  /** The opponent trainer's identity for its AI. */
  trainer: { classId: string; aiFlags: string[]; versionGroup: string } | null
  /** Set when a Pokemon fainted and its side must send another before the next turn. */
  pendingSwitch: Side[]
  winner: Side | null
  /** Gen 1 wAILayer2Encouragement: the opponent's turns since its Pokemon came in. */
  aiLayer2: number
}

export function emptyVolatile(): Volatile {
  return {
    confusion: 0,
    flinch: false,
    focusEnergy: false,
    leechSeed: false,
    substituteHp: 0,
    protectChain: 0,
    protecting: false,
    recharging: false,
    charging: null,
    semiInvulnerable: null,
    rampage: null,
    rollout: null,
    furyCutter: 0,
    choiceLock: null,
    encore: null,
    disable: null,
    taunt: 0,
    perishSong: 0,
    yawn: 0,
    destinyBond: false,
    cursed: false,
    nightmare: false,
    trapped: null,
    meanLook: false,
    ingrain: false,
    aquaRing: false,
    magnetRise: 0,
    rage: false,
    rageCounter: 0,
    minimized: false,
    defenseCurl: false,
    charge: false,
    flashFire: false,
    lockOn: 0,
    bide: null,
    stockpile: 0,
    attract: false,
    transformed: false,
    lastMove: 0,
    lastDamageTaken: null,
    counterDamage: null,
    turnsOut: 0,
    firstTurn: true,
    slowStartTurns: 5,
    unburden: false,
    xAccuracy: false,
    usedMoves: [],
    abilityRevealed: false,
    itemRevealed: false,
  }
}

export const zeroBoosts = (): Record<BoostKey, number> => ({
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
  acc: 0,
  eva: 0,
})

export type CornerPick = 'low' | 'high'

/**
 * A Pokemon at the start of a battle. Ranged spreads are pinned to one corner
 * here (`pick`): a turn engine needs concrete numbers. The sandbox shows which.
 */
export function initMon(
  ctx: GameContext,
  data: BattleData,
  spec: BattlerSpec,
  pick: CornerPick = 'high',
  hpPct: number | null = null,
  status: StatusId = 'healthy',
): MonState {
  const gen = ctx.generation
  const stats = {} as Record<StatId, number>
  for (const s of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as StatId[])
    stats[s] = statAt(spec, gen, s, pick)
  const maxHp = stats.hp
  const pp = spec.moves.map((id) => gameMove(data, id)?.pp ?? getMove(id)?.pp ?? 0)
  return {
    key: spec.key,
    spec,
    maxHp,
    hp: hpPct == null ? maxHp : Math.max(0, Math.round((maxHp * hpPct) / 100)),
    status,
    sleep: 0,
    toxic: 0,
    boosts: zeroBoosts(),
    pp,
    itemId: ctx.hasItems ? spec.itemId : null,
    consumedItem: null,
    abilityId: ctx.hasAbilities ? spec.abilityId : null,
    stats,
    volatile: emptyVolatile(),
    fainted: hpPct === 0,
    aiCount: 0,
  }
}

export function emptySideState(mons: MonState[], bag: number[] = []): SideState {
  return {
    mons,
    active: Math.max(
      0,
      mons.findIndex((m) => !m.fainted),
    ),
    reflect: 0,
    lightScreen: 0,
    safeguard: 0,
    mist: 0,
    spikes: 0,
    toxicSpikes: 0,
    stealthRock: false,
    tailwind: 0,
    luckyChant: 0,
    bag,
    futureSight: null,
    wish: null,
  }
}

export const activeMon = (st: BattleState, side: Side): MonState =>
  st.sides[side].mons[st.sides[side].active]

export const abilitySlugOf = (m: MonState): string =>
  m.abilityId != null ? (getAbility(m.abilityId)?.name ?? '') : ''
export const itemSlugOf = (m: MonState): string =>
  m.itemId != null ? (getItem(m.itemId)?.name ?? '') : ''

export function cloneState(st: BattleState): BattleState {
  return structuredClone(st)
}

export function aliveCount(side: SideState): number {
  return side.mons.filter((m) => !m.fainted).length
}

/** The engine's CalcPokemon for a live MonState: current HP, boosts, status, item. */
function abilityOnFor(m: MonState): boolean {
  const ab = abilitySlugOf(m)
  if (ab === 'flash-fire') return m.volatile.flashFire
  if (ab === 'slow-start') return m.volatile.slowStartTurns > 0
  if (ab === 'unburden') return m.volatile.unburden
  return false
}

export function calcPokemonOf(
  ctx: GameContext,
  st: BattleState,
  m: MonState,
  pick: CornerPick = 'high',
) {
  const badges = new Set(st.badges)
  const p = resolveAt(
    { ...m.spec, itemId: m.itemId, abilityId: m.abilityId },
    ctx,
    { hp: pick, atk: pick, def: pick, spa: pick, spd: pick, spe: pick },
    {
      status: m.status,
      boosts: {
        atk: m.boosts.atk,
        def: m.boosts.def,
        spa: m.boosts.spa,
        spd: m.boosts.spd,
        spe: m.boosts.spe,
      },
      currentHp: m.hp,
      // The engine's 'switched on' abilities. Intimidate is NOT one here: the turn
      // engine applies it as a real stat stage on entry, so the calc must not again.
      abilityOn: abilityOnFor(m),
    },
    badgeBoostsFor(m.spec, ctx, badges),
  )
  return p
}
