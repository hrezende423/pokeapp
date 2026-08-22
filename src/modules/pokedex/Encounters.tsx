import { useMemo } from 'react'
import { getLocation, getLocationArea } from '../../data'
import type { EncounterRow } from '../../data'

/**
 * Encounters for the selected version group.
 *
 * Rows are per (area, version, method, level band, condition set), which is very
 * granular — a single patch of grass can produce several rows differing only by
 * encounter slot. They are collapsed by area + method + version here, merging the
 * level range and summing the chance, which is what a player actually wants to
 * read.
 */
interface Grouped {
  key: string
  locationName: string
  areaName: string
  version: string
  method: string
  levelMin: number
  levelMax: number
  chance: number
  conditions: Set<string>
}

export function Encounters({ rows, versionGroup }: { rows: EncounterRow[]; versionGroup: string }) {
  const grouped = useMemo(() => {
    const map = new Map<string, Grouped>()
    for (const row of rows) {
      const key = `${row.location_area_id}|${row.version}|${row.method}`
      const existing = map.get(key)
      if (existing) {
        existing.levelMin = Math.min(existing.levelMin, row.level_min)
        existing.levelMax = Math.max(existing.levelMax, row.level_max)
        existing.chance += row.chance
        row.conditions.forEach((c) => existing.conditions.add(c))
      } else {
        map.set(key, {
          key,
          locationName:
            getLocation(row.location_id)?.display_name ?? `location #${row.location_id}`,
          areaName: getLocationArea(row.location_area_id)?.display_name ?? '',
          version: row.version,
          method: row.method,
          levelMin: row.level_min,
          levelMax: row.level_max,
          chance: row.chance,
          conditions: new Set(row.conditions),
        })
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        a.locationName.localeCompare(b.locationName) ||
        a.version.localeCompare(b.version) ||
        a.method.localeCompare(b.method),
    )
  }, [rows])

  if (rows.length === 0) {
    return (
      <p className="subtitle" data-testid="encounters-empty">
        Not found in the wild in {versionGroup}.
      </p>
    )
  }

  return (
    <div data-testid="encounters" data-total-rows={rows.length} data-grouped-rows={grouped.length}>
      <table className="rows">
        <thead>
          <tr>
            <th>Location</th>
            <th>Version</th>
            <th>Method</th>
            <th>Levels</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((g) => (
            <tr key={g.key}>
              <td>
                {g.locationName}
                {g.areaName && g.areaName !== g.locationName && (
                  <span className="subtitle"> · {g.areaName}</span>
                )}
                {g.conditions.size > 0 && (
                  <span className="subtitle"> · {[...g.conditions].join(', ')}</span>
                )}
              </td>
              <td>{g.version}</td>
              <td>{g.method}</td>
              <td>{g.levelMin === g.levelMax ? g.levelMin : `${g.levelMin}–${g.levelMax}`}</td>
              <td>{Math.min(g.chance, 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
