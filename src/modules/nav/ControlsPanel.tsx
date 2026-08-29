import { useState } from 'react'
import { TypeFilter } from '../../components/TypeFilter'
import { useFilters } from '../filters/filtersContext'
import { GlobalSearch } from '../search/GlobalSearch'
import { VersionGroupSelector } from '../version-group/VersionGroupSelector'
import { useNav } from './navContext'

/**
 * One toggle at the top-right of the app bar, revealing every control that used
 * to sit permanently on screen.
 *
 * TRIGGER: a text-only ghost button reading "Search/filter species" -- no icon,
 * no border, no fill. It replaced a Tabler IconFilter: an icon had to be guessed
 * at (filter or magnifier, each promising something different), where the words
 * say exactly what the panel holds. .ghost-button is the treatment .nav-trigger
 * and .pokedex-back already used unnamed.
 *
 * The panel is a disclosure, not a menu: it stays open until its own button
 * closes it, and does not dismiss on an outside click or on Escape. Escape
 * already belongs to the search results dropdown nested inside it, and a controls
 * panel that vanished while you were reaching for the second control would be
 * worse than one you close deliberately.
 *
 * The two Pokedex-specific controls only render while that module is active; the
 * cross-dex search and the game scope are app-wide and always present.
 */
export function ControlsPanel() {
  const [open, setOpen] = useState(false)
  const nav = useNav()
  const filters = useFilters()
  const onPokedex = nav.moduleId === 'pokedex'

  return (
    <div className="app-controls" data-testid="app-controls" data-open={open}>
      <button
        type="button"
        className="ghost-button app-controls-toggle"
        data-testid="controls-toggle"
        aria-expanded={open}
        aria-controls="app-controls-panel"
        data-filters-active={filters.active}
        onClick={() => setOpen((v) => !v)}
      >
        Search/filter species
      </button>

      {/* Kept mounted so the search keeps its state across a close/open, and
          hidden with display:none so nothing inside is tabbable while closed. */}
      <div className="app-controls-panel" id="app-controls-panel" data-testid="controls-panel">
        <div className="app-controls-field">
          <span className="app-controls-label">Search all dexes</span>
          <GlobalSearch />
        </div>

        {onPokedex && (
          <div className="app-controls-field" data-testid="controls-species-filters">
            <span className="app-controls-label">Filter species</span>
            <input
              type="search"
              data-testid="species-search"
              placeholder="Search by name…"
              value={filters.search}
              onChange={(e) => filters.setSearch(e.target.value)}
              aria-label="Search species by name"
            />
            <TypeFilter
              available={filters.availableTypes}
              selected={filters.typeFilter}
              onChange={filters.setTypeFilter}
            />
          </div>
        )}

        <div className="app-controls-field">
          <VersionGroupSelector />
        </div>
      </div>
    </div>
  )
}
