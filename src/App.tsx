import { useEffect, useState } from 'react'
import './App.css'
import { getBundleMeta, getIndexCounts, initDataLayer } from './data'
import type { BootStats } from './data'
import { Pokedex } from './modules/pokedex/Pokedex'
import { VersionGroupProvider } from './modules/version-group/VersionGroupProvider'

const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`

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
        <Pokedex />
      </VersionGroupProvider>

      <footer className="app-footer">
        <p className="subtitle" data-testid="boot-status">
          data layer ready in <span data-testid="boot-ms">{boot.ms.toFixed(0)} ms</span> ·{' '}
          <span data-testid="boot-bytes">{kib(boot.bytes)}</span> decoded ·{' '}
          {counts.species.toLocaleString()} species, {counts.moves.toLocaleString()} moves,{' '}
          {counts.types} types · dex 1–{meta.scope.max_species_id}
        </p>
      </footer>
    </main>
  )
}
