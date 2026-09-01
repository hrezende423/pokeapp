import { useMemo } from 'react'
import { DataTable, type Column } from '../../components/DataTable'
import { TypeLabel } from '../../components/ds/TypeLabel'
import { getItem, getLearnsetsForSpecies, getMove, getType } from '../../data'
import type { LearnRow, Move, Species, Variety } from '../../data'
import { EggMoveMarker } from './EggMoveMarker'
import { SpeciesGameScopeControl } from './SpeciesGameScopeControl'
import { versionGroupLabel } from './speciesFacts'
import { usePartitionRows } from './usePartitionRows'
import type { SpeciesGameScope } from './useSpeciesGameScope'

/**
 * The Learnset tab: this species' moves for one game, grouped by how they are
 * learned.
 *
 * THE SELECTOR IS THE SPECIES PAGE'S OWN, not the app-wide game selector --
 * confirmed decision. See useSpeciesGameScope for why the primary axis is the
 * generation and the games inside it are a secondary row.
 *
 * SAME GROUPING PATTERN AS THE MOVEDEX DETAIL PAGE, READ THE OTHER WAY. There, one
 * move is grouped by the method each species learns it by; here, one species is
 * grouped by the method it learns each move by. Same four labelled sections, same
 * order, same "unlisted methods still render" rule -- Colosseum purification and
 * XD's shadow moves are real rows in the bundle and dropping them silently would
 * be worse than an unfamiliar heading.
 *
 * ONE DataTable PER SECTION, not one table with a method column: the useful sort
 * inside a section is by level, and by move name in the other three, which a
 * single table cannot offer at once. Each section sorts independently.
 */

const METHOD_ORDER = ['level-up', 'machine', 'egg', 'tutor']

const METHOD_LABELS: Record<string, string> = {
  'level-up': 'Level up',
  machine: 'TM / HM',
  egg: 'Egg moves',
  tutor: 'Move tutor',
}

/**
 * TM vs HM is not in the learnset row -- the row only says `machine`. The
 * distinction comes from the machine ITEM for that move in that version group,
 * whose name is `tm12` or `hm03`. Same derivation the old learnset table used.
 */
function machineLabel(moveId: number, versionGroup: string): string | null {
  const move = getMove(moveId)
  if (!move) return null
  for (const machine of move.machines) {
    if (machine.version_group !== versionGroup || machine.item_id == null) continue
    const item = getItem(machine.item_id)
    if (item) return item.display_name || item.name.toUpperCase()
  }
  return null
}

/** A learnset row plus the resolved move, and a key the table can use. */
interface MoveRow {
  key: number
  row: LearnRow
  move: Move | undefined
  lead: string
}

function columnsFor(method: string): Column<MoveRow>[] {
  const leadLabel = method === 'level-up' ? 'Lv' : method === 'machine' ? 'TM/HM' : ''
  const columns: Column<MoveRow>[] = [
    {
      key: 'move',
      label: 'Move',
      render: (r) => (
        <span className="species-learn-move">
          {method === 'egg' && (
            <EggMoveMarker
              moveId={r.row.move_id}
              moveName={r.move?.display_name ?? `#${r.row.move_id}`}
            />
          )}
          {r.move?.display_name ?? `#${r.row.move_id}`}
        </span>
      ),
      sortValue: (r) => r.move?.display_name ?? '',
    },
    {
      key: 'type',
      label: 'Type',
      render: (r) => {
        const name = r.move?.type_id != null ? getType(r.move.type_id)?.name : null
        return name ? <TypeLabel type={name} small /> : '—'
      },
      sortValue: (r) => r.move?.type_id ?? null,
    },
    {
      key: 'category',
      label: 'Cat',
      render: (r) => r.move?.damage_class ?? '—',
      sortValue: (r) => r.move?.damage_class ?? null,
    },
    { key: 'power', label: 'Pwr', numeric: true, sortValue: (r) => r.move?.power ?? null },
    { key: 'accuracy', label: 'Acc', numeric: true, sortValue: (r) => r.move?.accuracy ?? null },
    { key: 'pp', label: 'PP', numeric: true, sortValue: (r) => r.move?.pp ?? null },
  ]

  // Only the two methods that HAVE a lead value get the column. An empty "" header
  // above 40 empty cells is a column that says nothing.
  if (leadLabel) {
    columns.unshift({
      key: 'lead',
      label: leadLabel,
      numeric: method === 'level-up',
      render: (r) => r.lead || '—',
      sortValue: (r) => (method === 'level-up' ? r.row.level : r.lead),
    })
  }
  return columns
}

export function SpeciesLearnsetTab({
  species,
  variety,
  scope,
}: {
  species: Species
  variety: Variety
  /* Owned by the page, not by this tab -- see the note in SpeciesDetailPage on
     why the scope is lifted. */
  scope: SpeciesGameScope | null
}) {
  const vgName = scope?.versionGroup.name ?? null
  const learnsets = usePartitionRows<LearnRow>(getLearnsetsForSpecies, species.id, vgName)

  const groups = useMemo(() => {
    if (learnsets.state.status !== 'ready') return []
    // Default form only, so a multi-form species does not list the same move
    // several times over.
    const rows = learnsets.state.rows.filter((r) => r.pokemon_id === variety.pokemon_id)
    const byMethod = new Map<string, LearnRow[]>()
    for (const row of rows) {
      const list = byMethod.get(row.method)
      if (list) list.push(row)
      else byMethod.set(row.method, [row])
    }
    const ordered = [
      ...METHOD_ORDER.filter((m) => byMethod.has(m)),
      ...[...byMethod.keys()].filter((m) => !METHOD_ORDER.includes(m)).sort(),
    ]
    return ordered.map((method) => ({
      method,
      rows: (byMethod.get(method) ?? []).map((row, i): MoveRow => {
        const move = getMove(row.move_id)
        const lead =
          method === 'level-up'
            ? row.level
              ? String(row.level)
              : ''
            : method === 'machine'
              ? (machineLabel(row.move_id, vgName ?? '') ?? '')
              : ''
        return { key: i, row, move, lead }
      }),
    }))
  }, [learnsets.state, variety.pokemon_id, vgName])

  if (!scope) {
    return (
      <p className="species-info-caption" data-testid="learnset-no-scope">
        No in-scope game carries a learnset for this species.
      </p>
    )
  }

  const total = groups.reduce((n, g) => n + g.rows.length, 0)

  return (
    <div className="species-learnset" data-testid="species-learnset" data-version-group={vgName}>
      <SpeciesGameScopeControl scope={scope} label="Generation" testId="learnset-scope" />

      {learnsets.state.status === 'loading' && (
        <p className="species-info-caption" data-testid="learnset-loading">
          Loading the {versionGroupLabel(scope.versionGroup.name)} learnset…
        </p>
      )}

      {learnsets.state.status === 'error' && (
        <div data-testid="learnset-error">
          <p role="alert">Could not load the learnset for this game.</p>
          <p className="species-info-caption">{learnsets.state.message}</p>
          <button
            type="button"
            className="retry-btn"
            data-testid="learnset-retry"
            onClick={learnsets.retry}
          >
            Try again
          </button>
        </div>
      )}

      {learnsets.state.status === 'ready' && total === 0 && (
        <p className="species-info-caption" data-testid="learnset-empty">
          {species.display_name} has no learnset in {versionGroupLabel(scope.versionGroup.name)}.
        </p>
      )}

      {learnsets.state.status === 'ready' &&
        groups.map((group) => (
          <section
            key={group.method}
            className="species-learn-group"
            data-testid={`species-learn-${group.method}`}
            data-rows={group.rows.length}
          >
            <h3 className="species-info-heading">
              {METHOD_LABELS[group.method] ?? group.method}{' '}
              <span className="species-info-count num">{group.rows.length}</span>
            </h3>
            <DataTable
              rows={group.rows}
              columns={columnsFor(group.method)}
              rowKey={(r) => r.key}
              initialSort={group.method === 'level-up' ? 'lead' : 'move'}
              testId={`species-learn-${group.method}-rows`}
            />
          </section>
        ))}
    </div>
  )
}
