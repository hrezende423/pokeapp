import { NavGroup } from './NavGroup'
import { NAV_TABS, entryContains, tabIsActive, type NavEntry, type PageId } from './navConfig'

/**
 * The top-level nav, rendered entirely from NAV_TABS.
 *
 * There is no per-tab and no per-item JSX here: one loop over the tabs, one
 * recursive renderer for entries. Changing the nav means editing navConfig.ts.
 *
 * "Notes" is absent on purpose -- a deliberate removal, not an omission.
 */

function NavEntryItem({
  entry,
  activeId,
  onSelect,
}: {
  entry: NavEntry
  activeId: PageId
  onSelect: (id: PageId) => void
}) {
  const active = entry.id === activeId

  // A nested entry renders as its own group, so the same hover/focus/Escape
  // behaviour applies one level down without a second implementation.
  if (entry.children && entry.children.length > 0) {
    return (
      <div className="nav-subgroup" data-testid={`nav-subgroup-${entry.id}`}>
        <button
          type="button"
          className={
            entryContains(entry, activeId)
              ? 'nav-item nav-item-parent nav-item-active'
              : 'nav-item nav-item-parent'
          }
          data-testid={`nav-${entry.id}`}
          aria-current={active ? 'page' : undefined}
          onClick={() => onSelect(entry.id)}
        >
          {entry.label}
        </button>
        <div className="nav-subdropdown" data-testid={`nav-subdropdown-${entry.id}`}>
          {entry.children.map((child) => (
            <NavEntryItem key={child.id} entry={child} activeId={activeId} onSelect={onSelect} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      className={active ? 'nav-item nav-item-active' : 'nav-item'}
      data-testid={`nav-${entry.id}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(entry.id)}
    >
      {entry.label}
    </button>
  )
}

export function NavMenu({
  activeId,
  onSelect,
}: {
  activeId: PageId
  onSelect: (id: PageId) => void
}) {
  return (
    <div className="app-nav" data-testid="app-nav">
      {NAV_TABS.map((tab) => {
        const items = tab.entries.map((entry) => (
          <NavEntryItem key={entry.id} entry={entry} activeId={activeId} onSelect={onSelect} />
        ))

        return (
          <NavGroup
            key={tab.id}
            id={tab.id}
            label={tab.label}
            active={tabIsActive(tab, activeId)}
            onActivate={tab.destination ? () => onSelect(tab.destination as PageId) : undefined}
          >
            {/* Wrapped when the tab asks for it, so `dex-switcher` resolves to
                exactly the registered dex buttons and nothing else. */}
            {tab.itemsTestId ? (
              <nav aria-label={tab.label} data-testid={tab.itemsTestId}>
                {items}
              </nav>
            ) : (
              items
            )}
          </NavGroup>
        )
      })}
    </div>
  )
}
