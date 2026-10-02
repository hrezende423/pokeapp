/**
 * S6: FORMAT RULES applied to both teams before anything is computed.
 *
 *   Level   'as-is' fights at the levels given; 'level-50' fights every Pokemon
 *           above 50 at 50 (the Battle Tower / Frontier Level 50 rule).
 *   Items   the Item Clause: no two of MY Pokemon hold the same item; a
 *           duplicate is removed from the later one, and the change is named.
 *   Battle  'double' is the in-game double battle. The engine is singles --
 *           the matrix, speed ladder and damage are exact one-on-one, but the
 *           partner, spread-move reduction and targeting are NOT modelled, so a
 *           doubles matchup carries that as a stated limitation on every output.
 */

import { getItem } from '../../data'
import { effectiveLevel, type BattlerSpec } from './battler'

export interface FormatRules {
  level: 'as-is' | 'level-50'
  itemClause: boolean
  battle: 'single' | 'double'
}

export const DEFAULT_FORMAT: FormatRules = { level: 'as-is', itemClause: false, battle: 'single' }

export interface Formatted {
  mine: BattlerSpec[]
  theirs: BattlerSpec[]
  notes: string[]
  /** A limitation every output under this format must carry. */
  limitation: string | null
}

export function applyFormat(
  mine: BattlerSpec[],
  theirs: BattlerSpec[],
  rules: FormatRules,
): Formatted {
  const notes: string[] = []
  const cap = (b: BattlerSpec): BattlerSpec => {
    if (rules.level !== 'level-50' || effectiveLevel(b) <= 50) return b
    return { ...b, levelOverride: 50 }
  }
  let m = mine.map(cap)
  const t = theirs.map(cap)
  const capped = [...mine, ...theirs].filter((b) => effectiveLevel(b) > 50).length
  if (rules.level === 'level-50' && capped)
    notes.push(`Level 50 rule: ${capped} Pokemon above 50 fight at 50`)
  if (rules.itemClause) {
    const seen = new Set<number>()
    m = m.map((b) => {
      if (b.itemId == null) return b
      if (!seen.has(b.itemId)) {
        seen.add(b.itemId)
        return b
      }
      notes.push(
        `Item Clause: ${b.label}'s ${getItem(b.itemId)?.display_name ?? 'item'} removed (a duplicate)`,
      )
      return { ...b, itemId: null }
    })
  }
  return {
    mine: m,
    theirs: t,
    notes,
    limitation:
      rules.battle === 'double'
        ? 'Double battle: computed one-on-one; partners, spread-move reduction and targeting are not modelled'
        : null,
  }
}
