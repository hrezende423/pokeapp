/**
 * Type coverage, at four scopes, from one file.
 *
 * DEFENSIVE (per species) -- how hard each attacking type hits this Pokemon.
 * OFFENSIVE (per moveset) -- for each defending type, how many of this build's
 * attacks land on each multiplier.
 * TEAM, TAKING DAMAGE -- for each attacking type, how many members are weak,
 * resistant and immune to it.
 * TEAM, DEALING DAMAGE -- the offensive panel with every member's attacks
 * pooled: one table, the same columns, a bigger denominator.
 *
 * THE TWO OFFENSIVE SCOPES ARE ONE COMPONENT (`OffencePanel`) rendering one or
 * many movesets, because "the same analysis for a member and for the team" is a
 * requirement rather than a coincidence -- two implementations of it would
 * drift, and the interesting comparison is between the two panels.
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
import { attackingTypesFor, offensiveTiers } from '../buildFacts'
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
 * DEALING DAMAGE, at either scope: one row per defending type, one column per
 * multiplier, and the cell is how many ATTACKS land there.
 *
 * ATTACKS, NOT TYPES, and not "the best you can manage" -- which is what this
 * panel used to say. "2x" told a reader the coverage existed; it did not say
 * whether it was three moves deep or one, and "one Earthquake" and "three ways
 * to hit Steel" are different teams. Counting attacks also makes each row add
 * up: the columns of a row sum to the number of damaging moves, so a reader can
 * see at a glance that four of six attacks do nothing much here.
 *
 * THE COLUMNS ARE THE MULTIPLIERS THAT ACTUALLY OCCUR, discovered from the data
 * and ordered best-for-the-attacker first. Against a single defending type the
 * chart only ever gives 0, 0.5, 1 or 2 -- 4x and 0.25x need the DEFENDER to have
 * two types, which is a pair-aware analysis and a different panel (see
 * `offensiveTiers`). Nothing here hardcodes that: if the rows ever carry a 4x,
 * the column appears.
 *
 * WORST MATCHUPS FIRST. A type nothing on the team hits hard is a Pokemon it
 * cannot break, so those rows lead, and among them the ones resisting or
 * ignoring the most attacks lead again. The row with no super-effective attack
 * at all is marked, the same way the defensive table marks a shared weakness.
 *
 * THE EMPTY CASE IS ITS OWN ANSWER. A moveset with no damaging moves is not
 * "neutral coverage" -- it has none, and saying so is the useful thing. The
 * ignored count is shown because "3 moves, 1 counted" is a question the reader
 * would otherwise have to ask: status and fixed-damage moves do not scale with
 * the chart, so they buy no coverage. See `attackingTypesFor`.
 */
/** Best for the attacker first. Only the ones present are rendered. */
const TIER_ORDER = [4, 2, 1, 0.5, 0.25, 0]

function OffencePanel({
  title,
  sets,
  generation,
  testId,
  emptyNote,
}: {
  title: string
  /* One moveset per member. Each carries its OWN generation, because a move's
     type is era-dependent and a team can hold builds from several eras; the
     CHART is the enclosing generation's. */
  sets: { moveIds: (number | null)[]; generation: number }[]
  generation: number
  testId: string
  emptyNote: string
}) {
  const per = sets.map((set) => attackingTypesFor(set.moveIds, set.generation))
  const brought = [...new Set(per.flatMap((p) => p.types))]
  const attacks = per.flatMap((p) => p.each)
  const counted = per.reduce((n, p) => n + p.counted, 0)
  const ignored = per.reduce((n, p) => n + p.ignored, 0)

  const rows = offensiveTiers(attacks, generation)
    .map((r) => ({
      type: r.type,
      counts: r.byMultiplier,
      hard: [...r.byMultiplier].reduce((n, [m, c]) => (m > 1 ? n + c : n), 0),
      blocked: [...r.byMultiplier].reduce((n, [m, c]) => (m < 1 ? n + c : n), 0),
    }))
    .sort((a, b) => a.hard - b.hard || b.blocked - a.blocked || a.type.localeCompare(b.type))
  const tiers = TIER_ORDER.filter((m) => rows.some((r) => (r.counts.get(m) ?? 0) > 0))
  /*
    THE BEST TIER PRESENT, and the only cell that ever prints a zero. Every
    other empty cell is left blank -- a table of zeroes reads as data and
    absence is not data -- but a row where NOTHING is super effective is the
    fact this panel exists to surface, so there the zero is written out. If no
    super-effective tier is present at all, the missing column says it instead.
  */
  const hardTier = tiers.find((m) => m > 1) ?? null

  return (
    <div className="tb-matchup" data-testid={testId}>
      <p className="tb-matchup-title">{title}</p>
      {brought.length === 0 ? (
        <span className="tb-matchup-empty" data-testid={`${testId}-empty`}>
          {emptyNote}
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
                {/* Not `num`: the heading sits beside "Type" at label size and
                    the numeric face draws a size larger than the sans one, so a
                    mono "0.5x" there would read as the biggest thing in the
                    table. The cells below it are numbers and do carry it. */}
                {tiers.map((m) => (
                  <th key={m}>{formatMultiplier(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.type}
                  data-type={row.type}
                  data-hole={row.hard === 0 ? 'true' : undefined}
                  data-wall={row.hard === 0 && row.blocked > 0 ? 'true' : undefined}
                >
                  <td>
                    <TypeLabel type={row.type} small />
                  </td>
                  {tiers.map((m) => (
                    <td
                      key={m}
                      className="num"
                      /*
                        MARKED ONLY WHEN THE ZERO COMES WITH RESISTANCE. Nothing
                        super effective is worth reading in every row it happens
                        in -- so the zero is always printed -- but a zero BESIDE
                        resisted or ignored attacks is the wall: no answer, and
                        it shrugs off part of what you do have. A half-built
                        member has no super-effective answer to almost anything,
                        and colouring all thirteen of those rows would spend the
                        page's one alarm colour on "this build is unfinished".
                      */
                      data-hole={
                        m === hardTier && row.hard === 0 && row.blocked > 0 ? 'true' : undefined
                      }
                    >
                      {row.counts.get(m) ?? (m === hardTier && row.hard === 0 ? 0 : '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

/** One build's four slots. */
export function MovesetCoverage({
  moveIds,
  generation,
  title,
}: {
  moveIds: (number | null)[]
  generation: number
  title: string
}) {
  return (
    <OffencePanel
      title={`${title} · dealing damage`}
      sets={[{ moveIds, generation }]}
      generation={generation}
      testId="tb-matchup-offense"
      emptyNote="No damaging moves selected, so there is no coverage to show. Status and fixed-damage moves do not scale with the type chart."
    />
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
 * The team, dealing damage: every member's attacks pooled into the panel above.
 *
 * IT IS THE SAME TABLE ON PURPOSE. A member's panel and the team's answer the
 * same question at two scopes, and the useful thing is comparing them -- "the
 * team has four answers to Steel" against "this member has none" only reads if
 * both are counted and laid out the same way.
 *
 * The pooled denominator is why counting ATTACKS rather than members matters
 * here: six members with one Earthquake between them is not the same team as
 * six members with one each, and a member count cannot tell them apart.
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
  if (members.length === 0) {
    return (
      <div className="tb-matchup" data-testid="tb-matchup-team-offense">
        <p className="tb-matchup-title">Team offence</p>
        <span className="tb-matchup-empty">No members yet.</span>
      </div>
    )
  }
  return (
    <OffencePanel
      title={`Team offence · ${members.length} member${members.length === 1 ? '' : 's'}`}
      sets={members}
      generation={generation}
      testId="tb-matchup-team-offense"
      emptyNote="No damaging moves anywhere on this team, so there is no coverage to show. Status and fixed-damage moves do not scale with the type chart."
    />
  )
}
