import { useMemo } from 'react'
import type { PokemonType } from '../../data'
import {
  groupByTier,
  multiplierLabel,
  multipliersAgainst,
  multipliersDealtBy,
  singleCombos,
} from './typeCombos'

/**
 * THE SPINE: a centred column of types with two wings -- what hits this type on
 * the left, what this type hits on the right.
 *
 * WHAT MAKES IT READ AS A DIAGRAM IS THE GEOMETRY, not a fill: one hairline
 * running the height of the page through the middle, each type name breaking it,
 * and the multipliers pinned to the INNER edge of each wing so the numbers sit
 * against the spine and the type runs flow outward from them. The reference
 * charts draw that direction with arrows; alignment carries it here and needs no
 * glyph.
 *
 * SINGLE TYPES ONLY, TODAY, AND NOT BY ASSUMPTION. It asks its question through
 * `singleCombos()` and the same combo-shaped primitives the Matrix uses, so the
 * dual-type expansion this view is expected to grow is a change to the row
 * source rather than a rewrite of the arithmetic. Nothing below is written as
 * "one type per side".
 */
export function TypeFlowView({ generation }: { generation: number }) {
  const rows = useMemo(
    () =>
      singleCombos(generation).map((combo) => ({
        type: combo[0],
        taken: groupByTier(multipliersAgainst(combo, generation)),
        dealt: groupByTier(multipliersDealtBy(combo[0], generation)),
      })),
    [generation],
  )

  return (
    <div className="tc-flow" data-layout="type-flow">
      <span className="tc-section-label">Damage taken on the left, damage dealt on the right</span>
      <div className="tc-flow-head">
        <span className="tc-section-label">Attacking it</span>
        <span />
        <span className="tc-section-label">It attacks</span>
      </div>
      {rows.map(({ type, taken, dealt }) => (
        <div className="tc-flow-row" key={type.id} data-testid={`tc-flow-${type.name}`}>
          <Wing side="left" label="Attacking it" tiers={taken} />
          {/* The surface behind the name is what breaks the hairline; it takes
              the hover tone with the row so the break follows the highlight. */}
          <div className="tc-spine">
            <span className="tc-spine-type" style={{ color: `var(--type-${type.name})` }}>
              {type.display_name}
            </span>
          </div>
          <Wing side="right" label="It attacks" tiers={dealt} />
        </div>
      ))}
    </div>
  )
}

function Wing({
  side,
  label,
  tiers,
}: {
  side: 'left' | 'right'
  /** Surfaces as the block's own heading once the row stacks on a phone. */
  label: string
  tiers: { multiplier: number; types: PokemonType[] }[]
}) {
  return (
    <div className={`tc-wing tc-wing-${side}`} data-side={label}>
      {tiers.map((tier) => (
        <div className="tc-wing-tier" key={tier.multiplier}>
          <span className="tc-wing-mult num" data-m={tier.multiplier}>
            {multiplierLabel(tier.multiplier)}
          </span>
          <span className="tc-run">
            {tier.types.map((t) => (
              <span key={t.id} className="tc-ty-sm" style={{ color: `var(--type-${t.name})` }}>
                {t.display_name}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}
