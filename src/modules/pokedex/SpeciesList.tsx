import { useMemo } from 'react'
import { DataTable } from '../../components/DataTable'
import { SpeciesCardGrid } from '../../components/SpeciesCardGrid'
import { TypeBadge } from '../../components/TypeBadge'
import { pokedexFooter } from '../../components/speciesCardFooters'
import { useDexRows } from '../dex/query/dexQueryContext'
import { useVersionGroup } from '../version-group/context'
import { speciesColumns } from './speciesColumns'
import type { SpeciesRow } from './speciesQuery'

/**
 * How the same list draws itself.
 *
 * `grid` is the browse view from Figma MainPage-Light/Dark; `list` is the wide
 * sortable table; `rail` is the 240px sidebar that sits beside an open species.
 * One component rather than three so the query -- and with it the generation
 * scope -- cannot drift between them, and so all three expose the same test ids.
 *
 * IT NO LONGER FILTERS. The rows arrive already filtered and sorted from the
 * shared dex query, which is where the app bar's controls write. Doing it here
 * as well was fine while "the query" was a name and a type list; with eleven
 * filter sections and a sort it would be a second implementation of the same
 * question.
 *
 * THE TABLE SORTS ITSELF, from its own column headers, in controlled mode
 * against the same query state. The bar's Sort trigger is disabled while this
 * view is open for exactly that reason: one ordering, one control, and the one
 * that is on screen beside the data wins.
 */
export type SpeciesListLayout = 'rail' | 'grid' | 'list'

interface Props {
  selectedId: number | null
  onSelect: (id: number) => void
  layout?: SpeciesListLayout
}

export function SpeciesList({ selectedId, onSelect, layout = 'rail' }: Props) {
  const { generation, versionGroup } = useVersionGroup()
  const { rows } = useDexRows<SpeciesRow>('pokedex')

  const columns = useMemo(
    () => speciesColumns({ generation, versionGroup }),
    [generation, versionGroup],
  )

  if (layout === 'list') {
    return (
      <div className="species-list species-list-table">
        {/*
          THE TABLE OWNS ITS OWN SORT HERE, and that is why the bar's Sort
          trigger is disabled while this view is open. The two cannot be one
          state: the menu offers the four orderings a CARD can be read by, and
          this table has thirty-five columns -- wiring the headers to the menu's
          state meant a header click set a key the menu could not hold, the
          fallback fired, and the click did nothing at all. One control per
          question, and on this view the control is the header row.
        */}
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.species.id}
          onRowClick={(row) => onSelect(row.species.id)}
          selectedKey={selectedId}
          initialSort="natdex"
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

          The FOOTER is this grid's own: abilities, and under them the base-stat
          total and Speed. The other grids that render this card keep the
          abilities line alone -- see speciesCardFooters.tsx.
        */}
        <SpeciesCardGrid
          entries={rows.map(({ species }) => ({ species }))}
          generation={generation}
          selectedId={selectedId}
          onSelect={onSelect}
          testId="species-rows"
          footer={pokedexFooter}
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
