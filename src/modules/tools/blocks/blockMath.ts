/**
 * #19 Pokéblocks (Gen 3) and Poffins (Gen 4): what a set of berries makes.
 *
 * PURE, AND UI-FREE. Each function is the game's own routine, transcribed:
 *
 *   Pokéblock: pokeruby Blender_CalculatePokeblock / pokeemerald
 *   CalculatePokeblock (identical) and CalculatePokeblockColor; the computer
 *   players' berries from SetOpponentsBerryData. Integer arithmetic throughout,
 *   in the same order, because the rounding is where blends differ.
 *
 *   Poffin: pokeplatinum ov83_0223FFD4 (overlay 83, the cooking result) and
 *   Poffin_MakePoffin / Poffin_CalcLevel (src/poffin.c). Cooking time is in
 *   frames at 30 per second, so a 60-second cook leaves the flavours as they are.
 *
 * Berry tables are each generation's own (src/data/berryFlavors.ts, generated).
 */

import { GEN3_BERRIES, GEN4_BERRIES, type BerryRow } from '../../../data/berryFlavors'

export const FLAVORS = ['Spicy', 'Dry', 'Sweet', 'Bitter', 'Sour'] as const

const trunc = Math.trunc

// ------------------------------------------------------------------ Gen 3

/** Berry numbers (1-based, Gen 3 order: Cheri 1 ... Aspear 5) the computer players use. */
const NPC_SETS: readonly (readonly number[])[] = [
  // the player chose Cheri, Chesto, Pecha, Rawst, Aspear: a set without it
  [5, 4, 3],
  [1, 5, 4],
  [2, 1, 5],
  [3, 2, 1],
  [4, 3, 2],
  // any other berry: chosen by its number % 5
  [1, 3, 4],
  [2, 4, 5],
  [3, 5, 1],
  [4, 1, 2],
  [5, 2, 3],
]
/** Emerald's Blend Master (Lilycove): Spelon, Pamtre, Watmel, Durin, Belue. */
const MASTER = [31, 32, 33, 34, 35]
export const GEN3_ENIGMA = 43

export type Gen3Mode = 'npc' | 'master' | 'friends'

/** The berries the computer players add, given the player's (SetOpponentsBerryData). */
export function opponentBerries(player: number, players: number, mode: Gen3Mode): number[] {
  let set = player - 1
  if (set >= 5) set = (set % 5) + 5
  const out: number[] = []
  for (let i = 0; i < players - 1; i++) {
    let berry = NPC_SETS[set][i]
    if (mode === 'master') {
      set %= MASTER.length
      berry = MASTER[set]
      // A player who brings one of the Master's own berries gets the five below them.
      const diff = player - MASTER[0]
      if (diff >= 0 && diff < MASTER.length) berry -= MASTER.length
    }
    out.push(berry)
  }
  return out
}

export type BlockColor =
  | 'Red'
  | 'Blue'
  | 'Pink'
  | 'Green'
  | 'Yellow'
  | 'Purple'
  | 'Indigo'
  | 'Brown'
  | 'LiteBlue'
  | 'Olive'
  | 'Gray'
  | 'Black'
  | 'White'
  | 'Gold'

const SINGLE: readonly BlockColor[] = ['Red', 'Blue', 'Pink', 'Green', 'Yellow']
const DOUBLE: readonly BlockColor[] = ['Purple', 'Indigo', 'Brown', 'LiteBlue', 'Olive']

export interface Pokeblock {
  color: BlockColor
  /** Spicy, dry, sweet, bitter, sour. Null for a Black block: three random flavours at 2. */
  flavors: number[] | null
  /** The highest flavour: what the block raises a condition by, before the nature. */
  level: number
  /** Sheen added per block. */
  feel: number
}

const gen3Row = (n: number): BerryRow => {
  const row = GEN3_BERRIES[n - 1]
  if (!row) throw new Error(`no Gen 3 berry #${n}`)
  return row
}

function blockColor(f: number[], berries: number[], negatives: number): BlockColor {
  if (f.every((x) => x === 0) || negatives > 3) return 'Black'
  if (new Set(berries).size < berries.length) return 'Black'
  const present = f.flatMap((x, i) => (x > 0 ? [i] : []))
  if (present.length > 3) return 'White'
  if (present.length === 3) return 'Gray'
  if (f.some((x) => x > 50)) return 'Gold'
  if (present.length === 1) return SINGLE[present[0]]
  const [a, b] = present
  return DOUBLE[f[a] >= f[b] ? a : b]
}

/** Blend: berry numbers (1-based) for every player, and the top speed in RPM. */
export function blend(berries: number[], maxRpm: number): Pokeblock {
  const n = berries.length
  const sum = [0, 0, 0, 0, 0, 0]
  for (const b of berries) {
    const [, flavors, smooth] = gen3Row(b)
    flavors.forEach((x, i) => (sum[i] += x))
    sum[5] += smooth
  }
  const first = sum[0]
  for (let i = 0; i < 4; i++) sum[i] -= sum[i + 1]
  sum[4] -= first
  let negatives = 0
  for (let i = 0; i < 5; i++)
    if (sum[i] < 0) {
      sum[i] = 0
      negatives++
    }
  for (let i = 0; i < 5; i++) if (sum[i] > 0) sum[i] = sum[i] < negatives ? 0 : sum[i] - negatives
  // The game keeps the speed in hundredths of an RPM.
  const factor = trunc(Math.round(maxRpm * 100) / 333) + 100
  for (let i = 0; i < 5; i++) {
    let v = trunc((sum[i] * factor) / 10)
    const rem = v % 10
    v = trunc(v / 10)
    if (rem > 4) v++
    sum[i] = v
  }
  const color = blockColor(sum.slice(0, 5), berries, negatives)
  const feel = Math.min(255, Math.max(0, trunc(sum[5] / n) - n))
  if (color === 'Black') return { color, flavors: null, level: 2, feel }
  const flavors = sum.slice(0, 5).map((x) => Math.min(255, x))
  return { color, flavors, level: Math.max(...flavors), feel }
}

// ------------------------------------------------------------------ Gen 4

export type PoffinKind =
  | { kind: 'flavor'; main: number; second: number | null }
  | { kind: 'Rich' | 'Overripe' | 'Mild' | 'Foul' }

export interface Poffin {
  type: PoffinKind
  /** Null for a Foul Poffin: three random flavours at 2. */
  flavors: number[] | null
  level: number
  smoothness: number
  /** Why it is Foul, when it is. */
  foulBecause?: string
}

export interface Cooking {
  /** Seconds the cook took. */
  seconds: number
  spills: number
  burns: number
  /** With others: how much stirring in step took off the smoothness (0-10). */
  inStep: number
}

const gen4Row = (name: string): BerryRow => {
  const row = GEN4_BERRIES.find((r) => r[0] === name)
  if (!row) throw new Error(`no Gen 4 berry ${name}`)
  return row
}

export function poffinName(t: PoffinKind): string {
  if (t.kind !== 'flavor') return `${t.kind} Poffin`
  return t.second == null
    ? `${FLAVORS[t.main]} Poffin`
    : `${FLAVORS[t.main]}-${FLAVORS[t.second]} Poffin`
}

export function cook(berries: string[], c: Cooking): Poffin {
  const n = berries.length
  const rows = berries.map(gen4Row)
  const sum = [0, 0, 0, 0, 0]
  let smoothSum = 0
  for (const [, flavors, smooth] of rows) {
    flavors.forEach((x, i) => (sum[i] += x))
    smoothSum += smooth
  }
  const repeats = Math.max(...berries.map((b) => berries.filter((x) => x === b).length))
  let foulBecause = repeats >= 2 && n > 1 ? 'two cooks used the same berry' : undefined

  let smoothness = trunc(smoothSum / n) - n
  const f = sum.map((x, i) => x - sum[(i + 1) % 5])
  const negatives = f.filter((x) => x < 0).length
  for (let i = 0; i < 5; i++) f[i] -= negatives
  if (negatives >= 4) foulBecause ??= 'four or more flavours cancelled out'

  const frames = Math.max(1, Math.round(c.seconds * 30))
  let t = trunc(1800000 / frames)
  if (t % 10 >= 5) t += 10
  t = trunc(t / 10)
  for (let i = 0; i < 5; i++) {
    let v = f[i] * t
    if (v % 100 >= 50) v += 100
    v = trunc(v / 100)
    f[i] = Math.max(0, v - (c.spills + c.burns))
  }
  if (n > 1) smoothness -= Math.min(10, Math.max(0, c.inStep))
  if (smoothness < 15) smoothness = 15

  // Poffin_MakePoffin receives the flavours as bytes.
  const bytes = f.map((x) => x & 0xff)
  const present = bytes.flatMap((x, i) => (x > 0 ? [i] : []))
  if (!foulBecause && present.length === 0) foulBecause = 'no flavour was left'
  if (foulBecause)
    return { type: { kind: 'Foul' }, flavors: null, level: 2, smoothness, foulBecause }

  let type: PoffinKind
  if (present.length === 1) type = { kind: 'flavor', main: present[0], second: null }
  else if (present.length === 2) {
    const [a, b] = present
    type =
      bytes[a] >= bytes[b]
        ? { kind: 'flavor', main: a, second: b }
        : { kind: 'flavor', main: b, second: a }
  } else type = { kind: present.length === 3 ? 'Rich' : 'Overripe' }
  if (bytes.some((x) => x >= 50)) type = { kind: 'Mild' }

  const level = Math.min(99, type.kind === 'flavor' ? bytes[type.main] : Math.max(...bytes))
  return { type, flavors: bytes, level, smoothness }
}

export const gen3Choices = GEN3_BERRIES.map((r, i) => ({ number: i + 1, name: r[0] })).filter(
  (b) => b.number !== GEN3_ENIGMA,
)
export const gen4Choices = GEN4_BERRIES.map((r) => r[0])
