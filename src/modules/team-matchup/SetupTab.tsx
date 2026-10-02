/**
 * SETUP: who fights whom, under which rules, on which numbers.
 *
 *   S1 my team from Team Building (the Collection does not exist yet; the setup
 *      keeps a link-ready field for it);
 *   S2/S3 the opponent by game -> trainer -> variant, with its exact data as the
 *      disassembly gives it; facility trainers as a pool (R6);
 *   S5 a custom team, or edits to a trainer's Pokemon;
 *   S6 format rules; S7 spread modes, per team and per Pokemon;
 *   D3 the field, badges for badge boosts, and Nuzlocke mode (O4).
 */

import { useMemo, useState } from 'react'
import {
  getAbility,
  getItem,
  getMove,
  getNature,
  getSpecies,
  getType,
  resolveAbilitiesForGeneration,
  resolveTypesForGeneration,
} from '../../data'
import { SearchSelect, type SearchOption } from '../../components/ds/SearchSelect'
import { holdableItems } from '../calculators/damageCalcState'
import { speciesPickerOptions } from '../calculators/damageSets'
import {
  effectiveLevel,
  hpDv,
  varietyOfSpec,
  type BattlerSpec,
  type SpreadMode,
} from '../battle/battler'
import { fmtRange } from '../battle/range'
import { isBoss, trainerTitle } from '../battle/sources'
import type { MatchupView } from './TeamMatchup'
import type { CustomMon, MonOverride, OpponentRef } from './model'
import { EMPTY_LINKS } from './model'
import { Choice, MonName, Note, Section } from './parts'
import { SpreadEditor } from './SpreadEditor'
import type { Weather } from '../calculators/damage'

export function SetupTab({ view }: { view: MatchupView }) {
  const { ctx, setup, update, resolved, tb } = view
  const teams = tb.teams.filter((t) => t.generation === ctx.generation && t.memberIds.some(Boolean))
  return (
    <div className="tm-setup" data-layout="tm-setup-grid">
      <div className="tm-setup-mine" data-layout="tm-setup-mine">
        <Section title="Your team" testId="tm-setup-mine">
          {teams.length === 0 ? (
            <Note tone="warn">
              No Gen {ctx.generation} team in Team Building yet. Make one there; it appears here.
            </Note>
          ) : (
            <label className="tm-inline-field">
              <span>Team</span>
              <select
                className="tm-select"
                data-testid="tm-team"
                value={setup.teamId ?? ''}
                onChange={(e) =>
                  update((s) => ({ ...s, teamId: e.target.value || null, mine: {}, lead: 0 }))
                }
              >
                <option value="">Choose a team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name?.trim() || `Team #${String(t.seq).padStart(3, '0')}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Note>
            From your Team Building teams. Collection: not available yet — the setup will take a
            Collection team once that module exists.
          </Note>
          {resolved.problems.map((p) => (
            <Note key={p} tone="warn">
              {p}
            </Note>
          ))}
          {resolved.mine.length > 0 && (
            <>
              <Choice
                label="Spreads for the whole team"
                value={setup.mySpreadMode}
                testId="tm-my-mode"
                options={[
                  { value: 'current', label: 'Use current' },
                  { value: 'custom', label: 'Customize' },
                ]}
                onChange={(v) => update((s) => ({ ...s, mySpreadMode: v }))}
              />
              <label className="tm-inline-field">
                <span>Lead</span>
                <select
                  className="tm-select"
                  data-testid="tm-lead"
                  value={setup.lead}
                  onChange={(e) => update((s) => ({ ...s, lead: Number(e.target.value) }))}
                >
                  {resolved.mine.map((m, i) => (
                    <option key={m.key} value={i}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              {resolved.doubles && (
                // S6: a double battle opens with two of mine.
                <label className="tm-inline-field">
                  <span>Second lead</span>
                  <select
                    className="tm-select"
                    data-testid="tm-lead2"
                    value={setup.lead2 ?? ''}
                    onChange={(e) =>
                      update((s) => ({
                        ...s,
                        lead2: e.target.value === '' ? undefined : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">The next one</option>
                    {resolved.mine.map((m, i) =>
                      i === setup.lead ? null : (
                        <option key={m.key} value={i}>
                          {m.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              )}
              <ol className="tm-roster" data-testid="tm-mine-roster">
                {resolved.mine.map((m, i) => (
                  <RosterRow
                    key={m.key}
                    spec={m}
                    view={view}
                    override={setup.mine[resolved.mineBuildIds[i]]}
                    teamMode={setup.mySpreadMode}
                    testId={`tm-mine-${i}`}
                    onChange={(ov) =>
                      update((s) => ({ ...s, mine: { ...s.mine, [resolved.mineBuildIds[i]]: ov } }))
                    }
                  />
                ))}
              </ol>
            </>
          )}
        </Section>
      </div>

      <div className="tm-setup-theirs" data-layout="tm-setup-theirs">
        <Section title="Opponent" testId="tm-setup-opponent">
          <OpponentPicker view={view} />
          {resolved.limitations.map((l) => (
            <Note key={l} tone="warn">
              {l}
            </Note>
          ))}
          {resolved.trainer && setup.opponent?.kind !== 'custom' && <TrainerFacts view={view} />}
          {resolved.theirs.length > 0 && (
            <>
              <Choice
                label="Their spreads"
                value={setup.theirSpreadMode}
                testId="tm-their-mode"
                options={[
                  { value: 'current', label: 'Use current (game data)' },
                  { value: 'custom', label: 'Customize' },
                ]}
                onChange={(v) => update((s) => ({ ...s, theirSpreadMode: v }))}
              />
              <ol className="tm-roster" data-testid="tm-theirs-roster">
                {resolved.theirs.slice(0, resolved.pool ? 12 : 6).map((m, i) => (
                  <RosterRow
                    key={m.key}
                    spec={m}
                    view={view}
                    editable
                    override={setup.theirs[i]}
                    teamMode={setup.theirSpreadMode}
                    testId={`tm-theirs-${i}`}
                    onChange={(ov) => update((s) => ({ ...s, theirs: { ...s.theirs, [i]: ov } }))}
                  />
                ))}
              </ol>
              {resolved.pool && resolved.theirs.length > 12 && (
                <Note>
                  {resolved.theirs.length - 12} more sets in the pool; every one is in the Matrix.
                </Note>
              )}
            </>
          )}
        </Section>
      </div>

      <div className="tm-setup-rules" data-layout="tm-setup-rules">
        <FormatAndField view={view} />
      </div>
    </div>
  )
}

// ------------------------------------------------------------ roster rows

function RosterRow({
  spec,
  view,
  override,
  teamMode,
  onChange,
  editable = false,
  testId,
}: {
  spec: BattlerSpec
  view: MatchupView
  override: MonOverride | undefined
  teamMode: SpreadMode
  onChange: (ov: MonOverride) => void
  editable?: boolean
  testId: string
}) {
  const [open, setOpen] = useState(false)
  const { ctx } = view
  const gen = ctx.generation
  const types = resolveTypesForGeneration(varietyOfSpec(spec), gen).map(
    (t) => getType(t.type_id)?.display_name ?? '',
  )
  const nature =
    spec.spread.natureIds.length === 1
      ? getNature(spec.spread.natureIds[0])?.display_name
      : spec.spread.natureIds.length
        ? `one of ${spec.spread.natureIds.length}`
        : gen >= 3
          ? 'any nature'
          : null
  const ivs = gen <= 2 ? dvLine(spec) : ivLine(spec)
  return (
    <li className="tm-roster-row" data-testid={testId}>
      <div className="tm-roster-main">
        <MonName spec={spec} />
        <span className="tm-muted">{types.join(' / ')}</span>
        {ctx.hasItems && (
          <span>
            {spec.itemId != null ? (getItem(spec.itemId)?.display_name ?? '—') : 'No item'}
          </span>
        )}
        {ctx.hasAbilities && (
          <span>{spec.abilityId != null ? getAbility(spec.abilityId)?.display_name : '—'}</span>
        )}
        {nature && <span>{nature}</span>}
        <span className="tm-mono">{ivs}</span>
        <span className="tm-roster-moves">
          {spec.moves.map((m) => getMove(m)?.display_name ?? `#${m}`).join(' · ')}
        </span>
        <label className="tm-inline-field tm-level" title="R4: what-if level for every analysis">
          <span>Level</span>
          <input
            type="number"
            className="tm-input tm-input-num"
            min={1}
            max={100}
            data-testid={`${testId}-level`}
            value={effectiveLevel(spec)}
            onChange={(e) => {
              const v = Math.max(1, Math.min(100, Number(e.target.value) || spec.level))
              onChange({ ...override, levelOverride: v === spec.level ? null : v })
            }}
          />
        </label>
        <button
          type="button"
          className="tm-link"
          data-testid={`${testId}-edit`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close' : editable ? 'Spread & edit' : 'Spread'}
        </button>
      </div>
      {open && (
        <div className="tm-roster-detail">
          <SpreadEditor
            spec={spec}
            ctx={ctx}
            override={override}
            teamMode={teamMode}
            onChange={onChange}
            testId={`${testId}-spread`}
          />
          {editable && (
            <MonEdits
              spec={spec}
              view={view}
              override={override}
              onChange={onChange}
              testId={`${testId}-edits`}
            />
          )}
        </div>
      )}
    </li>
  )
}

function dvLine(spec: BattlerSpec): string {
  const d = spec.spread.individual
  const r = (k: string) => fmtRange(d[k as 'attack'] ?? { min: 0, max: 0 }, 0, '-')
  const point = ['attack', 'defense', 'speed', 'special'].every(
    (k) => d[k as 'attack'] && d[k as 'attack']!.min === d[k as 'attack']!.max,
  )
  const hp = point
    ? hpDv({
        attack: d.attack!.min,
        defense: d.defense!.min,
        speed: d.speed!.min,
        special: d.special!.min,
      })
    : '?'
  return `DV ${hp}/${r('attack')}/${r('defense')}/${r('speed')}/${r('special')}`
}

function ivLine(spec: BattlerSpec): string {
  const vals = Object.values(spec.spread.individual).filter(Boolean)
  const all = vals.every((v) => v!.min === vals[0]!.min && v!.max === vals[0]!.max)
  const ev = Object.values(spec.spread.effort).reduce((s, v) => s + (v?.max ?? 0), 0)
  return `${all && vals[0] ? `IV ${fmtRange(vals[0], 0, '-')} all` : 'IV mixed'} · EV ${ev}`
}

/** S5: edit a trainer's Pokemon -- moves, item, ability -- as an override. */
function MonEdits({
  spec,
  view,
  override,
  onChange,
  testId,
}: {
  spec: BattlerSpec
  view: MatchupView
  override: MonOverride | undefined
  onChange: (ov: MonOverride) => void
  testId: string
}) {
  const { ctx, data } = view
  const moveOptions = useMemo<SearchOption[]>(
    () =>
      Object.keys(data.moves)
        .map(Number)
        .map((id) => ({ value: String(id), label: getMove(id)?.display_name ?? `#${id}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  )
  const items = useMemo(() => (ctx.hasItems ? holdableItems(ctx.generation) : []), [ctx])
  const abilities = ctx.hasAbilities
    ? resolveAbilitiesForGeneration(varietyOfSpec(spec), ctx.generation).filter((a) => !a.is_hidden)
    : []
  const moves = [...spec.moves, 0, 0, 0, 0].slice(0, 4)
  return (
    <div className="tm-edits" data-testid={testId}>
      {moves.map((m, slot) => (
        <SearchSelect
          key={slot}
          label={`Move ${slot + 1}`}
          options={[{ value: '0', label: '—' }, ...moveOptions]}
          value={String(m)}
          testId={`${testId}-move-${slot}`}
          onChange={(v) => {
            const next = moves.map((x, k) => (k === slot ? Number(v) : x)).filter((x) => x > 0)
            onChange({ ...override, moves: next })
          }}
        />
      ))}
      {ctx.hasItems && (
        <label className="tm-inline-field">
          <span>Item</span>
          <select
            className="tm-select"
            value={spec.itemId ?? ''}
            onChange={(e) =>
              onChange({ ...override, itemId: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">None</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.display_name}
              </option>
            ))}
          </select>
        </label>
      )}
      {ctx.hasAbilities && abilities.length > 1 && (
        <label className="tm-inline-field">
          <span>Ability</span>
          <select
            className="tm-select"
            value={spec.abilityId ?? ''}
            onChange={(e) => onChange({ ...override, abilityId: Number(e.target.value) })}
          >
            {abilities.map((a) => (
              <option key={a.ability.id} value={a.ability.id}>
                {a.ability.display_name}
              </option>
            ))}
          </select>
        </label>
      )}
      {(override?.moves || override?.itemId !== undefined || override?.abilityId !== undefined) && (
        <button
          type="button"
          className="tm-link"
          onClick={() =>
            onChange({ ...override, moves: undefined, itemId: undefined, abilityId: undefined })
          }
        >
          Undo edits
        </button>
      )}
    </div>
  )
}

// -------------------------------------------------------------- opponent

function OpponentPicker({ view }: { view: MatchupView }) {
  const { partition, setup, update, ctx } = view
  const kind = setup.opponent?.kind ?? 'trainer'
  const trainerOptions = useMemo<SearchOption[]>(() => {
    if (!partition) return []
    const placed = partition.trainers
      .filter((t) => !t.unused)
      .map((t) => ({ t, order: t.appearances[0]?.order ?? Number.MAX_SAFE_INTEGER }))
      .sort(
        (a, b) =>
          Number(isBoss(partition, b.t)) - Number(isBoss(partition, a.t)) || a.order - b.order,
      )
    return placed.map(({ t }) => ({
      value: t.id,
      label: trainerTitle(partition, t),
      hint: `Lv ${Math.max(...t.party.map((p) => p.level))}${t.battle !== 'single' ? ` · ${t.battle}` : ''}`,
      group: isBoss(partition, t) ? 'Bosses' : (t.appearances[0]?.location ?? 'Location not found'),
    }))
  }, [partition])
  const setOpp = (o: OpponentRef | null) =>
    update((s) => ({ ...s, opponent: o, theirs: {}, scenarioId: s.scenarioId }))
  return (
    <div className="tm-opponent">
      <Choice
        label="From"
        value={kind}
        testId="tm-opp-kind"
        options={[
          { value: 'trainer', label: 'Trainer' },
          { value: 'facility', label: 'Battle facility', disabled: !partition?.facilities.length },
          { value: 'custom', label: 'Custom team' },
        ]}
        onChange={(v) => {
          if (v === 'trainer') setOpp(null)
          else if (v === 'custom') setOpp({ kind: 'custom' })
          else {
            const f = partition?.facilities[0]
            if (f)
              setOpp({
                kind: 'facility',
                facilityId: f.id,
                trainerKey: f.trainers[0]?.key ?? '',
                level: 50,
                group: null,
                picks: [],
              })
          }
        }}
      />
      {kind === 'trainer' && (
        <SearchSelect
          label={`Trainer in ${ctx.label}`}
          options={trainerOptions}
          value={setup.opponent?.kind === 'trainer' ? setup.opponent.trainerId : ''}
          placeholder="Search trainers — bosses first"
          testId="tm-trainer"
          fieldSize="wide"
          maxResults={120}
          onChange={(id) => setOpp({ kind: 'trainer', trainerId: id })}
        />
      )}
      {kind === 'facility' && setup.opponent?.kind === 'facility' && <FacilityPicker view={view} />}
      {kind === 'custom' && <CustomTeamEditor view={view} />}
      {kind === 'trainer' && setup.opponent?.kind === 'trainer' && (
        <button
          type="button"
          className="tm-link"
          data-testid="tm-copy-to-custom"
          onClick={() =>
            update((s) => ({
              ...s,
              opponent: { kind: 'custom' },
              theirs: {},
              custom: view.resolved.theirs.map((t) => ({
                speciesId: t.speciesId,
                varietyName: t.varietyName,
                level: t.level,
                moves: t.moves,
                itemId: t.itemId,
                abilityId: t.abilityId,
                natureId: t.spread.natureIds[0] ?? null,
              })),
            }))
          }
        >
          Copy this team into a custom team
        </button>
      )}
    </div>
  )
}

function FacilityPicker({ view }: { view: MatchupView }) {
  const { partition, setup, update, resolved } = view
  if (setup.opponent?.kind !== 'facility' || !partition) return null
  const opp = setup.opponent
  const f = partition.facilities.find((x) => x.id === opp.facilityId)
  const set = (patch: Partial<typeof opp>) =>
    update((s) => ({ ...s, opponent: { ...opp, ...patch }, theirs: {} }))
  const groups = f
    ? [...new Set(f.sets.map((s) => s.group).filter((g): g is number => g != null))].sort(
        (a, b) => a - b,
      )
    : []
  return (
    <div className="tm-facility" data-testid="tm-facility">
      <label className="tm-inline-field">
        <span>Facility</span>
        <select
          className="tm-select"
          value={opp.facilityId}
          onChange={(e) =>
            set({
              facilityId: e.target.value,
              trainerKey:
                partition.facilities.find((x) => x.id === e.target.value)?.trainers[0]?.key ?? '',
              picks: [],
            })
          }
        >
          {partition.facilities.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <label className="tm-inline-field">
        <span>Trainer</span>
        <select
          className="tm-select"
          data-testid="tm-facility-trainer"
          value={opp.trainerKey}
          onChange={(e) => set({ trainerKey: e.target.value, picks: [] })}
        >
          {f?.trainers.map((t) => (
            <option key={t.key} value={t.key}>
              {[t.class_name, t.name, t.group].filter(Boolean).join(' ')}
            </option>
          ))}
        </select>
      </label>
      <label className="tm-inline-field">
        <span>Level</span>
        <input
          type="number"
          className="tm-input tm-input-num"
          min={1}
          max={100}
          value={opp.level}
          onChange={(e) => set({ level: Math.max(1, Math.min(100, Number(e.target.value) || 50)) })}
        />
      </label>
      {groups.length > 1 && (
        <label className="tm-inline-field">
          <span>Bracket</span>
          <select
            className="tm-select"
            value={opp.group ?? ''}
            onChange={(e) =>
              set({ group: e.target.value ? Number(e.target.value) : null, picks: [] })
            }
          >
            <option value="">Every bracket</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                Lv {g * 10}
              </option>
            ))}
          </select>
        </label>
      )}
      {f && <Note>{f.rules}</Note>}
      {f?.source_note && <Note tone="warn">{f.source_note}</Note>}
      {resolved.pool && (
        <div className="tm-pool" data-testid="tm-pool">
          <span className="tm-muted">
            Pool of {resolved.pool.length}; the trainer draws {resolved.poolSize}. Pick the sets you
            saw to fix the team, or leave none picked to analyse the whole pool.
          </span>
          <div className="tm-pool-list">
            {resolved.pool.map((e) => {
              const on = opp.picks.includes(e.setKey)
              return (
                <label key={e.setKey} className="tm-check">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      set({
                        picks: on
                          ? opp.picks.filter((k) => k !== e.setKey)
                          : [...opp.picks, e.setKey].slice(-6),
                      })
                    }
                  />
                  {e.spec.label} <span className="tm-muted">{(e.p * 100).toFixed(1)}%</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function CustomTeamEditor({ view }: { view: MatchupView }) {
  const { setup, update, ctx } = view
  const species = useMemo(() => speciesPickerOptions(ctx.generation), [ctx.generation])
  const set = (custom: CustomMon[]) => update((s) => ({ ...s, custom, theirs: {} }))
  return (
    <div className="tm-custom" data-testid="tm-custom">
      {setup.custom.map((c, i) => (
        <div key={i} className="tm-custom-row">
          <SearchSelect
            label={`Pokemon ${i + 1}`}
            options={species}
            value={`${c.speciesId}:${c.varietyName}`}
            testId={`tm-custom-${i}-species`}
            onChange={(v) => {
              const [id, variety] = v.split(':')
              set(
                setup.custom.map((x, k) =>
                  k === i
                    ? {
                        ...x,
                        speciesId: Number(id),
                        varietyName: variety,
                        moves: [],
                        abilityId: null,
                      }
                    : x,
                ),
              )
            }}
          />
          <label className="tm-inline-field">
            <span>Level</span>
            <input
              type="number"
              className="tm-input tm-input-num"
              min={1}
              max={100}
              value={c.level}
              onChange={(e) =>
                set(
                  setup.custom.map((x, k) =>
                    k === i
                      ? { ...x, level: Math.max(1, Math.min(100, Number(e.target.value) || 50)) }
                      : x,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="tm-link"
            onClick={() => set(setup.custom.filter((_, k) => k !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      {setup.custom.length < 6 && (
        <button
          type="button"
          className="tm-link"
          data-testid="tm-custom-add"
          onClick={() => {
            const sp = getSpecies(25)!
            set([
              ...setup.custom,
              {
                speciesId: sp.id,
                varietyName: sp.varieties[0].name,
                level: 50,
                moves: [],
                itemId: null,
                abilityId: null,
                natureId: null,
              },
            ])
          }}
        >
          Add a Pokemon
        </button>
      )}
      <Note>Moves, item and spread of each are edited from its row below ("Spread & edit").</Note>
    </div>
  )
}

function TrainerFacts({ view }: { view: MatchupView }) {
  const { resolved, ctx } = view
  const t = resolved.trainer!
  return (
    <dl className="tm-facts" data-testid="tm-trainer-facts">
      <dt>AI</dt>
      <dd>
        {ctx.generation <= 2
          ? `class ${t.classId}`
          : t.aiFlags.length
            ? t.aiFlags.join(', ')
            : 'no AI flags'}
      </dd>
      {ctx.hasItems && (
        <>
          <dt>Bag</dt>
          <dd>
            {t.bag.length
              ? t.bag.map((i) => getItem(i)?.display_name ?? `#${i}`).join(', ')
              : 'none'}
          </dd>
        </>
      )}
      <dt>Battle</dt>
      <dd>{resolved.battle}</dd>
      <dt>Send-out</dt>
      <dd>
        {ctx.sendOut === 'party-order'
          ? 'Next in party order'
          : ctx.sendOut === 'gen2-matchup'
            ? 'Best type matchup against your active Pokemon'
            : 'The Pokemon the AI rates best against your active one'}
      </dd>
    </dl>
  )
}

// ------------------------------------------------------- format & field

const WEATHER_LABEL: Record<string, string> = {
  sun: 'Sun',
  rain: 'Rain',
  sand: 'Sandstorm',
  hail: 'Hail',
}

function FormatAndField({ view }: { view: MatchupView }) {
  const { setup, update, ctx } = view
  const f = setup.field
  const rules = ctx.field
  const side = (s: 'mine' | 'theirs', patch: Partial<typeof f.sides.mine>) =>
    update((x) => ({
      ...x,
      field: { ...x.field, sides: { ...x.field.sides, [s]: { ...x.field.sides[s], ...patch } } },
    }))
  return (
    <>
      <Section title="Format" testId="tm-format">
        <Choice
          label="Level"
          value={setup.format.level}
          testId="tm-format-level"
          options={[
            { value: 'as-is', label: 'Open (as they are)' },
            { value: 'level-50', label: 'Level 50' },
          ]}
          onChange={(v) => update((s) => ({ ...s, format: { ...s.format, level: v } }))}
        />
        <Choice
          label="Battle"
          value={setup.format.battle}
          testId="tm-format-battle"
          options={[
            { value: 'single', label: 'Single' },
            { value: 'double', label: 'Double', disabled: ctx.generation < 3 },
          ]}
          onChange={(v) => update((s) => ({ ...s, format: { ...s.format, battle: v } }))}
        />
        <label className="tm-check">
          <input
            type="checkbox"
            data-testid="tm-item-clause"
            checked={setup.format.itemClause}
            disabled={!ctx.hasItems}
            onChange={(e) =>
              update((s) => ({ ...s, format: { ...s.format, itemClause: e.target.checked } }))
            }
          />
          Item Clause (no two of yours hold one item)
        </label>
        {view.resolved.notes.map((n) => (
          <Note key={n}>{n}</Note>
        ))}
        <label className="tm-check">
          <input
            type="checkbox"
            data-testid="tm-nuzlocke"
            checked={setup.nuzlocke}
            onChange={(e) => update((s) => ({ ...s, nuzlocke: e.target.checked }))}
          />
          Nuzlocke mode: rank leads and lines by not fainting
        </label>
      </Section>

      <Section title="Field" testId="tm-field">
        <label className="tm-inline-field">
          <span>Weather</span>
          <select
            className="tm-select"
            data-testid="tm-weather"
            value={f.weather ?? ''}
            onChange={(e) =>
              update((s) => ({
                ...s,
                field: { ...s.field, weather: (e.target.value || null) as Weather | null },
              }))
            }
          >
            <option value="">None</option>
            {rules.weathers.map((w) => (
              <option key={w} value={w}>
                {WEATHER_LABEL[w] ?? w}
              </option>
            ))}
          </select>
        </label>
        {ctx.trickRoom && (
          <label className="tm-check">
            <input
              type="checkbox"
              data-testid="tm-trick-room"
              checked={f.trickRoom}
              onChange={(e) =>
                update((s) => ({ ...s, field: { ...s.field, trickRoom: e.target.checked } }))
              }
            />
            Trick Room
          </label>
        )}
        {rules.gravity && (
          <label className="tm-check">
            <input
              type="checkbox"
              checked={f.gravity}
              onChange={(e) =>
                update((s) => ({ ...s, field: { ...s.field, gravity: e.target.checked } }))
              }
            />
            Gravity
          </label>
        )}
        {(['mine', 'theirs'] as const).map((s) => (
          <div key={s} className="tm-field-side" data-testid={`tm-field-${s}`}>
            <span className="tm-field-side-name">{s === 'mine' ? 'Your side' : 'Their side'}</span>
            {ctx.generation >= 1 && (
              <>
                <label className="tm-check">
                  <input
                    type="checkbox"
                    checked={f.sides[s].reflect}
                    onChange={(e) => side(s, { reflect: e.target.checked })}
                  />
                  Reflect
                </label>
                <label className="tm-check">
                  <input
                    type="checkbox"
                    checked={f.sides[s].lightScreen}
                    onChange={(e) => side(s, { lightScreen: e.target.checked })}
                  />
                  Light Screen
                </label>
              </>
            )}
            {rules.maxSpikes > 0 && (
              <label className="tm-inline-field">
                <span>Spikes</span>
                <select
                  className="tm-select"
                  value={f.sides[s].spikes}
                  onChange={(e) => side(s, { spikes: Number(e.target.value) })}
                >
                  {Array.from({ length: rules.maxSpikes + 1 }, (_, n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {rules.stealthRock && (
              <label className="tm-check">
                <input
                  type="checkbox"
                  checked={f.sides[s].stealthRock}
                  onChange={(e) => side(s, { stealthRock: e.target.checked })}
                />
                Stealth Rock
              </label>
            )}
            {ctx.tailwind && (
              <label className="tm-check">
                <input
                  type="checkbox"
                  checked={!!f.sides[s].tailwind}
                  onChange={(e) => side(s, { tailwind: e.target.checked })}
                />
                Tailwind
              </label>
            )}
          </div>
        ))}
      </Section>

      {ctx.badges.length > 0 && (
        <Section title="Badges (your badge boosts)" testId="tm-badges">
          <div className="tm-badges">
            {ctx.badges.map((b) => (
              <label
                key={b.id}
                className="tm-check"
                title={[
                  b.stats.length ? `Boosts ${b.stats.join(', ')}` : '',
                  b.type ? `${b.type} moves +1/8` : '',
                ]
                  .filter(Boolean)
                  .join('; ')}
              >
                <input
                  type="checkbox"
                  data-testid={`tm-badge-${b.id}`}
                  checked={setup.badges.includes(b.id)}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      badges: e.target.checked
                        ? [...s.badges, b.id]
                        : s.badges.filter((x) => x !== b.id),
                    }))
                  }
                />
                {b.label}
              </label>
            ))}
          </div>
          <button
            type="button"
            className="tm-link"
            onClick={() =>
              update((s) => ({
                ...s,
                badges: s.badges.length === ctx.badges.length ? [] : ctx.badges.map((b) => b.id),
              }))
            }
          >
            {setup.badges.length === ctx.badges.length ? 'None' : 'All'}
          </button>
          {ctx.generation === 2 && (
            <Note>
              Glacier Badge's Special Defense half applies only for some Special Attack values (a
              game bug, reproduced).
            </Note>
          )}
        </Section>
      )}

      {view.scenario && (
        <Section title="Scenario links" testId="tm-links">
          <Note>
            Notes, Journal, Nuzlocke Tracker and Collection are not built yet. This scenario keeps a
            field for each ({Object.keys(EMPTY_LINKS).join(', ')}) so it links to them once they
            exist.
          </Note>
        </Section>
      )}
    </>
  )
}
