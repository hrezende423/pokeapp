import { useMemo, useState } from 'react'
import { getSpecies, resolveStatsForGeneration } from '../../data'
import type { Species, Variety } from '../../data'
import { SelectField } from '../../components/ds/SelectField'
import { TextField } from '../../components/ds/TextField'
import { useVersionGroup } from '../version-group/context'
import { speciesEntries } from '../dex/entrySources'
import { computeStat, effortMax, individualMax, type NatureMods } from '../team-builder/statMath'
import { determineTurnOrder, effectiveSpeed, type SpeedParticipant } from './speedMath'

/**
 * Speed / Turn-Order Calculator.
 *
 * PRIORITY DECIDES FIRST, SPEED ONLY BREAKS THE TIE. This is deliberately not
 * "compare two Speed stats" — the far more common real question, "does my Quick
 * Attack go first", is a priority-bracket question that a bigger Speed number
 * cannot answer, so priority is a first-class input on each side, not an
 * afterthought.
 *
 * CHOICE SCARF AND TRICK ROOM ARE BOTH GEN 4+ ONLY, gated on the app's own
 * generation selector the same way Team Building gates natures and abilities —
 * neither existed yet in Gen 1-3.
 */

const SPEED_BOOST_INTRODUCED_IN_GENERATION = 4
const TRICK_ROOM_INTRODUCED_IN_GENERATION = 4

function defaultVariety(species: Species): Variety {
  return species.varieties.find((v) => v.is_default) ?? species.varieties[0]
}

interface SideState {
  speciesId: number
  level: number
  individual: number
  effort: number
  nature: 'up' | 'neutral' | 'down'
  priority: number
  isParalyzed: boolean
  hasSpeedBoostItem: boolean
}

function useSide(defaultSpeciesId: number): [SideState, (patch: Partial<SideState>) => void] {
  const [state, setState] = useState<SideState>({
    speciesId: defaultSpeciesId,
    level: 50,
    individual: 31,
    effort: 0,
    nature: 'neutral',
    priority: 0,
    isParalyzed: false,
    hasSpeedBoostItem: false,
  })
  const patch = (next: Partial<SideState>) => setState((prev) => ({ ...prev, ...next }))
  return [state, patch]
}

function SidePanel({
  label,
  species,
  generation,
  hasNatures,
  hasSpeedBoostItems,
  state,
  onChange,
}: {
  label: string
  species: Species[]
  generation: number
  hasNatures: boolean
  hasSpeedBoostItems: boolean
  state: SideState
  onChange: (patch: Partial<SideState>) => void
}) {
  const individualCap = individualMax(generation)
  const effortCap = effortMax(generation)

  return (
    <div className="calc-section">
      <h2 className="calc-section-heading">{label}</h2>
      <div className="calc-row">
        <SelectField
          label="Species"
          options={species.map((s) => ({ value: String(s.id), label: s.display_name }))}
          value={String(state.speciesId)}
          onChange={(e) => onChange({ speciesId: Number(e.target.value) })}
        />
        <TextField
          label="Level"
          type="number"
          min={1}
          max={100}
          value={state.level}
          onChange={(e) => onChange({ level: Math.min(100, Math.max(1, Number(e.target.value))) })}
        />
      </div>
      <div className="calc-row">
        <TextField
          label={`Speed ${generation <= 2 ? 'DV' : 'IV'} (0–${individualCap})`}
          type="number"
          min={0}
          max={individualCap}
          value={state.individual}
          onChange={(e) => onChange({ individual: Math.min(individualCap, Math.max(0, Number(e.target.value))) })}
        />
        <TextField
          label={`Speed ${generation <= 2 ? 'Stat Exp' : 'EV'} (0–${effortCap})`}
          type="number"
          min={0}
          max={effortCap}
          value={state.effort}
          onChange={(e) => onChange({ effort: Math.min(effortCap, Math.max(0, Number(e.target.value))) })}
        />
        {hasNatures && (
          <SelectField
            label="Nature (Speed)"
            options={[
              { value: 'up', label: '+10%' },
              { value: 'neutral', label: 'Neutral' },
              { value: 'down', label: '−10%' },
            ]}
            value={state.nature}
            onChange={(e) => onChange({ nature: e.target.value as SideState['nature'] })}
          />
        )}
      </div>
      <div className="calc-row">
        <TextField
          label="Move priority"
          type="number"
          min={-7}
          max={5}
          value={state.priority}
          onChange={(e) => onChange({ priority: Math.min(5, Math.max(-7, Number(e.target.value))) })}
        />
      </div>
      <div className="calc-toggle-row">
        <label className="calc-checkbox">
          <input
            type="checkbox"
            checked={state.isParalyzed}
            onChange={(e) => onChange({ isParalyzed: e.target.checked })}
          />
          Paralyzed (×0.25)
        </label>
        {hasSpeedBoostItems && (
          <label className="calc-checkbox">
            <input
              type="checkbox"
              checked={state.hasSpeedBoostItem}
              onChange={(e) => onChange({ hasSpeedBoostItem: e.target.checked })}
            />
            Choice Scarf (×1.5)
          </label>
        )}
      </div>
    </div>
  )
}

function speedFor(state: SideState, generation: number): SpeedParticipant {
  const target = getSpecies(state.speciesId)
  const hasNatures = generation >= 3
  let base = 0
  if (target) {
    const variety = defaultVariety(target)
    base = resolveStatsForGeneration(variety, generation).find((s) => s.stat === 'speed')?.base_stat ?? 0
  }
  const natureMods: NatureMods = hasNatures
    ? {
        increased: state.nature === 'up' ? 'speed' : null,
        decreased: state.nature === 'down' ? 'speed' : null,
      }
    : { increased: null, decreased: null }
  const speed = computeStat({
    generation,
    level: state.level,
    base,
    key: 'speed',
    effort: { speed: state.effort },
    individual: { speed: state.individual },
    nature: natureMods,
  })
  return {
    speed,
    priority: state.priority,
    isParalyzed: state.isParalyzed,
    hasSpeedBoostItem: state.hasSpeedBoostItem,
  }
}

export function SpeedCalculator() {
  const { generation } = useVersionGroup()
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])
  const hasNatures = generation >= 3
  const hasSpeedBoostItems = generation >= SPEED_BOOST_INTRODUCED_IN_GENERATION
  const hasTrickRoom = generation >= TRICK_ROOM_INTRODUCED_IN_GENERATION

  const [a, patchA] = useSide(species[0]?.id ?? 0)
  const [b, patchB] = useSide(species[1]?.id ?? species[0]?.id ?? 0)
  const [trickRoom, setTrickRoom] = useState(false)

  const speedA = speedFor(a, generation)
  const speedB = speedFor(b, generation)
  const order = determineTurnOrder(speedA, speedB, trickRoom && hasTrickRoom)

  const nameFor = (id: number) => getSpecies(id)?.display_name ?? '—'

  return (
    <div className="calc-tool" data-testid="calc-speed">
      <p className="calc-tool-note">
        Priority decides first; Speed only breaks a tie inside the same priority bracket, exactly
        as a battle does.
      </p>

      <SidePanel
        label="Pokémon A"
        species={species}
        generation={generation}
        hasNatures={hasNatures}
        hasSpeedBoostItems={hasSpeedBoostItems}
        state={a}
        onChange={patchA}
      />
      <SidePanel
        label="Pokémon B"
        species={species}
        generation={generation}
        hasNatures={hasNatures}
        hasSpeedBoostItems={hasSpeedBoostItems}
        state={b}
        onChange={patchB}
      />

      {hasTrickRoom && (
        <div className="calc-toggle-row">
          <label className="calc-checkbox">
            <input type="checkbox" checked={trickRoom} onChange={(e) => setTrickRoom(e.target.checked)} />
            Trick Room active
          </label>
        </div>
      )}

      <div className="calc-result" data-testid="calc-speed-result">
        <p className="calc-result-headline">
          {order === 'tie' ? (
            'Speed tie — order is random'
          ) : (
            <>{order === 'a' ? nameFor(a.speciesId) : nameFor(b.speciesId)} moves first</>
          )}
        </p>
        <p className="calc-result-note">
          {nameFor(a.speciesId)} effective Speed <span className="num">{effectiveSpeed(speedA)}</span> · priority{' '}
          <span className="num">{a.priority}</span> — {nameFor(b.speciesId)} effective Speed{' '}
          <span className="num">{effectiveSpeed(speedB)}</span> · priority <span className="num">{b.priority}</span>
        </p>
      </div>
    </div>
  )
}
