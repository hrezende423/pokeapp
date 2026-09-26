/**
 * The human-readable result, ported from the reference's calc/src/desc.ts:
 *
 *   "252+ Atk Choice Band Tauros Body Slam vs. 252 HP / 0 Def Chansey:
 *    120-142 (17.1 - 20.2%) -- guaranteed 5HKO after Leftovers recovery"
 *
 * THE SAME WORDS AS THE REFERENCE, so a line from here can be pasted beside one
 * from calc.pokemonshowdown.com and compared token for token -- which is how the
 * suite checks it. Names are the bundle's display names; the reference's own are
 * the same strings for every Gen 1-4 species, move and item except form suffixes.
 *
 * KO CHANCE: exact for up to three hits of a single move, including entry hazards
 * (Spikes, Stealth Rock) and the end-of-turn effects a Gen 1-4 singles battle can
 * produce (weather chip, Leftovers, Black Sludge, poison, burn, trapping moves).
 * Leech Seed and Nightmare exist in the era but the calculator offers no control
 * for them, so they never apply -- the same state as the reference's defaults.
 */

import { hasAbility, hasItem, hasStatus, hasType, type Combatant } from './combatant'
import type { MechanicsOutput } from './mechanics'
import type { CalcField, Damage, StatId, Weather } from './model'
import type { ResolvedMove } from './moveResolve'
import { typeIdOf } from './moveResolve'
import { typeMultiplier } from './util'

export interface RawDesc {
  attackerName: string
  moveName: string
  defenderName: string
  attackBoost?: number
  defenseBoost?: number
  attackEVs?: string
  defenseEVs?: string
  HPEVs?: string
  attackerItem?: string
  defenderItem?: string
  attackerAbility?: string
  defenderAbility?: string
  rivalry?: 'buffed' | 'nerfed'
  isBurned?: boolean
  isSwitching?: boolean
  isCharge?: boolean
  moveBP?: number
  moveType?: string
  hits?: number
  weather?: Weather
  isReflect?: boolean
  isLightScreen?: boolean
  isCritical?: boolean
}

const STAT_DISPLAY: Record<StatId, string> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
}
const STAT_KEY: Record<StatId, string> = {
  hp: 'hp',
  atk: 'attack',
  def: 'defense',
  spa: 'special-attack',
  spd: 'special-defense',
  spe: 'speed',
}
const WEATHER_NAME: Record<Weather, string> = {
  sun: 'Sun',
  rain: 'Rain',
  sand: 'Sand',
  hail: 'Hail',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "252+ Atk", "0 HP", "4 SpD 20 IVs" -- Gen 3+ only; Gen 1-2 lines carry no spread. */
export function statDescriptionText(gen: number, p: Combatant, stat: StatId): string {
  const key = STAT_KEY[stat]
  const ev = p.input.effort[key as keyof typeof p.input.effort] ?? 0
  const { increased, decreased } = p.nature
  const sign =
    stat === 'hp' || increased === decreased
      ? ''
      : increased === key
        ? '+'
        : decreased === key
          ? '-'
          : ''
  let text = `${ev}${sign} ${STAT_DISPLAY[stat]}`
  const iv = p.input.individual[key as keyof typeof p.input.individual] ?? 0
  if (gen >= 3 && iv !== 31) text += ` ${iv} IVs`
  return text
}

const appendIfSet = (s: string, add?: string) => (add ? `${s}${add} ` : s)

function descriptionLevels(a: Combatant, d: Combatant): [string, string] {
  if (a.level !== d.level) {
    return [a.level === 100 ? '' : `Lvl ${a.level}`, d.level === 100 ? '' : `Lvl ${d.level}`]
  }
  const level = [100, 50, 5].includes(a.level) ? '' : `Lvl ${a.level}`
  return [level, level]
}

export function buildDescription(desc: RawDesc, attacker: Combatant, defender: Combatant): string {
  const [attackerLevel, defenderLevel] = descriptionLevels(attacker, defender)
  let out = ''
  if (desc.attackBoost) out += `${desc.attackBoost > 0 ? '+' : ''}${desc.attackBoost} `
  out = appendIfSet(out, attackerLevel)
  out = appendIfSet(out, desc.attackEVs)
  out = appendIfSet(out, desc.attackerItem)
  out = appendIfSet(out, desc.attackerAbility)
  out = appendIfSet(out, desc.rivalry)
  if (desc.isBurned) out += 'burned '
  out += `${desc.attackerName} `
  if (desc.isSwitching) out += 'switching boosted '
  if (desc.isCharge) out += 'Charge boosted '
  out += `${desc.moveName} `
  const moveType = desc.moveType ? cap(desc.moveType) : undefined
  if (desc.moveBP && moveType) out += `(${desc.moveBP} BP ${moveType}) `
  else if (desc.moveBP) out += `(${desc.moveBP} BP) `
  else if (moveType) out += `(${moveType}) `
  if (desc.hits) out += `(${desc.hits} hits) `
  out += 'vs. '
  if (desc.defenseBoost) out += `${desc.defenseBoost > 0 ? '+' : ''}${desc.defenseBoost} `
  out = appendIfSet(out, defenderLevel)
  out = appendIfSet(out, desc.HPEVs)
  if (desc.defenseEVs) out += `/ ${desc.defenseEVs} `
  out = appendIfSet(out, desc.defenderItem)
  out = appendIfSet(out, desc.defenderAbility)
  out += desc.defenderName
  if (desc.weather) out += ` in ${WEATHER_NAME[desc.weather]}`
  if (desc.isReflect) out += ' through Reflect'
  else if (desc.isLightScreen) out += ' through Light Screen'
  if (desc.isCritical) out += ' on a critical hit'
  return out
}

// ------------------------------------------------------------------ ranges

/** [min, max] of one use: a fixed number, one roll set, or summed per-hit extremes. */
export function damageRange(damage: Damage): [number, number] {
  if (typeof damage === 'number') return [damage, damage]
  if (damage.length === 0) return [0, 0]
  if (typeof damage[0] === 'number') {
    const d = damage as number[]
    return [d[0], d[d.length - 1]]
  }
  const m = damage as number[][]
  return [m.reduce((s, r) => s + r[0], 0), m.reduce((s, r) => s + r[r.length - 1], 0)]
}

/** The reference's percent: floored to one decimal, never rounded up. */
export function toPercent(value: number, maxHp: number): number {
  return maxHp > 0 ? Math.floor((value * 1000) / maxHp) / 10 : 0
}

// -------------------------------------------------------------- KO chance

/** Every roll of every hit summed, reduced to a manageable distribution past three hits. */
function combine(damage: Damage): [number[], boolean] {
  if (typeof damage === 'number') return [[damage], false]
  if (damage.length >= 16 && typeof damage[0] === 'number') return [damage as number[], false]

  const reduce = (dist: number[], scale: number): number[] => {
    const len = dist.length / scale
    const out: number[] = []
    out[0] = dist[0]
    out[len - 1] = dist[dist.length - 1]
    for (let i = 1; i < len - 1; i++) out[i] = dist[Math.round(i * scale + scale / 2)]
    return out
  }
  const combineTwo = (a: number[], b: number[]) =>
    a.flatMap((x) => b.map((y) => x + y)).sort((x, y) => x - y)

  const dists = damage as number[][]
  let combined = [0]
  const numRolls = dists[0].length
  const numAccuracy = numRolls === 16 && dists.length === 3 ? 3 : 2
  let approximate = false
  for (let i = 0; i < dists.length; i++) {
    combined = combineTwo(combined, dists[i])
    if (i >= numAccuracy) {
      combined = reduce(combined, dists[i].length)
      approximate = true
    }
  }
  return [combined, approximate]
}

function serializeText(arr: string[]): string {
  if (arr.length === 0) return ''
  if (arr.length === 1) return arr[0]
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`
  return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`
}

function getHazards(
  gen: number,
  defender: Combatant,
  field: CalcField,
): { damage: number; texts: string[] } {
  let damage = 0
  const texts: string[] = []
  const side = field.defenderSide

  if (side.stealthRock && !hasAbility(defender, 'magic-guard')) {
    const rockId = typeIdOf('rock', gen)
    const eff = defender.typeIds.reduce(
      (m, id, i) => m * typeMultiplier(gen, rockId, 'rock', id, defender.types[i]),
      1,
    )
    damage += Math.max(Math.floor((eff * defender.maxHp) / 8), 1)
    texts.push('Stealth Rock')
  }

  if (!hasType(defender, 'flying') && !hasAbility(defender, 'magic-guard', 'levitate')) {
    if (side.spikes === 1) {
      damage += Math.floor(defender.maxHp / 8)
      texts.push(gen === 2 ? 'Spikes' : '1 layer of Spikes')
    } else if (side.spikes === 2) {
      damage += Math.floor(defender.maxHp / 6)
      texts.push('2 layers of Spikes')
    } else if (side.spikes === 3) {
      damage += Math.floor(defender.maxHp / 4)
      texts.push('3 layers of Spikes')
    }
  }
  return { damage, texts }
}

const TRAPPING = ['bind', 'clamp', 'fire-spin', 'magma-storm', 'sand-tomb', 'whirlpool', 'wrap']

/** Net HP change at end of turn: positive heals, negative hurts. */
function getEndOfTurn(
  gen: number,
  attacker: Combatant,
  defender: Combatant,
  move: ResolvedMove,
  field: CalcField,
): { damage: number; texts: string[] } {
  let damage = 0
  const texts: string[] = []
  const max = defender.maxHp
  const loseItem = move.slug === 'knock-off' && !hasAbility(defender, 'sticky-hold')
  const w = field.weather

  if (w === 'sun') {
    if (hasAbility(defender, 'dry-skin', 'solar-power')) {
      damage -= Math.floor(max / 8)
      texts.push(`${defender.abilityName} damage`)
    }
  } else if (w === 'rain') {
    if (hasAbility(defender, 'dry-skin')) {
      damage += Math.floor(max / 8)
      texts.push('Dry Skin recovery')
    } else if (hasAbility(defender, 'rain-dish')) {
      damage += Math.floor(max / 16)
      texts.push('Rain Dish recovery')
    }
  } else if (w === 'sand') {
    if (
      !hasType(defender, 'rock', 'ground', 'steel') &&
      !hasAbility(defender, 'magic-guard', 'sand-veil')
    ) {
      damage -= Math.floor(max / (gen === 2 ? 8 : 16))
      texts.push('sandstorm damage')
    }
  } else if (w === 'hail') {
    if (hasAbility(defender, 'ice-body')) {
      damage += Math.floor(max / 16)
      texts.push('Ice Body recovery')
    } else if (!hasType(defender, 'ice') && !hasAbility(defender, 'magic-guard', 'snow-cloak')) {
      damage -= Math.floor(max / 16)
      texts.push('hail damage')
    }
  }

  if (hasItem(defender, 'leftovers') && !loseItem) {
    damage += Math.floor(max / 16)
    texts.push('Leftovers recovery')
  } else if (hasItem(defender, 'black-sludge') && !loseItem) {
    if (hasType(defender, 'poison')) {
      damage += Math.floor(max / 16)
      texts.push('Black Sludge recovery')
    } else if (!hasAbility(defender, 'magic-guard', 'klutz')) {
      damage -= Math.floor(max / 8)
      texts.push('Black Sludge damage')
    }
  } else if (
    hasItem(defender, 'sticky-barb') &&
    !loseItem &&
    !hasAbility(defender, 'magic-guard', 'klutz')
  ) {
    damage -= Math.floor(max / 8)
    texts.push('Sticky Barb damage')
  }

  if (hasStatus(defender, 'psn')) {
    if (hasAbility(defender, 'poison-heal')) {
      damage += Math.floor(max / 8)
      texts.push('Poison Heal')
    } else if (!hasAbility(defender, 'magic-guard')) {
      damage -= Math.floor(max / (gen === 1 ? 16 : 8))
      texts.push('poison damage')
    }
  } else if (hasStatus(defender, 'tox')) {
    if (hasAbility(defender, 'poison-heal')) {
      damage += Math.floor(max / 8)
      texts.push('Poison Heal')
    } else if (!hasAbility(defender, 'magic-guard')) {
      texts.push('toxic damage')
    }
  } else if (hasStatus(defender, 'brn')) {
    if (hasAbility(defender, 'heatproof')) {
      damage -= Math.floor(max / 16)
      texts.push('reduced burn damage')
    } else if (!hasAbility(defender, 'magic-guard')) {
      damage -= Math.floor(max / (gen < 2 ? 16 : 8))
      texts.push('burn damage')
    }
  } else if (
    hasStatus(defender, 'slp') &&
    hasAbility(attacker, 'bad-dreams') &&
    !hasAbility(defender, 'magic-guard')
  ) {
    damage -= Math.floor(max / 8)
    texts.push('Bad Dreams')
  }

  if (!hasAbility(defender, 'magic-guard') && TRAPPING.includes(move.slug) && gen > 1) {
    damage -= Math.floor(max / 16)
    texts.push('trapping damage')
  }

  return { damage, texts }
}

function computeKOChance(
  damage: number[],
  hp: number,
  eot: number,
  hits: number,
  maxHp: number,
  toxicCounter: number,
): number {
  let toxicDamage = 0
  if (toxicCounter > 0) {
    toxicDamage = Math.floor((toxicCounter * maxHp) / 16)
    toxicCounter++
  }
  const n = damage.length
  if (hits === 1) {
    if (eot - toxicDamage > 0) {
      eot = 0
      toxicDamage = 0
    }
    for (let i = 0; i < n; i++) {
      if (damage[n - 1] - eot + toxicDamage < hp) return 0
      if (damage[i] - eot + toxicDamage >= hp) return (n - i) / n
    }
  }
  let sum = 0
  let lastc = 0
  for (let i = 0; i < n; i++) {
    const c =
      i === 0 || damage[i] !== damage[i - 1]
        ? computeKOChance(
            damage,
            hp - damage[i] + eot - toxicDamage,
            eot,
            hits - 1,
            maxHp,
            toxicCounter,
          )
        : lastc
    if (c === 1) {
      sum += n - i
      break
    }
    sum += c
    lastc = c
  }
  return sum / n
}

function predictTotal(
  damage: number,
  eot: number,
  hits: number,
  toxicCounter: number,
  maxHp: number,
): number {
  let toxicDamage = 0
  let lastTurnEot = eot
  if (toxicCounter > 0) {
    for (let i = 0; i < hits - 1; i++) toxicDamage += Math.floor(((toxicCounter + i) * maxHp) / 16)
    lastTurnEot -= Math.floor(((toxicCounter + (hits - 1)) * maxHp) / 16)
  }
  let total =
    hits > 1
      ? damage * hits - eot * (hits - 1) + toxicDamage
      : damage - eot * (hits - 1) + toxicDamage
  if (lastTurnEot < 0) total -= lastTurnEot
  return total
}

export function koChanceText(gen: number, result: MechanicsOutput): string {
  const { attacker, defender, move, field } = result
  const [damage, approximate] = combine(result.damage)
  if (damage.length === 0 || Number.isNaN(damage[0]) || damage[damage.length - 1] === 0) return ''
  if (damage[0] >= defender.maxHp) return 'guaranteed OHKO'

  const hazards = getHazards(gen, defender, field)
  const eot = getEndOfTurn(gen, attacker, defender, move, field)
  const toxicCounter = 0
  const qualifier = approximate ? 'approx. ' : ''
  const hazardsText = hazards.texts.length ? ` after ${serializeText(hazards.texts)}` : ''
  const afterText =
    hazards.texts.length || eot.texts.length
      ? ` after ${serializeText(hazards.texts.concat(eot.texts))}`
      : ''
  const afterTextNoHazards = eot.texts.length ? ` after ${serializeText(eot.texts)}` : ''
  const round = (c: number) => Math.max(Math.min(Math.round(c * 1000), 999), 1) / 10

  const koText = (without: number | undefined, withEot: number | undefined, n: number): string => {
    const turn = n === 1 ? 'OHKO' : `${n}HKO`
    let text = qualifier
    if (without === undefined || withEot === undefined) return `${text}possible ${turn}`
    if (without + withEot === 0) return `${text}not a KO`
    if (without === 1) return `guaranteed OHKO${hazardsText}`
    if (without > 0) {
      if (withEot === 1)
        return `${text}${round(without)}% chance to ${turn}${hazardsText} (guaranteed ${turn}${afterTextNoHazards})`
      if (withEot > without) {
        return `${text}${round(without)}% chance to ${turn}${hazardsText} (${qualifier}${round(withEot)}% chance to ${turn}${afterTextNoHazards})`
      }
      return `${text}${round(without)}% chance to ${turn}${hazardsText}`
    }
    if (withEot === 1) return `guaranteed ${turn}${afterText}`
    if (withEot > 0) text += `${round(withEot)}% chance to ${turn}${afterText}`
    return text
  }

  const hp = defender.curHp - hazards.damage
  const chance = computeKOChance(damage, hp, 0, 1, defender.maxHp, 0)
  const chanceWithEot = computeKOChance(damage, hp, eot.damage, 1, defender.maxHp, toxicCounter)
  if (chance + chanceWithEot > 0) return koText(chance, chanceWithEot, 1)

  for (let i = 2; i <= 4; i++) {
    const c = computeKOChance(damage, hp, eot.damage, i, defender.maxHp, toxicCounter)
    if (c > 0) return koText(0, c, i)
  }
  for (let i = 5; i <= 9; i++) {
    if (predictTotal(damage[0], eot.damage, i, toxicCounter, defender.maxHp) >= hp)
      return koText(0, 1, i)
    if (
      predictTotal(damage[damage.length - 1], eot.damage, i, toxicCounter, defender.maxHp) >= hp
    ) {
      return koText(undefined, undefined, i)
    }
  }
  return ''
}
