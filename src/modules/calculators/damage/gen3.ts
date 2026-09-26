/**
 * Generation 3 -- a port of the reference's calc/src/mechanics/gen3.ts.
 *
 * What Gen 3 adds over Gen 2, and why it is its own module:
 *   - ABILITIES: immunities (Levitate, Flash Fire, Volt/Water Absorb, Wonder Guard,
 *     Soundproof), stat doublers (Huge/Pure Power), pinch boosts (Blaze, Torrent,
 *     Overgrow, Swarm at 1/3 HP), Thick Fat, Guts, Hustle, Marvel Scale, Intimidate,
 *     and weather abilities (Drizzle et al. set the weather the reader picks;
 *     Air Lock / Cloud Nine suppress it).
 *   - NATURES, EVs and IVs replace Stat Exp and DVs -- carried by the combatant.
 *   - Items boost the ATTACK STAT (1.1x type items, 1.5x Choice Band), not the
 *     damage; the category is still by type (moveResolve.ts).
 *   - Burn, screens, weather and crits move to the end of the formula, and the
 *     random factor is 85..100 over 100: sixteen rolls.
 *   - Stat stages use the modern table, and a crit ignores only the stages that
 *     hurt the attacker.
 */

import { hasAbility, hasItem, hasStatus, named, type Combatant } from './combatant'
import { statDescriptionText, type RawDesc } from './desc'
import { itemBoostType } from './items'
import type { MechanicsOutput } from './mechanics'
import type { CalcField } from './model'
import { retype, type ResolvedMove } from './moveResolve'
import {
  checkAirLock,
  checkForecast,
  checkIntimidate,
  effectivenessPair,
  getFinalSpeed,
  getModifiedStat,
  handleFixedDamageMoves,
  TYPELESS,
} from './util'

export function calculateADV(
  gen: number,
  attacker: Combatant,
  defender: Combatant,
  move: ResolvedMove,
  field: CalcField,
): MechanicsOutput {
  checkAirLock(attacker, field)
  checkAirLock(defender, field)
  checkForecast(attacker, field)
  checkForecast(defender, field)
  checkIntimidate(attacker, defender)
  checkIntimidate(defender, attacker)
  attacker.stats.spe = getFinalSpeed(gen, attacker, field)
  defender.stats.spe = getFinalSpeed(gen, defender, field)

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

  if (move.category === 'status' && move.slug !== 'nature-power') return out(0, 1, 'status')

  if (move.slug === 'weather-ball') {
    const w = field.weather
    retype(
      move,
      w === 'sun'
        ? 'fire'
        : w === 'rain'
          ? 'water'
          : w === 'sand'
            ? 'rock'
            : w === 'hail'
              ? 'ice'
              : 'normal',
      gen,
    )
    move.category = move.type === 'rock' ? 'physical' : 'special'
    desc.weather = field.weather ?? undefined
    desc.moveType = move.type
    desc.moveBP = move.bp
  } else if (move.slug === 'brick-break') {
    field.defenderSide.reflect = false
    field.defenderSide.lightScreen = false
  }

  const [t1, t2] = effectivenessPair(gen, move, defender, {
    reorder: true,
    ghostRevealed: field.defenderSide.foresight,
  })
  const typeEffectiveness = t1 * t2
  if (typeEffectiveness === 0) return out(0, 0, 'immune')

  if (
    (hasAbility(defender, 'flash-fire') && move.type === 'fire') ||
    (hasAbility(defender, 'levitate') && move.type === 'ground') ||
    (hasAbility(defender, 'volt-absorb') && move.type === 'electric') ||
    (hasAbility(defender, 'water-absorb') && move.type === 'water') ||
    (hasAbility(defender, 'wonder-guard') && move.type !== TYPELESS && typeEffectiveness <= 1) ||
    (hasAbility(defender, 'soundproof') && move.isSound)
  ) {
    desc.defenderAbility = defender.abilityName
    return out(0, typeEffectiveness, 'ability')
  }

  desc.HPEVs = statDescriptionText(gen, defender, 'hp')

  const fixed = handleFixedDamageMoves(attacker, move)
  if (fixed) return out(fixed, typeEffectiveness)

  if (move.variable) return out(0, typeEffectiveness, 'variable')

  if (move.hits > 1) desc.hits = move.hits

  let bp = calculateBasePowerADV(attacker, defender, move, desc)
  if (bp === 0) return out(0, typeEffectiveness, 'variable')
  bp = calculateBPModsADV(attacker, move, desc, bp)

  const isCritical = move.isCrit && !hasAbility(defender, 'battle-armor', 'shell-armor')
  const at = calculateAttackADV(gen, attacker, defender, move, desc, isCritical)
  const df = calculateDefenseADV(gen, defender, move, desc, isCritical)
  const lv = attacker.level

  const hitDamage = (power: number, attack: number) => {
    let base = Math.floor(Math.floor((Math.floor((2 * lv) / 5 + 2) * attack * power) / df) / 50)
    base = calculateFinalModsADV(base, attacker, move, field, desc, isCritical)
    base = Math.floor(base * t1)
    base = Math.floor(base * t2)
    const rolls: number[] = []
    for (let i = 85; i <= 100; i++) rolls.push(Math.max(1, Math.floor((base * i) / 100)))
    return rolls
  }

  const damage = hitDamage(bp, at)
  if (move.hits <= 1) return out(damage, typeEffectiveness)

  const origAtk = desc.attackBoost
  const origDef = desc.defenseBoost
  const matrix: number[][] = [damage]
  for (let times = 1; times < move.hits; times++) {
    const newAt = calculateAttackADV(gen, attacker, defender, move, desc, isCritical)
    let newBp = calculateBasePowerADV(attacker, defender, move, desc, times + 1)
    newBp = calculateBPModsADV(attacker, move, desc, newBp)
    matrix[times] = hitDamage(newBp, newAt)
  }
  desc.attackBoost = origAtk
  desc.defenseBoost = origDef
  return out(matrix, typeEffectiveness)
}

export function calculateBasePowerADV(
  attacker: Combatant,
  defender: Combatant,
  move: ResolvedMove,
  desc: RawDesc,
  hit = 1,
): number {
  let bp = move.bp
  switch (move.slug) {
    case 'flail':
    case 'reversal': {
      const p = Math.floor((48 * attacker.curHp) / attacker.maxHp)
      bp = p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20
      desc.moveBP = bp
      break
    }
    case 'eruption':
    case 'water-spout':
      bp = Math.max(1, Math.floor((150 * attacker.curHp) / attacker.maxHp))
      desc.moveBP = bp
      break
    case 'low-kick': {
      const w = defender.weightKg
      bp = w >= 200 ? 120 : w >= 100 ? 100 : w >= 50 ? 80 : w >= 25 ? 60 : w >= 10 ? 40 : 20
      desc.moveBP = bp
      break
    }
    case 'facade':
      if (hasStatus(attacker, 'par', 'psn', 'tox', 'brn')) {
        bp = move.bp * 2
        desc.moveBP = bp
      }
      break
    case 'nature-power':
      move.category = 'physical'
      bp = 60
      desc.moveName = 'Swift'
      break
    case 'triple-kick':
      bp = hit * 10
      desc.moveBP = move.hits === 2 ? 30 : move.hits === 3 ? 60 : 10
      break
    default:
      bp = move.bp
  }
  return bp
}

export function calculateBPModsADV(
  attacker: Combatant,
  move: ResolvedMove,
  desc: RawDesc,
  basePower: number,
): number {
  if (
    attacker.curHp <= attacker.maxHp / 3 &&
    ((hasAbility(attacker, 'overgrow') && move.type === 'grass') ||
      (hasAbility(attacker, 'blaze') && move.type === 'fire') ||
      (hasAbility(attacker, 'torrent') && move.type === 'water') ||
      (hasAbility(attacker, 'swarm') && move.type === 'bug'))
  ) {
    basePower = Math.floor(basePower * 1.5)
    desc.attackerAbility = attacker.abilityName
  }
  return basePower
}

export function calculateAttackADV(
  gen: number,
  attacker: Combatant,
  defender: Combatant,
  move: ResolvedMove,
  desc: RawDesc,
  isCritical = false,
): number {
  const isPhysical = move.category === 'physical'
  const attackStat = isPhysical ? 'atk' : 'spa'
  desc.attackEVs = statDescriptionText(gen, attacker, attackStat)

  let at = attacker.rawStats[attackStat]

  if (isPhysical && hasAbility(attacker, 'huge-power', 'pure-power')) {
    at *= 2
    desc.attackerAbility = attacker.abilityName
  }

  const boostType = itemBoostType(attacker.item)
  if (
    (!hasItem(attacker, 'sea-incense') && boostType !== undefined && move.type === boostType) ||
    (move.slug === 'struggle' && boostType === 'normal')
  ) {
    at = Math.floor(at * 1.1)
    desc.attackerItem = attacker.itemName
  } else if (hasItem(attacker, 'sea-incense') && move.type === 'water') {
    at = Math.floor(at * 1.05)
    desc.attackerItem = attacker.itemName
  } else if (
    (isPhysical && hasItem(attacker, 'choice-band')) ||
    (!isPhysical && hasItem(attacker, 'soul-dew') && named(attacker, 'latios', 'latias'))
  ) {
    at = Math.floor(at * 1.5)
    desc.attackerItem = attacker.itemName
  } else if (
    (!isPhysical && hasItem(attacker, 'deep-sea-tooth') && named(attacker, 'clamperl')) ||
    (!isPhysical && hasItem(attacker, 'light-ball') && named(attacker, 'pikachu')) ||
    (isPhysical && hasItem(attacker, 'thick-club') && named(attacker, 'cubone', 'marowak'))
  ) {
    at *= 2
    desc.attackerItem = attacker.itemName
  }

  if (hasAbility(defender, 'thick-fat') && (move.type === 'fire' || move.type === 'ice')) {
    at = Math.floor(at / 2)
    desc.defenderAbility = defender.abilityName
  }

  if (
    (isPhysical &&
      (hasAbility(attacker, 'hustle') ||
        (hasAbility(attacker, 'guts') && attacker.status !== ''))) ||
    (!isPhysical && attacker.abilityOn && hasAbility(attacker, 'plus', 'minus'))
  ) {
    at = Math.floor(at * 1.5)
    desc.attackerAbility = attacker.abilityName
  }

  const boost = attacker.boosts[attackStat]
  if (boost > 0 || (!isCritical && boost < 0)) {
    at = getModifiedStat(at, boost, gen)
    desc.attackBoost = boost
  }
  return at
}

export function calculateDefenseADV(
  gen: number,
  defender: Combatant,
  move: ResolvedMove,
  desc: RawDesc,
  isCritical = false,
): number {
  const isPhysical = move.category === 'physical'
  const defenseStat = isPhysical ? 'def' : 'spd'
  desc.defenseEVs = statDescriptionText(gen, defender, defenseStat)

  let df = defender.rawStats[defenseStat]

  if (!isPhysical && hasItem(defender, 'soul-dew') && named(defender, 'latios', 'latias')) {
    df = Math.floor(df * 1.5)
    desc.defenderItem = defender.itemName
  } else if (
    (!isPhysical && hasItem(defender, 'deep-sea-scale') && named(defender, 'clamperl')) ||
    (isPhysical && hasItem(defender, 'metal-powder') && named(defender, 'ditto'))
  ) {
    df *= 2
    desc.defenderItem = defender.itemName
  }

  if (isPhysical && hasAbility(defender, 'marvel-scale') && defender.status !== '') {
    df = Math.floor(df * 1.5)
    desc.defenderAbility = defender.abilityName
  }

  if (move.slug === 'explosion' || move.slug === 'self-destruct') df = Math.floor(df / 2)

  const boost = defender.boosts[defenseStat]
  if (boost < 0 || (!isCritical && boost > 0)) {
    df = getModifiedStat(df, boost, gen)
    desc.defenseBoost = boost
  }
  return df
}

function calculateFinalModsADV(
  baseDamage: number,
  attacker: Combatant,
  move: ResolvedMove,
  field: CalcField,
  desc: RawDesc,
  isCritical: boolean,
): number {
  const isPhysical = move.category === 'physical'
  if (hasStatus(attacker, 'brn') && isPhysical && !hasAbility(attacker, 'guts')) {
    baseDamage = Math.floor(baseDamage / 2)
    desc.isBurned = true
  }

  if (!isCritical) {
    if (isPhysical && field.defenderSide.reflect) {
      baseDamage = Math.floor(baseDamage / 2)
      desc.isReflect = true
    } else if (!isPhysical && field.defenderSide.lightScreen) {
      baseDamage = Math.floor(baseDamage / 2)
      desc.isLightScreen = true
    }
  }

  const w = field.weather
  if ((w === 'sun' && move.type === 'fire') || (w === 'rain' && move.type === 'water')) {
    baseDamage = Math.floor(baseDamage * 1.5)
    desc.weather = w
  } else if (
    (w === 'sun' && move.type === 'water') ||
    (w === 'rain' && move.type === 'fire') ||
    (move.slug === 'solar-beam' && (w === 'rain' || w === 'sand' || w === 'hail'))
  ) {
    baseDamage = Math.floor(baseDamage / 2)
    desc.weather = w
  }

  if (hasAbility(attacker, 'flash-fire') && attacker.abilityOn && move.type === 'fire') {
    baseDamage = Math.floor(baseDamage * 1.5)
    desc.attackerAbility = attacker.abilityName
  }

  baseDamage = (isPhysical ? Math.max(1, baseDamage) : baseDamage) + 2
  if (isCritical) {
    baseDamage *= 2
    desc.isCritical = true
  }

  if (move.slug === 'pursuit' && field.defenderSide.switchingOut) {
    baseDamage = Math.floor(baseDamage * 2)
    desc.isSwitching = true
  }

  if (move.slug === 'weather-ball' && field.weather) {
    baseDamage *= 2
    desc.moveBP = move.bp * 2
  }

  if (field.attackerSide.charge && move.type === 'electric') {
    baseDamage *= 2
    desc.isCharge = true
  }

  if (attacker.types.includes(move.type)) baseDamage = Math.floor(baseDamage * 1.5)
  return baseDamage
}
