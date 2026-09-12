import { useMemo, type ReactNode } from 'react'
import { DataTable, type Column } from '../../components/DataTable'
import { SpeciesCardGrid } from '../../components/SpeciesCardGrid'
import { TypeBadge } from '../../components/TypeBadge'
import { useFilters } from '../filters/filtersContext'
import { useVersionGroup } from '../version-group/context'
import { statFieldsFor, type SpeciesRow } from './speciesQuery'

/**
 * How the same list draws itself.
 *
 * `grid` is the browse view from Figma MainPage-Light/Dark; `list` is the dense
 * sortable table added with the filter pass; `rail` is the 240px sidebar that
 * sits beside an open species. One component rather than three so the query --
 * and with it the generation scope -- cannot drift between them, and so all
 * three expose the same test ids.
 *
 * IT NO LONGER FILTERS. The rows arrive already filtered and sorted from the
 * filters context, which is where the controls write. Doing it here as well was
 * fine while "the query" was a name and a type list; with eleven filter sections
 * and a sort it would be a second implementation of the same question.
 *
 * THE TABLE AND THE SORT PANEL SHARE ONE SORT STATE. `DataTable` is driven in
 * controlled mode -- the header row and the panel are two views of the same
 * `query.sortKey`/`query.direction`, so clicking a column header moves the panel
 * and vice versa. Two independent copies would have disagreed the first time
 * either was used, and the reader would have had no way to tell which was in
 * force.
 */
export type SpeciesListLayout = 'rail' | 'grid' | 'list'

interface Props {
  selectedId: number | null
  onSelect: (id: number) => void
  layout?: SpeciesListLayout
}

export function SpeciesList({ selectedId, onSelect, layout = 'rail' }: Props) {
  const { generation } = useVersionGroup()
  const { query, sorts } = useFilters()
  const rows = query.visible

  /*
    The table's columns ARE the sort fields, mapped one to one, so a column that
    can be clicked to sort and a field the panel offers cannot come apart. The
    accessors are the same functions -- `sorts` is the single declaration -- and
    only the cell rendering is added here.
  */
  const columns: Column<SpeciesRow>[] = useMemo(() => {
    const statKeys = new Set(statFieldsFor(generation).map((s) => `stat-${s.key}`))
    return sorts.map((field) => {
      const numeric = field.key !== 'name'
      let render: (row: SpeciesRow) => ReactNode
      if (field.key === 'dex') {
        render = (row) => <span className="num">#{String(row.species.id).padStart(4, '0')}</span>
      } else if (field.key === 'name') {
        render = (row) => row.species.display_name
      } else if (field.key === 'height') {
        render = (row) => (
          <span className="num">
            {row.height != null ? (row.height / 10).toFixed(1) : '—'}
            <span className="move-unit">m</span>
          </span>
        )
      } else if (field.key === 'weight') {
        render = (row) => (
          <span className="num">
            {row.weight != null ? (row.weight / 10).toFixed(1) : '—'}
            <span className="move-unit">kg</span>
          </span>
        )
      } else if (statKeys.has(field.key) || field.key === 'bst' || field.key === 'friendship') {
        render = (row) => {
          const value = field.value(row)
          return <span className="num">{value ?? '—'}</span>
        }
      } else {
        render = (row) => <span className="num">{field.value(row) ?? '—'}</span>
      }
      return { key: field.key, label: field.label, sortValue: field.value, render, numeric }
    })
  }, [sorts, generation])

  if (layout === 'list') {
    return (
      <div className="species-list species-list-table">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.species.id}
          onRowClick={(row) => onSelect(row.species.id)}
          selectedKey={selectedId}
          sortKey={query.sortKey}
          direction={query.direction}
          onSort={query.setSort}
          testId="species-rows"
          emptyNote="No species match those filters."
        />
      </div>
    )
  }

  if (layout === 'grid') {
    return (
      <div className="species-list species-list-grid">
        {/*
          The card itself lives in components/SpeciesCardGrid.tsx, shared with the
          Movedex, Abilitydex and Breeding dex detail pages. This call site keeps
          the "species-rows" test id, so the grid is still the same thing every
          suite already inspects.
        */}
        <SpeciesCardGrid
          entries={rows.map(({ species }) => ({ species }))}
          generation={generation}
          selectedId={selectedId}
          onSelect={onSelect}
          testId="species-rows"
          emptyNote="No species match those filters."
        />
      </div>
    )
  }

  return (
    <div className="species-list">
      <ul className="species-rows" data-testid="species-rows">
        {rows.map(({ species, typeIds }) => (
          <li key={species.id}>
            <button
              type="button"
              data-testid={`species-row-${species.id}`}
              data-species-id={species.id}
              aria-current={selectedId === species.id}
              className={
                selectedId === species.id ? 'species-row species-row-active' : 'species-row'
              }
              onClick={() => onSelect(species.id)}
            >
              <span className="dex-no">#{String(species.id).padStart(3, '0')}</span>
              <span className="species-name">{species.display_name}</span>
              <span className="row-types">
                {typeIds.map((id) => (
                  <TypeBadge key={id} typeId={id} small />
                ))}
              </span>
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="empty" data-testid="list-empty">
            No species match those filters.
          </li>
        )}
      </ul>
    </div>
  )
}
