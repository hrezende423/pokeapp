import { NavGroup } from './NavGroup'
import { DEX_MODULES, type DexModuleId } from './registry'

/**
 * The dex group: "Pokédex" as both a destination and the trigger for a dropdown
 * listing the other five dexes.
 *
 * Still renders straight from DEX_MODULES, so a newly registered dex appears in
 * the dropdown with no change here. The first registered module is the trigger
 * and the rest are the items, which is why registry order matters: it is the
 * order the dropdown shows.
 *
 * Every module keeps its `nav-<id>` button inside this element, in registry
 * order, including the five in the dropdown -- they are hidden with
 * `display: none` rather than unmounted, so the switcher is always a complete,
 * inspectable list of what is registered.
 */
export function DexSwitcher({
  activeId,
  onSelect,
}: {
  activeId: DexModuleId
  onSelect: (id: DexModuleId) => void
}) {
  const [primary, ...rest] = DEX_MODULES

  return (
    <nav className="dex-switcher" aria-label="Dex modules" data-testid="dex-switcher">
      <NavGroup
        id="dexes"
        label={primary.label}
        active={activeId === primary.id}
        onActivate={() => onSelect(primary.id)}
        triggerTestId={`nav-${primary.id}`}
      >
        {rest.map((m) => (
          <button
            key={m.id}
            type="button"
            className={activeId === m.id ? 'nav-item nav-item-active' : 'nav-item'}
            data-testid={`nav-${m.id}`}
            aria-current={activeId === m.id ? 'page' : undefined}
            onClick={() => onSelect(m.id)}
          >
            {m.label}
          </button>
        ))}
      </NavGroup>
    </nav>
  )
}
