import { useMemo } from 'react'
import { TypeBadge } from '../../components/TypeBadge'
import { getItem, getMove } from '../../data'
import type { LearnRow } from '../../data'

/**
 * Display order for learn methods. Anything not listed (Colosseum purification,
 * XD shadow moves, the Stadium surfing Pikachu, ...) still renders, appended in
 * whatever order it appears, rather than being dropped.
 */
const METHOD_ORDER = ['level-up', 'machine', 'egg', 'tutor']

const METHOD_LABELS: Record<string, string> = {
  'level-up': 'Level up',
  machine: 'TM / HM',
  egg: 'Egg moves',
  tutor: 'Move tutor',
}

/**
 * TM vs HM is not in the learnset row — the row only says `machine`. The
 * distinction comes from the machine *item* for that move in that version group,
 * whose name is `tm12` or `hm03`.
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

export function Learnset({ rows, versionGroup }: { rows: LearnRow[]; versionGroup: string }) {
  const groups = useMemo(() => {
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
      rows: [...(byMethod.get(method) ?? [])].sort((a, b) => {
        if (method === 'level-up') return a.level - b.level || a.move_id - b.move_id
        const an = getMove(a.move_id)?.display_name ?? ''
        const bn = getMove(b.move_id)?.display_name ?? ''
        return an.localeCompare(bn)
      }),
    }))
  }, [rows])

  if (rows.length === 0) {
    return (
      <p className="subtitle" data-testid="learnset-empty">
        No learnset data for this species in {versionGroup}.
      </p>
    )
  }

  return (
    <div data-testid="learnset" data-total-rows={rows.length}>
      {groups.map((group) => (
        <section key={group.method} className="learn-group" data-testid={`learn-${group.method}`}>
          <h4>
            {METHOD_LABELS[group.method] ?? group.method}{' '}
            <span className="subtitle">({group.rows.length})</span>
          </h4>
          <table className="rows">
            <thead>
              <tr>
                <th>
                  {group.method === 'level-up' ? 'Lv' : group.method === 'machine' ? 'TM/HM' : ''}
                </th>
                <th>Move</th>
                <th>Type</th>
                <th>Cat</th>
                <th>Pwr</th>
                <th>Acc</th>
                <th>PP</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row, i) => {
                const move = getMove(row.move_id)
                const lead =
                  group.method === 'level-up'
                    ? row.level || '—'
                    : group.method === 'machine'
                      ? (machineLabel(row.move_id, versionGroup) ?? '—')
                      : ''
                return (
                  <tr
                    key={`${row.move_id}-${row.level}-${i}`}
                    data-move-id={row.move_id}
                    data-level={row.level}
                  >
                    <td>{lead}</td>
                    <td>{move?.display_name ?? `#${row.move_id}`}</td>
                    <td>{move?.type_id != null && <TypeBadge typeId={move.type_id} small />}</td>
                    <td>{move?.damage_class ?? '—'}</td>
                    <td>{move?.power ?? '—'}</td>
                    <td>{move?.accuracy ?? '—'}</td>
                    <td>{move?.pp ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
