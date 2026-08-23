import { useMemo, useState } from 'react'
import { TypeBadge } from '../../components/TypeBadge'
import { TypeFilter } from '../../components/TypeFilter'
import { resolveTypesForGeneration, typesInGeneration } from '../../data'
import type { Species } from '../../data'
import { speciesEntries } from '../dex/entrySources'
import { useVersionGroup } from '../version-group/context'

interface Props {
  selectedId: number | null
  onSelect: (id: number) => void
}

/** The default form is what the list shows; alternate forms live in the detail view. */
function defaultVariety(species: Species) {
  return species.varieties.find((v) => v.is_default) ?? species.varieties[0]
}

export function SpeciesList({ selectedId, onSelect }: Props) {
  const { generation, isAll } = useVersionGroup()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<number[]>([])

  const availableTypes = useMemo(() => typesInGeneration(generation), [generation])

  // A type that stops existing when the generation changes must not keep filtering.
  const activeTypeFilter = useMemo(
    () => typeFilter.filter((id) => availableTypes.some((t) => t.id === id)),
    [typeFilter, availableTypes],
  )

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    // The one source for "which species does this dex list" -- the global search
    // calls the same function, so the two cannot disagree about scope.
    return speciesEntries({ generation, isAll })
      .map((s) => {
        const variety = defaultVariety(s)
        return {
          species: s,
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

  return (
    <div className="species-list">
      <div className="list-controls">
        <input
          type="search"
          data-testid="species-search"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search species by name"
        />
        <TypeFilter
          available={availableTypes}
          selected={activeTypeFilter}
          onChange={setTypeFilter}
        />
        <p className="subtitle" data-testid="list-count">
          {rows.length} species
        </p>
      </div>

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
