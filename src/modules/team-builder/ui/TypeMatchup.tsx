/**
 * Type coverage, at four scopes, from one file.
 *
 * DEFENSIVE (per species) -- how hard each attacking type hits this Pokemon.
 * OFFENSIVE (per moveset) -- what this build's damaging moves can hit back.
 * TEAM, TAKING DAMAGE -- for each attacking type, how many members are weak to it.
 * TEAM, DEALING DAMAGE -- for each defending type, how many members have a
 * super-effective answer to it, and the best the team can manage if none do.
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
import type { Build } from '../model'

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
 * The team, taking damage: one row per attacking type, counting members weak,
 * resistant and IMMUNE.
 *
 * AN IMMUNITY IS NOT A RESISTANCE, and counting it as one is what this table
 * used to do -- `multiplier < 1` swept 0x in with 0.5x. On a team of Zapdos,
 * Bronzong, Gengar and Aggron that read "Ground: 1 weak, 3 resist" when three
 * of those members cannot be hit by Ground at all: Zapdos by its Flying half,
 * Bronzong and Gengar by Levitate. "Resists it" and "cannot be touched by it"
 * are different answers to the same question and the difference is the whole
 * reason a builder opens this panel.
 *
 * WHICH ALSO CHANGES WHICH ROWS ARE WORTH SHOWING. Dropping every type nothing
 * is weak to is still right for the noise it removes -- a full 17-row table of
 * mostly zeroes buries the rows that matter -- but it also dropped the team's
 * best news: Gengar's Normal immunity never appeared, because nothing on the
 * team happened to be weak to Normal. A row now earns its place with a weakness
 * OR an immunity.
 *
 * The counts come from `defensiveChart` per member, so every immunity the
 * per-species panel knows about is counted here too: both halves of a dual
 * type, the type-and-ability cases (Bronzong's Levitate over Ground, Heatran's
 * Flash Fire over an otherwise neutral Fire) and the ability-only ones.
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

  const tally = new Map<number, { name: string; weak: number; resist: number; immune: number }>()
  for (const member of members) {
    for (const row of defensiveChart(member.typeIds, member.abilityId ?? null, generation)) {
      const entry = tally.get(row.type.id) ?? { name: row.type.name, weak: 0, resist: 0, immune: 0 }
      /* Three exclusive buckets, in order: 0 is an immunity and must not also
         land in `resist`, which is what `multiplier < 1` on its own did. */
      if (row.multiplier > 1) entry.weak += 1
      else if (row.multiplier === 0) entry.immune += 1
      else if (row.multiplier < 1) entry.resist += 1
      tally.set(row.type.id, entry)
    }
  }

  const rows = [...tally.entries()]
    .map(([id, e]) => ({ id, ...e }))
    .filter((r) => r.weak > 0 || r.immune > 0)
    /* Worst first, then best first among the rest: a row with no weakness is
       here for its immunities, so more of them is more worth reading. */
    .sort((a, b) => b.weak - a.weak || b.immune - a.immune || a.name.localeCompare(b.name))

  return (
    <div className="tb-matchup" data-testid="tb-matchup-team">
      <p className="tb-matchup-title">Team coverage · {members.length} members</p>
      {rows.length === 0 ? (
        <span className="tb-matchup-empty">
          Nothing on this team is weak to anything, and nothing is immune to anything either.
        </span>
      ) : (
        <table className="tb-matchup-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Weak</th>
              <th>Resist</th>
              <th>Immune</th>
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
                <td className="num">{row.immune}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/**
 * The team, dealing damage.
 *
 * THE TWO TEAM PANELS ASK OPPOSITE QUESTIONS AND SO COUNT OPPOSITE THINGS. On
 * defence the number worth acting on is a HIGH one -- three members weak to
 * Ground is a team that loses to one Earthquake. On offence it is a ZERO: a
 * defending type no member can hit super effectively is a Pokemon this team
 * cannot break, and that is the row a builder is looking for. So this table is
 * sorted fewest-first, holes at the top, and it does NOT drop its quiet rows
 * the way the defensive one drops types nothing is weak to -- here the quiet
 * rows are the answer.
 *
 * TWO COLUMNS, BECAUSE THEY SAY DIFFERENT THINGS. "Hits hard" counts MEMBERS,
 * so it reads as redundancy: one member covering Steel is a plan, four is
 * comfort. "Best" is the best multiplier the whole team can manage against that
 * type, which is only interesting once the count is zero -- 1x means chip
 * damage, 0.5x means a wall, 0x means the team literally cannot touch it.
 *
 * ERA CORRECTNESS RUNS BOTH WAYS HERE. Each member's moves are resolved in the
 * MEMBER's own generation (a Gen 3 build's Charm is Normal, not Fairy), while
 * the chart itself is the TEAM's generation -- the same split the defensive
 * panel makes, and the reason a Gen 1 team gets no Dark or Steel row.
 */
export function TeamOffence({
  members,
  generation,
}: {
  /* Whole builds rather than pre-resolved type lists: which of a member's four
     moves count towards coverage is a question with a real answer in
     `attackingTypesFor`, and every caller would otherwise have to know it. */
  members: Pick<Build, 'moveIds' | 'generation'>[]
  generation: number
}) {
  const title = `Team offence · ${members.length} member${members.length === 1 ? '' : 's'}`
  if (members.length === 0) {
    return (
      <div className="tb-matchup" data-testid="tb-matchup-team-offense">
        <p className="tb-matchup-title">Team offence</p>
        <span className="tb-matchup-empty">No members yet.</span>
      </div>
    )
  }

  const perMember = members.map((m) => attackingTypesFor(m.moveIds, m.generation))
  const brought = [...new Set(perMember.flatMap((p) => p.types))]
  const counted = perMember.reduce((n, p) => n + p.counted, 0)
  const ignored = perMember.reduce((n, p) => n + p.ignored, 0)

  /* One member at a time, so the count is "how many members can do this" and
     not "how many of the team's types happen to be super effective". */
  const hits = new Map<string, number>()
  for (const p of perMember) {
    for (const row of offensiveCoverage(p.types, generation)) {
      if (row.multiplier > 1) hits.set(row.type, (hits.get(row.type) ?? 0) + 1)
    }
  }
  /* And the whole team's types at once, which gives the BEST it can manage --
     the move you would actually pick. */
  const rows = offensiveCoverage(brought, generation)
    .map((r) => ({ type: r.type, best: r.multiplier, hits: hits.get(r.type) ?? 0 }))
    .sort((a, b) => a.hits - b.hits || a.best - b.best || a.type.localeCompare(b.type))

  return (
    <div className="tb-matchup" data-testid="tb-matchup-team-offense">
      <p className="tb-matchup-title">{title}</p>
      {brought.length === 0 ? (
        <span className="tb-matchup-empty" data-testid="tb-matchup-team-offense-empty">
          No damaging moves anywhere on this team, so there is no coverage to show. Status and
          fixed-damage moves do not scale with the type chart.
        </span>
      ) : (
        <>
          <p className="tb-matchup-note">
            <span className="tb-matchup-rows">
              {brought.map((t) => (
                <TypeLabel key={t} type={t} small />
              ))}
            </span>
            {ignored > 0 && (
              <span className="tb-matchup-ignored">
                {counted} of {counted + ignored} moves counted
              </span>
            )}
          </p>
          <table className="tb-matchup-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Hits hard</th>
                <th>Best</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.type}
                  data-type={row.type}
                  data-hole={row.hits === 0 ? 'true' : undefined}
                >
                  <td>
                    <TypeLabel type={row.type} small />
                  </td>
                  {/* Zero is the fact this panel exists to surface, and it is
                      marked the same way three-members-weak is on the other
                      one: the row that changes a decision. */}
                  <td className="num" data-hole={row.hits === 0 ? 'true' : undefined}>
                    {row.hits}
                  </td>
                  <td className="num">{formatMultiplier(row.best)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
