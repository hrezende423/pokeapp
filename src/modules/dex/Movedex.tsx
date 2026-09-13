import { useMemo, type ReactNode } from 'react'
import { DataTable, type Column } from '../../components/DataTable'
import { TypeLabel } from '../../components/ds/TypeLabel'
import { getType, listVersionGroups } from '../../data'
import { fixedDamage } from '../../data/moveDamage'
import type { Move } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { useDexSelection, useNav } from '../nav/navContext'
import { DexPageShell } from './DexPageShell'
import { EntityDetailPage, type SpeciesSection } from './EntityDetailPage'
import { moveEntries } from './entrySources'
import {
  machineNames,
  moveFlagLabels,
  moveMetaRows,
  moveRange,
  moveRangeSort,
  pastValueRows,
  statChangeLabels,
} from './moveFacts'
import { LEARN_SECTIONS, useMoveLearners } from './useMoveLearners'

function titleCase(value: string | null): string {
  if (!value) return '—'
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * physical / special / status is `damage_class`, NOT `meta.category`.
 *
 * `meta.category` is a different axis entirely -- damage, ailment, net-good-stats,
 * ohko, field-effect and eleven more -- describing what the move *does*, not how
 * damage is calculated. The table's CATEGORY column is damage_class, which is what
 * the column name means everywhere else.
 */

/**
 * What the POWER cell says.
 *
 *   an ordinary damaging move   the number
 *   Dragon Rage / Sonic Boom    "40 hp" / "20 hp" -- a constant, not a power stat
 *   everything else             an em dash
 *
 * That last case covers two different things on purpose: a status move has no
 * power because it deals no damage, and a variable-damage move has none because
 * the amount depends on level, HP, weight or happiness. Neither has a number, so
 * both get the dash. There are 176 of the first and 31 of the second in scope;
 * see data/moveDamage.ts for how the split is derived, and why Seismic Toss and
 * Night Shade belong to the second group rather than being printed as constants.
 */
function powerCell(move: Move) {
  if (move.power != null) return <span className="num">{move.power}</span>
  const fixed = fixedDamage(move)
  if (fixed != null) {
    return (
      <span className="num" data-fixed-damage={fixed}>
        {fixed}
        <span className="move-unit">hp</span>
      </span>
    )
  }
  return <span className="num">—</span>
}

/**
 * What the ACCURACY cell says: the number with a percent sign, or a dash that
 * keeps its percent sign for a move that never misses.
 *
 * The dash keeps the "%" so the column stays a column: every cell then ends in
 * the same glyph at the same x, and a never-miss row does not read as a shorter
 * number. `accuracy: null` in the bundle means "no accuracy check", not unknown.
 */
function accuracyCell(move: Move) {
  return (
    <span className="num">
      {move.accuracy ?? '—'}
      <span className="move-unit">%</span>
    </span>
  )
}

/**
 * The learner grid, grouped by how each species learns the move.
 *
 * A species that learns a move both by level-up and by TM appears in both
 * sections: the question each section answers is "how", and both answers are
 * true. Level-up cards carry the level as a corner badge; the other three
 * sections need none, since the label already says everything.
 *
 * Generation-aware for free -- the hook reads the selected version group's own
 * learnset partition, so changing the game re-derives which methods exist. Under
 * "All" it unions all fourteen.
 */
function MoveDetail({ move, onBack }: { move: Move; onBack: () => void }) {
  const { versionGroup, generation, isAll } = useVersionGroup()
  const vgName = versionGroup?.name ?? null
  const { learners, failed, loading, error } = useMoveLearners(move, vgName, isAll)
  const [, selectSpecies] = useDexSelection('pokedex')
  const nav = useNav()

  const sections: SpeciesSection[] = useMemo(
    () =>
      LEARN_SECTIONS.map(({ method, label }) => ({
        label,
        entries: learners
          .filter((l) => l.methods.includes(method))
          .map((l) => ({
            species: l.species,
            badge: method === 'level-up' && l.level != null ? `Lv.${l.level}` : undefined,
          })),
      })),
    [learners],
  )

  /*
    The count describes what this page SHOWS, which is the four sections.

    The bundle carries four more learn methods -- xd-purification (332 rows across
    all version groups), form-change (12), stadium-surfing-pikachu (4),
    light-ball-egg (4) -- and a species whose only route to the move is one of
    those has no section to appear in. Under "All", Surf is one such move. Rather
    than quietly reporting a bigger number than the page can account for, the
    excluded species are counted and said out loud.
  */
  const shownIds = useMemo(
    () => new Set(sections.flatMap((s) => s.entries.map((e) => e.species.id))),
    [sections],
  )
  const excluded = learners.length - shownIds.size

  /*
    Each span holds ONLY its value, with the labels and separators outside them:
    a readout whose test id covers "· Power 40" cannot be compared to the bundle
    without unpicking the prose first.
  */
  const meta = (
    <>
      {move.type_id != null && (
        <span data-testid="movedex-type">
          <TypeLabel type={getType(move.type_id)?.name ?? ''} />
        </span>
      )}
      {' · '}
      <span data-testid="movedex-category">{titleCase(move.damage_class)}</span>
      {' · Power '}
      <span data-testid="movedex-power">{powerCell(move)}</span>
      {' · Accuracy '}
      <span data-testid="movedex-accuracy">{accuracyCell(move)}</span>
      {' · PP '}
      <span data-testid="movedex-pp" className="num">
        {move.pp ?? '—'}
      </span>
    </>
  )

  return (
    <EntityDetailPage
      testId="movedex-detail"
      entryId={move.id}
      onBack={onBack}
      backLabel="All moves"
      title={move.display_name}
      titleTestId="movedex-name"
      meta={meta}
      description={move.effect ?? move.short_effect ?? 'No effect text in the bundle.'}
      sections={sections}
      generation={generation}
      // A learner card is a link to that species: open it in the Pokedex and
      // switch there, the same thing the global search does with a hit.
      onSelectSpecies={(id) => {
        selectSpecies(id)
        nav.setModule('pokedex')
      }}
    >
      {/*
        THE WHOLE MOVE, not the six fields the table shows.

        Everything below was already in moves.json and none of it was on screen:
        priority, range, effect chance, the meta block (ailment, drain, healing,
        crit rate, multi-hit and multi-turn spans), the stat changes a move
        applies, the seven Bulbapedia flags, the machines that teach it, its
        contest and super-contest entries, and the values it had in earlier
        games. A page that printed a move's power and then said nothing about
        Fury Swipes hitting two to five times was leaving the interesting half
        of the record in the file.

        ROWS WITH NOTHING TO SAY ARE NOT RENDERED, rather than rendered as a
        dash. Almost every `meta` field is zero for almost every move, so a fixed
        table would be twelve dashes and one fact on most of them -- the same
        decision the shared detail page makes about empty species sections.
      */}
      <MoveFactBlocks move={move} />
      {loading && (
        <p className="subtitle" data-testid="movedex-learners-loading">
          {isAll ? 'Loading every version group…' : 'Loading learnset…'}
        </p>
      )}
      {error && (
        <p role="alert" data-testid="movedex-learners-error">
          Could not load the learnset data. {error}
        </p>
      )}
      {failed.length > 0 && (
        <p role="alert" data-testid="movedex-learners-partial">
          Incomplete: {failed.join(', ')} failed to load.
        </p>
      )}
      {!loading && !error && learners.length === 0 && (
        <p className="subtitle" data-testid="movedex-learners-none">
          No species learns this move{isAll ? ' in Generations 1-4' : ` in ${vgName}`}.
        </p>
      )}
      {!loading && !error && learners.length > 0 && (
        <p
          className="subtitle"
          data-testid="movedex-learner-count"
          data-learner-count={shownIds.size}
          data-excluded={excluded}
        >
          <span className="num">{shownIds.size}</span> species
          {isAll ? ' across all Generation 1-4 games' : ` in ${vgName}`}
          {excluded > 0 && (
            <span data-testid="movedex-learners-excluded">
              {' · '}
              <span className="num">{excluded}</span> more learn it only by a method this page does
              not group (Purification, form change, or a Stadium/Light Ball special case)
            </span>
          )}
        </p>
      )}
    </EntityDetailPage>
  )
}

/** Label/value rows on hairlines, the Itemdex's treatment. Nothing in a box. */
function FactRows({
  testId,
  rows,
}: {
  testId: string
  rows: { label: string; value: ReactNode }[]
}) {
  if (rows.length === 0) return null
  return (
    <ul className="fact-rows" data-testid={testId}>
      {rows.map((row) => (
        <li key={row.label}>
          <span className="fact-label">{row.label}</span>
          <span className="fact-value">{row.value}</span>
        </li>
      ))}
    </ul>
  )
}

function MoveFactBlocks({ move }: { move: Move }) {
  const { isAll, versionGroup } = useVersionGroup()
  /* Machines are per version group; under a single game only that game's TM
     counts, under "All" every Gen 1-4 group does. */
  const inScope = useMemo(() => {
    if (isAll || !versionGroup) return new Set(listVersionGroups().map((vg) => vg.name))
    return new Set([versionGroup.name])
  }, [isAll, versionGroup])
  /* Past values are scoped to the whole bundle rather than to one game: they
     describe a change BETWEEN games, so narrowing them to the selected one would
     leave nothing to compare. */
  const allGroups = useMemo(() => new Set(listVersionGroups().map((vg) => vg.name)), [])

  const machines = machineNames(move, inScope)
  const flags = moveFlagLabels(move)
  const statChanges = statChangeLabels(move)
  const metaRows = moveMetaRows(move)
  const pastRows = pastValueRows(move, allGroups)

  const basics: { label: string; value: ReactNode }[] = [
    { label: 'Range', value: moveRange(move) },
    { label: 'Priority', value: <span className="num">{move.priority}</span> },
    {
      label: 'Introduced',
      value:
        move.generation_id != null ? (
          <>
            Generation <span className="num">{move.generation_id}</span>
          </>
        ) : (
          '—'
        ),
    },
  ]
  if (move.effect_chance != null) {
    basics.push({
      label: 'Effect chance',
      value: (
        <>
          <span className="num">{move.effect_chance}</span>
          <span className="move-unit">%</span>
        </>
      ),
    })
  }
  if (statChanges.length > 0) {
    basics.push({ label: 'Stat changes', value: statChanges.join(' · ') })
  }
  if (flags.length > 0) basics.push({ label: 'Flags', value: flags.join(' · ') })
  if (machines.length > 0) basics.push({ label: 'Machines', value: machines.join(' · ') })

  const contest: { label: string; value: ReactNode }[] = []
  if (move.contest_type)
    contest.push({ label: 'Contest type', value: titleCase(move.contest_type) })
  if (move.contest_effect) {
    contest.push({
      label: 'Contest appeal',
      value: (
        <>
          <span className="num">{move.contest_effect.appeal ?? 0}</span> appeal ·{' '}
          <span className="num">{move.contest_effect.jam ?? 0}</span> jam
        </>
      ),
    })
    if (move.contest_effect.flavor_text) {
      contest.push({ label: 'Contest note', value: move.contest_effect.flavor_text })
    }
  }
  if (move.super_contest_effect) {
    contest.push({
      label: 'Super Contest',
      value: (
        <>
          <span className="num">{move.super_contest_effect.appeal ?? 0}</span> appeal
          {move.super_contest_effect.flavor_text
            ? ` · ${move.super_contest_effect.flavor_text}`
            : ''}
        </>
      ),
    })
  }

  return (
    <>
      <FactRows testId="movedex-facts" rows={basics} />
      <FactRows
        testId="movedex-meta"
        rows={metaRows.map((r) => ({ label: r.label, value: r.value }))}
      />
      <FactRows testId="movedex-contest" rows={contest} />
      {pastRows.length > 0 && (
        <>
          <p className="list-caption" data-testid="movedex-past-caption">
            Values in earlier games. These are recorded, not applied: the figures above are the
            bundle&apos;s current ones.
          </p>
          <FactRows
            testId="movedex-past"
            rows={pastRows.map((r) => ({ label: r.label, value: r.value }))}
          />
        </>
      )}
    </>
  )
}

export function Movedex() {
  const { generation, isAll } = useVersionGroup()

  /*
    THE NAME SEARCH AND THE TYPE FILTER LEFT THIS FILE, not the dex. Both used to
    be an always-visible row above the table with their own local state; they are
    declared in modules/dex/query/registries.ts now and applied by the shared
    query, because Pokepedia has one Search/Filter menu and it is in the app bar.
    What stays here is the list this dex is allowed to show at all.
  */
  const entries = useMemo(() => moveEntries({ generation, isAll }), [generation, isAll])

  const columns: Column<Move>[] = useMemo(
    () => [
      /*
        THE BATTLE NUMBERS COME BEFORE THE CATALOGUE ONES. Name, type and
        category say what the move IS; power, accuracy and PP are what you
        actually compare moves on and they now sit together, uninterrupted.
        Range and Gen are classification -- read once, not scanned -- so they
        close the row rather than splitting the three numbers apart, which is
        where they landed when they were added.

        EVERY COLUMN CARRIES ITS OWN WIDTH, emitted as a <colgroup>. The
        `.data-table th:nth-child(n)` rules in pokedex.css were written when this
        table had six columns and are positional, so the reorder above would
        otherwise have handed Power the width sized for Range -- and the two
        columns past the sixth had no rule at all, leaving them to be sized by
        whatever happened to be in the first row.
      */
      {
        key: 'name',
        label: 'Name',
        width: '15rem',
        sortValue: (m) => m.display_name,
        render: (m) => m.display_name,
      },
      {
        key: 'type',
        label: 'Type',
        width: '6.5rem',
        sortValue: (m) => (m.type_id != null ? (getType(m.type_id)?.name ?? '') : null),
        render: (m) =>
          m.type_id != null ? <TypeLabel type={getType(m.type_id)?.name ?? ''} small /> : '—',
      },
      {
        key: 'category',
        label: 'Category',
        width: '6rem',
        sortValue: (m) => m.damage_class,
        render: (m) => titleCase(m.damage_class),
      },
      {
        key: 'power',
        label: 'Power',
        width: '5.5rem',
        // Sorts on the real power only. A fixed-damage move is deliberately NOT
        // sorted as though 40 hp were 40 power -- different quantities -- and
        // null-last keeps those rows together at the end either way.
        sortValue: (m) => m.power,
        render: powerCell,
        numeric: true,
      },
      {
        key: 'accuracy',
        label: 'Accuracy',
        width: '5.5rem',
        sortValue: (m) => m.accuracy,
        render: accuracyCell,
        numeric: true,
      },
      {
        key: 'pp',
        label: 'PP',
        width: '4rem',
        sortValue: (m) => m.pp,
        render: (m) => <span className="num">{m.pp ?? '—'}</span>,
        numeric: true,
      },
      {
        // What the move can be aimed at. PokeAPI calls it `target`; "range" is
        // what a player calls it, and the fourteen slugs are mapped to words
        // rather than title-cased -- "Users Field" is not English. Wide enough
        // for "All opponents", the longest of those words.
        key: 'range',
        label: 'Range',
        width: '8rem',
        sortValue: moveRangeSort,
        render: (m) => moveRange(m),
      },
      {
        key: 'generation',
        label: 'Gen',
        width: '3.4rem',
        sortValue: (m) => m.generation_id,
        render: (m) => <span className="num">{m.generation_id ?? '—'}</span>,
        numeric: true,
      },
    ],
    [],
  )

  return (
    <DexPageShell
      dexId="movedex"
      entries={entries}
      entryId={(move) => move.id}
      gatedMessage={
        entries.length === 0
          ? `No move in the bundle exists in Generation ${generation}.`
          : undefined
      }
      list={({ entries: visible, onSelect }) => (
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={(m) => m.id}
          onRowClick={(m) => onSelect(m.id)}
          initialSort="name"
          testId="movedex-rows"
          emptyNote="No move matches those filters."
        />
      )}
      detail={({ entry, onBack }) => (
        <MoveDetail key={`${entry.id}`} move={entry} onBack={onBack} />
      )}
    />
  )
}
