import { useMemo, useState } from 'react'
import { TypeRow } from '../../components/ds/TypeLabel'
import { TypeBadge } from '../../components/TypeBadge'
import { TypeFilter } from '../../components/TypeFilter'
import {
  DEFAULT_ARTWORK_VIEW,
  getType,
  resolveAbilitiesForGeneration,
  resolveArtworkUrl,
  resolveTypesForGeneration,
  typesInGeneration,
} from '../../data'
import type { Species } from '../../data'
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

  const controls = (
    <div className="list-controls">
      <input
        type="search"
        data-testid="species-search"
        placeholder="Search by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search species by name"
      />
      <TypeFilter available={availableTypes} selected={activeTypeFilter} onChange={setTypeFilter} />
      <p className="subtitle" data-testid="list-count">
        {rows.length} species
      </p>
    </div>
  )

  if (layout === 'grid') {
    return (
      <div className="species-list species-list-grid">
        {controls}
        <ul className="pokedex-grid" data-testid="species-rows">
          {rows.map(({ species, variety, typeIds }) => (
            <li key={species.id}>
              <button
                type="button"
                data-testid={`species-row-${species.id}`}
                data-species-id={species.id}
                aria-current={selectedId === species.id}
                className="species-card"
                onClick={() => onSelect(species.id)}
              >
                {/* Centred on the card and flush with its top, per Figma's
                    shadow-number node -- not bleeding off a corner. Three digits,
                    against the four in the line below it. */}
                <span className="species-card-ghost" aria-hidden>
                  {String(species.id).padStart(3, '0')}
                </span>
                {(() => {
                  // Official artwork, regular, static -- the same default the
                  // detail view opens on, and what the reference renders.
                  const art = resolveArtworkUrl(species, variety, DEFAULT_ARTWORK_VIEW)
                  return art ? (
                    <img
                      className="species-card-art"
                      src={art}
                      alt=""
                      loading="lazy"
                      data-testid={`species-card-art-${species.id}`}
                    />
                  ) : null
                })()}
                <span className="species-card-text">
                  <span className="species-card-line">
                    <span className="dex-no">#{String(species.id).padStart(4, '0')}</span>
                    <span className="species-name">{species.display_name}</span>
                  </span>
                  <span className="species-card-types">
                    <TypeRow
                      types={typeIds.map((id) => getType(id)?.name ?? '').filter(Boolean)}
                      small
                    />
                  </span>
                  {/*
                    Non-hidden abilities only, middot-separated -- read off the
                    reference, where Quagsire shows "Damp · Water Absorb" but not
                    Unaware, and Bulbasaur shows Overgrow but not Chlorophyll.
                    Empty for Gens 1-2, which had no abilities at all; the line is
                    simply absent then, and because the text block is positioned
                    as a whole it cannot move the two lines above it.
                  */}
                  {(() => {
                    const abilities = resolveAbilitiesForGeneration(variety, generation)
                      .filter((a) => !a.is_hidden)
                      .map((a) => a.ability.display_name)
                    return abilities.length > 0 ? (
                      <span
                        className="species-card-ability"
                        data-testid={`species-card-ability-${species.id}`}
                      >
                        {abilities.join(' · ')}
                      </span>
                    ) : null
                  })()}
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

  return (
    <div className="species-list">
      {controls}

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
