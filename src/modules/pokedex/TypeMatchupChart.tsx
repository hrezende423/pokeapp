import { useMemo } from 'react'
import { TypeLabel } from '../../components/ds/TypeLabel'
import { getType, typeEffectivenessAgainst } from '../../data'

/**
 * Defensive type chart, grouped by multiplier.
 *
 * RESTRUCTURED FROM PER-TYPE TO PER-TIER. The previous version listed all
 * seventeen attacking types, each with its own multiplier beside it -- readable,
 * but it answers "what does Ice do to this" much better than "what should I not
 * throw at it", which is the question a type chart is usually open for. Grouping
 * inverts that: six possible tiers, each naming every type that lands in it, so
 * "weak to" is one line to read instead of seventeen cells to scan. Closer to how
 * Bulbapedia structures the same fact, in our own vocabulary -- referenced, not
 * copied, and nothing is scraped from it.
 *
 * NOTHING IS LOST IN THE REGROUPING. Every type still appears exactly once,
 * including the neutral ones, because x1 is a tier like any other. The numbers are
 * still typeEffectivenessAgainst's, the same era-resolved function -- a Gen 1
 * selection still has fifteen types with no Dark and no Steel, and Ghost still
 * does nothing to Psychic.
 *
 * EMPTY TIERS DO NOT RENDER. Most species have no x4 and no x0.25 tier, and an
 * empty "4x --" line claims a fact rather than omitting one. Same rule the Movedex
 * learn-method grouping already follows, and the same rule the Sprites tab follows
 * for games with no tiles.
 *
 * NO BADGES, NO PILLS, NO BOXES. Type names are coloured text through the shared
 * TypeLabel, which is the app-wide treatment in both list and detail contexts. The
 * tier heading carries the multiplier in --font-numeric; the row is separated by
 * --hairline like every other data row. The multiplier is NOT colour-coded --
 * green-good/red-bad would need two new semantic colours, --accent is spoken for,
 * and --stat-increase / --stat-decrease already mean a nature's stat change.
 */

/**
 * The six tiers, in the order they are read: worst case first.
 *
 * Ordered descending rather than by "interesting first", because the sequence is
 * itself the information -- a reader scanning down goes from what hurts most to
 * what does not hurt at all, and a tier's position tells them which without
 * reading the number.
 */
const TIERS = [
  { multiplier: 4, label: '4x', description: 'takes quadruple damage from' },
  { multiplier: 2, label: '2x', description: 'takes double damage from' },
  { multiplier: 1, label: '1x', description: 'takes neutral damage from' },
  { multiplier: 0.5, label: '0.5x', description: 'resists' },
  { multiplier: 0.25, label: '0.25x', description: 'strongly resists' },
  { multiplier: 0, label: 'Immune', description: 'is immune to' },
] as const

export function TypeMatchupChart({
  typeIds,
  generation,
}: {
  typeIds: number[]
  generation: number
}) {
  const rows = useMemo(() => typeEffectivenessAgainst(typeIds, generation), [typeIds, generation])

  const defending = typeIds.map((id) => getType(id)?.name).filter((n): n is string => n != null)

  const tiers = useMemo(
    () =>
      TIERS.map((tier) => ({
        ...tier,
        types: rows.filter((r) => r.multiplier === tier.multiplier).map((r) => r.type),
      })).filter((tier) => tier.types.length > 0),
    [rows],
  )

  /*
    A multiplier the six tiers do not cover would silently vanish, so it is counted
    and asserted instead. Gen 1-4 has no such value -- the products of 0, 0.5, 1
    and 2 over at most two defending types are exactly the six above -- and this is
    what keeps that true rather than assumed.
  */
  const grouped = tiers.reduce((n, t) => n + t.types.length, 0)

  return (
    <div
      className="type-matchup"
      data-testid="type-matchup-chart"
      data-attacking-types={rows.length}
      data-grouped-types={grouped}
      data-tiers={tiers.length}
      data-generation={generation}
    >
      <p className="type-matchup-caption">
        Damage taken by <span className="type-matchup-defender">{defending.join(' / ')}</span> from
        each of the <span className="num">{rows.length}</span> attacking types in{' '}
        {generation === 1 ? 'Generation I' : `Generation ${generation}`}.
      </p>

      <dl className="type-matchup-tiers">
        {tiers.map((tier) => (
          <div
            key={tier.label}
            className="type-matchup-tier"
            data-testid={`matchup-tier-${tier.multiplier}`}
            data-multiplier={tier.multiplier}
            data-count={tier.types.length}
          >
            <dt className="type-matchup-tier-label num">{tier.label}</dt>
            <dd className="type-matchup-tier-types">
              {tier.types.map((type, i) => (
                <span
                  key={type.id}
                  className="type-matchup-type"
                  data-testid={`matchup-type-${type.name}`}
                  data-multiplier={tier.multiplier}
                >
                  {i > 0 && (
                    <span className="type-matchup-sep" aria-hidden>
                      ·
                    </span>
                  )}
                  <TypeLabel type={type.name} small />
                </span>
              ))}
              <span className="visually-hidden">
                {`${defending.join(' / ')} ${tier.description} ${tier.types
                  .map((t) => t.name)
                  .join(', ')}`}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      {/* Not reachable with Gen 1-4 data; rendered rather than swallowed if it
          ever becomes reachable, because a missing type is a wrong chart. */}
      {grouped !== rows.length && (
        <p className="species-info-note" role="alert" data-testid="matchup-ungrouped">
          {rows.length - grouped} attacking type(s) fall outside the six known multiplier tiers and
          are not shown above.
        </p>
      )}
    </div>
  )
}
