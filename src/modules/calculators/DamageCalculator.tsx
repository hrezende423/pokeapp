import { useMemo, useState } from 'react'
import {
  getMove,
  getSpecies,
  getType,
  resolveStatsForGeneration,
  resolveTypesForGeneration,
  typeEffectivenessAgainst,
} from '../../data'
import type { Species, Variety } from '../../data'
import { fixedDamage, hasVariableDamage } from '../../data/moveDamage'
import { SelectField } from '../../components/ds/SelectField'
import { TextField } from '../../components/ds/TextField'
import { useVersionGroup } from '../version-group/context'
import { moveEntries, speciesEntries } from '../dex/entrySources'
import {
  computeStat,
  effortMax,
  individualMax,
  type NatureMods,
  type StatKey,
} from '../team-builder/statMath'
import { calculateDamage, isSpecialByType, percentOfHp } from './damageMath'

/**
 * Damage Calculator.
 *
 * ANY MOVE THE ERA HAS, NOT A LEGAL LEARNSET. Team Building already owns "can
 * this Pokemon actually learn this move" (legalMoveset.ts) — this tool answers a
 * different question, "what would this move do", so it deliberately does not
 * filter by learnset. Theorycrafting a move a species cannot really have is a
 * feature here, not a bug to close.
 *
 * DEFAULT SPREAD IS MAX INDIVIDUAL / ZERO EFFORT / NEUTRAL NATURE — the
 * highest-floor, no-training baseline most fan calculators start from — and both
 * sides are independently editable, because "what does a maxed attacker do to an
 * untrained defender" and its reverse are both real questions.
 */

type NatureDirection = 'up' | 'neutral' | 'down'

function defaultVariety(species: Species): Variety {
  return species.varieties.find((v) => v.is_default) ?? species.varieties[0]
}

function statLabel(key: StatKey): string {
  switch (key) {
    case 'attack':
      return 'Attack'
    case 'defense':
      return 'Defense'
    case 'special':
      return 'Special'
    case 'special-attack':
      return 'Sp. Atk'
    case 'special-defense':
      return 'Sp. Def'
    default:
      return key
  }
}

/** The stat key this move's category reads on offence/defence, era-correct. */
function categoryStatKeys(
  damageClass: string | null,
  moveTypeName: string | null,
  generation: number,
): { offense: StatKey; defense: StatKey; category: 'physical' | 'special' } {
  const special =
    generation >= 4 ? damageClass === 'special' : moveTypeName != null && isSpecialByType(moveTypeName, generation)

  if (!special) return { offense: 'attack', defense: 'defense', category: 'physical' }
  if (generation <= 1) return { offense: 'special', defense: 'special', category: 'special' }
  return { offense: 'special-attack', defense: 'special-defense', category: 'special' }
}

/** One side's stat inputs: individual (DV/IV) and effort (Stat Exp/EV), plus nature direction. */
function useStatInputs(generation: number) {
  const [individual, setIndividual] = useState(individualMax(generation))
  const [effort, setEffort] = useState(0)
  const [nature, setNature] = useState<NatureDirection>('neutral')
  return { individual, setIndividual, effort, setEffort, nature, setNature }
}

function StatInputRow({
  label,
  generation,
  showNature,
  state,
}: {
  label: string
  generation: number
  showNature: boolean
  state: ReturnType<typeof useStatInputs>
}) {
  const isDv = generation <= 2
  return (
    <div className="calc-row">
      <TextField
        label={`${label} ${isDv ? 'DV' : 'IV'} (0–${individualMax(generation)})`}
        type="number"
        min={0}
        max={individualMax(generation)}
        value={state.individual}
        onChange={(e) =>
          state.setIndividual(Math.min(individualMax(generation), Math.max(0, Number(e.target.value))))
        }
      />
      <TextField
        label={`${label} ${isDv ? 'Stat Exp' : 'EV'} (0–${effortMax(generation)})`}
        type="number"
        min={0}
        max={effortMax(generation)}
        value={state.effort}
        onChange={(e) =>
          state.setEffort(Math.min(effortMax(generation), Math.max(0, Number(e.target.value))))
        }
      />
      {showNature && (
        <SelectField
          label={`${label} nature`}
          options={[
            { value: 'up', label: '+10%' },
            { value: 'neutral', label: 'Neutral' },
            { value: 'down', label: '−10%' },
          ]}
          value={state.nature}
          onChange={(e) => state.setNature(e.target.value as NatureDirection)}
        />
      )}
    </div>
  )
}

export function DamageCalculator() {
  const { generation } = useVersionGroup()
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])
  const moves = useMemo(
    () => moveEntries({ generation, isAll: false }).filter((m) => m.damage_class !== 'status'),
    [generation],
  )

  const [attackerId, setAttackerId] = useState<number>(species[0]?.id ?? 0)
  const [defenderId, setDefenderId] = useState<number>(species[1]?.id ?? species[0]?.id ?? 0)
  const [moveId, setMoveId] = useState<number>(moves[0]?.id ?? 0)
  const [attackerLevel, setAttackerLevel] = useState(50)
  const [defenderLevel, setDefenderLevel] = useState(50)
  const [isCritical, setIsCritical] = useState(false)
  const [isBurned, setIsBurned] = useState(false)

  const attackerStat = useStatInputs(generation)
  const defenderStat = useStatInputs(generation)
  const hasNatures = generation >= 3

  const attackerSpecies = getSpecies(attackerId)
  const defenderSpecies = getSpecies(defenderId)
  const move = getMove(moveId)

  const result = useMemo(() => {
    if (!attackerSpecies || !defenderSpecies || !move) return null

    const attackerVariety = defaultVariety(attackerSpecies)
    const defenderVariety = defaultVariety(defenderSpecies)
    const moveType = move.type_id != null ? getType(move.type_id) : undefined

    const { offense, defense, category } = categoryStatKeys(
      move.damage_class,
      moveType?.name ?? null,
      generation,
    )

    const attackerTypeIds = resolveTypesForGeneration(attackerVariety, generation).map((t) => t.type_id)
    const defenderTypeIds = resolveTypesForGeneration(defenderVariety, generation).map((t) => t.type_id)

    const attackerBase =
      resolveStatsForGeneration(attackerVariety, generation).find((s) => s.stat === offense)?.base_stat ?? 0
    const defenderBase =
      resolveStatsForGeneration(defenderVariety, generation).find((s) => s.stat === defense)?.base_stat ?? 0
    const defenderHpBase =
      resolveStatsForGeneration(defenderVariety, generation).find((s) => s.stat === 'hp')?.base_stat ?? 0

    const natureFor = (direction: NatureDirection, key: StatKey): NatureMods =>
      hasNatures
        ? {
            increased: direction === 'up' ? key : null,
            decreased: direction === 'down' ? key : null,
          }
        : { increased: null, decreased: null }

    const attackStat = computeStat({
      generation,
      level: attackerLevel,
      base: attackerBase,
      key: offense,
      effort: { [offense]: attackerStat.effort },
      individual: { [offense]: attackerStat.individual },
      nature: natureFor(attackerStat.nature, offense),
    })
    const defenseStat = computeStat({
      generation,
      level: defenderLevel,
      base: defenderBase,
      key: defense,
      effort: { [defense]: defenderStat.effort },
      individual: { [defense]: defenderStat.individual },
      nature: natureFor(defenderStat.nature, defense),
    })
    const defenderMaxHp = computeStat({
      generation,
      level: defenderLevel,
      base: defenderHpBase,
      key: 'hp',
      effort: { hp: effortMax(generation) },
      individual: { hp: individualMax(generation) },
      nature: { increased: null, decreased: null },
    })

    const fixed = fixedDamage(move)
    const variable = hasVariableDamage(move)

    const effectivenessEntry =
      move.type_id != null
        ? typeEffectivenessAgainst(defenderTypeIds, generation).find((e) => e.type.id === move.type_id)
        : undefined
    const effectiveness = effectivenessEntry?.multiplier ?? 1

    if (variable) {
      return {
        category,
        offense,
        defense,
        effectiveness,
        variable: true as const,
        fixed: null,
        min: 0,
        max: 0,
        stab: attackerTypeIds.includes(move.type_id ?? -1),
        immune: effectiveness === 0,
        defenderMaxHp,
      }
    }

    if (fixed != null) {
      const dealt = effectiveness === 0 ? 0 : fixed
      return {
        category,
        offense,
        defense,
        effectiveness,
        variable: false as const,
        fixed: dealt,
        min: dealt,
        max: dealt,
        stab: false,
        immune: effectiveness === 0,
        defenderMaxHp,
      }
    }

    const damage = calculateDamage({
      generation,
      attacker: { level: attackerLevel, stat: attackStat, typeIds: attackerTypeIds },
      defender: { level: defenderLevel, stat: defenseStat, typeIds: defenderTypeIds },
      move: { power: move.power ?? 0, typeId: move.type_id ?? -1 },
      effectiveness,
      isCritical,
      isBurned: isBurned && category === 'physical',
    })

    return {
      category,
      offense,
      defense,
      effectiveness,
      variable: false as const,
      fixed: null,
      min: damage.min,
      max: damage.max,
      stab: damage.stab,
      immune: damage.immune,
      defenderMaxHp,
    }
  }, [
    attackerSpecies,
    defenderSpecies,
    move,
    generation,
    attackerLevel,
    defenderLevel,
    attackerStat.effort,
    attackerStat.individual,
    attackerStat.nature,
    defenderStat.effort,
    defenderStat.individual,
    defenderStat.nature,
    hasNatures,
    isCritical,
    isBurned,
  ])

  return (
    <div className="calc-tool" data-testid="calc-damage">
      <p className="calc-tool-note">
        Damage for one hit, at the given levels and spreads. Neutral stat stages, no weather, no
        held items or abilities beyond burn — see the range, not a battle result.
      </p>

      <div className="calc-section">
        <h2 className="calc-section-heading">Attacker</h2>
        <div className="calc-row">
          <SelectField
            label="Species"
            options={species.map((s) => ({ value: String(s.id), label: s.display_name }))}
            value={String(attackerId)}
            onChange={(e) => setAttackerId(Number(e.target.value))}
          />
          <TextField
            label="Level"
            type="number"
            min={1}
            max={100}
            value={attackerLevel}
            onChange={(e) => setAttackerLevel(Math.min(100, Math.max(1, Number(e.target.value))))}
          />
        </div>
        {result && (
          <StatInputRow
            label={statLabel(result.offense)}
            generation={generation}
            showNature={hasNatures}
            state={attackerStat}
          />
        )}
      </div>

      <div className="calc-section">
        <h2 className="calc-section-heading">Move</h2>
        <div className="calc-row">
          <SelectField
            label="Move"
            options={moves.map((m) => {
              const t = m.type_id != null ? getType(m.type_id) : undefined
              const power = m.power != null ? m.power : hasVariableDamage(m) ? 'variable' : 'fixed'
              return { value: String(m.id), label: `${m.display_name} (${t?.display_name ?? '—'}, ${power})` }
            })}
            value={String(moveId)}
            onChange={(e) => setMoveId(Number(e.target.value))}
          />
        </div>
        <div className="calc-toggle-row">
          <label className="calc-checkbox">
            <input type="checkbox" checked={isCritical} onChange={(e) => setIsCritical(e.target.checked)} />
            Critical hit
          </label>
          {result?.category === 'physical' && (
            <label className="calc-checkbox">
              <input type="checkbox" checked={isBurned} onChange={(e) => setIsBurned(e.target.checked)} />
              Attacker is burned
            </label>
          )}
        </div>
      </div>

      <div className="calc-section">
        <h2 className="calc-section-heading">Defender</h2>
        <div className="calc-row">
          <SelectField
            label="Species"
            options={species.map((s) => ({ value: String(s.id), label: s.display_name }))}
            value={String(defenderId)}
            onChange={(e) => setDefenderId(Number(e.target.value))}
          />
          <TextField
            label="Level"
            type="number"
            min={1}
            max={100}
            value={defenderLevel}
            onChange={(e) => setDefenderLevel(Math.min(100, Math.max(1, Number(e.target.value))))}
          />
        </div>
        {result && (
          <StatInputRow
            label={statLabel(result.defense)}
            generation={generation}
            showNature={hasNatures}
            state={defenderStat}
          />
        )}
      </div>

      {result && (
        <div className="calc-result" data-testid="calc-damage-result">
          {result.immune ? (
            <p className="calc-result-headline">No effect — the defender is immune.</p>
          ) : result.variable ? (
            <p className="calc-result-note" data-tone="alert">
              This move's damage does not come from a power value (a fixed-KO, level-, HP- or
              weight-based effect) — no single range applies.
            </p>
          ) : (
            <>
              <p className="calc-result-headline">
                <span className="num">{result.min}</span>–<span className="num">{result.max}</span> damage
              </p>
              <p className="calc-result-note">
                <span className="num">{percentOfHp(result.min, result.defenderMaxHp)}</span>–
                <span className="num">{percentOfHp(result.max, result.defenderMaxHp)}%</span> of the
                defender's {result.defenderMaxHp} max HP
                {result.stab && ' · STAB'}
                {result.effectiveness !== 1 && ` · ${result.effectiveness}× effective`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
