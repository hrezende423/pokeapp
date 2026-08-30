import { useMemo } from 'react'
import { SpeciesCardGrid } from '../../components/SpeciesCardGrid'
import { TypeBadge } from '../../components/TypeBadge'
import { resolveTypesForGeneration } from '../../data'
import type { Species } from '../../data'
import { useFilters } from '../filters/filtersContext'
import { speciesEntries } from '../dex/entrySources'
import { useVersionGroup } from '../version-group/context'

/**
 * How the same list draws itself.
 *
 * `grid` is the browse view from Figma MainPage-Light/Dark; `rail` is the 240px
 * sidebar that sits beside an open species. One component rather than two so the
 * filtering below -- and with it the generation scope -- cannot drift between
 * them, and so both expose the same test ids.
 */
export type SpeciesListLayout = 'rail' | 'grid'

interface Props {
  selectedId: number | null
  onSelect: (id: number) => void
  layout?: SpeciesListLayout
}

/** The default form is what the list shows; alternate forms live in the detail view. */
function defaultVariety(species: Species) {
  return species.varieties.find((v) => v.is_default) ?? species.varieties[0]
}

export function SpeciesList({ selectedId, onSelect, layout = 'rail' }: Props) {
  const { generation, isAll } = useVersionGroup()
  // The controls themselves live in the app bar's controls panel; this reads the
  // same state they write. The generation clamp is applied by the provider.
  const { search, typeFilter: activeTypeFilter } = useFilters()

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    // The one source for "which species does this dex list" -- the global search
    // calls the same function, so the two cannot disagree about scope.
    return speciesEntries({ generation, isAll })
      .map((s) => {
        const variety = defaultVariety(s)
        return {
          species: s,
          variety,
          typeIds: resolveTypesForGeneration(variety, generation).map((t) => t.type_id),
        }
      })
      .filter((row) => {
        if (term && !row.species.display_name.toLowerCase().includes(term)) return false
        // OR across selected types: a species matches if it has ANY of them.
        if (activeTypeFilter.length > 0) {
          if (!row.typeIds.some((id) => activeTypeFilter.includes(id))) return false
        }
        return true
      })
  }, [generation, isAll, search, activeTypeFilter])

  /*
    No count readout either. It was the last thing left in this block, so the
    block itself is gone rather than left as an empty wrapper contributing
    spacing. Row count is still observable -- it is the number of children of
    [data-testid="species-rows"], which is the truth rather than a rendered
    string about it.
  */

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
