import { useEffect, useState } from 'react'
import './App.css'
import { getBundleMeta, getIndexCounts, initDataLayer } from './data'
import type { BootStats } from './data'
import { DexSwitcher } from './modules/nav/DexSwitcher'
import { NavProvider } from './modules/nav/NavProvider'
import { useNav } from './modules/nav/navContext'
import { findModule } from './modules/nav/registry'
import { GlobalSearch } from './modules/search/GlobalSearch'
import { VersionGroupProvider } from './modules/version-group/VersionGroupProvider'
import { VersionGroupSelector } from './modules/version-group/VersionGroupSelector'
import './modules/pokedex/pokedex.css'

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
  const active = findModule(nav.moduleId)

  return (
    <>
      {/* Both of these are app-wide, not module-local: the version group gates
          five of the six dexes, and the search reaches all four searchable ones,
          so they sit beside the switcher rather than inside any one header. */}
      <div className="app-bar">
        <DexSwitcher activeId={active.id} onSelect={nav.setModule} />
        <GlobalSearch />
        <VersionGroupSelector />
      </div>
      <active.Component />
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
          <Shell />
        </NavProvider>
      </VersionGroupProvider>

      <footer className="app-footer">
        <p className="subtitle" data-testid="boot-status">
          data layer ready in <span data-testid="boot-ms">{boot.ms.toFixed(0)} ms</span> ·{' '}
          <span data-testid="boot-bytes">{kib(boot.bytes)}</span> decoded ·{' '}
          {counts.species.toLocaleString()} species, {counts.moves.toLocaleString()} moves,{' '}
          {counts.items.toLocaleString()} items, {counts.abilities} abilities, {counts.natures}{' '}
          natures, {counts.berries} berries · dex 1–{meta.scope.max_species_id}
        </p>
      </footer>
    </main>
  )
}
