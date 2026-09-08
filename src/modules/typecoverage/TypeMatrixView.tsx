import { useCallback, useEffect, useMemo, useState } from 'react'
import { typesInGeneration } from '../../data'
import type { Effectiveness } from '../../data'
import { Segmented } from './Segmented'
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
 * WHY B AND C ARE CUSTOM-ONLY. Standard's rows are attacking types, and an
 * attack has exactly one type to bring -- so "include dual-type combinations"
 * and "only combinations something really has" are questions with no meaning on
 * that axis. They are hidden rather than disabled: a disabled control that could
 * never apply reads as a feature that is temporarily broken.
 */

type Layout = 'custom' | 'standard'
type Depth = 'full' | 'single'
type Existence = 'existing' | 'all'

const LAYOUTS: { value: Layout; label: string }[] = [
  { value: 'custom', label: 'Custom' },
  { value: 'standard', label: 'Standard' },
]
const DEPTHS: { value: Depth; label: string }[] = [
  { value: 'full', label: 'Full' },
  { value: 'single', label: 'Single' },
]
const EXISTENCES: { value: Existence; label: string }[] = [
  { value: 'existing', label: 'Existing' },
  { value: 'all', label: 'All' },
]

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

export function TypeMatrixView({ generation }: { generation: number }) {
  const [layout, setLayout] = useState<Layout>('custom')
  const [depth, setDepth] = useState<Depth>('full')
  const [existence, setExistence] = useState<Existence>('existing')
  const [picked, setPicked] = useState<number[]>([])
  const [panel, setPanel] = useState<HoldersPanel | null>(null)

  /*
    SWITCHING ORIENTATION RESETS THE CUSTOM-ONLY CONTROLS, by explicit request:
    coming back from Standard lands on Full / Existing rather than resuming
    whatever was set before, so the reader is never looking at a matrix shaped by
    a control they cannot see and did not just touch.

    THE TYPE FILTER RESETS WITH THEM. It is hidden under Standard for exactly the
    same reason B and C are, so leaving it applied on the way back would be the
    same surprise the reset exists to prevent -- a matrix silently missing most
    of its rows because of a choice made before a round trip.
  */
  const changeLayout = useCallback((next: Layout) => {
    setLayout(next)
    setDepth('full')
    setExistence('existing')
    setPicked([])
  }, [])

  /*
    Standard never shows a dual typing: its rows are attacking types, and an
    attack brings one type.
  */
  const effectiveDepth: Depth = layout === 'standard' ? 'single' : depth

  /*
    AND STANDARD DOES NOT PRUNE ITS AXES BY WHAT EXISTS. This is the one place
    the brief contradicted itself and the resolution is written down rather than
    left in the code: Standard is specified as "the traditional layout", and it
    is also specified to force Existing -- but those cannot both hold, because
    the printed chart is a chart of the TYPE SYSTEM, not of extant species.

    Measured, not assumed: no species in Gen 1-4 scope is pure Flying, and in
    Gen 1 nothing is pure Rock, pure Ghost or pure Ice either (every Rock is
    Rock/Ground, every Ghost is Ghost/Poison). Pruning by existence turns the
    Gen 1 chart into 11 defending columns against 15 attacking rows, and an
    11x15 "traditional type chart" is simply wrong -- the real one is 15x15.

    So Existing keeps the meaning the brief gives it exactly where it is a
    CONTROL, which is Custom: there it prunes the combinations, singles included.
    In Standard, where it is not a control at all, the axes stay the full type
    system. That makes both halves of the brief true at once instead of trading
    one for the other.
  */
  const effectiveExistence: Existence = layout === 'standard' ? 'all' : existence

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
    */
    /*
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
      return { combo, key, row: multipliersAgainst(combo, generation), holders: holders.get(key) ?? [] }
    })
  }, [attacking, effectiveDepth, effectiveExistence, generation, holders, layout, picked])

  /* A scroll moves the header the panel was measured against, so it is dismissed
     rather than re-placed -- the same call the mockup makes. */
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

  const togglePicked = (id: number) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))

  const customControls = layout === 'custom'
  const existingCount = defendingRows.filter((r) => r.holders.length > 0).length

  return (
    <div className="tc-matrix" data-layout="type-matrix" data-matrix-layout={layout}>
      <div className="tc-controls" data-layout="matrix-controls">
        <div className="tc-control-row">
          <Segmented
            label="Layout"
            testId="tc-toggle-layout"
            options={LAYOUTS}
            value={layout}
            onChange={changeLayout}
          />
          {/* Hidden, not disabled, under Standard -- see the header note. */}
          {customControls && (
            <Segmented
              label="Combinations"
              testId="tc-toggle-depth"
              options={DEPTHS}
              value={depth}
              onChange={setDepth}
            />
          )}
          {customControls && (
            <Segmented
              label="Species"
              testId="tc-toggle-existence"
              options={EXISTENCES}
              value={existence}
              onChange={setExistence}
            />
          )}
        </div>

        {customControls && (
          <div className="tc-filter-row" data-layout="matrix-type-filter">
            <span className="tc-control-label" id="tc-filter-label">
              Show only
            </span>
            {/*
              UNDERLINED, NOT FILLED. A chip or a pill is what this control
              usually is and is exactly what the design system forbids; the
              underline is already this page's language for "this one is active",
              which is what the tab strip above it does.
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
                    onClick={() => togglePicked(type.id)}
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
                  onClick={() => setPicked([])}
                >
                  clear the filter
                </button>
              )}
            </div>
          </div>
        )}

        <p className="tc-count" data-testid="tc-matrix-count">
          {layout === 'custom' ? (
            <>
              <span className="num">{defendingRows.length}</span>{' '}
              {defendingRows.length === 1 ? 'defending typing' : 'defending typings'}
              {/* Only under All: under Existing every row exists by definition,
                  so "88 typings, 88 of them exist" says the same thing twice. */}
              {effectiveExistence === 'all' && (
                <>
                  {' · '}
                  <span className="num">{existingCount}</span> of them exist
                </>
              )}
              {picked.length > 0 && ' · filtered'}
            </>
          ) : (
            <>
              <span className="num">{attacking.length}</span> attacking types against{' '}
              <span className="num">{defendingRows.length}</span> defending types
            </>
          )}
        </p>
      </div>

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
              <th className="tc-corner">
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

      {/* The dimmed-row line only where a dimmed row can actually appear. */}
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
