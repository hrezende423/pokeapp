import { ToggleSwitch } from '../../components/ToggleSwitch'
import { FilterPanel } from '../dex/query/FilterPanel'
import { PanelScroller } from '../dex/query/PanelScroller'
import { SortPanel } from '../dex/query/SortPanel'
import { useDexQueryBundle } from '../dex/query/dexQueryContext'
import { useDisclosureGroup } from '../dex/query/useDisclosureGroup'
import { GlobalSearch } from '../search/GlobalSearch'

/**
 * The app bar's one page menu: "Sort/Filter".
 *
 * ONE MENU, THREE PARTS (owner, 2026-10-10). The Grid/List switch, the Sort menu
 * and the Search/Filter menu were three triggers in the bar; they are one text
 * trigger now, and the panel is divided in the order a reader narrows a list:
 *
 *   View mode        the Pokedex's Grid/List switch     (Pokedex browse only)
 *   Sort options     field and direction                (pages with a bar sort)
 *   Search/Filter    the cross-dex search + the page's filters
 *
 * A HAIRLINE BETWEEN PARTS AND NOWHERE ELSE. The rows inside a part are spaced,
 * not ruled -- the owner's call, and it is what makes the three parts read as
 * three. A part a page does not have is absent, not empty.
 *
 * DISABLED, NOT HIDDEN, on a page with nothing to sort, filter or switch (Type
 * Coverage, the Naturedex's matrix, a build being edited, the calculators):
 * the same call the Sort trigger made on the list view, and for the same reason
 * -- a trigger that vanishes reads as a bug, a greyed one says "not here". The
 * cross-dex search lives in this menu, so it goes with it on those pages.
 *
 * "RESET FILTERS" IS STICKY at the top of the panel. With the filters unfolded
 * the panel scrolls, and undoing a filter should not need the scroll back up.
 *
 * Panels stay MOUNTED while closed (display: none), so filters keep their values
 * across a close/open and nothing inside is tabbable. A press outside closes it.
 */
export function ControlsPanel() {
  const bundle = useDexQueryBundle()
  const { openId, toggle, ref } = useDisclosureGroup({ dismissOnOutsideClick: true })
  const hasFilters = bundle.sections.length > 0
  const hasSort = bundle.sorts.length > 0
  const hasView = bundle.showViewToggle
  const available = !bundle.menuDisabled && (hasFilters || hasSort || hasView)
  /* ANDed with `available` so a menu left open on one page cannot hang open
     under a disabled trigger on the next, with nothing left to close it. */
  const open = openId === 'menu' && available
  const count = bundle.query.visible.length
  const sortActive =
    hasSort && !bundle.sortDisabled && bundle.query.sortKey !== bundle.sorts[0]?.key

  return (
    <div className="app-controls-cluster" ref={ref}>
      <div className="app-controls" data-testid="app-controls" data-open={open}>
        <button
          type="button"
          className="ghost-button app-controls-toggle"
          data-testid="controls-toggle"
          aria-expanded={open}
          aria-controls="app-controls-panel"
          disabled={!available}
          title={available ? undefined : 'Nothing to sort or filter on this page'}
          data-filters-active={available && (bundle.query.activeCount > 0 || sortActive)}
          onClick={() => toggle('menu')}
        >
          Sort/Filter
        </button>

        <PanelScroller
          className="app-controls-panel dex-menu"
          testId="controls-panel"
          id="app-controls-panel"
        >
          {/* The same action as "Clear all filters" at the foot of the panel, at
              the head of it as well, and pinned there while the panel scrolls. */}
          {hasFilters && (
            <div className="app-controls-reset">
              <button
                type="button"
                className="ghost-button dex-filter-clear"
                data-testid="controls-reset-top"
                disabled={bundle.query.activeCount === 0}
                onClick={bundle.query.clearAll}
              >
                Reset filters
              </button>
            </div>
          )}

          {hasView && (
            <div className="app-controls-part" data-part="view" data-testid="controls-part-view">
              <span className="ds-field-label">View mode</span>
              <ToggleSwitch
                id="species-view"
                label="View"
                offLabel="Grid"
                onLabel="List"
                checked={bundle.view === 'list'}
                onChange={(next) => bundle.setView(next ? 'list' : 'grid')}
              />
            </div>
          )}

          {hasSort && (
            <div className="app-controls-part" data-part="sort" data-testid="controls-part-sort">
              {/*
                The list view is a TABLE and its column headers are the sort
                there, so the part says so in place of the fields rather than
                offering a second control for the same state.
              */}
              {bundle.sortDisabled ? (
                <>
                  <span className="ds-field-label">Sort by</span>
                  <p className="dex-filter-note" data-testid="controls-sort-disabled">
                    Sort the list view from its column headers.
                  </p>
                </>
              ) : (
                <SortPanel dexId="dex" sorts={bundle.sorts} query={bundle.query} />
              )}
            </div>
          )}

          {hasFilters && (
            <div
              className="app-controls-part"
              data-part="filter"
              data-testid="controls-part-filter"
            >
              <div className="app-controls-field">
                <span className="app-controls-label">Search all dexes</span>
                <GlobalSearch />
              </div>
              <div className="app-controls-field" data-testid="controls-dex-filters">
                <FilterPanel
                  dexId="dex"
                  sections={bundle.sections}
                  query={bundle.query}
                  footer={
                    <p className="dex-filter-count" data-testid="dex-filter-count">
                      {count} {count === 1 ? 'match' : 'matches'}
                    </p>
                  }
                />
              </div>
            </div>
          )}
        </PanelScroller>
      </div>
    </div>
  )
}
