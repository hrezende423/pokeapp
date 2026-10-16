import { useMemo, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { TextField } from '../../../components/ds/TextField'
import { getMove } from '../../../data'
import { gameMove } from '../../battle/battleData'
import { useGameMoveTable } from '../../calculators/useGameMoveTable'
import { moveEntries } from '../../dex/entrySources'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { TARGET_LABEL, hitClass, targetOf, type TargetKind } from './targetingMath'

const TOOL = findTool('12')!
/** The Gen 3 reference a Gen 4 game's targets are compared with. */
const GEN3_REFERENCE = 'emerald'

/**
 * #12 Doubles targeting guide: every move's target in a double battle, from the
 * game's own move table, filterable by what it hits. On a Gen 4 game, a move
 * whose reach changed from Gen 3 (Surf now hits your ally) is marked.
 */
export function TargetingTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!} gamePicker>
      {({ generation, game }) =>
        game ? <TargetingBody key={generation} generation={generation} game={game.name} /> : null
      }
    </ToolShell>
  )
}

function TargetingBody({ generation, game }: { generation: number; game: string }) {
  const table = useGameMoveTable(game)
  const gen3 = useGameMoveTable(generation === 4 ? GEN3_REFERENCE : null)
  const moves = useMemo(
    () =>
      moveEntries({ generation, isAll: false }).sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      ),
    [generation],
  )
  const [kind, setKind] = useState<TargetKind | 'all' | 'changed'>('all')
  const [query, setQuery] = useState('')

  const reason =
    table.status === 'error'
      ? `This game’s move table did not load: ${table.message}`
      : table.status !== 'ready'
        ? 'Loading this game’s move table…'
        : null
  const rows =
    table.status === 'ready'
      ? moves.map((m) => {
          const target = targetOf(gameMove(table.data, m.id)?.tg)
          const before =
            gen3.status === 'ready' && gameMove(gen3.data, m.id)
              ? targetOf(gameMove(gen3.data, m.id)?.tg)
              : null
          const changed = before != null && hitClass(before) !== hitClass(target)
          return { id: m.id, target, before, changed }
        })
      : []
  const q = query.trim().toLowerCase()
  const shown = rows.filter(
    (r) =>
      (kind === 'all' || (kind === 'changed' ? r.changed : r.target === kind)) &&
      (q === '' || (getMove(r.id)?.display_name ?? '').toLowerCase().includes(q)),
  )

  return (
    <>
      <ToolInputs>
        <div className="calc-row">
          <SelectField
            label="Hits"
            options={[
              { value: 'all', label: 'Any target' },
              ...(Object.keys(TARGET_LABEL) as TargetKind[]).map((k) => ({
                value: k,
                label: TARGET_LABEL[k],
              })),
              ...(generation === 4 ? [{ value: 'changed', label: 'Changed since Gen 3' }] : []),
            ]}
            value={kind}
            data-testid="tg-kind"
            onChange={(e) => setKind(e.target.value as typeof kind)}
          />
          <TextField
            label="Move name"
            value={query}
            data-testid="tg-query"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </ToolInputs>
      <ToolResult reason={reason}>
        <p className="calc-result-headline" data-testid="tg-count">
          <span className="num">{shown.length}</span> moves
        </p>
        <ul className="tools-list" data-testid="tg-rows">
          {shown.map((r) => (
            <li
              key={r.id}
              className="tools-item"
              data-testid={`tg-move-${r.id}`}
              data-target={r.target ?? ''}
            >
              <span>{getMove(r.id)?.display_name}</span>
              <span className="tools-blurb">
                {r.target ? TARGET_LABEL[r.target] : 'Not in this game’s table'}
                {r.changed && r.before ? ` · Gen 3: ${TARGET_LABEL[r.before]}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </ToolResult>
    </>
  )
}
