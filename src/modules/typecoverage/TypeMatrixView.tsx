import { useEffect, useMemo, useState } from 'react'
import { typesInGeneration } from '../../data'
import type { Effectiveness } from '../../data'
import {
  abbreviate,
  comboExists,
  comboKey,
  fullCombos,
  holdersByCombo,
  multiplierGlyph,
  multipliersAgainst,
  singleCombos,
  type TypeCombo,
} from './typeCombos'
import type { MatrixControls } from './useMatrixControls'

/**
 * The matrix, in two orientations, from ONE computation.
 *
 * WHAT THE TWO ORIENTATIONS ARE. Standard is the printed chart everyone has
 * seen: attacking types down the side, defending types across the top. Custom is
 * that table transposed -- defending typings down the side, attacking types
 * across the top -- and it is the orientation that can show 4x and 1/4x at all,
 * because those tiers need a defender holding two types and only the row axis
 * can carry a pair.
 *
 * THE TRANSPOSE IS AN INDEX SWAP, NOT A SECOND TABLE. `defendingRows` below is
 * computed once, per defending typing, in attacking-type order. Custom renders
 * it as it stands; Standard reads the same array with the two loops exchanged.
 * That is deliberate and it is the whole reason the two orientations cannot
 * disagree about a cell -- there is no second derivation to drift from the first,
 * which is the failure mode this codebase has been bitten by before.
 *
 * THE TOGGLES ARE NOT HERE. They live in the shell's right-hand rail, so the
 * generation dropdown can sit in the same place on all four tabs -- see
 * ControlRail and useMatrixControls. This view renders the type filter, which
 * belongs above the table it filters, and the table itself.
 */

/** One defending typing and its multipliers, in attacking-type order. */
interface DefendingRow {
  combo: TypeCombo
  key: string
  row: Effectiveness[]
  holders: string[]
}

/** Where the holders panel is drawn, in viewport coordinates. */
interface HoldersPanel {
  key: string
  names: string[]
  left: number
  top: number
}

export function TypeMatrixView({
  generation,
  controls,
}: {
  generation: number
  controls: MatrixControls
}) {
  const [panel, setPanel] = useState<HoldersPanel | null>(null)
  const { layout, picked, effectiveDepth, effectiveExistence, customControls } = controls

  const attacking = useMemo(() => typesInGeneration(generation), [generation])
  const holders = useMemo(() => holdersByCombo(generation), [generation])

  const defendingRows = useMemo<DefendingRow[]>(() => {
    const base = effectiveDepth === 'full' ? fullCombos(generation) : singleCombos(generation)
    const existing =
      effectiveExistence === 'existing' ? base.filter((c) => comboExists(c, holders)) : base
    /*
      THE FILTER TOUCHES THIS AXIS ONLY. It narrows defending typings and never
      the attacking columns, which stay the full set for the generation -- the
      question it answers is "show me the typings I care about defending", and
      dropping columns would silently change what every remaining row says.
      A row survives if EITHER half matches, so picking Water keeps Water,
      Water/Flying and Grass/Water alike.

      CLAMPED TO THE GENERATION'S OWN TYPES. Picking Steel in Gen 4 and then
      switching to Gen 1 would otherwise filter to a typing that cannot exist
      there and render an empty matrix, which reads as a broken page rather than
      as a filter that no longer applies.
    */
    const live = picked.filter((id) => attacking.some((t) => t.id === id))
    const filtered =
      layout === 'custom' && live.length > 0
        ? existing.filter((c) => c.some((t) => live.includes(t.id)))
        : existing

    return filtered.map((combo) => {
      const key = comboKey(combo)
      return {
        combo,
        key,
        row: multipliersAgainst(combo, generation),
        holders: holders.get(key) ?? [],
      }
    })
  }, [attacking, effectiveDepth, effectiveExistence, generation, holders, layout, picked])

  /* A scroll moves the header the panel was measured against, so it is dismissed
     rather than re-placed. */
  useEffect(() => {
    if (!panel) return
    const drop = () => setPanel(null)
    window.addEventListener('scroll', drop, true)
    return () => window.removeEventListener('scroll', drop, true)
  }, [panel])

  const showHolders = (key: string, names: string[], el: HTMLElement) => {
    const box = el.getBoundingClientRect()
    setPanel({ key, names, left: Math.max(8, box.left), top: box.bottom + 6 })
  }

  const existingCount = defendingRows.filter((r) => r.holders.length > 0).length

  /*
    THE ROW COUNT IS THE CORNER'S TOOLTIP, not a line of its own. It is a fact
    about the table's axes, so it belongs on the cell that names them -- and as a
    standing line it spent a row of vertical space repeating something the reader
    wants once.
  */
  const cornerTitle =
    layout === 'custom'
      ? [
          `${defendingRows.length} defending ${defendingRows.length === 1 ? 'typing' : 'typings'}`,
          effectiveExistence === 'all' ? `${existingCount} of them exist` : null,
          picked.length > 0 ? 'filtered' : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : `${attacking.length} attacking types against ${defendingRows.length} defending types`

  return (
    <div className="tc-matrix" data-layout="type-matrix" data-matrix-layout={layout}>
      {/* ABOVE THE TABLE IT FILTERS, in the content column rather than the rail:
          a control that narrows rows reads as a caption for them. */}
      {customControls && (
        <div className="tc-filter-row" data-layout="matrix-type-filter">
          <span className="tc-control-label" id="tc-filter-label">
            Show only
          </span>
          {/*
            UNDERLINED, NOT FILLED. A chip or a pill is what this control usually
            is and is exactly what the design system forbids; the underline is
            already this page's language for "this one is active", which is what
            the tab strip above it does.
          */}
          <div
            className="tc-filters"
            role="group"
            aria-labelledby="tc-filter-label"
            data-testid="tc-type-filter"
          >
            {attacking.map((type) => {
              const on = picked.includes(type.id)
              return (
                <button
                  key={type.id}
                  type="button"
                  className="tc-filter"
                  data-testid={`tc-type-filter-${type.name}`}
                  data-type={type.name}
                  data-on={on}
                  aria-pressed={on}
                  style={{ color: `var(--type-${type.name})` }}
                  onClick={() => controls.togglePicked(type.id)}
                >
                  {type.display_name}
                </button>
              )
            })}
            {picked.length > 0 && (
              <button
                type="button"
                className="tc-filter-clear"
                data-testid="tc-type-filter-clear"
                onClick={controls.clearPicked}
              >
                clear the filter
              </button>
            )}
          </div>
        </div>
      )}

      {/*
        THE TABLE IS ITS OWN SCROLLER, and that is what makes the column headers
        stay put. `position: sticky` resolves against the nearest scrolling
        ancestor, so a table that grows the page instead of scrolling itself has
        nothing to stick to -- which is exactly why the header row scrolled away
        in the mockup despite already declaring `top: 0`.

        BOTH AXES FREEZE. Vertical was the request; horizontal was already here
        and is kept deliberately, because the row labels ARE the table's meaning
        and seventeen columns do not fit a phone.
      */}
      <div className="tc-matrix-scroll" data-layout="matrix-table">
        <table className="tc-table">
          <thead>
            <tr>
              <th className="tc-corner" title={cornerTitle} data-testid="tc-corner">
                <span className="tc-axis-note">
                  {layout === 'custom' ? 'defending ↓ / attacking →' : 'attacking ↓ / defending →'}
                </span>
              </th>
              {layout === 'custom'
                ? attacking.map((type) => (
                    <th
                      key={type.id}
                      className="tc-col-head"
                      data-testid={`tc-col-${type.name}`}
                      style={{ color: `var(--type-${type.name})` }}
                      title={`${type.display_name} attacking`}
                    >
                      {abbreviate(type.name)}
                    </th>
                  ))
                : defendingRows.map((r) => (
                    <th
                      key={r.key}
                      className="tc-col-head"
                      data-testid={`tc-col-${r.combo[0].name}`}
                      style={{ color: `var(--type-${r.combo[0].name})` }}
                      title={`${r.combo[0].display_name} defending`}
                    >
                      {abbreviate(r.combo[0].name)}
                    </th>
                  ))}
            </tr>
          </thead>
          <tbody>
            {layout === 'custom'
              ? defendingRows.map((r) => (
                  <tr key={r.key} data-testid="tc-row">
                    <th
                      className="tc-row-head tc-row-head-combo"
                      data-exists={r.holders.length > 0}
                      data-testid={`tc-row-${r.key}`}
                      tabIndex={0}
                      onMouseEnter={(e) => showHolders(r.key, r.holders, e.currentTarget)}
                      onMouseLeave={() => setPanel(null)}
                      onFocus={(e) => showHolders(r.key, r.holders, e.currentTarget)}
                      onBlur={() => setPanel(null)}
                    >
                      <ComboLabel combo={r.combo} />
                    </th>
                    {r.row.map((cell) => (
                      <Cell
                        key={cell.type.id}
                        multiplier={cell.multiplier}
                        title={`${cell.type.display_name} on ${r.combo
                          .map((t) => t.display_name)
                          .join('/')}: ${multiplierGlyph(cell.multiplier)}x`}
                      />
                    ))}
                  </tr>
                ))
              : attacking.map((att, i) => (
                  <tr key={att.id} data-testid="tc-row">
                    <th
                      className="tc-row-head"
                      data-testid={`tc-row-${att.name}`}
                      style={{ color: `var(--type-${att.name})` }}
                    >
                      {att.display_name}
                    </th>
                    {/* The index swap: same rows, read down the attacking axis. */}
                    {defendingRows.map((r) => (
                      <Cell
                        key={r.key}
                        multiplier={r.row[i].multiplier}
                        title={`${att.display_name} on ${r.combo[0].display_name}: ${multiplierGlyph(
                          r.row[i].multiplier,
                        )}x`}
                      />
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Fixed-positioned so it escapes the table's own scroller rather than
          being clipped by it -- the same reason the team panels are portalled. */}
      {panel && (
        <div
          className="tc-holders"
          data-testid="tc-holders"
          style={{ left: panel.left, top: panel.top }}
        >
          <span className="tc-holders-head">
            {panel.names.length > 0
              ? `${panel.names.length} Pokémon`
              : 'No Pokémon has this combination'}
          </span>
          {panel.names.length > 0 && panel.names.join(', ')}
        </div>
      )}

      <MatrixLegend explainDimmed={effectiveExistence === 'all'} />
    </div>
  )
}

/** "WATER · GRASS", each half in its own colour. */
function ComboLabel({ combo }: { combo: TypeCombo }) {
  return (
    <>
      {combo.map((t, i) => (
        <span key={t.id}>
          {i > 0 && <span className="tc-combo-sep">·</span>}
          <span style={{ color: `var(--type-${t.name})` }}>{t.display_name}</span>
        </span>
      ))}
    </>
  )
}

/**
 * One cell: the multiplier as coloured TEXT, never a filled cell.
 *
 * 1x IS RENDERED BUT INVISIBLE (transparent, not absent), so the cell keeps its
 * box and the grid stays a grid while two hundred neutral cells stop competing
 * with the eighty-nine that carry a fact.
 */
function Cell({ multiplier, title }: { multiplier: number; title: string }) {
  return (
    <td data-m={multiplier} title={title}>
      {multiplierGlyph(multiplier)}
    </td>
  )
}

function MatrixLegend({ explainDimmed }: { explainDimmed: boolean }) {
  return (
    <div className="tc-legend">
      <span className="tc-legend-item">
        <span className="num tc-more">4</span> <span className="num tc-more">2</span> more damage
      </span>
      <span className="tc-legend-item">
        <span className="num tc-less">½</span> <span className="num tc-less">¼</span> less damage
      </span>
      <span className="tc-legend-item">
        <span className="num tc-none">0</span> no effect
      </span>
      <span className="tc-legend-item">blank normal damage</span>
      {explainDimmed && (
        <span className="tc-legend-item">a dimmed row is a combination nothing has</span>
      )}
    </div>
  )
}
