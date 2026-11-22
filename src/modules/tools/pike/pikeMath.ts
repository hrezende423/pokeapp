/**
 * Battle Pike room odds (Emerald): what is behind each of the three doors.
 *
 * PURE, AND UI-FREE. From pret/pokeemerald @ 9103e529c2fbdd7add4a1ff3350c6c1f92112c42,
 * src/battle_pike.c:
 *   - sRoomTypeHints (512-522): the hint category of each room type;
 *   - SetHintedRoom (1334-1375): the hint lady's door (Random() % 3) and its room.
 *     With healing rooms disabled the candidate list is built 6 long but only 4
 *     are filled; the 2 left over stay 0 (AllocZeroed) = SINGLE_BATTLE, so the
 *     list is [SINGLE, NPC, STATUS, WILD, SINGLE, SINGLE] and Hard and Double
 *     battles are never hinted. A STATUS hint with no healthy Pokémon, or a
 *     DOUBLE hint with fewer than two able to battle, becomes NPC;
 *   - GetNextRoomType (1014-1092): any other door is uniform over the room types
 *     left after removing the hint's whole category, Double (fewer than two able),
 *     Status (no healthy Pokémon) and both heals (healing disabled);
 *   - AtLeastTwoAliveMons (1482-1499), AtLeastOneHealthyMon (982-1012);
 *   - GetPikeQueenFightType (1501-1531) with sFrontierBrainStreakAppearances'
 *     Pike row {28, 140, 56, 1} (468-477): the hint is set with nextRoom = 1;
 *   - sNumMonsToHealBeforePikeQueen (524-532), HealSomeMonsBeforePikeQueen (1538-1544);
 *   - TryInflictRandomStatus (871-980), DoesTypePreventStatus (841-869): ten random
 *     swaps shuffle the party order; the first 1/2/3 healthy Pokémon in that order
 *     (by curChallengeBattleNum <= 4 / <= 9 / else) are the targets; a status
 *     whose type immunity covers every target is rolled again. Abilities never
 *     cause a reroll: they only stop the status on that one Pokémon.
 * data/scripts/battle_pike.inc: the counter and the win streak each go up by one
 * on entering a room and one on leaving it, so a hallway is always odd (1..13)
 * and a door choice adds two to the streak.
 */

/** Room types, in the game's own order: the index is PIKE_ROOM_*. */
export const ROOMS = [
  'single',
  'heal-full',
  'npc',
  'status',
  'heal-part',
  'wild',
  'hard',
  'double',
] as const
export type PikeRoom = (typeof ROOMS)[number]

export type PikeHint = 'people' | 'whispering' | 'nostalgia' | 'pokemon'
export const HINTS: readonly PikeHint[] = ['people', 'whispering', 'nostalgia', 'pokemon']

/** sRoomTypeHints. */
export const ROOM_HINT: Readonly<Record<PikeRoom, PikeHint>> = {
  single: 'people',
  'heal-full': 'people',
  npc: 'whispering',
  status: 'nostalgia',
  'heal-part': 'nostalgia',
  wild: 'pokemon',
  hard: 'pokemon',
  double: 'whispering',
}

export interface PikeState {
  /** pikeHealingRoomsDisabled: the first hallway, or the party left the last room fully healed. */
  healingDisabled: boolean
  /** Pokémon able to battle, 1-3. */
  aliveCount: number
  /** At least one able to battle with no status. */
  anyHealthy: boolean
}

export type RoomOdds = Record<PikeRoom, number>

const zero = (): RoomOdds => Object.fromEntries(ROOMS.map((r) => [r, 0])) as RoomOdds

/** Why a state cannot happen, or null. */
export function stateProblem(s: PikeState): string | null {
  if (!Number.isInteger(s.aliveCount) || s.aliveCount < 1 || s.aliveCount > 3)
    return 'One to three Pokémon must be able to battle: with none the challenge is over.'
  if (s.healingDisabled && (s.aliveCount < 3 || !s.anyHealthy))
    return 'Healing rooms are off only when the whole party is fully healed: all three able to battle, none with a status.'
  return null
}

/** The room behind the hinted door (SetHintedRoom), when Lucy is not due. */
export function hintOdds(s: PikeState): RoomOdds {
  const cand: PikeRoom[] = s.healingDisabled
    ? ['single', 'npc', 'status', 'wild', 'single', 'single']
    : [...ROOMS]
  const out = zero()
  for (const c of cand) {
    let t = c
    if (t === 'status' && !s.anyHealthy) t = 'npc'
    if (t === 'double' && s.aliveCount < 2) t = 'npc'
    out[t] += 1 / cand.length
  }
  return out
}

/** The chance of hearing each hint category. */
export function hintCategoryOdds(s: PikeState): Record<PikeHint, number> {
  const h = hintOdds(s)
  const out = { people: 0, whispering: 0, nostalgia: 0, pokemon: 0 }
  for (const r of ROOMS) out[ROOM_HINT[r]] += h[r]
  return out
}

/** Which room types an unhinted door can hold after a hint of this category. */
export function allowedOtherRooms(hint: PikeHint, s: PikeState): PikeRoom[] {
  return ROOMS.filter(
    (r) =>
      ROOM_HINT[r] !== hint &&
      !(r === 'double' && s.aliveCount < 2) &&
      !(r === 'status' && !s.anyHealthy) &&
      !((r === 'heal-full' || r === 'heal-part') && s.healingDisabled),
  )
}

/** An unhinted door after a hint of this category: uniform over what is allowed. */
export function otherDoorOddsByHint(hint: PikeHint, s: PikeState): RoomOdds {
  const allowed = allowedOtherRooms(hint, s)
  const out = zero()
  for (const r of allowed) out[r] = 1 / allowed.length
  return out
}

/** GetNextRoomType for a door the hint is not about. Only the hint's category matters. */
export function otherDoorOdds(hintType: PikeRoom, s: PikeState): RoomOdds {
  return otherDoorOddsByHint(ROOM_HINT[hintType], s)
}

/** An unhinted door when the hint is not known: the mean over every hint the lady can give. */
export function unhintedDoorOdds(s: PikeState): RoomOdds {
  const hinted = hintOdds(s)
  const out = zero()
  for (const h of ROOMS) {
    if (hinted[h] === 0) continue
    const other = otherDoorOdds(h, s)
    for (const r of ROOMS) out[r] += hinted[h] * other[r]
  }
  return out
}

// ------------------------------------------------------------------ Lucy

/** sFrontierBrainStreakAppearances[FRONTIER_FACILITY_PIKE]. */
export const PIKE_BRAIN_STREAK = { first: 28, second: 140, every: 56, offset: 1 } as const

export type LucyFight = 'silver' | 'gold' | 'rematch'

/**
 * GetPikeQueenFightType(1): the fight the hint sets up at a hallway with this
 * win streak, or null. 0 symbols: the Silver Symbol battle; 1: the Gold; 2: a
 * rematch.
 */
export function lucyFight(streak: number, symbols: number): LucyFight | null {
  const s = streak + 1
  const { first, second, every, offset } = PIKE_BRAIN_STREAK
  if (symbols === 0) return s === first - offset ? 'silver' : null
  if (symbols === 1) return s === second - offset ? 'gold' : null
  if (s === first - offset) return 'rematch'
  if (s === second - offset || (s > second && (s - second + offset) % every === 0)) return 'rematch'
  return null
}

/** Is Lucy behind every door of the hallway at this streak? */
export function isLucyRoom(streak: number, symbols: number): boolean {
  return lucyFight(streak, symbols) != null
}

/** A hallway's place: the streak there, the room it leads to (streak + 2), its challenge and door choice. */
export interface PikePlace {
  streak: number
  room: number
  challenge: number
  door: number
}

export function placeOf(streak: number): PikePlace {
  return {
    streak,
    room: streak + 2,
    challenge: Math.floor(streak / 14) + 1,
    door: (streak % 14) / 2 + 1,
  }
}

/** The next hallway (this one included) where Lucy waits, or null if she never will with these symbols. */
export function nextLucy(streak: number, symbols: number): PikePlace | null {
  for (let k = streak; k <= streak + 2 * PIKE_BRAIN_STREAK.second; k += 2)
    if (isLucyRoom(k, symbols)) return placeOf(k)
  return null
}

/** Is this a streak a hallway can have: a whole, even number (two per door choice)? */
export function hallwayStreakProblem(streak: number): string | null {
  if (!Number.isInteger(streak) || streak < 0) return 'The win streak is a whole number, 0 or more.'
  // pikeWinStreaks is a u16.
  if (streak > 65534)
    return 'The game keeps the win streak in 16 bits: at most 65,534 at a hallway.'
  if (streak % 2 !== 0)
    return 'At a hallway the win streak is even: each door choice adds two (the hallway and the room).'
  return null
}

/** sNumMonsToHealBeforePikeQueen: each door heals 0, 1 or 2 Pokémon, one third each. */
export const LUCY_HEAL_COUNTS = [0, 1, 2] as const

// ----------------------------------------------------------- status room

export const STATUSES = ['toxic', 'freeze', 'paralysis', 'sleep', 'burn'] as const
export type PikeStatus = (typeof STATUSES)[number]

/** Random() % 100 bands: < 35, < 60, < 80, < 90, else. */
export const STATUS_WEIGHT: Readonly<Record<PikeStatus, number>> = {
  toxic: 35,
  freeze: 25,
  paralysis: 20,
  sleep: 10,
  burn: 10,
}

/** DoesTypePreventStatus. */
export const STATUS_IMMUNE_TYPES: Readonly<Record<PikeStatus, readonly string[]>> = {
  toxic: ['poison', 'steel'],
  freeze: ['ice'],
  paralysis: ['ground', 'electric'],
  sleep: [],
  burn: ['fire'],
}

/** Who inflicts it (sStatusMon) and with what. Burn: Dusclops or Kirlia, Random() % 2. */
export const STATUS_SOURCE: Readonly<Record<PikeStatus, { by: string; move: string }>> = {
  toxic: { by: 'Kirlia', move: 'Toxic' },
  freeze: { by: 'Dusclops', move: 'Ice Beam' },
  paralysis: { by: 'Kirlia', move: 'Thunder Wave' },
  sleep: { by: 'Kirlia', move: 'Hypnosis' },
  burn: { by: 'Dusclops or Kirlia, half each', move: 'Will-O-Wisp' },
}

export const typePrevents = (status: PikeStatus, types: readonly string[]): boolean =>
  types.some((t) => STATUS_IMMUNE_TYPES[status].includes(t))

/**
 * How many Pokémon the status room targets, by door choice 1-7. It reads the
 * room counter, which is 2 x door in the room: <= 4 -> 1, <= 9 -> 2, else 3.
 */
export function statusTargets(doorChoice: number): 1 | 2 | 3 {
  const counter = 2 * doorChoice
  return counter <= 4 ? 1 : counter <= 9 ? 2 : 3
}

/** One party slot, in party order. */
export interface PikeSlot {
  /** Able to battle with no status: only these can be targeted. */
  healthy: boolean
  types: readonly string[]
}

/**
 * The exact distribution of the party order after TryInflictRandomStatus's ten
 * swaps of indices[Random() % 3] and indices[Random() % 3] (equal picks swap
 * nothing). Keyed "012" etc.; close to uniform, not exactly.
 */
export function shuffleDistribution(): Map<string, number> {
  let dist = new Map<string, number>([['012', 1]])
  for (let step = 0; step < 10; step++) {
    const next = new Map<string, number>()
    for (const [perm, p] of dist)
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          const a = perm.split('')
          ;[a[i], a[j]] = [a[j], a[i]]
          const k = a.join('')
          next.set(k, (next.get(k) ?? 0) + p / 9)
        }
    dist = next
  }
  return dist
}

/**
 * The chance of each status in the status room, given the party (three slots, in
 * order) and how many it targets. Null when no Pokémon is healthy: the room
 * cannot be picked then.
 */
export function statusOdds(
  party: readonly PikeSlot[],
  targets: number,
): Record<PikeStatus, number> | null {
  if (!party.some((m) => m.healthy)) return null
  const out = { toxic: 0, freeze: 0, paralysis: 0, sleep: 0, burn: 0 }
  for (const [perm, p] of shuffleDistribution()) {
    const considered: PikeSlot[] = []
    for (const ch of perm) {
      const m = party[Number(ch)]
      if (m?.healthy) considered.push(m)
      if (considered.length === targets) break
    }
    const ok = STATUSES.filter((st) => considered.some((m) => !typePrevents(st, m.types)))
    const total = ok.reduce((a, st) => a + STATUS_WEIGHT[st], 0)
    for (const st of ok) out[st] += (p * STATUS_WEIGHT[st]) / total
  }
  return out
}
