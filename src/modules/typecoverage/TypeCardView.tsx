import { useMemo } from 'react'
import type { PokemonType } from '../../data'
import {
  abbreviate,
  groupByTier,
  multiplierLabel,
  multipliersAgainst,
  multipliersDealtBy,
  singleCombos,
} from './typeCombos'

/**
 * One tile per type, three-letter labels, for narrow windows.
 *
 * The same facts the other views carry, at the density a phone can hold: the
 * offensive tiers first ("to"), then the defensive ones ("from"), so a tile
 * reads top-to-bottom as "what I do, then what happens to me".
 *
 * THE ABBREVIATION IS THE POINT AND ITS LIMIT. Three letters is what lets a run
 * of eight resisted types sit on one line in a 196px tile; it is also why this
 * view is a companion to the others rather than a replacement, since NOR/NON and
 * GRO/GRA are only unambiguous next to their own colour.
 *
 * Asks through `singleCombos()` and the shared combo primitives, so the
 * dual-type expansion is a change of tile source rather than of logic.
 */
export function TypeCardView({ generation }: { generation: number }) {
  const cards = useMemo(
    () =>
      singleCombos(generation).map((combo) => ({
        type: combo[0],
        dealt: groupByTier(multipliersDealtBy(combo[0], generation)),
        taken: groupByTier(multipliersAgainst(combo, generation)),
      })),
    [generation],
  )

  return (
    <div className="tc-cards-view" data-layout="type-cards">
      <div className="tc-cards">
        {cards.map(({ type, dealt, taken }) => (
          <div className="tc-card" key={type.id} data-testid={`tc-card-${type.name}`}>
            <div className="tc-card-head">
              <span className="tc-ty" style={{ color: `var(--type-${type.name})` }}>
                {type.display_name}
              </span>
            </div>
            {dealt.map((tier) => (
              <Line
                key={`to-${tier.multiplier}`}
                label={`${multiplierLabel(tier.multiplier)} to`}
                types={tier.types}
              />
            ))}
            {taken.map((tier) => (
              <Line
                key={`from-${tier.multiplier}`}
                label={`${multiplierLabel(tier.multiplier)} from`}
                types={tier.types}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Line({ label, types }: { label: string; types: PokemonType[] }) {
  return (
    <div className="tc-card-line">
      {/*
        NOT `num`. Martian Mono draws about a fifth wider than Plex Sans at the
        same px, so "2x from" in the mono face overran the 46px label track and
        wrapped onto two lines on every tile. The mono rule is about tabular
        data and stops at a label like this -- which is also what the mockup did.
      */}
      <span className="tc-card-line-label">{label}</span>
      <span className="tc-run">
        {types.map((t) => (
          <span key={t.id} className="tc-ty-sm" style={{ color: `var(--type-${t.name})` }}>
            {abbreviate(t.name)}
          </span>
        ))}
      </span>
    </div>
  )
}
