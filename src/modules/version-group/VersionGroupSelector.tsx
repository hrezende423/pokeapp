import { useMemo } from 'react'
import { useVersionGroup } from './context'

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
 * Minimal version-group picker: a native select, grouped by generation.
 *
 * Intentionally plain. The polished settings surface is deferred; this exists so
 * the selection that drives the whole Pokedex is changeable.
 */
export function VersionGroupSelector() {
  const { versionGroup, setVersionGroup, available } = useVersionGroup()

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
        value={versionGroup.name}
        onChange={(e) => setVersionGroup(e.target.value)}
      >
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
