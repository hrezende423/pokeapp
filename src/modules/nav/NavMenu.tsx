import { DexSwitcher } from './DexSwitcher'
import { NavGroup } from './NavGroup'
import type { DexModuleId } from './registry'

/**
 * The top-level nav: three groups rather than a flat row of every dex.
 *
 *   Pokédex       destination + dropdown of the other five dexes
 *   Team Builder  dropdown only -- nothing is built behind these yet
 *   Tools         no dropdown; the domain is unscoped
 *
 * "Notes" is absent on purpose.
 *
 * Team Builder's items are the two that were named. The instruction that
 * introduced it ended with "etc.", so there are more intended and they are NOT
 * guessed at here -- the two known items are wired as inert placeholders and the
 * rest are an open question.
 */
const TEAM_ITEMS = ['Build Library', 'Team Builder'] as const

export function NavMenu({
  activeId,
  onSelect,
}: {
  activeId: DexModuleId
  onSelect: (id: DexModuleId) => void
}) {
  return (
    <div className="app-nav" data-testid="app-nav">
      <DexSwitcher activeId={activeId} onSelect={onSelect} />

      <NavGroup id="team" label="Team Builder">
        {TEAM_ITEMS.map((item) => (
          <button
            key={item}
            type="button"
            className="nav-item"
            data-testid={`nav-team-${item.toLowerCase().replace(/\s+/g, '-')}`}
            /*
              aria-disabled, NOT the disabled attribute: `disabled` removes a
              button from the tab order, which would make these two unreachable by
              keyboard -- the exact failure this dropdown is supposed to avoid.
              This way they are announced as unavailable, still focusable, and the
              click does nothing because there is nothing built behind them.
            */
            aria-disabled="true"
          >
            {item}
          </button>
        ))}
      </NavGroup>

      <NavGroup
        id="tools"
        label="Tools"
        emptyNote="Nothing here yet — the tools and calculators domain is not scoped."
      />
    </div>
  )
}
