import { IconChevronRight } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

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
  sortValue?: (row: T) => string | number | null
  /** Right-aligned, --font-numeric. For counts and measurements. */
  numeric?: boolean
}

export type SortDirection = 'asc' | 'desc'

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  selectedKey = null,
  initialSort,
  testId,
  emptyNote,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => number
  onRowClick?: (row: T) => void
  selectedKey?: number | null
  /** Column key to sort by on first render. */
  initialSort?: string
  testId: string
  emptyNote?: string
}) {
  const [sortKey, setSortKey] = useState<string | null>(initialSort ?? null)
  // "movedex-rows" names the table; a row inside it is "movedex-row-29", not
  // "movedex-rows-row-29". Same convention LedgerList uses.
  const base = testId.replace(/-rows$/, '')
  const [direction, setDirection] = useState<SortDirection>('asc')

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sortKey)
    if (!column?.sortValue) return rows
    const get = column.sortValue
    const sign = direction === 'asc' ? 1 : -1
    // Slice first: sort mutates, and `rows` is the caller's array.
    return rows.slice().sort((a, b) => {
      const av = get(a)
      const bv = get(b)
      // Null-last regardless of direction -- see the note above.
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign
      return String(av).localeCompare(String(bv)) * sign
    })
  }, [rows, sortKey, direction, columns])

  const toggle = (key: string) => {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setDirection('asc')
    }
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table" data-testid={testId}>
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
