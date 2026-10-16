/**
 * #21 Battle Arena scoring (Emerald): the referee's verdict after three turns.
 *
 * PURE, AND UI-FREE. From pokeemerald src/battle_arena.c:
 *   - Mind: the sum of sMindRatings over the moves each side used (+1 most
 *     attacks, -1 Protect / Detect / Endure / Fake Out, 0 the rest; generated
 *     into src/data/arenaMindRatings.ts). Added when the move runs (battle_util.c).
 *   - Skill: BattleArena_AddSkillPoints at the end of each move -- the outcomes
 *     below -- and BattleArena_DeductSkillPoints, -3 when the side's own move is
 *     stopped by a message such as "made it ineffective" or "restored HP using".
 *   - Body: HP left as a whole percentage of the HP at the matchup's start.
 * Each category: higher scores 2, a tie 1 each. Higher total wins; a tied total
 * knocks BOTH out (data/battle_scripts_1.s BattleScript_ArenaJudgmentDraw).
 */

import { ARENA_MIND_RATING } from '../../../data/arenaMindRatings'

export type SkillResult =
  | 'hit'
  | 'super'
  | 'mixed'
  | 'resisted'
  | 'no-effect'
  | 'blocked'
  | 'failed-status'
  | 'protected-self'

export const SKILL_POINTS: Record<SkillResult, number> = {
  hit: 1,
  super: 2,
  mixed: 1,
  resisted: -1,
  'no-effect': -2,
  blocked: 0,
  'failed-status': -2,
  'protected-self': 0,
}

export const SKILL_LABEL: Record<SkillResult, string> = {
  hit: 'Worked (normal hit, or a status move)',
  super: 'Super effective',
  mixed: 'Super and not very effective at once',
  resisted: 'Not very effective',
  'no-effect': 'Missed or had no effect',
  blocked: 'Blocked by the target’s Protect or Detect',
  'failed-status': 'Status move on a target already statused',
  'protected-self': 'Its own Protect / Detect worked',
}

export const mindRating = (moveId: number): number => ARENA_MIND_RATING[moveId] ?? 0

export interface Side {
  /** Moves used, one per turn; null = no move that turn. */
  moves: (number | null)[]
  skills: (SkillResult | null)[]
  /** Times its move was stopped by a -3 message (e.g. Volt Absorb, Levitate's "made it useless"). */
  stopped: number
  hpStart: number
  hpEnd: number
}

export type Mark = 'win' | 'tie' | 'loss'

export interface Judgment {
  mind: [number, number]
  skill: [number, number]
  body: [number, number]
  marks: { mind: [Mark, Mark]; skill: [Mark, Mark]; body: [Mark, Mark] }
  total: [number, number]
  result: 'you' | 'opponent' | 'draw'
}

const score = (s: Side) => ({
  mind: s.moves.reduce<number>((n, m) => n + (m == null ? 0 : mindRating(m)), 0),
  skill:
    s.skills.reduce<number>((n, r) => n + (r == null ? 0 : SKILL_POINTS[r]), 0) - 3 * s.stopped,
  body: Math.trunc((s.hpEnd * 100) / s.hpStart),
})

const compare = (a: number, b: number): [Mark, Mark] =>
  a > b ? ['win', 'loss'] : a < b ? ['loss', 'win'] : ['tie', 'tie']
const POINTS: Record<Mark, number> = { win: 2, tie: 1, loss: 0 }

export function judge(you: Side, foe: Side): Judgment {
  const a = score(you)
  const b = score(foe)
  const marks = {
    mind: compare(a.mind, b.mind),
    skill: compare(a.skill, b.skill),
    body: compare(a.body, b.body),
  }
  const total: [number, number] = [0, 1].map(
    (i) => POINTS[marks.mind[i]] + POINTS[marks.skill[i]] + POINTS[marks.body[i]],
  ) as [number, number]
  return {
    mind: [a.mind, b.mind],
    skill: [a.skill, b.skill],
    body: [a.body, b.body],
    marks,
    total,
    result: total[0] > total[1] ? 'you' : total[0] < total[1] ? 'opponent' : 'draw',
  }
}
