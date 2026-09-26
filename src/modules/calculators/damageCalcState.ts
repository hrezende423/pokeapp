/**
 * The damage calculator's form state, and the one place it meets the engine.
 *
 * A side is plain ids and numbers -- what a saved build would hold -- and
 * `toCalcPokemon` resolves it to the bundle records the engine consumes. Keeping
 * the state flat is what lets a generation switch be a pure function
 * (`normalizeSide`) rather than an effect chasing stale fields.
 *
 * DEFAULTS FOLLOW THE REFERENCE CALCULATOR, so a fresh calc here and on
 * calc.pokemonshowdown.com read the same: level 100; Gen 1-2 max DVs (15) and max
 * Stat Exp (65535); Gen 3-4 31 IVs, 0 EVs and a neutral nature (Serious); the
 * species' first ability; no item.
 */

import {
  getAbility,
  getItem,
  getMove,
  getNature,
  getSpecies,
  getVersionGroupByName,
  itemExistsInGeneration,
  listNatures,
  moveExistsInGeneration,
  resolveAbilitiesForGeneration,
  type Item,
  type Move,
  type Species,
  type Variety,
} from '../../data'
import { resolveMovePowerForGeneration, resolveMoveTypeNameForGeneration } from '../../data/moveEra'
import { itemEntries, speciesEntries } from '../dex/entrySources'
import { MAX_DV, MAX_IV, MAX_STAT_EXP, type StatNumbers } from '../team-builder/statMath'
import {
  FIELD_RULES,
  HELD_ITEMS_INTRODUCED_IN_GENERATION,
  type Boosts,
  type CalcField,
  type CalcPokemon,
  type StatusId,
} from './damage'

export const MOVE_SLOT_COUNT = 4

export interface SideState {
  speciesId: number
  /** Variety slug: 'charizard', 'deoxys-attack'. */
  varietyName: string
  level: number
  natureId: number | null
  abilityId: number | null
  abilityOn: boolean
  itemId: number | null
  status: StatusId
  boosts: Boosts
  /** Null means full HP. */
  currentHp: number | null
  gender: 'M' | 'F' | 'N'
  effort: StatNumbers
  individual: StatNumbers
  /**
   * The four move slots. NULL MEANS "NOT CHOSEN YET": the panel derives four
   * defaults from the learnset once it has loaded, rather than an effect writing
   * them in -- so there is never a frame of the previous species' moves.
   */
  moves: (number | null)[] | null
  /** Per slot: forced critical hit, hit count, base power override. */
  crit: boolean[]
  hits: (number | null)[]
  power: (number | null)[]
  /**
   * What an older era took away, kept so a round trip gives it back: switching
   * Gen 4 -> Gen 2 -> Gen 4 restores the EV spread, nature, ability and Choice
   * Band instead of leaving the reader to rebuild the set. Each spread model
   * (Stat Exp/DVs, EVs/IVs) keeps its own last values.
   */
  remembered?: {
    classic?: { effort: StatNumbers; individual: StatNumbers }
    modern?: { effort: StatNumbers; individual: StatNumbers }
    itemId?: number | null
    natureId?: number | null
    abilityId?: number | null
  }
}

/** Species that exist in every generation in scope, for a default matchup. */
export const DEFAULT_ATTACKER_ID = 6 // Charizard
export const DEFAULT_DEFENDER_ID = 9 // Blastoise

export function defaultVariety(species: Species): Variety {
  return species.varieties.find((v) => v.is_default) ?? species.varieties[0]
}

export function varietyOf(side: SideState): Variety {
  const species = getSpecies(side.speciesId)!
  return species.varieties.find((v) => v.name === side.varietyName) ?? defaultVariety(species)
}

/** Gen 1-2 keep five spread keys (one Special); Gen 3-4 six. */
export function spreadDefaults(gen: number): { effort: StatNumbers; individual: StatNumbers } {
  if (gen <= 2) {
    const keys = ['hp', 'attack', 'defense', 'special', 'speed'] as const
    return {
      effort: Object.fromEntries(keys.map((k) => [k, MAX_STAT_EXP])),
      individual: { attack: MAX_DV, defense: MAX_DV, special: MAX_DV, speed: MAX_DV },
    }
  }
  const keys = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'] as const
  return { effort: {}, individual: Object.fromEntries(keys.map((k) => [k, MAX_IV])) }
}

export function neutralNatureId(): number | null {
  return listNatures().find((n) => n.name === 'serious')?.id ?? null
}

export function newSide(speciesId: number, gen: number): SideState {
  const species = getSpecies(speciesId)!
  const variety = defaultVariety(species)
  const { effort, individual } = spreadDefaults(gen)
  return {
    speciesId,
    varietyName: variety.name,
    level: 100,
    natureId: gen >= 3 ? neutralNatureId() : null,
    abilityId: resolveAbilitiesForGeneration(variety, gen)[0]?.ability.id ?? null,
    abilityOn: false,
    itemId: null,
    status: 'healthy',
    boosts: {},
    currentHp: null,
    gender: 'N',
    effort,
    individual,
    moves: null,
    crit: [false, false, false, false],
    hits: [null, null, null, null],
    power: [null, null, null, null],
  }
}

/** A different species (or form) keeps the level, spread, nature and field; resets what belonged to the old one. */
export function withSpecies(
  side: SideState,
  speciesId: number,
  varietyName: string,
  gen: number,
): SideState {
  const species = getSpecies(speciesId)!
  const variety = species.varieties.find((v) => v.name === varietyName) ?? defaultVariety(species)
  return {
    ...side,
    speciesId,
    varietyName: variety.name,
    abilityId: resolveAbilitiesForGeneration(variety, gen)[0]?.ability.id ?? null,
    abilityOn: false,
    currentHp: null,
    moves: null,
    remembered: { ...side.remembered, abilityId: null },
    crit: [false, false, false, false],
    hits: [null, null, null, null],
    power: [null, null, null, null],
  }
}

/** Is this form battle-available in `gen`? Castform's weather forms are Forecast's business. */
export function formAvailable(variety: Variety, gen: number): boolean {
  if (variety.is_default) return true
  if (variety.name.startsWith('castform-')) return false
  return variety.form_version_groups.some((vg) => {
    const g = vg ? getVersionGroupByName(vg)?.generation_id : null
    return g != null && g <= gen
  })
}

/**
 * Bring a side into `gen`: drop what the era does not have (items before Gen 2,
 * abilities and natures before Gen 3, a form that did not exist yet), and swap the
 * spread model when crossing the Stat Exp / EV boundary. A species the era does
 * not have is replaced with the default.
 */
export function normalizeSide(side: SideState, gen: number, fallbackId: number): SideState {
  const inGen = speciesEntries({ generation: gen, isAll: false }).some(
    (s) => s.id === side.speciesId,
  )
  if (!inGen) return newSide(fallbackId, gen)

  const species = getSpecies(side.speciesId)!
  let variety =
    species.varieties.find((v) => v.name === side.varietyName) ?? defaultVariety(species)
  if (!formAvailable(variety, gen)) variety = defaultVariety(species)

  const remembered = { ...side.remembered }
  // Anything the target era lacks is remembered before it is dropped.
  if (side.itemId != null) remembered.itemId = side.itemId
  if (side.natureId != null) remembered.natureId = side.natureId
  if (side.abilityId != null) remembered.abilityId = side.abilityId

  const abilities = resolveAbilitiesForGeneration(variety, gen)
  const wantAbility = side.abilityId ?? remembered.abilityId ?? null
  const abilityId = abilities.some((a) => a.ability.id === wantAbility)
    ? wantAbility
    : (abilities[0]?.ability.id ?? null)

  const wantItem = side.itemId ?? remembered.itemId ?? null
  const item = wantItem != null ? getItem(wantItem) : undefined
  const itemId =
    gen >= HELD_ITEMS_INTRODUCED_IN_GENERATION && item && itemExistsInGeneration(item, gen)
      ? wantItem
      : null

  const wasModern = side.individual.hp != null
  const current = { effort: side.effort, individual: side.individual }
  let spread = current
  if (gen >= 3 !== wasModern) {
    remembered[wasModern ? 'modern' : 'classic'] = current
    spread = remembered[gen >= 3 ? 'modern' : 'classic'] ?? spreadDefaults(gen)
  }

  const moves = side.moves
    ? side.moves.map((id) => {
        const m = id != null ? getMove(id) : undefined
        return m && moveExistsInGeneration(m, gen) ? id : null
      })
    : null

  const boosts: Boosts = { ...side.boosts }
  if (gen === 1) delete boosts.spd

  return {
    ...side,
    varietyName: variety.name,
    abilityId: gen >= 3 ? abilityId : null,
    natureId: gen >= 3 ? (side.natureId ?? remembered.natureId ?? neutralNatureId()) : null,
    itemId,
    ...spread,
    boosts,
    gender: gen >= 4 ? side.gender : 'N',
    moves,
    remembered,
  }
}

export function normalizeField(field: CalcField, gen: number): CalcField {
  const rules = FIELD_RULES[gen]
  const side = (s: CalcField['defenderSide']) => ({
    ...s,
    spikes: Math.min(s.spikes, rules.maxSpikes),
    stealthRock: rules.stealthRock && s.stealthRock,
    foresight: rules.foresight && s.foresight,
    switchingOut: rules.pursuit && s.switchingOut,
    charge: rules.charge && s.charge,
  })
  return {
    weather: field.weather && rules.weathers.includes(field.weather) ? field.weather : null,
    gravity: rules.gravity && field.gravity,
    attackerSide: side(field.attackerSide),
    defenderSide: side(field.defenderSide),
  }
}

export function toCalcPokemon(side: SideState): CalcPokemon {
  const species = getSpecies(side.speciesId)!
  return {
    species,
    variety: varietyOf(side),
    level: side.level,
    individual: side.individual,
    effort: side.effort,
    nature: side.natureId != null ? (getNature(side.natureId) ?? null) : null,
    ability: side.abilityId != null ? (getAbility(side.abilityId) ?? null) : null,
    abilityOn: side.abilityOn,
    item: side.itemId != null ? (getItem(side.itemId) ?? null) : null,
    status: side.status,
    boosts: side.boosts,
    currentHp: side.currentHp,
    gender: side.gender,
  }
}

// ---------------------------------------------------------------- options

/** Abilities whose effect the reader switches on (the engine's `abilityOn`). */
export const TOGGLED_ABILITIES = [
  'flash-fire',
  'plus',
  'minus',
  'slow-start',
  'intimidate',
  'unburden',
]

/** Damaging moves, plus Nature Power, which calls one. */
export function isDamaging(move: Move): boolean {
  return move.damage_class !== 'status' || move.name === 'nature-power'
}

/**
 * Moves that make poor defaults: two-turn, recharge, self-KO, conditional or
 * sleep-only. Still pickable; just never pre-filled.
 */
const NOT_A_DEFAULT = new Set([
  'hyper-beam',
  'giga-impact',
  'blast-burn',
  'hydro-cannon',
  'frenzy-plant',
  'rock-wrecker',
  'roar-of-time',
  'focus-punch',
  'explosion',
  'self-destruct',
  'dream-eater',
  'snore',
  'last-resort',
  'sky-attack',
  'solar-beam',
  'skull-bash',
  'razor-wind',
  'future-sight',
  'doom-desire',
  'bide',
  'belch',
  'synchronoise',
  'fake-out',
  'sucker-punch',
  'focus-blast',
])

/**
 * Four starting moves: the strongest learnable attack of each type, ranked by
 * power x accuracy with STAB counted, so a fresh calc shows a plausible moveset
 * rather than Hyper Beam, Giga Impact and two other recharge moves.
 */
export function defaultMoves(
  moveIds: number[],
  gen: number,
  attackerTypes: string[],
): (number | null)[] {
  const bestByType = new Map<string, { id: number; score: number }>()
  for (const id of moveIds) {
    const m = getMove(id)
    if (!m || !isDamaging(m) || m.name === 'nature-power' || NOT_A_DEFAULT.has(m.name)) continue
    const power = resolveMovePowerForGeneration(m, gen) ?? 0
    if (power <= 0) continue
    const type = resolveMoveTypeNameForGeneration(m, gen) ?? ''
    const score = power * ((m.accuracy ?? 100) / 100) * (attackerTypes.includes(type) ? 1.5 : 1)
    const best = bestByType.get(type)
    if (!best || score > best.score || (score === best.score && id < best.id))
      bestByType.set(type, { id, score })
  }
  const picks: (number | null)[] = [...bestByType.values()]
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, MOVE_SLOT_COUNT)
    .map((m) => m.id)
  while (picks.length < MOVE_SLOT_COUNT) picks.push(null)
  return picks
}

/**
 * Items the item picker offers: what exists in the era (itemEntries, the Itemdex's
 * own scoping), narrowed to the two bag pockets a Pokemon can hold from -- general
 * items and berries. Key items, TMs, balls and battle items are never held.
 */
export function holdableItems(gen: number): Item[] {
  return itemEntries({ generation: gen, isAll: false })
    .filter((i) => i.pocket === 'misc' || i.pocket === 'berries')
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
}
