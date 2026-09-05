/**
 * Type coverage, at two scopes, from one component.
 *
 * PER-SPECIES it is the ordinary defensive chart: how hard each attacking type
 * hits this Pokemon. PER-TEAM it is the question that actually matters when
 * building -- for each attacking type, how many of your members it hits super
 * effectively, and how many resist it. A team with four members weak to Ice has a
 * problem no single member's chart reveals.
 *
 * Both are computed live from `typeEffectivenessAgainst`, per the spec's
 * "Must-have live computed value" -- nothing here is cached or precomputed, and
 * the generation is always passed through, so a Gen 1 team correctly sees no Dark
 * or Steel column and Gen 1's own type chart.
 */

import { typeEffectivenessAgainst } from '../../../data'
import { TypeLabel } from '../../../components/ds/TypeLabel'

/** x4 and x2 both read as "weak"; x0 and x0.25/x0.5 as "resists". */
function bucket(multiplier: number): 'weak' | 'resist' | 'neutral' {
  if (multiplier > 1) return 'weak'
  if (multiplier < 1) return 'resist'
  return 'neutral'
}

function formatMultiplier(multiplier: number): string {
  if (multiplier === 0) return '0'
  if (Number.isInteger(multiplier)) return `${multiplier}x`
  return `${multiplier}x`
}

export function SpeciesMatchup({
  typeIds,
  generation,
  title,
}: {
  typeIds: number[]
  generation: number
  title: string
}) {
  const rows = typeEffectivenessAgainst(typeIds, generation)
  const weak = rows.filter((r) => bucket(r.multiplier) === 'weak')
  const resist = rows.filter((r) => bucket(r.multiplier) === 'resist')

  return (
    <div className="tb-matchup" data-testid="tb-matchup-species">
      <p className="tb-matchup-title">{title}</p>
      <MatchupGroup label="Weak to" rows={weak} empty="Nothing" />
      <MatchupGroup label="Resists" rows={resist} empty="Nothing" />
    </div>
  )
}

function MatchupGroup({
  label,
  rows,
  empty,
}: {
  label: string
  rows: { type: { id: number; name: string }; multiplier: number }[]
  empty: string
}) {
  return (
    <div className="tb-matchup-group">
      <span className="tb-matchup-label">{label}</span>
      {rows.length === 0 ? (
        <span className="tb-matchup-empty">{empty}</span>
      ) : (
        <span className="tb-matchup-rows">
          {rows.map((row) => (
            <span key={row.type.id} className="tb-matchup-row">
              <TypeLabel type={row.type.name} small />
              <span className="tb-matchup-mult num">{formatMultiplier(row.multiplier)}</span>
            </span>
          ))}
        </span>
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
  members: { label: string; typeIds: number[] }[]
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
    for (const row of typeEffectivenessAgainst(member.typeIds, generation)) {
      const entry = tally.get(row.type.id) ?? { name: row.type.name, weak: 0, resist: 0 }
      const kind = bucket(row.multiplier)
      if (kind === 'weak') entry.weak += 1
      if (kind === 'resist') entry.resist += 1
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
