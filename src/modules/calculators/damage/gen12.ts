/**
 * Generations 1 and 2 -- a port of the reference's calc/src/mechanics/gen12.ts.
 *
 * The quirks that make this its own module rather than Gen 3 with switches off:
 *   - A Gen 1 critical hit DOUBLES THE LEVEL and reads the UNMODIFIED stats --
 *     no stages, no burn, no screens. Gen 2 doubles the damage instead, and only
 *     ignores stages/burn/screens when the attacker's stage is not ahead of the
 *     defender's.
 *   - Stats above 255 are both quartered (and wrapped to a byte) before the
 *     division -- the Game Boy's one-byte arithmetic, visible in results.
 *   - The random factor is 217..255 over 255: THIRTY-NINE rolls, not sixteen.
 *   - Gen 1 multiplies the two halves of a dual typing separately, flooring after
 *     each; a base damage of exactly 1 skips the random factor entirely.
 *   - Gen 2 items are few and specific: Light Ball, Thick Club, Metal Powder and
 *     the 1.1x type boosters -- with Dragon Fang a no-op and Dragon Scale
 *     boosting Dragon instead, a real Gen 2 bug the reference reproduces.
 *   - Stat stages use Gen 1-2's own table and are applied up front.
 */

import { hasItem, hasStatus, named, type Combatant } from './combatant'
import type { RawDesc } from './desc'
import { itemBoostType } from './items'
import type { CalcField } from './model'
import type { ResolvedMove } from './moveResolve'
import type { MechanicsOutput } from './mechanics'
import { computeFinalStats, effectivenessPair, handleFixedDamageMoves, TYPELESS } from './util'

/** Present's glitched Gen 2 lookup: a type's internal index. */
const PRESENT_TYPE_INDEX: Record<string, number> = {
  normal: 0,
  fighting: 1,
  flying: 2,
  poison: 3,
  ground: 4,
  rock: 5,
  bug: 7,
  ghost: 8,
  steel: 9,
  [TYPELESS]: 19,
  fire: 20,
  water: 21,
  grass: 22,
  electric: 23,
  psychic: 24,
  ice: 25,
  dragon: 26,
  dark: 27,
}

export function calculateRBYGSC(
  gen: number,
  attacker: Combatant,
  defender: Combatant,
  move: ResolvedMove,
  field: CalcField,
): MechanicsOutput {
  computeFinalStats(gen, attacker, defender, field)

  const desc: RawDesc = {
    attackerName: attacker.name,
    moveName: move.name,
    defenderName: defender.name,
  }
  const out = (
    damage: MechanicsOutput['damage'],
    effectiveness = 1,
    reason: MechanicsOutput['noDamageReason'] = null,
  ): MechanicsOutput => ({
    damage,
    desc,
    move,
    attacker,
    defender,
    field,
    effectiveness,
    noDamageReason: reason,
  })

  if (move.category === 'status') return out(0, 1, 'status')

  // Gen 1 fixed-damage moves ignore the type chart (a Gen 1 Seismic Toss hits a Ghost).
  if (gen === 1) {
    const fixed = handleFixedDamageMoves(attacker, move)
    if (fixed) return out(fixed)
  }

  const [t1, t2] = effectivenessPair(gen, move, defender, {
    reorder: gen === 2,
    ghostRevealed: field.defenderSide.foresight,
  })
  const typeEffectiveness = t1 * t2
  if (typeEffectiveness === 0) return out(0, 0, 'immune')

  if (gen === 2) {
    const fixed = handleFixedDamageMoves(attacker, move)
    if (fixed) return out(fixed, typeEffectiveness)
  }

  if (move.variable) return out(0, typeEffectiveness, 'variable')

  if (move.hits > 1) desc.hits = move.hits

  // Flail and Reversal are variable BP and never crit.
  if (move.slug === 'flail' || move.slug === 'reversal') {
    move.isCrit = false
    const p = Math.floor((48 * attacker.curHp) / attacker.maxHp)
    move.bp = p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20
    desc.moveBP = move.bp
  } else if (move.slug === 'present' && !move.bp) {
    move.bp = 40
  }

  if (move.bp === 0) return out(0, typeEffectiveness, 'variable')

  const isPhysical = move.category === 'physical'
  const attackStat = isPhysical ? 'atk' : 'spa'
  const defenseStat = isPhysical ? 'def' : 'spd'
  let at = attacker.stats[attackStat]
  let df = defender.stats[defenseStat]

  const ignoreMods =
    move.isCrit &&
    (gen === 1 || (gen === 2 && attacker.boosts[attackStat] <= defender.boosts[defenseStat]))

  let lv = attacker.level
  if (ignoreMods) {
    at = attacker.rawStats[attackStat]
    df = defender.rawStats[defenseStat]
    if (gen === 1) {
      lv *= 2
      desc.isCritical = true
    }
  } else {
    if (attacker.boosts[attackStat] !== 0) desc.attackBoost = attacker.boosts[attackStat]
    if (defender.boosts[defenseStat] !== 0) desc.defenseBoost = defender.boosts[defenseStat]
    if (isPhysical && hasStatus(attacker, 'brn')) {
      at = Math.floor(at / 2)
      desc.isBurned = true
    }
  }

  if (move.slug === 'explosion' || move.slug === 'self-destruct') df = Math.floor(df / 2)

  if (!ignoreMods) {
    if (isPhysical && field.defenderSide.reflect) {
      df *= 2
      desc.isReflect = true
    } else if (!isPhysical && field.defenderSide.lightScreen) {
      df *= 2
      desc.isLightScreen = true
    }
  }

  if (
    (named(attacker, 'pikachu') && hasItem(attacker, 'light-ball') && !isPhysical) ||
    (named(attacker, 'cubone', 'marowak') && hasItem(attacker, 'thick-club') && isPhysical)
  ) {
    at *= 2
    desc.attackerItem = attacker.itemName
  }

  if (at > 255 || df > 255) {
    at = Math.floor(at / 4) % 256
    df = Math.floor(df / 4) % 256
  }

  // Gen 2 Present reads the Pokemon's secondary types for its level and defence.
  if (move.slug === 'present') {
    at = 10
    df = Math.max(PRESENT_TYPE_INDEX[attacker.types[1] ?? attacker.types[0]] ?? 0, 1)
    lv = Math.max(PRESENT_TYPE_INDEX[defender.types[1] ?? defender.types[0]] ?? 0, 1)
  }

  if (named(defender, 'ditto') && hasItem(defender, 'metal-powder')) {
    df = Math.floor(df * 1.5)
    desc.defenderItem = defender.itemName
  }

  let baseDamage = Math.floor(
    Math.floor((Math.floor((2 * lv) / 5 + 2) * Math.max(1, at) * move.bp) / Math.max(1, df)) / 50,
  )

  if (gen === 2 && move.isCrit) {
    baseDamage *= 2
    desc.isCritical = true
  }

  if (move.slug === 'pursuit' && field.defenderSide.switchingOut) {
    baseDamage = Math.floor(baseDamage * 2)
    desc.isSwitching = true
  }

  // Gen 2 only: Dragon Fang does nothing and Dragon Scale boosts Dragon.
  const boostType = hasItem(attacker, 'dragon-fang')
    ? undefined
    : itemBoostType(hasItem(attacker, 'dragon-scale') ? 'dragon-fang' : attacker.item)
  if (
    boostType &&
    (move.type === boostType || (move.slug === 'struggle' && boostType === 'normal'))
  ) {
    baseDamage = Math.floor(baseDamage * 1.1)
    desc.attackerItem = attacker.itemName
  }

  baseDamage = Math.min(997, baseDamage) + 2

  const w = field.weather
  if ((w === 'sun' && move.type === 'fire') || (w === 'rain' && move.type === 'water')) {
    baseDamage = Math.floor(baseDamage * 1.5)
    desc.weather = w
  } else if (
    (w === 'sun' && move.type === 'water') ||
    (w === 'rain' && (move.type === 'fire' || move.slug === 'solar-beam'))
  ) {
    baseDamage = Math.floor(baseDamage / 2)
    desc.weather = w
  }

  if (attacker.types.includes(move.type)) baseDamage = Math.floor(baseDamage * 1.5)

  if (gen === 1) {
    baseDamage = Math.floor(baseDamage * t1)
    baseDamage = Math.floor(baseDamage * t2)
  } else {
    baseDamage = Math.floor(baseDamage * typeEffectiveness)
  }

  // Flail and Reversal don't use the random factor.
  if (move.slug === 'flail' || move.slug === 'reversal') return out(baseDamage, typeEffectiveness)

  const roll = (b: number) => {
    const rolls: number[] = []
    for (let i = 217; i <= 255; i++) {
      if (gen === 2) rolls.push(Math.max(1, Math.floor((b * i) / 255)))
      else rolls.push(b === 1 ? 1 : Math.floor((b * i) / 255))
    }
    return rolls
  }

  const damage = roll(baseDamage)
  if (move.hits <= 1) return out(damage, typeEffectiveness)

  const matrix: number[][] = [damage]
  if (move.slug === 'triple-kick') {
    desc.moveBP = move.hits === 2 ? 30 : move.hits === 3 ? 60 : 10
    for (let hit = 1; hit < move.hits; hit++) {
      const next = { ...move, hits: 1, bp: (hit + 1) * 10 }
      matrix[hit] = calculateRBYGSC(
        gen,
        cloneCombatant(attacker),
        cloneCombatant(defender),
        next,
        field,
      ).damage as number[]
    }
  } else {
    for (let hit = 1; hit < move.hits; hit++) matrix[hit] = roll(baseDamage)
  }
  return out(matrix, typeEffectiveness)
}

/** A fresh copy for a recursive per-hit calculation, so its stat pass cannot compound. */
export function cloneCombatant(p: Combatant): Combatant {
  return {
    ...p,
    rawStats: { ...p.rawStats },
    stats: { ...p.rawStats },
    boosts: { ...p.boosts },
    types: [...p.types],
    typeIds: [...p.typeIds],
  }
}
