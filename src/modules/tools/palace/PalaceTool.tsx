import { useMemo, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { getMove, listNatures } from '../../../data'
import { useGameMoveTable } from '../../calculators/useGameMoveTable'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { GROUPS, palaceGroup, palaceOdds, type Group, type PalaceMove } from './palaceMath'

const TOOL = findTool('20')!
const GROUP_LABEL: Record<Group, string> = {
  attack: 'Attack',
  defense: 'Defense',
  support: 'Support',
}

/**
 * #20 Battle Palace odds: in Emerald's Battle Palace the Pokémon picks its own
 * moves, by nature. For a nature and four moves, the chance of each kind of move
 * above and at or below half HP, and how often it does nothing.
 */
export function PalaceTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!} gamePicker>
      {({ game }) => (game ? <PalaceBody game={game.name} /> : null)}
    </ToolShell>
  )
}

const pct = (p: number) => `${(p * 100).toFixed((p * 100) % 1 === 0 ? 0 : 1)}%`
const moveName = (id: number) => getMove(id)?.display_name ?? `#${id}`

function PalaceBody({ game }: { game: string }) {
  const table = useGameMoveTable(game)
  const natures = listNatures().sort((a, b) => a.display_name.localeCompare(b.display_name))
  const [nature, setNature] = useState(natures[0]?.name ?? 'adamant')
  const [picked, setPicked] = useState<(number | null)[]>([null, null, null, null])

  const moveOptions = useMemo(() => {
    if (table.status !== 'ready') return []
    return Object.entries(table.data.moves)
      .map(([id, m]) => ({ id: Number(id), group: palaceGroup(m.tg ?? '', m.p) }))
      .filter((m) => getMove(m.id))
      .sort((a, b) => moveName(a.id).localeCompare(moveName(b.id)))
  }, [table])
  const groupOf = (id: number) => moveOptions.find((m) => m.id === id)?.group
  const moves: PalaceMove[] = [...new Set(picked.filter((m): m is number => m != null))]
    .map((id) => ({ id, group: groupOf(id) }))
    .filter((m): m is PalaceMove => m.group != null)

  const reason =
    table.status === 'error'
      ? `Emerald’s move table did not load: ${table.message}`
      : table.status !== 'ready'
        ? 'Loading Emerald’s move table…'
        : moves.length === 0
          ? 'Pick at least one move.'
          : null
  const bands = reason
    ? null
    : ([false, true] as const).map((low) => ({ low, odds: palaceOdds(nature, moves, low)! }))

  return (
    <>
      <ToolInputs>
        <SelectField
          label="Nature"
          options={natures.map((n) => ({ value: n.name, label: n.display_name }))}
          value={nature}
          data-testid="pal-nature"
          onChange={(e) => setNature(e.target.value)}
        />
        <div className="calc-row">
          {picked.map((id, i) => (
            <SelectField
              key={i}
              label={`Move ${i + 1}${id != null && groupOf(id) ? ` · ${GROUP_LABEL[groupOf(id)!]}` : ''}`}
              options={[
                { value: '', label: '—' },
                ...moveOptions.map((m) => ({ value: String(m.id), label: moveName(m.id) })),
              ]}
              value={id != null ? String(id) : ''}
              data-testid={`pal-move-${i + 1}`}
              onChange={(e) =>
                setPicked((p) =>
                  p.map((x, k) => (k === i ? (e.target.value ? Number(e.target.value) : null) : x)),
                )
              }
            />
          ))}
        </div>
        <p className="calc-result-note">
          A move’s group is the game’s: Defense is a move on the user only; Support is a status move
          on the target, or one on the field; everything else is Attack. Within a group the Frontier
          AI picks. If the nature picks a group the Pokémon has no move in, it uses a random move
          from the others — and half the time does nothing instead.
        </p>
      </ToolInputs>
      <ToolResult reason={reason}>
        {bands && (
          <div className="tools-compare-scroll">
            <table className="tools-compare" data-testid="pal-table">
              <thead>
                <tr>
                  <th />
                  <th scope="col">Above half HP</th>
                  <th scope="col">At or below half, awake</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g, i) => (
                  <tr key={g} data-testid={`pal-group-${g}`}>
                    <th scope="row">
                      {GROUP_LABEL[g]}
                      <span className="tools-blurb">
                        {' '}
                        {bands[0].odds.groups[i].moves.length
                          ? bands[0].odds.groups[i].moves.map(moveName).join(', ')
                          : '(no move: fallback)'}
                      </span>
                    </th>
                    {bands.map((b) => (
                      <td key={String(b.low)} className="num" data-chance={b.odds.groups[i].chance}>
                        {pct(b.odds.groups[i].chance)}
                      </td>
                    ))}
                  </tr>
                ))}
                {moves
                  .filter((m) => bands.some((b) => b.odds.fallback.has(m.id)))
                  .map((m) => (
                    <tr key={m.id} data-testid={`pal-fallback-${m.id}`}>
                      <th scope="row">via fallback: {moveName(m.id)}</th>
                      {bands.map((b) => (
                        <td
                          key={String(b.low)}
                          className="num"
                          data-chance={b.odds.fallback.get(m.id) ?? 0}
                        >
                          {pct(b.odds.fallback.get(m.id) ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                <tr data-testid="pal-idle">
                  <th scope="row">Does nothing</th>
                  {bands.map((b) => (
                    <td key={String(b.low)} className="num" data-chance={b.odds.idle}>
                      {pct(b.odds.idle)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </ToolResult>
    </>
  )
}
