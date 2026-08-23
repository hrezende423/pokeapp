import { useEffect, useState } from 'react'
import './App.css'
import { getBundleMeta, getIndexCounts, initDataLayer } from './data'
import type { BootStats } from './data'
import { DexSwitcher } from './modules/nav/DexSwitcher'
import { DEFAULT_MODULE_ID, findModule } from './modules/nav/registry'
import { VersionGroupProvider } from './modules/version-group/VersionGroupProvider'
import { VersionGroupSelector } from './modules/version-group/VersionGroupSelector'
import './modules/pokedex/pokedex.css'

const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`

export default function App() {
  const [boot, setBoot] = useState<BootStats | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [moduleId, setModuleId] = useState(DEFAULT_MODULE_ID)

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
  const active = findModule(moduleId)

  return (
    <main className="panel">
      <VersionGroupProvider>
        {/* The version group is app-wide state: it gates four of the five dexes,
            so the picker lives beside the switcher rather than inside any one
            module's header. */}
        <div className="app-bar">
          <DexSwitcher activeId={active.id} onSelect={setModuleId} />
          <VersionGroupSelector />
        </div>
        <active.Component />
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
