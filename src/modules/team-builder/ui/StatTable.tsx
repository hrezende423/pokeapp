/**
 * The four-column stat table: name | base | computed total | bar.
 *
 * THE BAR IS THE ONE SANCTIONED REVERSAL of "stats are a plain table" -- six
 * values on one scale where the spread is the fact. It is scoped to this block
 * and is not a licence for progress bars elsewhere. Its fill is `--accent`, which
 * is the fourth of that token's exactly four sanctioned uses (stat magnitude).
 *
 * ROWS COME FROM THE GENERATION, not from the data: Gen 1 renders five rows with
 * one unsplit Special, Gen 2-4 render six. `statKeysForGeneration` owns that.
 *
 * The totals are computed by statMath.computeStat, which picks the Gen 1-2 or the
 * Gen 3-4 formula and applies the nature multiplier only where natures exist.
 */

import { baseStatFor, natureModsFor, STAT_LABEL, type SpeciesFacts } from '../buildFacts'
import { statKeysForGeneration, type Build } from '../model'
import { computeStat, natureMultiplier } from '../statMath'

/** Widest total a Gen 1-4 stat realistically reaches; the bar's full scale. */
const BAR_MAX = 400

export function StatTable({ build, facts }: { build: Build; facts: SpeciesFacts }) {
  const keys = statKeysForGeneration(build.generation)
  const nature = natureModsFor(build.natureId)

  const rows = keys.map((key) => {
    const base = baseStatFor(facts.stats, key)
    const total = computeStat({
      generation: build.generation,
      level: build.level,
      base,
      key,
      effort: build.effort,
      individual: build.individual,
      nature,
    })
    const mod = build.generation >= 3 ? natureMultiplier(nature, key) : 1
    return { key, base, total, mod }
  })

  const sum = rows.reduce((acc, r) => acc + r.total, 0)

  return (
    <table className="tb-stats" data-testid="tb-stat-table">
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} data-stat={row.key}>
            <th scope="row" className="tb-stat-name">
              {STAT_LABEL[row.key]}
            </th>
            <td className="tb-stat-base num" data-testid={`tb-stat-${row.key}-base`}>
              {row.base}
            </td>
            <td
              className="tb-stat-total num"
              /* A raised or lowered stat is marked on the number itself; there is
                 no separate arrow glyph, and neutral natures mark nothing. */
              data-mod={row.mod > 1 ? 'up' : row.mod < 1 ? 'down' : undefined}
              data-testid={`tb-stat-${row.key}-total`}
            >
              {row.total}
            </td>
            <td className="tb-stat-bar-cell">
              <span className="tb-stat-bar" aria-hidden>
                <span
                  className="tb-stat-bar-fill"
                  style={{ width: `${Math.min(100, (row.total / BAR_MAX) * 100)}%` }}
                />
              </span>
            </td>
          </tr>
        ))}
        <tr className="tb-stat-total-row">
          <th scope="row" className="tb-stat-name">
            Total
          </th>
          <td />
          <td className="tb-stat-total num" data-testid="tb-stat-sum">
            {sum}
          </td>
          <td />
        </tr>
      </tbody>
    </table>
  )
}
