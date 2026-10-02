/**
 * What a move DOES besides its damage, decoded per generation from the game's own
 * move table (battleData: the effect constant and its chance) with the PokeAPI
 * move meta filling the generation-agnostic parts (which stat, by how much).
 *
 * CHANCES ARE THE GAME'S. Gen 1 encodes them in the effect constant and compares
 * a random byte (pokered engine/battle/effects.asm): SIDE_EFFECT1 is 26/256 for
 * burn/freeze/paralysis/flinch, 52/256 for poison; SIDE_EFFECT2 77/256 (103/256
 * poison); stat-down side effects 85/256; confusion 25/256. Gen 2 stores a byte
 * per move (data/moves/moves.asm, `percent`). Gen 3-4 store a percent.
 *
 * An effect the engine does not simulate is reported as `unsimulated` with its
 * constant, and the turn engine logs it -- it is never silently treated as a
 * plain hit without saying so.
 */

import { getMove } from '../../../data'
import type { BattleData } from '../battleData'
import { gameMove } from '../battleData'
import type { BoostKey } from './state'

export type Ailment =
  'slp' | 'psn' | 'tox' | 'brn' | 'frz' | 'par' | 'confusion' | 'flinch' | 'attract'

export interface StatChange {
  stat: BoostKey
  delta: number
}

export interface MoveSem {
  moveId: number
  slug: string
  effect: string
  damaging: boolean
  /** Status inflicted on the target: primary (chance 1) or secondary. */
  ailment?: { kind: Ailment; chance: number }
  /** Stat changes, on the user or the target, with their chance. */
  stats?: { target: 'self' | 'foe'; changes: StatChange[]; chance: number }
  /** Fraction of damage dealt drained (positive) or taken as recoil (negative). */
  drain?: number
  /** Fraction of max HP healed (Recover family); 'weather' for Moonlight family; 'rest'. */
  heal?: number | 'weather' | 'rest'
  multiHit?: boolean
  twoTurn?: 'charge' | 'fly' | 'dig' | 'dive' | 'bounce' | 'shadow-force'
  recharge?: boolean
  selfDestruct?: boolean
  ohko?: boolean
  screen?: 'reflect' | 'light-screen' | 'safeguard' | 'mist' | 'lucky-chant' | 'tailwind'
  weather?: 'sun' | 'rain' | 'sand' | 'hail'
  hazard?: 'spikes' | 'toxic-spikes' | 'stealth-rock'
  clearHazards?: boolean
  forceSwitch?: boolean
  pivot?: 'u-turn' | 'baton-pass'
  protect?: boolean
  substitute?: boolean
  leechSeed?: boolean
  haze?: boolean
  focusEnergy?: boolean
  bellyDrum?: boolean
  rampage?: boolean
  trap?: boolean
  counter?: 'physical' | 'special'
  fixed?: 'level' | number | 'half-hp' | 'psywave'
  trickRoom?: boolean
  painSplit?: boolean
  destinyBond?: boolean
  perishSong?: boolean
  yawn?: boolean
  encore?: boolean
  disable?: boolean
  taunt?: boolean
  curse?: boolean
  meanLook?: boolean
  rapidSpin?: boolean
  healBell?: boolean
  /** An effect the engine does not simulate. */
  unsimulated?: string
}

const STAT_OF: Record<string, BoostKey> = {
  attack: 'atk',
  defense: 'def',
  'special-attack': 'spa',
  'special-defense': 'spd',
  speed: 'spe',
  accuracy: 'acc',
  evasion: 'eva',
}

const AILMENT_OF: Record<string, Ailment> = {
  paralysis: 'par',
  sleep: 'slp',
  freeze: 'frz',
  burn: 'brn',
  poison: 'psn',
  confusion: 'confusion',
  infatuation: 'attract',
}

const BYTE = (n: number) => n / 256

/** Gen 1 side-effect chances from the effect constant (pokered effects.asm). */
function gen1Chance(effect: string, kind: Ailment | 'stat'): number {
  if (/SIDE_EFFECT1$/.test(effect)) return kind === 'psn' ? BYTE(52) : BYTE(26)
  if (/SIDE_EFFECT2$/.test(effect)) return kind === 'psn' ? BYTE(103) : BYTE(77)
  if (/_DOWN_SIDE_EFFECT$/.test(effect)) return BYTE(85)
  if (effect === 'CONFUSION_SIDE_EFFECT') return BYTE(25)
  return 1
}

const SPECIAL: Record<string, Partial<MoveSem>> = {
  'u-turn': { pivot: 'u-turn' },
  'baton-pass': { pivot: 'baton-pass' },
  'rapid-spin': { rapidSpin: true },
  spikes: { hazard: 'spikes' },
  'toxic-spikes': { hazard: 'toxic-spikes' },
  'stealth-rock': { hazard: 'stealth-rock' },
  reflect: { screen: 'reflect' },
  'light-screen': { screen: 'light-screen' },
  safeguard: { screen: 'safeguard' },
  mist: { screen: 'mist' },
  'lucky-chant': { screen: 'lucky-chant' },
  tailwind: { screen: 'tailwind' },
  'sunny-day': { weather: 'sun' },
  'rain-dance': { weather: 'rain' },
  sandstorm: { weather: 'sand' },
  hail: { weather: 'hail' },
  protect: { protect: true },
  detect: { protect: true },
  endure: { protect: true },
  substitute: { substitute: true },
  'leech-seed': { leechSeed: true },
  haze: { haze: true },
  'focus-energy': { focusEnergy: true },
  'belly-drum': { bellyDrum: true },
  roar: { forceSwitch: true },
  whirlwind: { forceSwitch: true },
  counter: { counter: 'physical' },
  'mirror-coat': { counter: 'special' },
  'seismic-toss': { fixed: 'level' },
  'night-shade': { fixed: 'level' },
  'dragon-rage': { fixed: 40 },
  'sonic-boom': { fixed: 20 },
  'super-fang': { fixed: 'half-hp' },
  psywave: { fixed: 'psywave' },
  'trick-room': { trickRoom: true },
  'pain-split': { painSplit: true },
  'destiny-bond': { destinyBond: true },
  'perish-song': { perishSong: true },
  yawn: { yawn: true },
  encore: { encore: true },
  disable: { disable: true },
  taunt: { taunt: true },
  curse: { curse: true },
  'mean-look': { meanLook: true },
  block: { meanLook: true },
  'spider-web': { meanLook: true },
  'heal-bell': { healBell: true },
  aromatherapy: { healBell: true },
  rest: { heal: 'rest' },
  moonlight: { heal: 'weather' },
  'morning-sun': { heal: 'weather' },
  synthesis: { heal: 'weather' },
  explosion: { selfDestruct: true },
  'self-destruct': { selfDestruct: true },
  thrash: { rampage: true },
  'petal-dance': { rampage: true },
  outrage: { rampage: true },
  'hyper-beam': { recharge: true },
  'giga-impact': { recharge: true },
  'blast-burn': { recharge: true },
  'hydro-cannon': { recharge: true },
  'frenzy-plant': { recharge: true },
  'rock-wrecker': { recharge: true },
  'roar-of-time': { recharge: true },
  'solar-beam': { twoTurn: 'charge' },
  'razor-wind': { twoTurn: 'charge' },
  'skull-bash': { twoTurn: 'charge' },
  'sky-attack': { twoTurn: 'charge' },
  fly: { twoTurn: 'fly' },
  dig: { twoTurn: 'dig' },
  dive: { twoTurn: 'dive' },
  bounce: { twoTurn: 'bounce' },
  'shadow-force': { twoTurn: 'shadow-force' },
  fissure: { ohko: true },
  'horn-drill': { ohko: true },
  guillotine: { ohko: true },
  'sheer-cold': { ohko: true },
}

/** Moves whose distinctive effect is out of scope for the engine (logged when used). */
const UNSIMULATED = new Set([
  'transform',
  'metronome',
  'mimic',
  'mirror-move',
  'sketch',
  'conversion',
  'conversion-2',
  'bide',
  'teleport',
  'splash',
  'pay-day',
  'thief',
  'covet',
  'trick',
  'switcheroo',
  'knock-off',
  'snatch',
  'magic-coat',
  'imprison',
  'grudge',
  'spite',
  'future-sight',
  'doom-desire',
  'wish',
  'nature-power',
  'assist',
  'sleep-talk',
  'copycat',
  'me-first',
  'role-play',
  'skill-swap',
  'gastro-acid',
  'worry-seed',
  'power-trick',
  'power-swap',
  'guard-swap',
  'heart-swap',
  'psych-up',
  'acupressure',
  'recycle',
  'embargo',
  'heal-block',
  'gravity',
  'miracle-eye',
  'odor-sleuth',
  'foresight',
  'lock-on',
  'mind-reader',
  'camouflage',
  'stockpile',
  'spit-up',
  'swallow',
  'uproar',
  'beat-up',
  'present',
  'fling',
  'natural-gift',
  'pluck',
  'bug-bite',
  'last-resort',
  'sucker-punch',
  'focus-punch',
  'feint',
  'magnet-rise',
  'aqua-ring',
  'ingrain',
  'healing-wish',
  'lunar-dance',
  'memento',
  'refresh',
  'nightmare',
  'attract',
  'torment',
  'follow-me',
  'helping-hand',
  'charge',
  'mud-sport',
  'water-sport',
  'tickle',
  'flatter',
  'swagger',
  'superpower',
  'overheat',
  'psycho-boost',
  'draco-meteor',
  'leaf-storm',
  'close-combat',
  'hammer-arm',
  'fake-out',
  'rollout',
  'ice-ball',
  'fury-cutter',
  'rage',
  'endeavor',
  'reversal',
  'flail',
  'brick-break',
  'secret-power',
  'weather-ball',
  'facade',
  'smelling-salts',
  'wake-up-slap',
  'revenge',
  'avenge',
  'payback',
  'assurance',
  'pursuit',
  'gyro-ball',
  'trump-card',
  'punishment',
  'wring-out',
  'crush-grip',
  'brine',
  'struggle',
])

/** Moves above whose ENGINE damage already accounts for the quirk (power formulas). */
const DAMAGE_HANDLED = new Set([
  'superpower',
  'overheat',
  'psycho-boost',
  'draco-meteor',
  'leaf-storm',
  'close-combat',
  'hammer-arm',
  'reversal',
  'flail',
  'weather-ball',
  'facade',
  'brine',
  'gyro-ball',
  'punishment',
  'wring-out',
  'crush-grip',
  'pursuit',
  'revenge',
  'avenge',
  'payback',
  'assurance',
  'smelling-salts',
  'wake-up-slap',
  'trump-card',
  'present',
  'struggle',
  'secret-power',
  'brick-break',
  'fake-out',
  'endeavor',
])

export function moveSem(gen: number, data: BattleData, moveId: number): MoveSem {
  const move = getMove(moveId)
  const gm = gameMove(data, moveId)
  const slug = move?.name ?? ''
  const effect = gm?.e ?? ''
  const power = gm?.p ?? move?.power ?? 0
  const sem: MoveSem = {
    moveId,
    slug,
    effect,
    damaging:
      power > 0 ||
      [
        'seismic-toss',
        'night-shade',
        'dragon-rage',
        'sonic-boom',
        'super-fang',
        'psywave',
        'counter',
        'mirror-coat',
        'fissure',
        'horn-drill',
        'guillotine',
        'sheer-cold',
        'endeavor',
        'flail',
        'reversal',
        'return',
        'frustration',
        'magnitude',
        'low-kick',
        'grass-knot',
        'gyro-ball',
        'present',
        'hidden-power',
        'eruption',
        'water-spout',
        'crush-grip',
        'wring-out',
        'punishment',
        'trump-card',
        'natural-gift',
        'fling',
        'beat-up',
      ].includes(slug),
  }
  Object.assign(sem, SPECIAL[slug] ?? {})
  if (!move) return sem
  const meta = move.meta
  // ---- ailment
  const ailmentName = meta?.ailment ?? null
  let kind: Ailment | null = ailmentName ? (AILMENT_OF[ailmentName] ?? null) : null
  if (slug === 'toxic' || /BADLY_POISON|TOXIC/.test(effect)) kind = sem.damaging ? kind : 'tox'
  if ((meta?.flinch_chance ?? 0) > 0 && !kind) kind = 'flinch'
  if (kind) {
    let chance: number
    if (!sem.damaging) chance = 1
    else if (gen === 1) chance = gen1Chance(effect, kind)
    else if (gen === 2) chance = gm?.cb != null ? BYTE(gm.cb) : (gm?.c ?? 0) / 100
    else chance = (gm?.c ?? meta?.ailment_chance ?? meta?.flinch_chance ?? 0) / 100
    if (kind === 'flinch' && gen >= 3 && !gm?.c) chance = (meta?.flinch_chance ?? 0) / 100
    if (chance > 0) sem.ailment = { kind, chance }
  }
  // ---- stat changes
  const changes = (move.stat_changes ?? [])
    .map((c) => ({ stat: STAT_OF[c.stat ?? ''], delta: c.change }))
    .filter((c): c is StatChange => !!c.stat)
  if (changes.length && !sem.bellyDrum && !sem.curse) {
    const cat = meta?.category ?? ''
    const self =
      cat === 'damage+raise' ||
      move.target === 'user' ||
      (cat === 'net-good-stats' && changes.every((c) => c.delta > 0) && move.target === 'user')
    let chance = 1
    if (sem.damaging) {
      if (gen === 1) chance = gen1Chance(effect, 'stat')
      else if (gen === 2) chance = gm?.cb != null ? BYTE(gm.cb) : (gm?.c ?? 0) / 100
      else chance = (gm?.c ?? meta?.stat_chance ?? 0) / 100
      // Self-lowering after-effects (Superpower, Overheat, Close Combat) always happen.
      if (changes.every((c) => c.delta < 0) && self) chance = 1
    }
    if (gen === 1) {
      // Gen 1 had one Special stat: a special-defense change is a special change.
      for (const c of changes) if (c.stat === 'spd') c.stat = 'spa'
    }
    if (chance > 0) sem.stats = { target: self ? 'self' : 'foe', changes, chance }
  }
  // ---- drain / recoil / heal
  const drain = meta?.drain ?? 0
  if (drain) sem.drain = drain / 100
  const healing = meta?.healing ?? 0
  if (healing > 0 && sem.heal == null) sem.heal = healing / 100
  if (move.meta?.min_hits && move.meta?.max_hits && move.meta.max_hits > 1) sem.multiHit = true
  if (meta?.ailment === 'trap' && sem.damaging) sem.trap = true
  if (UNSIMULATED.has(slug) && !DAMAGE_HANDLED.has(slug)) sem.unsimulated = effect || slug
  return sem
}
