import { useMemo } from 'react'
import {
  getAbility,
  getMove,
  getType,
  listMoves,
  listNatures,
  moveExistsInGeneration,
  resolveAbilitiesForGeneration,
  resolveStatsForGeneration,
  resolveTypesForGeneration,
  type Move,
} from '../../data'
import { resolveMovePowerForGeneration, resolveMoveTypeNameForGeneration } from '../../data/moveEra'
import { CompactFieldStrip, FormSectionLabel } from '../../components/ds/FormParts'
import { EvStatRow, EvStatTable } from '../../components/ds/EvStatTable'
import { MoveSlotGrid, MoveSlotTile } from '../../components/ds/MoveSlotTile'
import { SearchSelect, type SearchOption } from '../../components/ds/SearchSelect'
import { SelectField } from '../../components/ds/SelectField'
import { TextField } from '../../components/ds/TextField'
import { Toggle } from '../../components/ds/Toggle'
import { TypeLabel } from '../../components/ds/TypeLabel'
import { useDraftNumber } from '../../components/ds/useDraftNumber'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import { speciesEntries } from '../dex/entrySources'
import {
  MAX_DV,
  MAX_EV,
  MAX_EV_TOTAL,
  MAX_IV,
  MAX_STAT_EXP,
  effortTotal,
  hpDvFrom,
  type StatKey,
  type StatNumbers,
} from '../team-builder/statMath'
import {
  categoryFor,
  computeRawStats,
  HELD_ITEMS_INTRODUCED_IN_GENERATION,
  POWER_OVERRIDE_DEFAULTS,
  type BoostStat,
  type StatId,
  type StatusId,
} from './damage'
import {
  MOVE_SLOT_COUNT,
  TOGGLED_ABILITIES,
  formAvailable,
  holdableItems,
  isDamaging,
  toCalcPokemon,
  varietyOf,
  withSpecies,
  type SideState,
} from './damageCalcState'
import type { useGenerationLearnset } from './useGenerationLearnset'

type Learnset = ReturnType<typeof useGenerationLearnset>

/**
 * One Pokemon's inputs, in the Showdown calculator's arrangement -- species, type
 * and level; the stat table with each stage inline on its row; nature, ability,
 * item, status; current HP; four moves -- drawn with this app's controls (the
 * hairline fields, the ds Toggle, the move-slot tiles). Both Pokemon are the same
 * component: every calculation runs both ways, so neither is "the attacker".
 *
 * EVERY ERA GATE IS A HIDE, NOT A DISABLE, the same idiom as the species page:
 * no item before Gen 2, no ability or nature before Gen 3, Stat Exp and DVs
 * instead of EVs and IVs before Gen 3, one Special in Gen 1.
 */

const STATUS_OPTIONS: { value: StatusId; label: string }[] = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'brn', label: 'Burned' },
  { value: 'par', label: 'Paralyzed' },
  { value: 'psn', label: 'Poisoned' },
  { value: 'tox', label: 'Badly poisoned' },
  { value: 'slp', label: 'Asleep' },
  { value: 'frz', label: 'Frozen' },
]

const STAGE_OPTIONS = [6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6].map((n) => ({
  value: String(n),
  label: n > 0 ? `+${n}` : n === 0 ? '—' : String(n),
}))

interface SpreadRow {
  stat: StatId
  label: string
  /** Key into effort/individual. Gen 1-2's Special is one key for both halves. */
  key: StatKey
  /** Key into the era's base stats. */
  baseKey: StatKey
}

function spreadRows(gen: number): SpreadRow[] {
  if (gen === 1) {
    return [
      { stat: 'hp', label: 'HP', key: 'hp', baseKey: 'hp' },
      { stat: 'atk', label: 'Atk', key: 'attack', baseKey: 'attack' },
      { stat: 'def', label: 'Def', key: 'defense', baseKey: 'defense' },
      { stat: 'spa', label: 'Spc', key: 'special', baseKey: 'special' },
      { stat: 'spe', label: 'Spe', key: 'speed', baseKey: 'speed' },
    ]
  }
  const shared = gen === 2
  return [
    { stat: 'hp', label: 'HP', key: 'hp', baseKey: 'hp' },
    { stat: 'atk', label: 'Atk', key: 'attack', baseKey: 'attack' },
    { stat: 'def', label: 'Def', key: 'defense', baseKey: 'defense' },
    {
      stat: 'spa',
      label: 'SpA',
      key: shared ? 'special' : 'special-attack',
      baseKey: 'special-attack',
    },
    {
      stat: 'spd',
      label: 'SpD',
      key: shared ? 'special' : 'special-defense',
      baseKey: 'special-defense',
    },
    { stat: 'spe', label: 'Spe', key: 'speed', baseKey: 'speed' },
  ]
}

const SHORT_STAT: Record<string, string> = {
  attack: 'Atk',
  defense: 'Def',
  'special-attack': 'SpA',
  'special-defense': 'SpD',
  speed: 'Spe',
}

function natureLabel(n: {
  display_name: string
  increased_stat: string | null
  decreased_stat: string | null
}) {
  if (!n.increased_stat || n.increased_stat === n.decreased_stat) return n.display_name
  return `${n.display_name} (+${SHORT_STAT[n.increased_stat]} −${SHORT_STAT[n.decreased_stat ?? '']})`
}

function formLabel(speciesName: string, varietyName: string, speciesSlug: string): string {
  if (!varietyName.startsWith(`${speciesSlug}-`)) return speciesName
  const form = varietyName
    .slice(speciesSlug.length + 1)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-')
  return `${speciesName}-${form}`
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function DamagePokemonPanel({
  index,
  gen,
  side,
  onChange,
  showGender,
  anyMove,
  onAnyMove,
  learnset,
  moves,
}: {
  /** 0 or 1: "Pokémon 1" / "Pokémon 2". */
  index: 0 | 1
  gen: number
  side: SideState
  onChange: (next: SideState) => void
  showGender: boolean
  anyMove: boolean
  onAnyMove: (next: boolean) => void
  learnset: Learnset
  /** The four slots as calculated: the side's own, or the learnset defaults. */
  moves: (number | null)[]
}) {
  const variety = varietyOf(side)
  const set = (patch: Partial<SideState>) => onChange({ ...side, ...patch })
  const role = `p${index + 1}`
  const testId = (s: string) => `dcalc-${role}-${s}`

  // ---------------------------------------------------------------- options
  const speciesOptions = useMemo<SearchOption[]>(() => {
    const out: SearchOption[] = []
    for (const s of speciesEntries({ generation: gen, isAll: false })) {
      for (const v of s.varieties) {
        if (!formAvailable(v, gen)) continue
        out.push({
          value: `${s.id}:${v.name}`,
          label: v.is_default ? s.display_name : formLabel(s.display_name, v.name, s.name),
          hint: `#${String(s.id).padStart(3, '0')}`,
        })
      }
    }
    return out
  }, [gen])

  const itemOptions = useMemo<SearchOption[]>(
    () => [
      { value: '', label: '(none)' },
      ...holdableItems(gen).map((i) => ({ value: String(i.id), label: i.display_name })),
    ],
    [gen],
  )

  const abilities = resolveAbilitiesForGeneration(variety, gen)
  const natures = useMemo(
    () => [...listNatures()].sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [],
  )
  const types = resolveTypesForGeneration(variety, gen).map((t) => getType(t.type_id)?.name ?? '')

  // ------------------------------------------------------------- the spread
  const rawStats = computeRawStats(toCalcPokemon(side), gen)
  const bases = new Map(resolveStatsForGeneration(variety, gen).map((s) => [s.stat, s.base_stat]))
  const modern = gen >= 3
  const rows = spreadRows(gen)
  const effortKeys = [...new Set(rows.map((r) => r.key))]
  const evTotal = effortTotal(side.effort, effortKeys)

  const setEffort = (key: StatKey, value: number) => {
    if (modern) {
      const others = effortKeys
        .filter((k) => k !== key)
        .reduce((sum, k) => sum + (side.effort[k] ?? 0), 0)
      set({
        effort: {
          ...side.effort,
          [key]: Math.min(value, MAX_EV, Math.max(0, MAX_EV_TOTAL - others)),
        },
      })
    } else {
      set({ effort: { ...side.effort, [key]: Math.min(value, MAX_STAT_EXP) } })
    }
  }
  // Gen 1-2's HP DV is derived from the other four, so it has no key to reset.
  const resetSpread = (which: 'individual' | 'effort') => {
    const keys = effortKeys.filter((k) => modern || which === 'effort' || k !== 'hp')
    set({ [which]: Object.fromEntries(keys.map((k) => [k, 0])) as StatNumbers })
  }
  const resetHeader = (text: string, which: 'individual' | 'effort', what: string) => (
    <button
      type="button"
      className="ghost-button dcalc-reset"
      title={`Reset ${what} to 0`}
      aria-label={`Reset ${what} to 0`}
      data-testid={testId(`reset-${which}`)}
      onClick={() => resetSpread(which)}
    >
      {text}
    </button>
  )
  const setIndividual = (key: StatKey, value: number) =>
    set({
      individual: {
        ...side.individual,
        [key]: Math.min(value, modern ? MAX_IV : MAX_DV),
      } as StatNumbers,
    })

  const maxHp = rawStats.hp
  const hp = side.currentHp ?? maxHp
  const pct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0
  const levelDraft = useDraftNumber(side.level, (level) => set({ level, currentHp: null }), {
    min: 1,
    max: 100,
  })
  const hpDraft = useDraftNumber(hp, (n) => set({ currentHp: n === maxHp ? null : n }), {
    max: maxHp,
  })
  const pctDraft = useDraftNumber(
    pct,
    (p) => set({ currentHp: p >= 100 ? null : Math.floor((maxHp * p) / 100) }),
    { max: 100 },
  )

  const toggledAbility = abilities.find((a) => a.ability.id === side.abilityId)?.ability
  const showAbilityOn =
    gen >= 3 && toggledAbility != null && TOGGLED_ABILITIES.includes(toggledAbility.name)

  const stageSelect = (stat: BoostStat, label: string) => (
    <SelectField
      label={`${label} stage`}
      hideLabel
      options={STAGE_OPTIONS}
      value={String(side.boosts[stat] ?? 0)}
      data-testid={testId(`stage-${stat}`)}
      onChange={(e) => set({ boosts: { ...side.boosts, [stat]: Number(e.target.value) } })}
    />
  )

  return (
    <div className="dcalc-panel" data-layout={`dcalc-${role}`} data-testid={`dcalc-${role}`}>
      <FormSectionLabel>{`Pokémon ${index + 1}`}</FormSectionLabel>

      <CompactFieldStrip testId={testId('strip')}>
        <SearchSelect
          label="Pokémon"
          options={speciesOptions}
          value={`${side.speciesId}:${side.varietyName}`}
          onChange={(v) => {
            const [id, name] = v.split(':')
            onChange(withSpecies(side, Number(id), name, gen))
          }}
          testId={testId('species')}
        />
        <div className="ds-field dcalc-type-field" data-testid={testId('types')}>
          <span className="ds-field-label">Type</span>
          <span className="dcalc-type-line">
            {types.map((t, i) => (
              <span key={t} className="dcalc-type">
                {i > 0 && <span className="dcalc-type-sep">·</span>}
                <TypeLabel type={t} small />
              </span>
            ))}
          </span>
        </div>
        <TextField
          label="Level"
          fieldSize="narrow"
          type="number"
          min={1}
          max={100}
          data-testid={testId('level')}
          {...levelDraft}
        />
        {showGender && (
          <SelectField
            label="Gender"
            fieldSize="narrow"
            options={[
              { value: 'N', label: '—' },
              { value: 'M', label: 'M' },
              { value: 'F', label: 'F' },
            ]}
            value={side.gender}
            data-testid={testId('gender')}
            onChange={(e) => set({ gender: e.target.value as SideState['gender'] })}
          />
        )}
      </CompactFieldStrip>

      <EvStatTable
        testId={testId('spread')}
        columns={[
          'Stat',
          'Base',
          resetHeader(modern ? 'IV' : 'DV', 'individual', modern ? 'IVs' : 'DVs'),
          resetHeader(modern ? 'EVs' : 'Stat Exp', 'effort', modern ? 'EVs' : 'Stat Exp'),
          'Total',
          'Stage',
        ]}
        footer={
          modern ? (
            <span data-testid={testId('ev-total')}>{`${evTotal} / ${MAX_EV_TOTAL} EVs`}</span>
          ) : gen === 2 ? (
            'SpA and SpD share one Special DV and Stat Exp in Gen 2; the HP DV is derived.'
          ) : (
            'The HP DV is derived from the other four.'
          )
        }
      >
        {rows.map((row) => (
          <EvStatRow
            key={row.stat}
            testId={testId(`row-${row.stat}`)}
            label={row.label}
            base={bases.get(row.baseKey) ?? null}
            individual={
              !modern && row.stat === 'hp'
                ? {
                    value: hpDvFrom(side.individual),
                    max: MAX_DV,
                    testId: testId(`iv-${row.stat}`),
                  }
                : {
                    value: side.individual[row.key] ?? 0,
                    max: modern ? MAX_IV : MAX_DV,
                    onChange: (n) => setIndividual(row.key, n),
                    testId: testId(`iv-${row.stat}`),
                  }
            }
            effort={{
              value: side.effort[row.key] ?? 0,
              max: modern ? MAX_EV : MAX_STAT_EXP,
              slider: modern,
              onChange: (n) => setEffort(row.key, n),
              testId: testId(`ev-${row.stat}`),
            }}
            total={rawStats[row.stat]}
            extra={row.stat === 'hp' ? null : stageSelect(row.stat as BoostStat, row.label)}
          />
        ))}
      </EvStatTable>

      <CompactFieldStrip testId={testId('setup')}>
        {gen >= 3 && (
          <SelectField
            label="Nature"
            options={natures.map((n) => ({ value: String(n.id), label: natureLabel(n) }))}
            value={side.natureId != null ? String(side.natureId) : ''}
            data-testid={testId('nature')}
            onChange={(e) => set({ natureId: Number(e.target.value) })}
          />
        )}
        {gen >= 3 && (
          <SelectField
            label="Ability"
            options={abilities.map((a) => ({
              value: String(a.ability.id),
              label: a.ability.display_name,
            }))}
            value={side.abilityId != null ? String(side.abilityId) : ''}
            data-testid={testId('ability')}
            onChange={(e) => set({ abilityId: Number(e.target.value), abilityOn: false })}
          />
        )}
        {gen >= HELD_ITEMS_INTRODUCED_IN_GENERATION && (
          <SearchSelect
            label="Item"
            options={itemOptions}
            value={side.itemId != null ? String(side.itemId) : ''}
            onChange={(v) =>
              set({
                itemId: v ? Number(v) : null,
                remembered: { ...side.remembered, itemId: null },
              })
            }
            testId={testId('item')}
          />
        )}
        <SelectField
          label="Status"
          options={STATUS_OPTIONS}
          value={side.status}
          data-testid={testId('status')}
          onChange={(e) => set({ status: e.target.value as StatusId })}
        />
      </CompactFieldStrip>

      <div className="dcalc-hp-line">
        <TextField
          label="Current HP"
          fieldSize="narrow"
          type="number"
          min={0}
          max={maxHp}
          data-testid={testId('hp')}
          {...hpDraft}
        />
        <span className="dcalc-hp-of num">/ {maxHp}</span>
        <TextField
          label="Current HP percent"
          hideLabel
          fieldSize="narrow"
          type="number"
          min={0}
          max={100}
          data-testid={testId('hp-pct')}
          {...pctDraft}
        />
        <span className="dcalc-hp-of dcalc-hp-pct" aria-hidden>
          %
        </span>
        {showAbilityOn && (
          <Toggle
            on={side.abilityOn}
            label={`${toggledAbility!.display_name} active`}
            onChange={(next) => set({ abilityOn: next })}
          />
        )}
      </div>

      <MovesGroup
        gen={gen}
        side={side}
        onChange={onChange}
        anyMove={anyMove}
        onAnyMove={onAnyMove}
        learnset={learnset}
        moves={moves}
        testId={testId}
      />
    </div>
  )
}

type SlotPatch = {
  move?: number | null
  crit?: boolean
  hits?: number | null
  power?: number | null
}

function MovesGroup({
  gen,
  side,
  onChange,
  anyMove,
  onAnyMove,
  learnset,
  moves,
  testId,
}: {
  gen: number
  side: SideState
  onChange: (next: SideState) => void
  anyMove: boolean
  onAnyMove: (next: boolean) => void
  learnset: Learnset
  moves: (number | null)[]
  testId: (s: string) => string
}) {
  const { state, retry } = learnset
  const learnable = state.status === 'ready' ? state.rows : null

  const options = useMemo(() => {
    const pool = anyMove
      ? listMoves().filter((m) => moveExistsInGeneration(m, gen))
      : (learnable ?? []).map((id) => getMove(id)).filter((m): m is Move => m != null)
    return pool.filter(isDamaging).sort((a, b) => a.display_name.localeCompare(b.display_name))
  }, [anyMove, learnable, gen])

  const skillLink = side.abilityId != null && getAbility(side.abilityId)?.name === 'skill-link'

  // Any edit materializes the four slots, so the learnset defaults stop applying.
  const patchSlot = (slot: number, patch: SlotPatch) => {
    const next = {
      ...side,
      moves: [...moves],
      crit: [...side.crit],
      hits: [...side.hits],
      power: [...side.power],
    }
    if ('move' in patch) {
      next.moves[slot] = patch.move ?? null
      next.hits[slot] = null
      next.power[slot] = null
    }
    if (patch.crit !== undefined) next.crit[slot] = patch.crit
    if ('hits' in patch) next.hits[slot] = patch.hits ?? null
    if ('power' in patch) next.power[slot] = patch.power ?? null
    onChange(next)
  }

  return (
    <div className="dcalc-group">
      <FormSectionLabel
        aside={
          <ToggleSwitch
            id={testId('any-move')}
            label="Moves"
            offLabel="Learnable"
            onLabel="Any"
            checked={anyMove}
            onChange={onAnyMove}
          />
        }
      >
        Moves
      </FormSectionLabel>

      {!anyMove && state.status === 'loading' && (
        <p className="dcalc-note" data-testid={testId('learnset-loading')}>
          Loading the Generation {gen} learnset…
        </p>
      )}
      {!anyMove && state.status === 'error' && (
        <p className="dcalc-note" data-tone="alert" data-testid={testId('learnset-error')}>
          The learnset did not load ({state.message}).{' '}
          <button type="button" className="dcalc-link" onClick={retry}>
            Retry
          </button>{' '}
          or switch to Any.
        </p>
      )}

      <MoveSlotGrid testId={testId('moves')}>
        {Array.from({ length: MOVE_SLOT_COUNT }, (_, slot) => (
          <MoveTile
            key={slot}
            slot={slot}
            gen={gen}
            moveId={moves[slot]}
            options={options}
            crit={side.crit[slot]}
            hits={side.hits[slot]}
            power={side.power[slot]}
            skillLink={skillLink}
            onPatch={(patch) => patchSlot(slot, patch)}
            testId={testId}
          />
        ))}
      </MoveSlotGrid>
    </div>
  )
}

/** The engine's own default hit count (moveResolve.ts), so the selector shows what is calculated. */
function defaultHits(
  slug: string,
  gen: number,
  min: number | null,
  max: number | null,
  skillLink: boolean,
) {
  if (slug === 'triple-kick') return gen === 2 ? 2 : 3
  if (min == null || max == null) return 1
  if (min === max) return min
  return skillLink ? max : min + 1
}

function MoveTile({
  slot,
  gen,
  moveId,
  options,
  crit,
  hits,
  power,
  skillLink,
  onPatch,
  testId,
}: {
  slot: number
  gen: number
  moveId: number | null
  options: Move[]
  crit: boolean
  hits: number | null
  power: number | null
  skillLink: boolean
  onPatch: (patch: SlotPatch) => void
  testId: (s: string) => string
}) {
  const move = moveId != null ? getMove(moveId) : undefined
  const slotOptions = move && !options.some((o) => o.id === move.id) ? [move, ...options] : options
  const type = move ? (resolveMoveTypeNameForGeneration(move, gen) ?? '') : ''
  const min = move?.meta?.min_hits ?? null
  const max = move?.meta?.max_hits ?? null
  const hitChoices =
    move?.name === 'triple-kick'
      ? gen === 2
        ? [1, 2, 3]
        : null
      : min != null && max != null && min < max && move?.name !== 'beat-up'
        ? Array.from({ length: max - min + 1 }, (_, i) => min + i)
        : null
  const hasPower = move != null && move.name in POWER_OVERRIDE_DEFAULTS
  const powerDraft = useDraftNumber(
    power ?? (move ? (POWER_OVERRIDE_DEFAULTS[move.name] ?? 1) : 1),
    (n) => onPatch({ power: n }),
    { min: 1, max: 255 },
  )

  return (
    <MoveSlotTile
      label={`Move ${slot + 1}`}
      testId={testId(`slot-${slot}`)}
      detail={
        move ? (
          <span className="dcalc-tile-facts">
            <TypeLabel type={type} small /> · {capitalize(categoryFor(gen, move, type))} ·{' '}
            {resolveMovePowerForGeneration(move, gen) ?? '—'}
          </span>
        ) : (
          'Empty'
        )
      }
    >
      <SelectField
        label={`Move ${slot + 1}`}
        hideLabel
        options={[
          { value: '', label: '(empty)' },
          ...slotOptions.map((m) => ({ value: String(m.id), label: m.display_name })),
        ]}
        value={moveId != null ? String(moveId) : ''}
        data-testid={testId(`move-${slot}`)}
        onChange={(e) => onPatch({ move: e.target.value ? Number(e.target.value) : null })}
      />
      {move && (
        <div className="dcalc-tile-options">
          <Toggle on={crit} label="Crit" onChange={(next) => onPatch({ crit: next })} />
          {hitChoices && (
            <SelectField
              label="Hits"
              fieldSize="narrow"
              options={hitChoices.map((n) => ({ value: String(n), label: String(n) }))}
              value={String(hits ?? defaultHits(move.name, gen, min, max, skillLink))}
              data-testid={testId(`hits-${slot}`)}
              onChange={(e) => onPatch({ hits: Number(e.target.value) })}
            />
          )}
          {hasPower && (
            <TextField
              label="Power"
              fieldSize="narrow"
              type="number"
              min={1}
              max={255}
              data-testid={testId(`power-${slot}`)}
              {...powerDraft}
            />
          )}
        </div>
      )}
    </MoveSlotTile>
  )
}
