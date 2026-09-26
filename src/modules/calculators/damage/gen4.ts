/**
 * Generation 4 -- a port of the reference's calc/src/mechanics/gen4.ts.
 *
 * What Gen 4 changes, and why it is its own module:
 *   - THE PHYSICAL/SPECIAL SPLIT becomes per MOVE (moveResolve.ts reads
 *     `damage_class` from here on instead of the type).
 *   - Type-boost items move from the attack stat to BASE POWER, at 1.2x; the
 *     Plates, Muscle Band, Wise Glasses and the three Orbs join them.
 *   - Choice Specs, Life Orb, Expert Belt, Metronome and the resist berries arrive,
 *     and the random factor moves BEFORE STAB, with STAB, the two type halves and
 *     the late modifiers each floored inside the roll.
 *   - Abilities: Mold Breaker, Technician, Iron Fist, Reckless, Adaptability,
 *     Tinted Lens, Filter/Solid Rock, Sniper, Simple, Unaware, Scrappy, Normalize,
 *     Rivalry, Download, Slow Start, Solar Power, Flower Gift, Heatproof, Dry Skin,
 *     Motor Drive, Klutz.
 *   - Sandstorm raises a Rock type's Special Defense by half; Gravity grounds.
 *   - Many new BP-from-state moves: Gyro Ball, Payback, Punishment, Brine, Crush
 *     Grip, Wring Out, Wake-Up Slap, Grass Knot, Fling, Natural Gift, Judgment.
 */

import { hasAbility, hasItem, hasStatus, hasType, named, type Combatant } from './combatant'
import { statDescriptionText, type RawDesc } from './desc'
import { berryResistType, isPlate, itemBoostType, naturalGift } from './items'
import type { MechanicsOutput } from './mechanics'
import type { CalcField } from './model'
import { retype, typeName, type ResolvedMove } from './moveResolve'
import {
  checkAirLock,
  checkDownload,
  checkForecast,
  checkIntimidate,
  checkKlutz,
  countBoosts,
  effectivenessPair,
  getFinalSpeed,
  getModifiedStat,
  getSimpleModifiedStat,
  handleFixedDamageMoves,
  TYPELESS,
} from './util'

/** Abilities Mold Breaker switches off, as the reference lists them for Gen 4. */
const MOLD_BREAKER_IGNORES = [
  'battle-armor',
  'clear-body',
  'damp',
  'dry-skin',
  'filter',
  'flash-fire',
  'flower-gift',
  'heatproof',
  'hyper-cutter',
  'immunity',
  'inner-focus',
  'insomnia',
  'keen-eye',
  'leaf-guard',
  'levitate',
  'lightning-rod',
  'limber',
  'magma-armor',
  'marvel-scale',
  'motor-drive',
  'oblivious',
  'own-tempo',
  'sand-veil',
  'shell-armor',
  'shield-dust',
  'simple',
  'snow-cloak',
  'solid-rock',
  'soundproof',
  'sticky-hold',
  'storm-drain',
  'sturdy',
  'suction-cups',
  'tangled-feet',
  'thick-fat',
  'unaware',
  'vital-spirit',
  'volt-absorb',
  'water-absorb',
  'water-veil',
  'white-smoke',
  'wonder-guard',
]

export function calculateDPP(
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
  checkKlutz(attacker)
  checkKlutz(defender)
  checkIntimidate(attacker, defender)
  checkIntimidate(defender, attacker)
  // Download reads the target's stats as they stand, which in Gen 4 are the raw ones.
  checkDownload(attacker, defender)
  checkDownload(defender, attacker)
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

  if (hasAbility(attacker, 'mold-breaker') && MOLD_BREAKER_IGNORES.includes(defender.ability)) {
    defender.ability = ''
    defender.abilityName = ''
    desc.attackerAbility = attacker.abilityName
  }

  const isCritical = move.isCrit && !hasAbility(defender, 'battle-armor', 'shell-armor')

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
    desc.weather = field.weather ?? undefined
    desc.moveType = move.type
  } else if (move.slug === 'judgment' && isPlate(attacker.item)) {
    retype(move, itemBoostType(attacker.item)!, gen)
  } else if (move.slug === 'natural-gift' && attacker.item.endsWith('-berry')) {
    const gift = attacker.itemRecord ? naturalGift(attacker.itemRecord.id) : null
    if (gift) {
      move.typeId = gift.typeId
      move.type = typeName(gift.typeId, gen)
      move.bp = gift.power
    } else {
      retype(move, 'normal', gen)
      move.bp = 1
    }
    desc.attackerItem = attacker.itemName
    desc.moveBP = move.bp
    desc.moveType = move.type
  } else if (move.slug === 'brick-break') {
    field.defenderSide.reflect = false
    field.defenderSide.lightScreen = false
  }

  if (hasAbility(attacker, 'normalize') && move.slug !== 'struggle') {
    retype(move, 'normal', gen)
    desc.attackerAbility = attacker.abilityName
  }

  const ghostRevealed = hasAbility(attacker, 'scrappy') || field.defenderSide.foresight
  let [t1, t2] = effectivenessPair(gen, move, defender, {
    reorder: true,
    ghostRevealed,
    gravity: field.gravity,
  })
  let typeEffectiveness = t1 * t2

  // An Iron Ball grounds its holder (and Klutz does not stop it in Gen 4).
  if (typeEffectiveness === 0 && move.type === 'ground' && hasItem(defender, 'iron-ball')) {
    if (t1 === 0) t1 = 1
    else if (defender.types[1] && t2 === 0) t2 = 1
    typeEffectiveness = t1 * t2
  }

  if (typeEffectiveness === 0) return out(0, 0, 'immune')

  const ignoresWonderGuard = move.type === TYPELESS || move.slug === 'fire-fang'
  if (
    (!ignoresWonderGuard && hasAbility(defender, 'wonder-guard') && typeEffectiveness <= 1) ||
    (move.type === 'fire' && hasAbility(defender, 'flash-fire')) ||
    (move.type === 'water' && hasAbility(defender, 'dry-skin', 'water-absorb')) ||
    (move.type === 'electric' && hasAbility(defender, 'motor-drive', 'volt-absorb')) ||
    (move.type === 'ground' &&
      !field.gravity &&
      !hasItem(defender, 'iron-ball') &&
      hasAbility(defender, 'levitate')) ||
    (move.isSound && hasAbility(defender, 'soundproof'))
  ) {
    desc.defenderAbility = defender.abilityName
    return out(0, typeEffectiveness, 'ability')
  }

  desc.HPEVs = statDescriptionText(gen, defender, 'hp')

  const fixed = handleFixedDamageMoves(attacker, move)
  if (fixed) return out(fixed, typeEffectiveness)

  if (move.variable) return out(0, typeEffectiveness, 'variable')

  if (move.hits > 1) desc.hits = move.hits

  const isPhysical = move.category === 'physical'

  let basePower = calculateBasePowerDPP(gen, attacker, defender, move, field, desc)
  if (basePower === 0) return out(0, typeEffectiveness, 'variable')
  basePower = calculateBPModsDPP(attacker, defender, move, field, desc, basePower)

  const attack = calculateAttackDPP(gen, attacker, defender, move, field, desc, isCritical)
  const defense = calculateDefenseDPP(gen, attacker, defender, move, field, desc, isCritical)

  let stabMod = 1
  if (attacker.types.includes(move.type)) {
    if (hasAbility(attacker, 'adaptability')) {
      stabMod = 2
      desc.attackerAbility = attacker.abilityName
    } else stabMod = 1.5
  }

  let filterMod = 1
  if (hasAbility(defender, 'filter', 'solid-rock') && typeEffectiveness > 1) {
    filterMod = 0.75
    desc.defenderAbility = defender.abilityName
  }

  // Metronome counts consecutive uses; a single calculation is the first, so 1x.
  const metronomeMod = 1

  let ebeltMod = 1
  if (hasItem(attacker, 'expert-belt') && typeEffectiveness > 1) {
    ebeltMod = 1.2
    desc.attackerItem = attacker.itemName
  }

  let tintedMod = 1
  if (hasAbility(attacker, 'tinted-lens') && typeEffectiveness < 1) {
    tintedMod = 2
    desc.attackerAbility = attacker.abilityName
  }

  let berryMod = 1
  const resist = berryResistType(defender.item)
  if (
    resist !== undefined &&
    move.type === resist &&
    (typeEffectiveness > 1 || move.type === 'normal')
  ) {
    berryMod = 0.5
    desc.defenderItem = defender.itemName
  }

  const hitDamage = (bp: number, atk: number, withBerry: boolean) => {
    let base = Math.floor(
      Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * bp * atk) / 50) / defense,
    )
    if (hasStatus(attacker, 'brn') && isPhysical && !hasAbility(attacker, 'guts')) {
      base = Math.floor(base * 0.5)
      desc.isBurned = true
    }
    base = calculateFinalModsDPP(base, attacker, move, field, desc, isCritical)
    const rolls: number[] = []
    for (let i = 0; i < 16; i++) {
      let d = Math.floor((base * (85 + i)) / 100)
      d = Math.floor(d * stabMod)
      d = Math.floor(d * t1)
      d = Math.floor(d * t2)
      d = Math.floor(d * filterMod)
      d = Math.floor(d * ebeltMod)
      d = Math.floor(d * metronomeMod)
      d = Math.floor(d * tintedMod)
      if (withBerry) d = Math.floor(d * berryMod)
      rolls.push(Math.max(1, d))
    }
    return rolls
  }

  const damage = hitDamage(basePower, attack, true)
  if (move.hits <= 1) return out(damage, typeEffectiveness)

  // The resist berry is eaten by the first hit, so later hits do not get it.
  const origAtk = desc.attackBoost
  const origDef = desc.defenseBoost
  const matrix: number[][] = [damage]
  for (let times = 1; times < move.hits; times++) {
    let bp = calculateBasePowerDPP(gen, attacker, defender, move, field, desc, times + 1)
    bp = calculateBPModsDPP(attacker, defender, move, field, desc, bp)
    const atk = calculateAttackDPP(gen, attacker, defender, move, field, desc, isCritical)
    matrix[times] = hitDamage(bp, atk, false)
  }
  desc.attackBoost = origAtk
  desc.defenseBoost = origDef
  return out(matrix, typeEffectiveness)
}

export function calculateBasePowerDPP(
  gen: number,
  attacker: Combatant,
  defender: Combatant,
  move: ResolvedMove,
  field: CalcField,
  desc: RawDesc,
  hit = 1,
): number {
  let bp = move.bp
  const turnOrder = attacker.stats.spe > defender.stats.spe ? 'first' : 'last'
  switch (move.slug) {
    case 'brine':
      if (defender.curHp <= defender.maxHp / 2) {
        bp *= 2
        desc.moveBP = bp
      }
      break
    case 'eruption':
    case 'water-spout':
      bp = Math.max(1, Math.floor((bp * attacker.curHp) / attacker.maxHp))
      desc.moveBP = bp
      break
    case 'facade':
      if (hasStatus(attacker, 'par', 'psn', 'tox', 'brn')) {
        bp = move.bp * 2
        desc.moveBP = bp
      }
      break
    case 'flail':
    case 'reversal': {
      const p = Math.floor((64 * attacker.curHp) / attacker.maxHp)
      bp = p <= 1 ? 200 : p <= 5 ? 150 : p <= 12 ? 100 : p <= 21 ? 80 : p <= 42 ? 40 : 20
      desc.moveBP = bp
      break
    }
    case 'fling':
      // The bundle's per-item `fling_power`; 0 (no damage) for an item that cannot be flung.
      bp = attacker.itemRecord?.fling_power ?? 0
      desc.moveBP = bp
      desc.attackerItem = attacker.itemName
      break
    case 'grass-knot':
    case 'low-kick': {
      const w = defender.weightKg
      bp = w >= 200 ? 120 : w >= 100 ? 100 : w >= 50 ? 80 : w >= 25 ? 60 : w >= 10 ? 40 : 20
      desc.moveBP = bp
      break
    }
    case 'gyro-ball':
      bp = Math.min(150, Math.floor((25 * defender.stats.spe) / Math.max(1, attacker.stats.spe)))
      desc.moveBP = bp
      break
    case 'payback':
      if (turnOrder !== 'first') {
        bp *= 2
        desc.moveBP = bp
      }
      break
    case 'punishment':
      bp = Math.min(200, 60 + 20 * countBoosts(gen, defender.boosts))
      desc.moveBP = bp
      break
    case 'pursuit': {
      const switching = field.defenderSide.switchingOut
      bp = move.bp * (switching ? 2 : 1)
      if (switching) desc.isSwitching = true
      desc.moveBP = bp
      break
    }
    case 'wake-up-slap':
      if (hasStatus(defender, 'slp')) {
        bp *= 2
        desc.moveBP = bp
      }
      break
    case 'nature-power':
      move.category = 'special'
      bp = 80
      desc.moveName = 'Tri Attack'
      break
    case 'crush-grip':
    case 'wring-out':
      bp = Math.floor((defender.curHp * 120) / defender.maxHp) + 1
      desc.moveBP = bp
      break
    case 'triple-kick':
      bp = hit * 10
      desc.moveBP = move.hits === 2 ? 30 : move.hits === 3 ? 60 : 10
      break
    case 'weather-ball':
      bp = move.bp * (field.weather ? 2 : 1)
      desc.moveBP = bp
      break
    default:
      bp = move.bp
  }
  return bp
}

export function calculateBPModsDPP(
  attacker: Combatant,
  defender: Combatant,
  move: ResolvedMove,
  field: CalcField,
  desc: RawDesc,
  basePower: number,
): number {
  if (field.attackerSide.charge && move.type === 'electric') {
    basePower = Math.floor(basePower * 2)
    desc.isCharge = true
  }

  if (hasAbility(attacker, 'technician') && basePower <= 60) {
    basePower = Math.floor(basePower * 1.5)
    desc.attackerAbility = attacker.abilityName
  }

  const isPhysical = move.category === 'physical'
  const boostType = itemBoostType(attacker.item)
  if (
    (hasItem(attacker, 'muscle-band') && isPhysical) ||
    (hasItem(attacker, 'wise-glasses') && !isPhysical)
  ) {
    basePower = Math.floor(basePower * 1.1)
    desc.attackerItem = attacker.itemName
  } else if (
    (boostType !== undefined && move.type === boostType) ||
    (hasItem(attacker, 'adamant-orb') &&
      named(attacker, 'dialga') &&
      (move.type === 'steel' || move.type === 'dragon')) ||
    (hasItem(attacker, 'lustrous-orb') &&
      named(attacker, 'palkia') &&
      (move.type === 'water' || move.type === 'dragon')) ||
    (hasItem(attacker, 'griseous-orb') &&
      named(attacker, 'giratina-origin') &&
      (move.type === 'ghost' || move.type === 'dragon')) ||
    (move.slug === 'struggle' && boostType === 'normal')
  ) {
    basePower = Math.floor(basePower * 1.2)
    desc.attackerItem = attacker.itemName
  }

  if (
    (hasAbility(attacker, 'reckless') && (move.recoil || move.hasCrashDamage)) ||
    (hasAbility(attacker, 'iron-fist') && move.isPunch)
  ) {
    basePower = Math.floor(basePower * 1.2)
    desc.attackerAbility = attacker.abilityName
  } else if (
    attacker.curHp <= attacker.maxHp / 3 &&
    ((hasAbility(attacker, 'overgrow') && move.type === 'grass') ||
      (hasAbility(attacker, 'blaze') && move.type === 'fire') ||
      (hasAbility(attacker, 'torrent') && move.type === 'water') ||
      (hasAbility(attacker, 'swarm') && move.type === 'bug'))
  ) {
    basePower = Math.floor(basePower * 1.5)
    desc.attackerAbility = attacker.abilityName
  }

  if (
    (hasAbility(defender, 'heatproof') && move.type === 'fire') ||
    (hasAbility(defender, 'thick-fat') && (move.type === 'fire' || move.type === 'ice'))
  ) {
    basePower = Math.floor(basePower * 0.5)
    desc.defenderAbility = defender.abilityName
  } else if (hasAbility(defender, 'dry-skin') && move.type === 'fire') {
    basePower = Math.floor(basePower * 1.25)
    desc.defenderAbility = defender.abilityName
  }

  if (hasAbility(attacker, 'rivalry') && attacker.gender !== 'N' && defender.gender !== 'N') {
    if (attacker.gender === defender.gender) {
      basePower = Math.floor(basePower * 1.25)
      desc.rivalry = 'buffed'
    } else {
      basePower = Math.floor(basePower * 0.75)
      desc.rivalry = 'nerfed'
    }
    desc.attackerAbility = attacker.abilityName
  }

  return basePower
}

export function calculateAttackDPP(
  gen: number,
  attacker: Combatant,
  defender: Combatant,
  move: ResolvedMove,
  field: CalcField,
  desc: RawDesc,
  isCritical = false,
): number {
  const isPhysical = move.category === 'physical'
  const attackStat = isPhysical ? 'atk' : 'spa'
  desc.attackEVs = statDescriptionText(gen, attacker, attackStat)
  let attack = attacker.rawStats[attackStat]
  const boost = attacker.boosts[attackStat]

  if (hasAbility(defender, 'unaware')) {
    desc.defenderAbility = defender.abilityName
  } else if (hasAbility(attacker, 'simple')) {
    attack = getSimpleModifiedStat(attack, boost)
    desc.attackerAbility = attacker.abilityName
    desc.attackBoost = boost
  } else if (boost > 0 || (!isCritical && boost < 0)) {
    attack = getModifiedStat(attack, boost, gen)
    desc.attackBoost = boost
  }

  if (isPhysical && hasAbility(attacker, 'pure-power', 'huge-power')) {
    attack *= 2
    desc.attackerAbility = attacker.abilityName
  } else if (
    field.weather === 'sun' &&
    hasAbility(attacker, isPhysical ? 'flower-gift' : 'solar-power')
  ) {
    attack = Math.floor(attack * 1.5)
    desc.attackerAbility = attacker.abilityName
    desc.weather = field.weather
  } else if (
    (isPhysical &&
      (hasAbility(attacker, 'hustle') ||
        (hasAbility(attacker, 'guts') && attacker.status !== ''))) ||
    (!isPhysical && attacker.abilityOn && hasAbility(attacker, 'plus', 'minus'))
  ) {
    attack = Math.floor(attack * 1.5)
    desc.attackerAbility = attacker.abilityName
  } else if (isPhysical && hasAbility(attacker, 'slow-start') && attacker.abilityOn) {
    attack = Math.floor(attack / 2)
    desc.attackerAbility = attacker.abilityName
  }

  if (
    (isPhysical ? hasItem(attacker, 'choice-band') : hasItem(attacker, 'choice-specs')) ||
    (!isPhysical && hasItem(attacker, 'soul-dew') && named(attacker, 'latios', 'latias'))
  ) {
    attack = Math.floor(attack * 1.5)
    desc.attackerItem = attacker.itemName
  } else if (
    (hasItem(attacker, 'light-ball') && named(attacker, 'pikachu')) ||
    (hasItem(attacker, 'thick-club') && named(attacker, 'cubone', 'marowak') && isPhysical) ||
    (hasItem(attacker, 'deep-sea-tooth') && named(attacker, 'clamperl') && !isPhysical)
  ) {
    attack *= 2
    desc.attackerItem = attacker.itemName
  }
  return attack
}

export function calculateDefenseDPP(
  gen: number,
  attacker: Combatant,
  defender: Combatant,
  move: ResolvedMove,
  field: CalcField,
  desc: RawDesc,
  isCritical = false,
): number {
  const isPhysical = move.category === 'physical'
  const defenseStat = isPhysical ? 'def' : 'spd'
  desc.defenseEVs = statDescriptionText(gen, defender, defenseStat)
  let defense = defender.rawStats[defenseStat]
  const boost = defender.boosts[defenseStat]

  if (hasAbility(attacker, 'unaware')) {
    desc.attackerAbility = attacker.abilityName
  } else if (hasAbility(defender, 'simple')) {
    defense = getSimpleModifiedStat(defense, boost)
    desc.defenderAbility = defender.abilityName
    desc.defenseBoost = boost
  } else if (boost < 0 || (!isCritical && boost > 0)) {
    defense = getModifiedStat(defense, boost, gen)
    desc.defenseBoost = boost
  }

  if (hasAbility(defender, 'marvel-scale') && defender.status !== '' && isPhysical) {
    defense = Math.floor(defense * 1.5)
    desc.defenderAbility = defender.abilityName
  } else if (hasAbility(defender, 'flower-gift') && field.weather === 'sun' && !isPhysical) {
    defense = Math.floor(defense * 1.5)
    desc.defenderAbility = defender.abilityName
    desc.weather = field.weather
  }

  if (hasItem(defender, 'soul-dew') && named(defender, 'latios', 'latias') && !isPhysical) {
    defense = Math.floor(defense * 1.5)
    desc.defenderItem = defender.itemName
  } else if (
    (hasItem(defender, 'deep-sea-scale') && named(defender, 'clamperl') && !isPhysical) ||
    (hasItem(defender, 'metal-powder') && named(defender, 'ditto') && isPhysical)
  ) {
    defense *= 2
    desc.defenderItem = defender.itemName
  }

  if (field.weather === 'sand' && hasType(defender, 'rock') && !isPhysical) {
    defense = Math.floor(defense * 1.5)
    desc.weather = field.weather
  }

  if (move.slug === 'explosion' || move.slug === 'self-destruct')
    defense = Math.floor(defense * 0.5)

  return Math.max(1, defense)
}

function calculateFinalModsDPP(
  baseDamage: number,
  attacker: Combatant,
  move: ResolvedMove,
  field: CalcField,
  desc: RawDesc,
  isCritical: boolean,
): number {
  const isPhysical = move.category === 'physical'
  if (!isCritical) {
    if (isPhysical && field.defenderSide.reflect) {
      baseDamage = Math.floor(baseDamage * 0.5)
      desc.isReflect = true
    } else if (!isPhysical && field.defenderSide.lightScreen) {
      baseDamage = Math.floor(baseDamage * 0.5)
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
    baseDamage = Math.floor(baseDamage * 0.5)
    desc.weather = w
  }

  if (hasAbility(attacker, 'flash-fire') && attacker.abilityOn && move.type === 'fire') {
    baseDamage = Math.floor(baseDamage * 1.5)
    desc.attackerAbility = attacker.abilityName
  }

  baseDamage += 2

  if (isCritical) {
    if (hasAbility(attacker, 'sniper')) {
      baseDamage *= 3
      desc.attackerAbility = attacker.abilityName
    } else baseDamage *= 2
    desc.isCritical = true
  }

  if (hasItem(attacker, 'life-orb')) {
    baseDamage = Math.floor(baseDamage * 1.3)
    desc.attackerItem = attacker.itemName
  }
  return baseDamage
}
