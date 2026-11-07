import { useMemo, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { Toggle } from '../../../components/ds/Toggle'
import { getSpecies } from '../../../data'
import { gameContext } from '../../battle/game'
import { buildToSpec } from '../../battle/sources'
import { FIELD_RULES, type Weather } from '../../calculators/damage'
import { useGameMoveTable } from '../../calculators/useGameMoveTable'
import { itemEntries, speciesEntries } from '../../dex/entrySources'
import { orderedTeams } from '../../team-builder/model'
import { useTeamBuilderData } from '../../team-builder/store'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { SPEED_ITEMS, newRow, readTiers, type TierField, type TierRow } from './speedTiersMath'
import { TierRowEditor } from './TierRowEditor'

const TOOL = findTool('5')!

const WEATHER_LABEL: Record<Weather, string> = {
  sun: 'Sun',
  rain: 'Rain',
  sand: 'Sandstorm',
  hail: 'Hail',
}

/**
 * #5 Speed tiers: any set of Pokemon, typed in or loaded from a team, in the
 * order they move. The ladder is the battle engine's (battle/speed.ts), which
 * follows each game's own turn-order routine; exact ties are flagged 50/50 and
 * priority moves, Quick Claw and Lagging Tail are listed as the exceptions.
 */
export function SpeedTiersTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!}>
      {({ generation, game }) =>
        game ? <SpeedTiersBody key={generation} generation={generation} game={game.name} /> : null
      }
    </ToolShell>
  )
}

function SpeedTiersBody({ generation, game }: { generation: number; game: string }) {
  const ctx = useMemo(() => gameContext(game), [game])
  const table = useGameMoveTable(game)
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])
  const items = useMemo(
    () => itemEntries({ generation, isAll: false }).filter((i) => SPEED_ITEMS.includes(i.name)),
    [generation],
  )
  const tb = useTeamBuilderData()
  const teams = orderedTeams(tb).filter((t) => t.generation === generation)
  const rules = FIELD_RULES[generation]

  // Opens on two Pokemon, so there is a ladder to read before anything is typed.
  const [rows, setRows] = useState<TierRow[]>(() => {
    const first = species[0]?.id ?? 1
    return [newRow('mine', first, ctx), newRow('theirs', species[3]?.id ?? first, ctx)]
  })
  const [field, setField] = useState<TierField>({
    weather: null,
    tailwind: { mine: false, theirs: false },
    trickRoom: false,
  })

  const patch = (key: string, p: Partial<TierRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))

  const loadTeam = (teamId: string) => {
    const team = tb.teams.find((t) => t.id === teamId)
    if (!team) return
    const loaded = team.memberIds
      .map((id, slot) => ({ build: tb.builds.find((b) => b.id === id), slot }))
      .filter((x) => x.build)
      .map(({ build, slot }) => {
        const spec = buildToSpec(build!, ctx, slot)
        return { ...newRow('mine', build!.speciesId, ctx), moves: spec.moves, build: spec }
      })
    setRows((rs) => [...loaded, ...rs.filter((r) => !r.build)])
  }

  const outcome =
    table.status === 'ready'
      ? readTiers(ctx, table.data, rows, field)
      : {
          ok: false as const,
          reason:
            table.status === 'error'
              ? `This game’s data did not load: ${table.message}`
              : 'Loading this game’s data…',
        }
  const nameOf = (key: string) => {
    const r = rows.find((x) => x.key === key)
    return (
      r?.build?.label ?? (r?.speciesId != null ? getSpecies(r.speciesId)?.display_name : '') ?? ''
    )
  }

  return (
    <>
      <ToolInputs>
        <h2 className="calc-section-heading">Field</h2>
        <div className="calc-row">
          {rules.weathers.length > 0 && (
            <SelectField
              label="Weather"
              options={[
                { value: '', label: 'None' },
                ...rules.weathers.map((w) => ({ value: w, label: WEATHER_LABEL[w] })),
              ]}
              value={field.weather ?? ''}
              data-testid="tiers-weather"
              onChange={(e) =>
                setField({ ...field, weather: (e.target.value || null) as Weather | null })
              }
            />
          )}
          {teams.length > 0 && (
            <SelectField
              label="Load a team (yours)"
              options={[
                { value: '', label: 'Choose…' },
                ...teams.map((t) => ({ value: t.id, label: t.name || `Team ${t.seq}` })),
              ]}
              value=""
              data-testid="tiers-load-team"
              onChange={(e) => e.target.value && loadTeam(e.target.value)}
            />
          )}
        </div>
        {ctx.trickRoom && (
          <div className="calc-toggle-row">
            <Toggle
              on={field.trickRoom}
              label="Trick Room"
              onChange={(v) => setField({ ...field, trickRoom: v })}
            />
            <Toggle
              on={field.tailwind.mine}
              label="Tailwind (yours)"
              onChange={(v) => setField({ ...field, tailwind: { ...field.tailwind, mine: v } })}
            />
            <Toggle
              on={field.tailwind.theirs}
              label="Tailwind (theirs)"
              onChange={(v) => setField({ ...field, tailwind: { ...field.tailwind, theirs: v } })}
            />
          </div>
        )}

        {rows.map((row, i) => (
          <TierRowEditor
            key={row.key}
            index={i}
            row={row}
            ctx={ctx}
            species={species}
            items={items}
            onChange={(p) => patch(row.key, p)}
            onRemove={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
          />
        ))}
        <div className="calc-toggle-row">
          <button
            type="button"
            className="tools-link"
            data-testid="tiers-add-mine"
            onClick={() => setRows((rs) => [...rs, newRow('mine', species[0]?.id ?? null, ctx)])}
          >
            + Add yours
          </button>
          <button
            type="button"
            className="tools-link"
            data-testid="tiers-add-theirs"
            onClick={() => setRows((rs) => [...rs, newRow('theirs', species[0]?.id ?? null, ctx)])}
          >
            + Add theirs
          </button>
        </div>
      </ToolInputs>

      <ToolResult reason={outcome.ok ? null : outcome.reason}>
        {outcome.ok && (
          <ol className="tools-list" data-testid="tiers-ladder">
            {outcome.rows.map((r) => (
              <li
                key={r.key}
                className="tools-item"
                data-testid={`tiers-rank-${r.rank + 1}`}
                data-key={r.key}
              >
                <span>
                  <span className="num">{r.rank + 1}.</span> {nameOf(r.key)}{' '}
                  <span className="tools-blurb">({r.side === 'mine' ? 'yours' : 'theirs'})</span>
                </span>
                <span>
                  <span className="num" data-testid={`tiers-speed-${r.rank + 1}`}>
                    {r.speed.min === r.speed.max ? r.speed.min : `${r.speed.min}–${r.speed.max}`}
                  </span>
                  {r.ties.length > 0 && (
                    <span className="tools-blurb">
                      {' '}
                      · speed tie with {r.ties.map(nameOf).join(', ')}: 50/50
                    </span>
                  )}
                  {r.exceptions.map((x) => (
                    <span key={x.label} className="tools-blurb">
                      {' '}
                      · {x.label}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        )}
        {outcome.ok && field.trickRoom && (
          <p className="calc-result-note">
            Trick Room: slowest first within each priority bracket.
          </p>
        )}
      </ToolResult>
    </>
  )
}
