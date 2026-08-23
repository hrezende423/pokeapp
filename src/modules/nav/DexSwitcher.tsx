import { DEX_MODULES, type DexModuleId } from './registry'

/**
 * Top-level switcher between registered dex modules.
 *
 * Functional only, no design polish -- it renders straight from DEX_MODULES, so a
 * newly registered dex appears here with no change to this file.
 */
export function DexSwitcher({
  activeId,
  onSelect,
}: {
  activeId: DexModuleId
  onSelect: (id: DexModuleId) => void
}) {
  return (
    <nav className="dex-switcher" aria-label="Dex modules" data-testid="dex-switcher">
      {DEX_MODULES.map((m) => (
        <button
          key={m.id}
          type="button"
          data-testid={`nav-${m.id}`}
          aria-current={activeId === m.id ? 'page' : undefined}
          className={activeId === m.id ? 'dex-tab dex-tab-active' : 'dex-tab'}
          onClick={() => onSelect(m.id)}
        >
          {m.label}
        </button>
      ))}
    </nav>
  )
}
