import { IconFilter } from '@tabler/icons-react'
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
 * ICON: Tabler's IconFilter, not IconSearch. What this reveals is a set of things
 * that narrow what you are looking at -- a name filter, a type filter and a game
 * scope -- and a magnifier would promise a search box and nothing else. The
 * cross-dex search is in here too, but it is one of four controls rather than the
 * headline.
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
        className="app-controls-toggle"
        data-testid="controls-toggle"
        aria-expanded={open}
        aria-controls="app-controls-panel"
        aria-label={open ? 'Hide search and filters' : 'Show search and filters'}
        data-filters-active={filters.active}
        onClick={() => setOpen((v) => !v)}
      >
        <IconFilter size={24} stroke={1.5} aria-hidden focusable="false" />
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
