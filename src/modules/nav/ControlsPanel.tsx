import { ToggleSwitch } from '../../components/ToggleSwitch'
// The Pokedex's type filter is declared as a `types` filter in speciesQuery.ts
// and rendered by FilterPanel, which is the ONE place in the app that renders
// components/TypeFilter -- so the Pokedex, the Movedex and the Berrydex cannot
// drift apart in colours, OR semantics or clear behaviour. It used to be
// imported directly here; the import moved with the markup, not the rule.
import { FilterPanel } from '../dex/query/FilterPanel'
import { SortPanel } from '../dex/query/SortPanel'
import { useDisclosureGroup } from '../dex/query/useDisclosureGroup'
import { useFilters } from '../filters/filtersContext'
import { GlobalSearch } from '../search/GlobalSearch'
import { VersionGroupSelector } from '../version-group/VersionGroupSelector'
import { useNav } from './navContext'

/**
 * The app bar's right-hand controls: everything that used to sit permanently on
 * screen, plus -- on the Pokedex -- that dex's filter and sort disclosures.
 *
 * TRIGGERS: text-only ghost buttons -- no icon, no border, no fill. "Search/
 * filter species" replaced a Tabler IconFilter, because an icon had to be
 * guessed at (filter or magnifier, each promising something different) where the
 * words say exactly what the panel holds. .ghost-button is the treatment
 * .nav-trigger and .pokedex-back already used unnamed.
 *
 * TWO DISCLOSURES ON THE POKEDEX, ONE EVERYWHERE ELSE, and one open at a time.
 * Sort is a separate question from filtering and gets its own panel, the same
 * split every other dex's controls row makes; `useDisclosureGroup` makes "only
 * one" structural rather than a pair of handlers that have to remember each
 * other. The Sort trigger only renders on the Pokedex, because it is the only
 * module whose controls live up here -- see filtersContext.ts for why.
 *
 * NEITHER PANEL DISMISSES ON AN OUTSIDE CLICK, which is the one place this
 * pattern differs from the per-dex version, and it is deliberate: this panel
 * holds the cross-dex search, whose results dropdown already owns Escape and
 * whose hits are clicked from inside a floating layer. A panel that vanished
 * while you were reaching for a result would be worse than one you close.
 *
 * The panel stays MOUNTED while closed (display: none), so the filters keep
 * their values across a close/open and nothing inside is tabbable.
 */
export function ControlsPanel() {
  const nav = useNav()
  const filters = useFilters()
  const onPokedex = nav.moduleId === 'pokedex'
  const { openId, toggle } = useDisclosureGroup()
  const filtersOpen = openId === 'filters'
  const sortOpen = openId === 'sort'
  const count = filters.query.visible.length

  return (
    <>
      {onPokedex && (
        <div className="app-controls" data-testid="species-sort" data-open={sortOpen}>
          <button
            type="button"
            className="ghost-button app-controls-toggle"
            data-testid="species-sort-toggle"
            aria-expanded={sortOpen}
            aria-controls="species-sort-panel"
            data-filters-active={filters.query.sortKey !== 'dex'}
            onClick={() => toggle('sort')}
          >
            Sort
          </button>
          <div
            className="app-controls-panel"
            id="species-sort-panel"
            data-testid="species-sort-panel"
          >
            <div className="app-controls-field">
              <SortPanel
                dexId="species"
                sorts={filters.sorts}
                query={filters.query}
                /*
                  THE VIEW SWITCH LIVES IN THE SORT PANEL, not beside it, because
                  the two are one decision: the grid can order by three fields and
                  the table by all twelve, so "which orderings exist" is answered
                  by "which view am I in". Putting the switch anywhere else would
                  make the field list change for a reason off screen.
                */
                header={
                  <ToggleSwitch
                    id="species-view"
                    label="View"
                    offLabel="Grid"
                    onLabel="List"
                    checked={filters.view === 'list'}
                    onChange={(next) => filters.setView(next ? 'list' : 'grid')}
                  />
                }
              />
            </div>
          </div>
        </div>
      )}

      <div className="app-controls" data-testid="app-controls" data-open={filtersOpen}>
        <button
          type="button"
          className="ghost-button app-controls-toggle"
          data-testid="controls-toggle"
          aria-expanded={filtersOpen}
          aria-controls="app-controls-panel"
          data-filters-active={onPokedex && filters.query.activeCount > 0}
          onClick={() => toggle('filters')}
        >
          Search/filter species
        </button>

        <div className="app-controls-panel" id="app-controls-panel" data-testid="controls-panel">
          <div className="app-controls-field">
            <span className="app-controls-label">Search all dexes</span>
            <GlobalSearch />
          </div>

          {onPokedex && (
            <div className="app-controls-field" data-testid="controls-species-filters">
              <span className="app-controls-label">Filter species</span>
              <FilterPanel
                dexId="species"
                sections={filters.sections}
                query={filters.query}
                /* The Pokedex grid deliberately has no count on the page, so the
                   readout lives here, where it answers the question the filters
                   just raised: how many are left. */
                footer={
                  <p className="dex-filter-count" data-testid="species-count">
                    {count} species
                  </p>
                }
              />
            </div>
          )}

          <div className="app-controls-field">
            <VersionGroupSelector />
          </div>
        </div>
      </div>
    </>
  )
}
