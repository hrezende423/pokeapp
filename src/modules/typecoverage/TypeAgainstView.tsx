import { useMemo } from 'react'
import type { Effectiveness, PokemonType } from '../../data'
import { multipliersAgainst, multipliersDealtBy, singleCombos } from './typeCombos'

/**
 * THE PRACTICAL FRAMING: read a row as "the thing in front of you is this type".
 *
 * The other views state the chart; this one states the decision. Each row turns
 * one enemy typing into the four answers a battle actually needs, and the column
 * names are those answers rather than multiplier labels:
 *
 *   HIT IT WITH    attacking types that do 2x or better to it
 *   NOT WITH       attacking types it resists or ignores
 *   SAFE TO SEND   types that resist or ignore ITS attacks
 *   DO NOT SEND    types its attacks hit for 2x or better
 *
 * THE TWO HALVES ARE DIFFERENT DIRECTIONS OF THE CHART, which is the whole
 * reason this view is not a relabelled "By type": the first two columns read the
 * enemy as a defender, the last two read it as an attacker. Conflating them is
 * the mistake the column names exist to prevent.
 *
 * Like Flow, it asks through `singleCombos()` and combo-shaped primitives, so
 * the dual-type expansion is a change of row source rather than of logic.
 */
export function TypeAgainstView({ generation }: { generation: number }) {
  const rows = useMemo(
    () =>
      singleCombos(generation).map((combo) => {
        const taken = multipliersAgainst(combo, generation)
        const dealt = multipliersDealtBy(combo[0], generation)
        return {
          type: combo[0],
          /* 4x cannot arise against a single defending type, but the test is
             `>= 2` rather than `=== 2` so a dual-type row would land here too. */
          hitWith: pick(taken, (m) => m >= 2),
          notWith: pick(taken, (m) => m < 1),
          safeToSend: pick(dealt, (m) => m < 1),
          doNotSend: pick(dealt, (m) => m >= 2),
        }
      }),
    [generation],
  )

  return (
    <div className="tc-against" data-layout="type-against">
      <div className="tc-against-wrap">
        <table className="tc-against-table">
          <thead>
            <tr>
              <th>It is</th>
              <th>Hit it with</th>
              <th>Not with</th>
              <th>Safe to send</th>
              <th>Do not send</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.type.id} data-testid={`tc-against-${row.type.name}`}>
                <td className="tc-against-enemy">
                  <span className="tc-ty" style={{ color: `var(--type-${row.type.name})` }}>
                    {row.type.display_name}
                  </span>
                </td>
                <Run types={row.hitWith} />
                <Run types={row.notWith} />
                <Run types={row.safeToSend} />
                <Run types={row.doNotSend} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function pick(row: Effectiveness[], test: (multiplier: number) => boolean): PokemonType[] {
  return row.filter((e) => test(e.multiplier)).map((e) => e.type)
}

/**
 * One cell's type run.
 *
 * "Nothing." IS WRITTEN OUT rather than left blank: an empty cell reads as
 * missing data, and for Normal's "do not send" the emptiness IS the fact -- it
 * hits nothing for extra damage.
 */
function Run({ types }: { types: PokemonType[] }) {
  return (
    <td>
      {types.length === 0 ? (
        <span className="tc-empty-note">Nothing.</span>
      ) : (
        <span className="tc-run">
          {types.map((t) => (
            <span key={t.id} className="tc-ty-sm" style={{ color: `var(--type-${t.name})` }}>
              {t.display_name}
            </span>
          ))}
        </span>
      )}
    </td>
  )
}
