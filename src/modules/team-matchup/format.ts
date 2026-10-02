/** Text formatting for the matchup's outputs: verdict words, percentages, probabilities, hit counts. */

import type { Verdict } from '../battle/analysis/matrix'
import { fmtRange, type Range } from '../battle/range'

export const VERDICT: Record<Verdict, { symbol: string; word: string; title: string }> = {
  wins: {
    symbol: '▲',
    word: 'Win',
    title: 'You KO it first in every case, taking under half your HP',
  },
  trades: {
    symbol: '◆',
    word: 'Trade',
    title: 'You KO it first in every case, but take half your HP or more',
  },
  roll: {
    symbol: '◐',
    word: 'Roll',
    title: 'Who wins depends on rolls, a speed tie or a spread range',
  },
  loses: { symbol: '▼', word: 'Lose', title: 'It KOs you first in every case' },
}

export const pct = (r: Range, digits = 1) => `${fmtRange(r, digits)}%`
export const prob = (p: number) =>
  p >= 0.9995 ? '100%' : p <= 0.0005 ? '0%' : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`
export const probRange = (r: Range) =>
  Math.abs(r.max - r.min) < 0.005 ? prob(r.min) : `${prob(r.min)}–${prob(r.max)}`
export const hits = (r: Range) =>
  !Number.isFinite(r.min)
    ? '—'
    : r.min === r.max
      ? `${r.min}`
      : !Number.isFinite(r.max)
        ? `${r.min}+`
        : `${r.min}–${r.max}`
