import { useMemo } from 'react'
import { MAX_SPECIES_ID } from '../../data'
import { ALL_VERSION_GROUPS, useVersionGroup } from './context'

const GENERATION_LABELS: Record<number, string> = {
  1: 'Generation I',
  2: 'Generation II',
  3: 'Generation III',
  4: 'Generation IV',
}

/** Human label for a version group, e.g. 'heartgold-soulsilver' -> 'HeartGold / SoulSilver'. */
function label(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' / ')
}

/**
 * Version-group picker: a native select, grouped by generation, with "All" on
 * top for the unfiltered dex.
 *
 * The "All" caption reads its ceiling from MAX_SPECIES_ID, which is derived from
 * the generation ranges -- adding a generation there updates this label too
 * instead of leaving a stale 493 behind.
 */
export function VersionGroupSelector() {
  const { selection, setVersionGroup, available } = useVersionGroup()

  const byGeneration = useMemo(() => {
    const groups = new Map<number, typeof available>()
    for (const vg of available) {
      const gen = vg.generation_id ?? 0
      const list = groups.get(gen)
      if (list) list.push(vg)
      else groups.set(gen, [vg])
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0])
  }, [available])

  return (
    <label className="vg-selector">
      <span>Game</span>
      <select
        data-testid="vg-select"
        value={selection}
        onChange={(e) => setVersionGroup(e.target.value)}
      >
        <option value={ALL_VERSION_GROUPS}>All (#1-{MAX_SPECIES_ID})</option>
        {byGeneration.map(([generation, groups]) => (
          <optgroup
            key={generation}
            label={GENERATION_LABELS[generation] ?? `Generation ${generation}`}
          >
            {groups.map((vg) => (
              <option key={vg.name} value={vg.name}>
                {label(vg.name)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
