import { useMemo, useState } from 'react'
import { DataTable, type Column } from '../../components/DataTable'
import { TypeLabel } from '../../components/ds/TypeLabel'
import { getType, typesInGeneration } from '../../data'
import { fixedDamage } from '../../data/moveDamage'
import type { Move } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { TypeFilter } from '../../components/TypeFilter'
import { useDexSelection, useNav } from '../nav/navContext'
import { DexPageShell } from './DexPageShell'
import { EntityDetailPage, type SpeciesSection } from './EntityDetailPage'
import { moveEntries } from './entrySources'
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

export function Movedex() {
  const { generation, isAll } = useVersionGroup()
  const [typeFilter, setTypeFilter] = useState<number[]>([])

  const availableTypes = useMemo(() => typesInGeneration(generation), [generation])

  // A type that stops existing when the generation changes must not keep filtering.
  const activeTypeFilter = useMemo(
    () => typeFilter.filter((id) => availableTypes.some((t) => t.id === id)),
    [typeFilter, availableTypes],
  )

  const gated = useMemo(() => moveEntries({ generation, isAll }), [generation, isAll])

  const entries = useMemo(
    () =>
      activeTypeFilter.length === 0
        ? gated
        : gated.filter((m) => m.type_id != null && activeTypeFilter.includes(m.type_id)),
    [gated, activeTypeFilter],
  )

  const columns: Column<Move>[] = useMemo(
    () => [
      {
        key: 'name',
        label: 'Name',
        sortValue: (m) => m.display_name,
        render: (m) => m.display_name,
      },
      {
        key: 'type',
        label: 'Type',
        sortValue: (m) => (m.type_id != null ? (getType(m.type_id)?.name ?? '') : null),
        render: (m) =>
          m.type_id != null ? <TypeLabel type={getType(m.type_id)?.name ?? ''} small /> : '—',
      },
      {
        key: 'category',
        label: 'Category',
        sortValue: (m) => m.damage_class,
        render: (m) => titleCase(m.damage_class),
      },
      {
        key: 'power',
        label: 'Power',
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
        sortValue: (m) => m.accuracy,
        render: accuracyCell,
        numeric: true,
      },
      {
        key: 'pp',
        label: 'PP',
        sortValue: (m) => m.pp,
        render: (m) => <span className="num">{m.pp ?? '—'}</span>,
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
      searchText={(move) => move.display_name}
      searchLabel="Search/filter moves"
      // The one dex with an always-visible control row rather than the
      // ghost-button disclosure every other dex uses. Deliberate: this table is
      // dense enough that filtering is the primary way through it, so the filter
      // is not something to put behind a click. See DexControls.
      controlsVariant="inline"
      controls={
        <TypeFilter
          available={availableTypes}
          selected={activeTypeFilter}
          onChange={setTypeFilter}
          testIdPrefix="movedex-type"
          label="Filter moves by type"
        />
      }
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
