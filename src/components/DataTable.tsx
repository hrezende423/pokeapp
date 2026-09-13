import { IconChevronRight } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { compareSortValues, type SortValue } from './sortValues'

/**
 * A sortable data table, driven by a column config.
 *
 * Built for the Movedex list, but nothing in here knows about moves: a column
 * declares how to render a cell and how to sort by it, and the table does the
 * rest. A second dense list becomes a config, not another component.
 *
 * Sorting is stable and null-last in both directions. A move with no power is
 * not "0 power" -- status moves have no power at all -- so nulls sink whichever
 * way the arrow points rather than clustering at the strong end when descending.
 * The comparator itself lives in components/sortValues.ts, because the dex sort
 * PANELS sort lists that are not tables and had to mean the same thing by it.
 *
 * SORT STATE IS OPTIONALLY CONTROLLED. Left alone the table owns it, which is
 * what the Movedex wants: its header row is the only sort control on the page.
 * Pass `sortKey`/`direction`/`onSort` and the caller owns it instead -- the
 * Pokedex list view does, because the same sort is also offered in its Sort
 * disclosure, and a panel and a header row that each held their own copy would
 * disagree the moment either was used.
 *
 * A CLICKABLE ROW ENDS IN A CHEVRON, added by the table rather than declared as a
 * column: it is not data, it is the affordance saying the row opens something,
 * and it appears exactly when `onRowClick` is set. The ledger list carries the
 * identical glyph at the same size, so a table row and a ledger row make the same
 * promise. The header gets an empty cell above it so the column count matches.
 */

export interface Column<T> {
  key: string
  label: string
  /** Cell contents. Defaults to the sort value when omitted. */
  render?: (row: T) => ReactNode
  /** Sort key. Omit for a column that cannot be sorted. */
  sortValue?: (row: T) => SortValue
  /** Right-aligned, --font-numeric. For counts and measurements. */
  numeric?: boolean
  /**
   * Explicit column width, e.g. "7.5rem".
   *
   * Emitted as a <colgroup>, which under `table-layout: fixed` is what actually
   * decides the width. Omit it and the table keeps whatever its stylesheet says
   * -- the Movedex's six columns are sized in CSS and stay that way. The Pokedex
   * list view sets one per column because 34 columns cannot be addressed by
   * nth-child without becoming unreadable, and because the promise that its
   * first twelve fit the window is a sum of these numbers.
   */
  width?: string
}

export type SortDirection = 'asc' | 'desc'

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  selectedKey = null,
  initialSort,
  sortKey: controlledSortKey,
  direction: controlledDirection,
  onSort,
  testId,
  emptyNote,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => number
  onRowClick?: (row: T) => void
  selectedKey?: number | null
  /** Column key to sort by on first render. Ignored when `sortKey` is passed. */
  initialSort?: string
  /** Controlled sort column. Pass with `direction` and `onSort`, or none of them. */
  sortKey?: string | null
  /** Controlled sort direction. */
  direction?: SortDirection
  /** Called with the next (key, direction) pair when a header is clicked. */
  onSort?: (key: string, direction: SortDirection) => void
  testId: string
  emptyNote?: string
}) {
  const [ownSortKey, setOwnSortKey] = useState<string | null>(initialSort ?? null)
  // "movedex-rows" names the table; a row inside it is "movedex-row-29", not
  // "movedex-rows-row-29". Same convention LedgerList uses.
  const base = testId.replace(/-rows$/, '')
  const [ownDirection, setOwnDirection] = useState<SortDirection>('asc')

  const controlled = onSort != null
  const sortKey = controlled ? (controlledSortKey ?? null) : ownSortKey
  const direction = controlled ? (controlledDirection ?? 'asc') : ownDirection

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sortKey)
    if (!column?.sortValue) return rows
    const get = column.sortValue
    const sign = direction === 'asc' ? 1 : -1
    // Slice first: sort mutates, and `rows` is the caller's array.
    return rows.slice().sort((a, b) => compareSortValues(get(a), get(b), sign))
  }, [rows, sortKey, direction, columns])

  const toggle = (key: string) => {
    // Same column -> flip; a different one -> start ascending. Identical in both
    // modes, so a controlled caller inherits the header's behaviour rather than
    // reimplementing it.
    const next: SortDirection = key === sortKey && direction === 'asc' ? 'desc' : 'asc'
    if (controlled) {
      onSort(key, next)
      return
    }
    if (key === sortKey) {
      setOwnDirection(next)
    } else {
      setOwnSortKey(key)
      setOwnDirection('asc')
    }
  }

  const widths = columns.some((c) => c.width)

  return (
    <div className="data-table-wrap">
      {/*
        `data-table-sized` SAYS THIS TABLE DECLARES ITS OWN COLUMN WIDTHS, and
        the stylesheet uses it to stand its positional fallbacks down. Those
        fallbacks (`.data-table th:nth-child(n)`) were written for the Movedex's
        original six columns and reach every table in the app, so without a way
        to opt out a colgroup was not authoritative: Chrome's fixed layout takes
        the LARGER of the column's width and the first row's cell width, so a
        declared 3.9rem column still came out at the 15rem the fallback asked
        for. Marking the table is what makes Column.width mean what it says.
      */}
      <table className={widths ? 'data-table data-table-sized' : 'data-table'} data-testid={testId}>
        {widths && (
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={c.width ? { width: c.width } : undefined} />
            ))}
            {onRowClick && <col className="data-table-chevron-col" />}
          </colgroup>
        )}
        <thead>
          <tr>
            {columns.map((c) => {
              const active = c.key === sortKey
              const sortable = c.sortValue != null
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={c.numeric ? 'data-table-num' : undefined}
                  // The live sort state, for assistive tech and for the suites.
                  aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  {sortable ? (
                    <button
                      type="button"
                      className={active ? 'data-table-sort is-active' : 'data-table-sort'}
                      data-testid={`${base}-sort-${c.key}`}
                      onClick={() => toggle(c.key)}
                    >
                      {c.label}
                      <span className="data-table-arrow" aria-hidden>
                        {active ? (direction === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              )
            })}
            {/* Header cell for the chevron column: unlabelled, but it has to
                exist or the header row is one cell short of the body rows. */}
            {onRowClick && <th scope="col" className="data-table-chevron-col" aria-label="Open" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row)
            return (
              <tr
                key={key}
                data-testid={`${base}-row-${key}`}
                data-entry-id={key}
                aria-current={selectedKey === key ? true : undefined}
                className={onRowClick ? 'data-table-row-clickable' : undefined}
                // A row is the click target so the whole row reacts, but the
                // keyboard needs a real control: the name cell carries a button.
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c, i) => (
                  <td key={c.key} className={c.numeric ? 'data-table-num' : undefined}>
                    {i === 0 && onRowClick ? (
                      <button
                        type="button"
                        className="data-table-open"
                        data-testid={`${base}-open-${key}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onRowClick(row)
                        }}
                      >
                        {c.render ? c.render(row) : String(c.sortValue?.(row) ?? '')}
                      </button>
                    ) : c.render ? (
                      c.render(row)
                    ) : (
                      String(c.sortValue?.(row) ?? '')
                    )}
                  </td>
                ))}
                {onRowClick && (
                  <td className="data-table-chevron-col">
                    <IconChevronRight
                      className="row-chevron"
                      size={16}
                      stroke={1.5}
                      aria-hidden
                      focusable="false"
                    />
                  </td>
                )}
              </tr>
            )
          })}
          {sorted.length === 0 && emptyNote && (
            <tr>
              <td
                colSpan={columns.length + (onRowClick ? 1 : 0)}
                className="empty"
                data-testid={`${base}-empty`}
              >
                {emptyNote}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
