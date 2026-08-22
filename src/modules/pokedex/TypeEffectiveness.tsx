import { useMemo } from 'react'
import { TypeBadge } from '../../components/TypeBadge'
import { typeEffectivenessAgainst } from '../../data'

const LABELS: { test: (m: number) => boolean; title: string; key: string }[] = [
  { test: (m) => m === 0, title: 'Immune (0x)', key: 'immune' },
  { test: (m) => m === 0.25, title: 'Resists (0.25x)', key: 'quarter' },
  { test: (m) => m === 0.5, title: 'Resists (0.5x)', key: 'half' },
  { test: (m) => m === 2, title: 'Weak to (2x)', key: 'double' },
  { test: (m) => m === 4, title: 'Weak to (4x)', key: 'quadruple' },
]

/**
 * Defensive matchups for the selected generation.
 *
 * The generation drives both which types exist and what the matchups are, so a
 * Gen 1 selection shows 15 attacking types with no Dark or Steel, and Ghost is
 * correctly shown as doing nothing to Psychic.
 */
export function TypeEffectiveness({
  typeIds,
  generation,
}: {
  typeIds: number[]
  generation: number
}) {
  const rows = useMemo(() => typeEffectivenessAgainst(typeIds, generation), [typeIds, generation])

  const groups = LABELS.map((label) => ({
    ...label,
    types: rows.filter((r) => label.test(r.multiplier)).map((r) => r.type),
  })).filter((g) => g.types.length > 0)

  return (
    <div data-testid="type-effectiveness" data-attacking-types={rows.length}>
      {groups.length === 0 && <p className="subtitle">Neutral against everything.</p>}
      <dl className="matchups">
        {groups.map((group) => (
          <div key={group.key} data-testid={`matchup-${group.key}`}>
            <dt>{group.title}</dt>
            <dd>
              {group.types.map((t) => (
                <TypeBadge key={t.id} typeId={t.id} small />
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="subtitle">
        {rows.length} attacking types exist in Generation {generation}.
      </p>
    </div>
  )
}
