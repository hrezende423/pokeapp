import { useMemo } from 'react'
import {
  getAbility,
  getMove,
  listMoves,
  listNatures,
  moveExistsInGeneration,
  resolveAbilitiesForGeneration,
  resolveStatsForGeneration,
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
import { ToggleSwitch } from '../../components/ToggleSwitch'
import { useDraftNumber } from '../../components/ds/useDraftNumber'
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
  type DamageResult,
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
 * One Pokemon's inputs, laid out as the team-build form (DESIGN-SYSTEM.md §5,
 * §11): a compact strip of configuration fields on top, then named groups --
 * Battle setup, the spread table in the dominant position, and (for the attacker)
 * the four move tiles.
 *
 * EVERY ERA GATE IS A HIDE, NOT A DISABLE, the same idiom as the species page:
 * no item field in Gen 1, no ability or nature before Gen 3, Stat Exp and DVs
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
  label: n > 0 ? `+${n}` : String(n),
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
  const special = gen === 2
  return [
    { stat: 'hp', label: 'HP', key: 'hp', baseKey: 'hp' },
    { stat: 'atk', label: 'Atk', key: 'attack', baseKey: 'attack' },
    { stat: 'def', label: 'Def', key: 'defense', baseKey: 'defense' },
    {
      stat: 'spa',
      label: 'SpA',
      key: special ? 'special' : 'special-attack',
      baseKey: 'special-attack',
    },
    {
      stat: 'spd',
      label: 'SpD',
      key: special ? 'special' : 'special-defense',
      baseKey: 'special-defense',
    },
    { stat: 'spe', label: 'Spe', key: 'speed', baseKey: 'speed' },
  ]
}

const STAGE_STATS: Record<number, { stat: BoostStat; label: string }[]> = {
  1: [
    { stat: 'atk', label: 'Atk' },
    { stat: 'def', label: 'Def' },
    { stat: 'spa', label: 'Spc' },
    { stat: 'spe', label: 'Spe' },
  ],
}
const MODERN_STAGES: { stat: BoostStat; label: string }[] = [
  { stat: 'atk', label: 'Atk' },
  { stat: 'def', label: 'Def' },
  { stat: 'spa', label: 'SpA' },
  { stat: 'spd', label: 'SpD' },
  { stat: 'spe', label: 'Spe' },
]

function natureLabel(n: {
  display_name: string
  increased_stat: string | null
  decreased_stat: string | null
}) {
  const short: Record<string, string> = {
    attack: 'Atk',
    defense: 'Def',
    'special-attack': 'SpA',
    'special-defense': 'SpD',
    speed: 'Spe',
  }
  if (!n.increased_stat || n.increased_stat === n.decreased_stat) return n.display_name
  return `${n.display_name} (+${short[n.increased_stat]} −${short[n.decreased_stat ?? '']})`
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

export function DamagePokemonPanel({
  role,
  gen,
  side,
  onChange,
  showMoves,
  showGender,
  anyMove,
  onAnyMove,
  results,
  selectedSlot,
  onSelectSlot,
  learnset,
  moves,
}: {
  role: 'attacker' | 'defender'
  gen: number
  side: SideState
  onChange: (next: SideState) => void
  showMoves: boolean
  showGender: boolean
  anyMove: boolean
  onAnyMove: (next: boolean) => void
  /** One per slot; null where the slot is empty or the calc failed. */
  results: (DamageResult | null)[]
  selectedSlot: number
  onSelectSlot: (slot: number) => void
  /** The attacker's learnset, owned by the calculator because it also derives the default moves. */
  learnset: Learnset
  /** The four slots as calculated: the side's own, or the learnset defaults. */
  moves: (number | null)[]
}) {
  const variety = varietyOf(side)
  const set = (patch: Partial<SideState>) => onChange({ ...side, ...patch })
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
  const setIndividual = (key: StatKey, value: number) =>
    set({
      individual: {
        ...side.individual,
        [key]: Math.min(value, modern ? MAX_IV : MAX_DV),
      } as StatNumbers,
    })

  const maxHp = rawStats.hp
  const hp = side.currentHp ?? maxHp
  const levelDraft = useDraftNumber(side.level, (level) => set({ level, currentHp: null }), {
    min: 1,
    max: 100,
  })
  const hpDraft = useDraftNumber(hp, (n) => set({ currentHp: n === maxHp ? null : n }), {
    max: maxHp,
  })
  const toggledAbility = abilities.find((a) => a.ability.id === side.abilityId)?.ability
  const showAbilityOn =
    gen >= 3 && toggledAbility != null && TOGGLED_ABILITIES.includes(toggledAbility.name)

  return (
    <div className="dcalc-panel" data-layout={`dcalc-${role}`} data-testid={`dcalc-${role}`}>
      <div className="dcalc-panel-head">
        <h2 className="dcalc-panel-title">{role === 'attacker' ? 'Attacker' : 'Defender'}</h2>
      </div>

      <CompactFieldStrip testId={testId('strip')}>
        <SearchSelect
          label="Pokémon"
          fieldSize="wide"
          options={speciesOptions}
          value={`${side.speciesId}:${side.varietyName}`}
          onChange={(v) => {
            const [id, name] = v.split(':')
            onChange(withSpecies(side, Number(id), name, gen))
          }}
          testId={testId('species')}
        />
        <TextField
          label="Level"
          fieldSize="narrow"
          type="number"
          min={1}
          max={100}
          data-testid={testId('level')}
          {...levelDraft}
        />
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
        {gen >= 3 && (
          <SelectField
            label="Nature"
            options={natures.map((n) => ({ value: String(n.id), label: natureLabel(n) }))}
            value={side.natureId != null ? String(side.natureId) : ''}
            data-testid={testId('nature')}
            onChange={(e) => set({ natureId: Number(e.target.value) })}
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

      <div className="dcalc-group">
        <FormSectionLabel>Battle setup</FormSectionLabel>
        <CompactFieldStrip testId={testId('battle')}>
          <TextField
            label="Current HP"
            type="number"
            min={0}
            max={maxHp}
            helper={`of ${maxHp} · ${maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0}%`}
            data-testid={testId('hp')}
            {...hpDraft}
          />
          {(STAGE_STATS[gen] ?? MODERN_STAGES).map(({ stat, label }) => (
            <SelectField
              key={stat}
              label={label}
              fieldSize="narrow"
              options={STAGE_OPTIONS}
              value={String(side.boosts[stat] ?? 0)}
              data-testid={testId(`stage-${stat}`)}
              onChange={(e) => set({ boosts: { ...side.boosts, [stat]: Number(e.target.value) } })}
            />
          ))}
          {showGender && (
            <SelectField
              label="Gender"
              options={[
                { value: 'N', label: '—' },
                { value: 'M', label: 'Male' },
                { value: 'F', label: 'Female' },
              ]}
              value={side.gender}
              data-testid={testId('gender')}
              onChange={(e) => set({ gender: e.target.value as SideState['gender'] })}
            />
          )}
        </CompactFieldStrip>
        {showAbilityOn && (
          <div className="dcalc-inline-toggles">
            <Toggle
              on={side.abilityOn}
              label={`${toggledAbility!.display_name} active`}
              onChange={(next) => set({ abilityOn: next })}
            />
          </div>
        )}
      </div>

      <div className="dcalc-group">
        <FormSectionLabel
          aside={
            modern ? (
              <span data-testid={testId('ev-total')}>
                {evTotal} / {MAX_EV_TOTAL} EVs
              </span>
            ) : undefined
          }
        >
          {modern ? 'EV allocation' : 'Stat Exp & DVs'}
        </FormSectionLabel>
        <EvStatTable
          testId={testId('spread')}
          columns={['Stat', 'Base', modern ? 'EVs' : 'Stat Exp', modern ? 'IV' : 'DV', 'Total']}
          footer={
            modern
              ? `${MAX_EV_TOTAL - evTotal} EVs left`
              : gen === 2
                ? 'SpA and SpD share one Special DV and one Stat Exp in Gen 2. The HP DV is derived from the other four.'
                : 'The HP DV is derived from the other four.'
          }
        >
          {rows.map((row) => (
            <EvStatRow
              key={row.stat}
              testId={testId(`row-${row.stat}`)}
              label={row.label}
              base={bases.get(row.baseKey) ?? null}
              effort={{
                value: side.effort[row.key] ?? 0,
                max: modern ? MAX_EV : MAX_STAT_EXP,
                slider: modern,
                onChange: (n) => setEffort(row.key, n),
                testId: testId(`ev-${row.stat}`),
              }}
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
              total={rawStats[row.stat]}
            />
          ))}
        </EvStatTable>
      </div>

      {showMoves && (
        <MovesGroup
          gen={gen}
          side={side}
          onChange={onChange}
          anyMove={anyMove}
          onAnyMove={onAnyMove}
          results={results}
          selectedSlot={selectedSlot}
          onSelectSlot={onSelectSlot}
          testId={testId}
          learnset={learnset}
          moves={moves}
        />
      )}
    </div>
  )
}

function moveOption(m: Move) {
  return { value: String(m.id), label: m.display_name }
}

function slotDetail(result: DamageResult | null, move: Move | undefined, gen: number): string {
  if (!move) return 'Empty'
  const type = resolveMoveTypeNameForGeneration(move, gen) ?? ''
  const typeLabel = type ? type.charAt(0).toUpperCase() + type.slice(1) : ''
  if (!result) return typeLabel
  if (result.noDamageReason === 'immune' || result.noDamageReason === 'ability')
    return `${typeLabel} · no effect`
  if (result.noDamageReason === 'variable') return `${typeLabel} · not calculated`
  return `${result.percent[0]} – ${result.percent[1]}%`
}

function MovesGroup({
  gen,
  side,
  onChange,
  anyMove,
  onAnyMove,
  results,
  selectedSlot,
  onSelectSlot,
  testId,
  learnset,
  moves,
}: {
  gen: number
  side: SideState
  onChange: (next: SideState) => void
  anyMove: boolean
  onAnyMove: (next: boolean) => void
  results: (DamageResult | null)[]
  selectedSlot: number
  onSelectSlot: (slot: number) => void
  testId: (s: string) => string
  learnset: Learnset
  moves: (number | null)[]
}) {
  const { state, retry } = learnset
  const learnable = state.status === 'ready' ? state.rows : null

  const options = useMemo(() => {
    const pool = anyMove
      ? listMoves().filter((m) => moveExistsInGeneration(m, gen))
      : (learnable ?? []).map((id) => getMove(id)).filter((m): m is Move => m != null)
    return pool.filter(isDamaging).sort((a, b) => a.display_name.localeCompare(b.display_name))
  }, [anyMove, learnable, gen])

  const setSlot = (slot: number, moveId: number | null) => {
    const next = [...moves]
    next[slot] = moveId
    const power = [...side.power]
    const hits = [...side.hits]
    power[slot] = null
    hits[slot] = null
    onChange({ ...side, moves: next, power, hits })
  }

  const selectedMove = moves[selectedSlot] != null ? getMove(moves[selectedSlot]!) : undefined
  const minHits = selectedMove?.meta?.min_hits ?? null
  const maxHits = selectedMove?.meta?.max_hits ?? null
  const hitChoices =
    selectedMove?.name === 'triple-kick'
      ? gen === 2
        ? [1, 2, 3]
        : null
      : minHits != null && maxHits != null && minHits < maxHits && selectedMove?.name !== 'beat-up'
        ? Array.from({ length: maxHits - minHits + 1 }, (_, i) => minHits + i)
        : null
  const hasPowerOverride = selectedMove != null && selectedMove.name in POWER_OVERRIDE_DEFAULTS
  const powerDraft = useDraftNumber(
    side.power[selectedSlot] ??
      (selectedMove ? (POWER_OVERRIDE_DEFAULTS[selectedMove.name] ?? 1) : 1),
    (n) => {
      const power = [...side.power]
      power[selectedSlot] = n
      onChange({ ...side, moves, power })
    },
    { min: 1, max: 255 },
  )
  const skillLink = side.abilityId != null && getAbility(side.abilityId)?.name === 'skill-link'

  return (
    <div className="dcalc-group">
      <FormSectionLabel
        aside={
          <ToggleSwitch
            id={`${testId('any-move')}`}
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
          Loading this Pokémon's Generation {gen} learnset…
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
        {Array.from({ length: MOVE_SLOT_COUNT }, (_, slot) => {
          const id = moves[slot]
          const move = id != null ? getMove(id) : undefined
          const slotOptions =
            move && !options.some((o) => o.id === move.id) ? [move, ...options] : options
          return (
            <MoveSlotTile
              key={slot}
              label={`Move ${slot + 1}`}
              selected={slot === selectedSlot}
              onSelect={() => onSelectSlot(slot)}
              detail={slotDetail(results[slot] ?? null, move, gen)}
              testId={testId(`slot-${slot}`)}
            >
              <SelectField
                label={`Move ${slot + 1}`}
                hideLabel
                options={[{ value: '', label: '(empty)' }, ...slotOptions.map(moveOption)]}
                value={id != null ? String(id) : ''}
                data-testid={testId(`move-${slot}`)}
                onChange={(e) => setSlot(slot, e.target.value ? Number(e.target.value) : null)}
              />
            </MoveSlotTile>
          )
        })}
      </MoveSlotGrid>

      {selectedMove && (
        <div className="dcalc-move-options" data-testid={testId('move-options')}>
          <span className="dcalc-move-facts">
            {selectedMove.display_name} ·{' '}
            {(() => {
              const t = resolveMoveTypeNameForGeneration(selectedMove, gen) ?? ''
              return t.charAt(0).toUpperCase() + t.slice(1)
            })()}{' '}
            ·{' '}
            {capitalize(
              categoryFor(
                gen,
                selectedMove,
                resolveMoveTypeNameForGeneration(selectedMove, gen) ?? '',
              ),
            )}{' '}
            · {resolveMovePowerForGeneration(selectedMove, gen) ?? '—'} power
          </span>
          <Toggle
            on={side.crit[selectedSlot]}
            label="Critical hit"
            onChange={(next) => {
              const crit = [...side.crit]
              crit[selectedSlot] = next
              onChange({ ...side, moves, crit })
            }}
          />
          {hitChoices && (
            <SelectField
              label="Hits"
              fieldSize="narrow"
              options={hitChoices.map((n) => ({ value: String(n), label: String(n) }))}
              value={String(
                side.hits[selectedSlot] ??
                  defaultHits(selectedMove.name, gen, minHits, maxHits, skillLink),
              )}
              data-testid={testId('hits')}
              onChange={(e) => {
                const hits = [...side.hits]
                hits[selectedSlot] = Number(e.target.value)
                onChange({ ...side, moves, hits })
              }}
            />
          )}
          {hasPowerOverride && (
            <TextField
              label="Power"
              fieldSize="narrow"
              type="number"
              min={1}
              max={255}
              data-testid={testId('power')}
              {...powerDraft}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** The engine's own default (moveResolve.ts), so the selector shows what is being calculated. */
function defaultHits(
  slug: string,
  gen: number,
  min: number | null,
  max: number | null,
  skillLink: boolean,
): number {
  if (slug === 'triple-kick') return gen === 2 ? 2 : 3
  if (min == null || max == null) return 1
  if (min === max) return min
  return skillLink ? max : min + 1
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
