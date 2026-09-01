import { useMemo } from 'react'
import { TypeLabel } from '../../components/ds/TypeLabel'
import { getType, typeEffectivenessAgainst } from '../../data'

/**
 * Defensive type chart as a grid of every attacking type, with this species'
 * actual multiplier against each.
 *
 * NEW, and not a restyle of TypeEffectiveness.tsx. That component groups the
 * matchups into "weak to / resists / immune" buckets and drops every neutral type,
 * so it answers "what beats this" but cannot answer "what does Ice do to it" --
 * the type simply is not on screen. The grid answers both, and is what the
 * DetailPage frame shows. The old component stays where it is, untouched, for the
 * old detail view.
 *
 * ALL SEVENTEEN, INCLUDING THE NEUTRAL ONES -- that is the point of a chart. The
 * generation decides how many there actually are: a Gen 1 selection has 15, with
 * no Dark and no Steel, and Ghost correctly doing nothing to Psychic. That comes
 * from typeEffectivenessAgainst, which is the same era-resolved function the old
 * component uses, so the two can never disagree about a matchup.
 *
 * NO COLOUR CODING BY MULTIPLIER. Green-good/red-bad would need two new semantic
 * colours; --accent is spoken for (four uses, none of them this) and
 * --stat-increase / --stat-decrease mean a nature's stat change, not a damage
 * multiplier. So the distinction is a TONE STEP, which is what the system uses
 * for emphasis everywhere else: a neutral x1 cell is secondary text, anything
 * that is not x1 is primary and bold. The number carries the meaning, and the
 * weight tells you at a glance which cells are worth reading.
 *
 * Values are --font-numeric (tabular data) and the cells are separated by
 * --hairline, matching the data-table conventions the rest of the app uses.
 */

/**
 * Multipliers as they are written about, not as JS prints them.
 *
 * 0.25 rather than 1/4 because the app's numeric face is tabular: a fraction glyph
 * would not align in the column, and the quarter-resistance is the one cell most
 * likely to be scanned for.
 */
function formatMultiplier(multiplier: number): string {
  if (multiplier === 0) return '0'
  if (multiplier === 0.25) return '0.25'
  if (multiplier === 0.5) return '0.5'
  return String(multiplier)
}

/** What a cell means, for the accessible name and for the suite to assert on. */
function describeMultiplier(multiplier: number): string {
  if (multiplier === 0) return 'no effect'
  if (multiplier < 1) return 'resisted'
  if (multiplier > 1) return 'super effective'
  return 'neutral'
}

export function TypeMatchupChart({
  typeIds,
  generation,
}: {
  typeIds: number[]
  generation: number
}) {
  const rows = useMemo(() => typeEffectivenessAgainst(typeIds, generation), [typeIds, generation])

  const defending = typeIds.map((id) => getType(id)?.name).filter((n): n is string => n != null)

  return (
    <div
      className="type-matchup"
      data-testid="type-matchup-chart"
      data-attacking-types={rows.length}
      data-generation={generation}
    >
      <p className="type-matchup-caption">
        Damage taken by <span className="type-matchup-defender">{defending.join(' / ')}</span> from
        each of the <span className="num">{rows.length}</span> attacking types in{' '}
        {generation === 1 ? 'Generation I' : `Generation ${generation}`}.
      </p>
      <ul className="type-matchup-grid">
        {rows.map(({ type, multiplier }) => (
          <li
            key={type.id}
            className="type-matchup-cell"
            /* Attribute-driven so the assertion reads the resolved number rather
               than parsing the formatted string back out of the DOM. */
            data-testid={`matchup-cell-${type.name}`}
            data-multiplier={multiplier}
            data-neutral={multiplier === 1}
          >
            <TypeLabel type={type.name} small />
            <span className="type-matchup-value num">
              <span className="type-matchup-times" aria-hidden>
                ×
              </span>
              {formatMultiplier(multiplier)}
            </span>
            <span className="visually-hidden">
              {`${type.name}: ${formatMultiplier(multiplier)} times damage, ${describeMultiplier(multiplier)}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
