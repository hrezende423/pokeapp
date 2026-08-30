import { useEffect, useState } from 'react'
import './App.css'
import { getBundleMeta, getIndexCounts, initDataLayer } from './data'
import type { BootStats } from './data'
import { DesignSystemPage } from './modules/design-system/DesignSystemPage'
import { FiltersProvider } from './modules/filters/FiltersProvider'
import { ControlsPanel } from './modules/nav/ControlsPanel'
import { NavMenu } from './modules/nav/NavMenu'
import { NavProvider } from './modules/nav/NavProvider'
import { useNav } from './modules/nav/navContext'
import { findPage } from './modules/nav/navConfig'
import { VersionGroupProvider } from './modules/version-group/VersionGroupProvider'
import './modules/pokedex/pokedex.css'

/**
 * The design-system reference page has no nav tab any more -- it was an
 * implementation aid, not a destination. It is still reachable at ?ds=1 so the
 * components stay rendered by the real app against the real data layer, which is
 * what the design-system verification measures. Read once at module scope: there
 * is no router, and nothing toggles this at runtime.
 */
const SHOW_DESIGN_SYSTEM =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('ds')

const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`

/**
 * The app bar plus the active module.
 *
 * Split out from App because it consumes the nav context that App provides: the
 * active module id and the search's navigation target are the same state, so both
 * the switcher and the global search read it from one place.
 */
function Shell() {
  const nav = useNav()
  const active = findPage(nav.moduleId)

  return (
    <>
      {/* Both of these are app-wide, not module-local: the version group gates
          five of the six dexes, and the search reaches all four searchable ones,
          so they sit beside the switcher rather than inside any one header. */}
      <div className="app-bar">
        {/* Brand then the three nav groups, per the full-95 navbar spec. */}
        <div className="app-bar-nav">
          <span className="app-brand" data-testid="app-brand">
            Pokeapp
          </span>
          <NavMenu activeId={active.id} onSelect={nav.setModule} />
        </div>
        {/* Every control that used to sit permanently in the bar or above the
            grid now lives behind this one toggle, at the bar's top right. */}
        <ControlsPanel />
      </div>
      {SHOW_DESIGN_SYSTEM ? <DesignSystemPage /> : <active.Component />}
    </>
  )
}

export default function App() {
  const [boot, setBoot] = useState<BootStats | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    initDataLayer()
      .then(setBoot)
      .catch((err: unknown) => setBootError(err instanceof Error ? err.message : String(err)))
  }, [])

  if (bootError) {
    return (
      <main className="panel">
        <h1>Pokeapp</h1>
        <p role="alert" data-testid="boot-error">
          Data layer failed to load: {bootError}
        </p>
      </main>
    )
  }

  if (!boot) {
    return (
      <main className="panel">
        <h1>Pokeapp</h1>
        <p data-testid="boot-status">Loading data bundle…</p>
      </main>
    )
  }

  const meta = getBundleMeta()
  const counts = getIndexCounts()

  return (
    <main className="panel">
      <VersionGroupProvider>
        <NavProvider>
          {/* Inside VersionGroupProvider: the type-filter clamp reads the
              generation from it. */}
          <FiltersProvider>
            <Shell />
          </FiltersProvider>
        </NavProvider>
      </VersionGroupProvider>

      <footer className="app-footer">
        {/* Every figure here is a count or a measurement, so every one of them is
            in --font-numeric -- the words between them are not. */}
        <p className="subtitle" data-testid="boot-status">
          data layer ready in{' '}
          <span data-testid="boot-ms" className="num">
            {boot.ms.toFixed(0)} ms
          </span>{' '}
          ·{' '}
          <span data-testid="boot-bytes" className="num">
            {kib(boot.bytes)}
          </span>{' '}
          decoded · <span className="num">{counts.species.toLocaleString()}</span> species,{' '}
          <span className="num">{counts.moves.toLocaleString()}</span> moves,{' '}
          <span className="num">{counts.items.toLocaleString()}</span> items,{' '}
          <span className="num">{counts.abilities}</span> abilities,{' '}
          <span className="num">{counts.natures}</span> natures,{' '}
          <span className="num">{counts.berries}</span> berries · dex{' '}
          <span className="num">1–{meta.scope.max_species_id}</span>
        </p>
      </footer>
    </main>
  )
}
