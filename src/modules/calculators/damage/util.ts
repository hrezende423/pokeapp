/**
 * Shared mechanics, ported from the reference's calc/src/mechanics/util.ts --
 * only the parts a Gen 1-4 singles battle can reach.
 *
 * Type effectiveness is NOT re-derived here: it reads `damageRelationsFor`, the
 * same per-generation relations every type chart in the app draws from. What this
 * adds is the per-DEFENDING-TYPE split the formulas need -- Gen 1 and Gen 3 floor
 * after each half of a dual typing separately, so a single composed multiplier
 * (what typeEffectivenessAgainst returns) would round differently.
 */

import { damageRelationsFor, typesInGeneration } from '../../../data'
import { hasAbility, hasItem, hasStatus, named, type Combatant } from './combatant'
import type { CalcField, SideConditions, StatId } from './model'
import type { ResolvedMove } from './moveResolve'

/** The attacking type that has no chart entry at all: Struggle, Future Sight, Doom Desire. */
export const TYPELESS = '???'

/**
 * The order Gen 2-4 resolve a dual typing in, so the two per-type floors happen in
 * the games' order rather than the Pokedex's slot order.
 */
const TYPE_PRECEDENCE = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
]

/** Defender's [first, second?] as {id, name}, reordered by precedence where the era does. */
export function orderedDefenderTypes(
  defender: Combatant,
  reorder: boolean,
): { id: number; name: string }[] {
  const types = defender.typeIds.map((id, i) => ({ id, name: defender.types[i] }))
  if (reorder && types.length === 2 && types[0].name !== types[1].name) {
    if (TYPE_PRECEDENCE.indexOf(types[0].name) > TYPE_PRECEDENCE.indexOf(types[1].name)) {
      return [types[1], types[0]]
    }
  }
  return types
}

/** One attacking type against one defending type, in `gen`'s chart. */
export function typeMultiplier(
  gen: number,
  moveTypeId: number | null,
  moveType: string,
  defendingTypeId: number,
  defendingType: string,
  isGhostRevealed = false,
  isGravity = false,
): number {
  if (moveType === TYPELESS || moveTypeId == null) return 1
  if (
    isGhostRevealed &&
    defendingType === 'ghost' &&
    (moveType === 'normal' || moveType === 'fighting')
  ) {
    return 1
  }
  if (isGravity && defendingType === 'flying' && moveType === 'ground') return 1
  const relations = damageRelationsFor(defendingTypeId, gen)
  if (!relations) return 1
  if (relations.no_damage_from.includes(moveTypeId)) return 0
  if (relations.double_damage_from.includes(moveTypeId)) return 2
  if (relations.half_damage_from.includes(moveTypeId)) return 0.5
  return 1
}

/** Both halves of the defender's typing, in era order. */
export function effectivenessPair(
  gen: number,
  move: ResolvedMove,
  defender: Combatant,
  {
    reorder,
    ghostRevealed = false,
    gravity = false,
  }: { reorder: boolean; ghostRevealed?: boolean; gravity?: boolean },
): [number, number] {
  const [first, second] = orderedDefenderTypes(defender, reorder)
  const t1 = first
    ? typeMultiplier(gen, move.typeId, move.type, first.id, first.name, ghostRevealed, gravity)
    : 1
  const t2 = second
    ? typeMultiplier(gen, move.typeId, move.type, second.id, second.name, ghostRevealed, gravity)
    : 1
  return [t1, t2]
}

/** Stat stage multiplier. Gen 1-2 use their own table and cap the result at 1..999. */
export function getModifiedStat(stat: number, mod: number, gen: number): number {
  if (gen <= 2) {
    if (mod >= 0) {
      const table = [1, 1.5, 2, 2.5, 3, 3.5, 4]
      stat = Math.floor(stat * table[mod])
    } else {
      const numerators = [100, 66, 50, 40, 33, 28, 25]
      stat = Math.floor((stat * numerators[-mod]) / 100)
    }
    return Math.min(999, Math.max(1, stat))
  }
  const table: [number, number][] = [
    [2, 8],
    [2, 7],
    [2, 6],
    [2, 5],
    [2, 4],
    [2, 3],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 2],
    [6, 2],
    [7, 2],
    [8, 2],
  ]
  const [num, den] = table[6 + mod]
  return Math.floor(OF16(stat * num) / den)
}

/** Simple doubles every stage, capped at +/-6 (Gen 4). */
export function getSimpleModifiedStat(stat: number, mod: number): number {
  const simpleMod = Math.min(6, Math.max(-6, mod * 2))
  return simpleMod > 0
    ? Math.floor((stat * (2 + simpleMod)) / 2)
    : simpleMod < 0
      ? Math.floor((stat * 2) / (2 - simpleMod))
      : stat
}

export function OF16(n: number): number {
  return n > 65535 ? n % 65536 : n
}

export function OF32(n: number): number {
  return n > 4294967295 ? n % 4294967296 : n
}

export function pokeRound(n: number): number {
  return n % 1 > 0.5 ? Math.ceil(n) : Math.floor(n)
}

export function chainMods(mods: number[], lower: number, upper: number): number {
  let m = 4096
  for (const mod of mods) {
    if (mod !== 4096) m = (m * mod + 2048) >> 12
  }
  return Math.max(Math.min(m, upper), lower)
}

/** Items that halve Speed while held: Macho Brace and the Gen 4 Power items. */
const EV_ITEMS = [
  'macho-brace',
  'power-anklet',
  'power-band',
  'power-belt',
  'power-bracer',
  'power-lens',
  'power-weight',
]

/** Final Speed, for the two Gen 4 moves that read it (Gyro Ball, Payback). */
export function getFinalSpeed(gen: number, p: Combatant, field: CalcField): number {
  const weather = field.weather ?? ''
  let speed = getModifiedStat(p.rawStats.spe, p.boosts.spe, gen)
  const mods: number[] = []

  if (
    (hasAbility(p, 'unburden') && p.abilityOn) ||
    (hasAbility(p, 'chlorophyll') && weather === 'sun') ||
    (hasAbility(p, 'swift-swim') && weather === 'rain')
  ) {
    mods.push(8192)
  } else if (hasAbility(p, 'quick-feet') && p.status !== '') {
    mods.push(6144)
  } else if (hasAbility(p, 'slow-start') && p.abilityOn) {
    mods.push(2048)
  }

  if (!(hasAbility(p, 'unburden') && p.abilityOn)) {
    if (hasItem(p, 'choice-scarf')) mods.push(6144)
    else if (hasItem(p, 'iron-ball', ...EV_ITEMS)) mods.push(2048)
    else if (hasItem(p, 'quick-powder') && named(p, 'ditto')) mods.push(8192)
  }

  speed = OF32(pokeRound((speed * chainMods(mods, 410, 131172)) / 4096))
  if (hasStatus(p, 'par') && !hasAbility(p, 'quick-feet')) {
    speed = Math.floor(OF32(speed * 25) / 100)
  }
  speed = Math.min(gen <= 2 ? 999 : 10000, speed)
  return Math.max(0, speed)
}

/** Gen 1-2: every stat has its stage applied up front, and Speed its full modifier. */
export function computeFinalStats(gen: number, a: Combatant, d: Combatant, field: CalcField) {
  for (const p of [a, d]) {
    for (const stat of ['atk', 'def', 'spa', 'spd'] as StatId[]) {
      p.stats[stat] = getModifiedStat(p.rawStats[stat], p.boosts[stat as 'atk'], gen)
    }
    p.stats.spe = getFinalSpeed(gen, p, field)
  }
}

/** Seismic Toss, Night Shade, Dragon Rage, Sonic Boom. 0 means "not a fixed-damage move". */
export function handleFixedDamageMoves(attacker: Combatant, move: ResolvedMove): number {
  if (move.slug === 'seismic-toss' || move.slug === 'night-shade') return attacker.level
  if (move.slug === 'dragon-rage') return 40
  if (move.slug === 'sonic-boom') return 20
  return 0
}

export function checkAirLock(p: Combatant, field: CalcField) {
  if (hasAbility(p, 'air-lock', 'cloud-nine')) field.weather = null
}

/** Castform's typing follows the weather. */
export function checkForecast(p: Combatant, field: CalcField) {
  if (!hasAbility(p, 'forecast') || !named(p, 'castform')) return
  const byWeather: Record<string, string> = { sun: 'fire', rain: 'water', hail: 'ice' }
  const type = byWeather[field.weather ?? ''] ?? 'normal'
  const id = typesInGeneration(p.gen).find((t) => t.name === type)?.id
  if (id == null) return
  p.types = [type]
  p.typeIds = [id]
}

export function checkIntimidate(source: Combatant, target: Combatant) {
  const blocked = hasAbility(target, 'clear-body', 'white-smoke', 'hyper-cutter')
  if (hasAbility(source, 'intimidate') && source.abilityOn && !blocked) {
    target.boosts.atk = hasAbility(target, 'simple')
      ? Math.max(-6, target.boosts.atk - 2)
      : Math.max(-6, target.boosts.atk - 1)
  }
}

/** Download raises whichever attacking stat the target's weaker defence invites. */
export function checkDownload(source: Combatant, target: Combatant) {
  if (!hasAbility(source, 'download')) return
  if (target.stats.spd <= target.stats.def) source.boosts.spa = Math.min(6, source.boosts.spa + 1)
  else source.boosts.atk = Math.min(6, source.boosts.atk + 1)
}

/** Klutz suppresses the held item -- except Iron Ball in Gen 4, and the Speed-halving items. */
export function checkKlutz(p: Combatant) {
  if (p.gen === 4 && hasItem(p, 'iron-ball')) return
  if (hasAbility(p, 'klutz') && !EV_ITEMS.includes(p.item)) {
    p.item = ''
    p.itemName = ''
    p.itemRecord = null
  }
}

/** Positive stages only, for Punishment. */
export function countBoosts(gen: number, boosts: Combatant['boosts']): number {
  const stats =
    gen === 1
      ? (['atk', 'def', 'spa', 'spe'] as const)
      : (['atk', 'def', 'spa', 'spd', 'spe'] as const)
  return stats.reduce((sum, s) => sum + Math.max(0, boosts[s]), 0)
}

export function copySide(side: SideConditions): SideConditions {
  return { ...side }
}

export function copyField(field: CalcField): CalcField {
  return {
    ...field,
    attackerSide: copySide(field.attackerSide),
    defenderSide: copySide(field.defenderSide),
  }
}
