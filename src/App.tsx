import { useCallback, useEffect, useState } from 'react'
import './App.css'
import {
  getBundleMeta,
  getEncountersForSpecies,
  getIndexCounts,
  getLearnsetsForSpecies,
  getMove,
  getSpecies,
  getVersionGroupStats,
  initDataLayer,
  isVersionGroupLoaded,
  listVersionGroups,
  loadedVersionGroups,
} from './data'
import type { BootStats, EncounterRow, LearnRow, VersionGroup } from './data'

const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`
const ms = (v: number) => `${v.toFixed(0)} ms`

/** Species used to demonstrate that per-group rows resolve. */
const SAMPLE_SPECIES_ID = 80 // slowbro — its Headbutt learn method varies by game

interface GroupView {
  versionGroup: string
  learnsets: LearnRow[]
  encounters: EncounterRow[]
  cacheHit: boolean
}

export default function App() {
  const [boot, setBoot] = useState<BootStats | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [groups, setGroups] = useState<VersionGroup[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<GroupView | null>(null)
  const [loadingGroup, setLoadingGroup] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<string[]>([])

  useEffect(() => {
    initDataLayer()
      .then((stats) => {
        setBoot(stats)
        setGroups(listVersionGroups())
      })
      .catch((err: unknown) => setBootError(err instanceof Error ? err.message : String(err)))
  }, [])

  const selectGroup = useCallback(async (versionGroup: string) => {
    // Captured before the load so the UI can show whether this was served from
    // memory or required a network round trip.
    const wasCached = isVersionGroupLoaded(versionGroup)
    setLoadingGroup(versionGroup)
    setSelected(versionGroup)
    try {
      const [learnsets, encounters] = await Promise.all([
        getLearnsetsForSpecies(SAMPLE_SPECIES_ID, versionGroup),
        getEncountersForSpecies(SAMPLE_SPECIES_ID, versionGroup),
      ])
      setView({ versionGroup, learnsets, encounters, cacheHit: wasCached })
      setLoaded(loadedVersionGroups())
    } finally {
      setLoadingGroup(null)
    }
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
  const sample = getSpecies(SAMPLE_SPECIES_ID)
  const groupStats = view ? getVersionGroupStats(view.versionGroup) : undefined

  return (
    <main className="panel">
      <h1>Pokeapp</h1>
      <p className="subtitle">
        Gen 1–{meta.scope.max_generation} data layer · national dex 1–
        {meta.scope.max_species_id}
      </p>

      <section>
        <h2>Boot</h2>
        <p data-testid="boot-status">
          ready in <strong data-testid="boot-ms">{ms(boot.ms)}</strong> ·{' '}
          <strong data-testid="boot-bytes">{kib(boot.bytes)}</strong> decoded across{' '}
          {boot.files.length} files
        </p>
        <ul className="stats">
          {Object.entries(counts).map(([key, value]) => (
            <li key={key}>
              <span>{key.replace(/_/g, ' ')}</span>
              <strong>{value.toLocaleString()}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Version group</h2>
        <p className="subtitle">
          Learnsets and encounters load per group, on demand. Re-selecting a group is served from
          memory.
        </p>
        <div className="chips" role="group" aria-label="Version group">
          {groups.map((vg) => (
            <button
              key={vg.id}
              type="button"
              data-testid={`vg-${vg.name}`}
              aria-pressed={selected === vg.name}
              className={selected === vg.name ? 'chip chip-active' : 'chip'}
              onClick={() => void selectGroup(vg.name)}
            >
              {vg.name}
              <small>
                gen {vg.generation_id} · {vg.learnset_rows.toLocaleString()} /{' '}
                {vg.encounter_rows.toLocaleString()}
                {isVersionGroupLoaded(vg.name) ? ' · cached' : ''}
              </small>
            </button>
          ))}
        </div>
        <p className="subtitle" data-testid="loaded-groups">
          in memory: {loaded.length ? loaded.join(', ') : 'none'}
        </p>
      </section>

      {loadingGroup && <p data-testid="group-loading">Loading {loadingGroup}…</p>}

      {view && !loadingGroup && (
        <section data-testid="group-view">
          <h2>
            {sample?.display_name ?? `#${SAMPLE_SPECIES_ID}`} in{' '}
            <span data-testid="group-name">{view.versionGroup}</span>
          </h2>
          <p data-testid="group-stats">
            {view.cacheHit ? 'served from memory (no fetch)' : 'fetched from network'}
            {groupStats && !view.cacheHit
              ? ` · ${kib(groupStats.bytes)} decoded in ${ms(groupStats.ms)}`
              : ''}
          </p>
          <p>
            <span data-testid="learnset-count">{view.learnsets.length}</span> learnset rows ·{' '}
            <span data-testid="encounter-count">{view.encounters.length}</span> encounter rows
          </p>
          <table className="rows">
            <thead>
              <tr>
                <th>move</th>
                <th>method</th>
                <th>level</th>
              </tr>
            </thead>
            <tbody>
              {view.learnsets.slice(0, 12).map((row, i) => (
                <tr key={`${row.move_id}-${row.method}-${row.level}-${i}`}>
                  <td>{getMove(row.move_id)?.display_name ?? `#${row.move_id}`}</td>
                  <td>{row.method}</td>
                  <td>{row.level || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  )
}
