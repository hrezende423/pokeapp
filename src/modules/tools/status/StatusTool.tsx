import { useMemo, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { TypeLabel } from '../../../components/ds/TypeLabel'
import { getMove, isSpeciesInGeneration, type Species } from '../../../data'
import { gameMove } from '../../battle/battleData'
import { useGameMoveTable } from '../../calculators/useGameMoveTable'
import { moveEntries, speciesEntries } from '../../dex/entrySources'
import { ToggleSwitch } from '../../../components/ToggleSwitch'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { useLearnRows } from '../useLearnRows'
import { AILMENTS, inflictsOf, type Ailment, type Inflict } from './statusMath'

const TOOL = findTool('11')!

/**
 * #11 Status move finder: every move that inflicts a status, or every
 * status-inflicting move one Pokemon learns -- with whether the status is the
 * move's purpose or a chance on a damaging move. The game's own move table
 * decides (statusMath.ts), so Gen 1's Tri Attack does nothing extra.
 */
export function StatusTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!} gamePicker>
      {({ generation, game }) =>
        game ? <StatusBody key={generation} generation={generation} game={game.name} /> : null
      }
    </ToolShell>
  )
}

type Row = { moveId: number; inflict: Inflict }

function StatusBody({ generation, game }: { generation: number; game: string }) {
  const table = useGameMoveTable(game)
  const learn = useLearnRows(game)
  const moves = useMemo(() => moveEntries({ generation, isAll: false }), [generation])
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])
  const [bySpecies, setBySpecies] = useState(false)
  const [ailment, setAilment] = useState<Ailment>('paralysis')
  const [speciesId, setSpeciesId] = useState<number>(species[0]?.id ?? 1)
  const [kind, setKind] = useState<'all' | 'guaranteed' | 'secondary'>('all')

  const rows: Row[] | null = useMemo(() => {
    if (table.status !== 'ready') return null
    const out: Row[] = []
    for (const m of moves) {
      for (const inflict of inflictsOf(generation, gameMove(table.data, m.id), m.id))
        out.push({ moveId: m.id, inflict })
    }
    return out
  }, [table, moves, generation])

  const reason =
    table.status === 'error'
      ? `This game’s move table did not load: ${table.message}`
      : !rows
        ? 'Loading this game’s move table…'
        : bySpecies && learn.error
          ? `This game’s learnsets did not load: ${learn.error}`
          : bySpecies && !learn.rows
            ? 'Loading this game’s learnsets…'
            : null

  const keep = (r: Row) =>
    kind === 'all' || (kind === 'guaranteed' ? r.inflict.chance == null : r.inflict.chance != null)
  let shown: Row[] = []
  if (rows && !reason) {
    if (bySpecies) {
      const learned = new Set(
        (learn.rows ?? [])
          .filter(
            (r) => r.species_id === speciesId && isSpeciesInGeneration(r.species_id, generation),
          )
          .map((r) => r.move_id),
      )
      shown = rows.filter((r) => learned.has(r.moveId) && keep(r))
    } else {
      shown = rows.filter((r) => r.inflict.ailment === ailment && keep(r))
    }
    shown.sort(
      (a, b) =>
        (b.inflict.chance ?? 101) - (a.inflict.chance ?? 101) ||
        name(a.moveId).localeCompare(name(b.moveId)),
    )
  }

  return (
    <>
      <ToolInputs>
        <ToggleSwitch
          id="status-mode"
          label="Find"
          offLabel="By status"
          onLabel="By Pokémon"
          checked={bySpecies}
          onChange={setBySpecies}
        />
        <div className="calc-row">
          {bySpecies ? (
            <SelectField
              label="Pokémon"
              options={species.map((s: Species) => ({
                value: String(s.id),
                label: s.display_name,
              }))}
              value={String(speciesId)}
              data-testid="status-species"
              onChange={(e) => setSpeciesId(Number(e.target.value))}
            />
          ) : (
            <SelectField
              label="Status"
              options={AILMENTS.map((a) => ({ value: a.id, label: a.label }))}
              value={ailment}
              data-testid="status-ailment"
              onChange={(e) => setAilment(e.target.value as Ailment)}
            />
          )}
          <SelectField
            label="Kind"
            options={[
              { value: 'all', label: 'Both' },
              { value: 'guaranteed', label: 'Status moves (the effect is the move)' },
              { value: 'secondary', label: 'Secondary (a chance on a damaging move)' },
            ]}
            value={kind}
            data-testid="status-kind"
            onChange={(e) => setKind(e.target.value as typeof kind)}
          />
        </div>
      </ToolInputs>
      <ToolResult reason={reason}>
        <p className="calc-result-headline" data-testid="status-count">
          <span className="num">{shown.length}</span> moves
        </p>
        <ul className="tools-list" data-testid="status-rows">
          {shown.map((r, i) => {
            const mv = getMove(r.moveId)
            const gm = table.status === 'ready' ? gameMove(table.data, r.moveId) : undefined
            return (
              <li
                key={`${r.moveId}-${i}`}
                className="tools-item"
                data-testid={`status-move-${r.moveId}`}
                data-chance={r.inflict.chance ?? 'status'}
              >
                <span>
                  {mv?.display_name} {gm && <TypeLabel type={gm.t} small />}
                </span>
                <span className="tools-blurb">
                  {bySpecies && `${AILMENTS.find((a) => a.id === r.inflict.ailment)?.label}: `}
                  {r.inflict.chance == null ? 'the move’s effect' : `${r.inflict.chance}% chance`}
                  {gm && gm.p > 1 ? ` · ${gm.p} power` : ''}
                  {r.inflict.note ? ` · ${r.inflict.note}` : ''}
                </span>
              </li>
            )
          })}
        </ul>
      </ToolResult>
    </>
  )
}

const name = (id: number) => getMove(id)?.display_name ?? ''
