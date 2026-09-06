/**
 * Type coverage, at three scopes, from one file.
 *
 * DEFENSIVE (per species) -- how hard each attacking type hits this Pokemon.
 * OFFENSIVE (per moveset) -- what this build's damaging moves can hit back.
 * TEAM -- for each attacking type, how many members it hits super effectively.
 *
 * THE PANELS ARE GROUPED BY MULTIPLIER, NOT JUST BY SIGN. "Weak to" that mixes
 * 4x and 2x buries the two types that will actually kill you among the six that
 * merely hurt, and a 4x weakness is a different fact about a build than a 2x
 * one. Same on the other side: a 0.25x resistance is a switch-in and a 0.5x is
 * not. So each group splits into tiers, one per distinct multiplier, ordered
 * worst-first -- and a tier with nothing in it is not rendered at all rather
 * than printed empty.
 *
 * THE GROUPS STACK, one under the next. Side by side they were about 170px each
 * and a four-type tier wrapped onto three lines; full width, a tier is one line
 * and the reader gets "Weak to" before "Resists" in the order they would say
 * them. `Column` is still the right name for the component -- it lays its tiers
 * out in a column -- but the groups themselves no longer sit in a row.
 *
 * Everything is computed live from `typeEffectivenessAgainst`, per the spec's
 * "Must-have live computed value" -- nothing here is cached or precomputed, and
 * the generation is always passed through, so a Gen 1 team correctly sees no Dark
 * or Steel column and Gen 1's own type chart.
 */

import { defensiveChart } from '../typeDefence'
import { TypeLabel } from '../../../components/ds/TypeLabel'
import { attackingTypesFor, offensiveCoverage } from '../buildFacts'

interface Row {
  name: string
  multiplier: number
}

/** "4x", "0.5x", "0x". Fractions keep their decimals; whole numbers do not gain any. */
function formatMultiplier(multiplier: number): string {
  return `${multiplier}x`
}

/**
 * One column: a heading, then one row per distinct multiplier present.
 *
 * `order` decides which multiplier leads. Weaknesses read worst-first (4 before
 * 2); resistances read best-first (0.25 before 0.5), because in both cases the
 * first row is the one that changes a decision.
 */
function Column({
  label,
  rows,
  order,
  testId,
}: {
  label: string
  rows: Row[]
  order: 'desc' | 'asc'
  testId: string
}) {
  if (rows.length === 0) return null
  const multipliers = [...new Set(rows.map((r) => r.multiplier))].sort((a, b) =>
    order === 'desc' ? b - a : a - b,
  )
  return (
    <div className="tb-matchup-col" data-testid={testId}>
      <span className="tb-matchup-label">{label}</span>
      {multipliers.map((multiplier) => (
        <div className="tb-matchup-tier" key={multiplier} data-mult={multiplier}>
          <span className="tb-matchup-mult num">{formatMultiplier(multiplier)}</span>
          <span className="tb-matchup-rows">
            {rows
              .filter((r) => r.multiplier === multiplier)
              .map((r) => (
                <TypeLabel key={r.name} type={r.name} small />
              ))}
          </span>
        </div>
      ))}
    </div>
  )
}

export function SpeciesMatchup({
  typeIds,
  abilityId = null,
  generation,
  title,
}: {
  typeIds: number[]
  /** The build's ability. Levitate and Flash Fire change this chart outright. */
  abilityId?: number | null
  generation: number
  title: string
}) {
  const rows = defensiveChart(typeIds, abilityId, generation).map((r) => ({
    name: r.type.name,
    multiplier: r.multiplier,
  }))
  const weak = rows.filter((r) => r.multiplier > 1)
  const resist = rows.filter((r) => r.multiplier < 1 && r.multiplier > 0)
  const immune = rows.filter((r) => r.multiplier === 0)

  return (
    <div className="tb-matchup" data-testid="tb-matchup-species">
      <p className="tb-matchup-title">{title} · taking damage</p>
      <div className="tb-matchup-cols">
        <Column label="Weak to" rows={weak} order="desc" testId="tb-matchup-weak" />
        <Column label="Resists" rows={resist} order="asc" testId="tb-matchup-resist" />
        <Column label="Immune to" rows={immune} order="desc" testId="tb-matchup-immune" />
      </div>
      {weak.length === 0 && resist.length === 0 && immune.length === 0 && (
        <span className="tb-matchup-empty">Neutral against everything.</span>
      )}
    </div>
  )
}

/**
 * What the four move slots can hit.
 *
 * THE EMPTY CASE IS ITS OWN ANSWER. A build with no damaging moves is not
 * "neutral coverage" -- it has none, and saying so is the useful thing. The
 * ignored count is shown because "3 moves, 1 counted" is a question the reader
 * would otherwise have to ask: status and fixed-damage moves do not scale with
 * the chart, so they buy no coverage. See `attackingTypesFor`.
 */
export function MovesetCoverage({
  moveIds,
  generation,
  title,
}: {
  moveIds: (number | null)[]
  generation: number
  title: string
}) {
  const { types, counted, ignored } = attackingTypesFor(moveIds, generation)
  const rows: Row[] = offensiveCoverage(types, generation).map((r) => ({
    name: r.type,
    multiplier: r.multiplier,
  }))
  const superEff = rows.filter((r) => r.multiplier > 1)
  const resisted = rows.filter((r) => r.multiplier < 1 && r.multiplier > 0)
  const immune = rows.filter((r) => r.multiplier === 0)

  return (
    <div className="tb-matchup" data-testid="tb-matchup-offense">
      <p className="tb-matchup-title">{title} · dealing damage</p>
      {types.length === 0 ? (
        <span className="tb-matchup-empty" data-testid="tb-matchup-offense-empty">
          No damaging moves selected, so there is no coverage to show. Status and fixed-damage moves
          do not scale with the type chart.
        </span>
      ) : (
        <>
          <p className="tb-matchup-note">
            <span className="tb-matchup-rows">
              {types.map((t) => (
                <TypeLabel key={t} type={t} small />
              ))}
            </span>
            {ignored > 0 && (
              <span className="tb-matchup-ignored">
                {counted} of {counted + ignored} moves counted
              </span>
            )}
          </p>
          <div className="tb-matchup-cols">
            <Column label="Hits hard" rows={superEff} order="desc" testId="tb-matchup-super" />
            <Column label="Resisted by" rows={resisted} order="asc" testId="tb-matchup-resisted" />
            <Column label="No effect on" rows={immune} order="desc" testId="tb-matchup-noeffect" />
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Team-wide coverage: one row per attacking type, counting members weak and
 * resistant. Types that nothing on the team is weak to are dropped -- a full
 * 17-row table of mostly zeroes buries the two rows worth acting on.
 */
export function TeamMatchup({
  members,
  generation,
}: {
  /* `abilityId` per member, because a team's weaknesses are the sum of its
     members' REAL ones -- a team of six Bronzong is not weak to Ground. */
  members: { label: string; typeIds: number[]; abilityId?: number | null }[]
  generation: number
}) {
  if (members.length === 0) {
    return (
      <div className="tb-matchup" data-testid="tb-matchup-team">
        <p className="tb-matchup-title">Team coverage</p>
        <span className="tb-matchup-empty">No members yet.</span>
      </div>
    )
  }

  const tally = new Map<number, { name: string; weak: number; resist: number }>()
  for (const member of members) {
    for (const row of defensiveChart(member.typeIds, member.abilityId ?? null, generation)) {
      const entry = tally.get(row.type.id) ?? { name: row.type.name, weak: 0, resist: 0 }
      if (row.multiplier > 1) entry.weak += 1
      if (row.multiplier < 1) entry.resist += 1
      tally.set(row.type.id, entry)
    }
  }

  const rows = [...tally.entries()]
    .map(([id, e]) => ({ id, ...e }))
    .filter((r) => r.weak > 0)
    .sort((a, b) => b.weak - a.weak || a.name.localeCompare(b.name))

  return (
    <div className="tb-matchup" data-testid="tb-matchup-team">
      <p className="tb-matchup-title">Team coverage · {members.length} members</p>
      {rows.length === 0 ? (
        <span className="tb-matchup-empty">Nothing on this team is weak to anything.</span>
      ) : (
        <table className="tb-matchup-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Weak</th>
              <th>Resist</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-type={row.name}>
                <td>
                  <TypeLabel type={row.name} small />
                </td>
                {/* The count that matters is the weak one; three or more members
                    sharing a weakness is the thing worth noticing. */}
                <td className="num" data-weak={row.weak >= 3 ? 'high' : undefined}>
                  {row.weak}
                </td>
                <td className="num">{row.resist}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
