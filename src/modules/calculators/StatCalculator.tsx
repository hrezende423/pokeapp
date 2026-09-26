import { useCallback, useMemo, useState } from 'react'
import { getSpecies, listNatures, resolveStatsForGeneration } from '../../data'
import type { Species, Variety } from '../../data'
import { SelectField } from '../../components/ds/SelectField'
import { StatRow, StatList } from '../../components/ds/DataRows'
import { TextField } from '../../components/ds/TextField'
import { useVersionGroup } from '../version-group/context'
import { speciesEntries } from '../dex/entrySources'
import {
  computeStat,
  effortMax,
  hiddenPower,
  hpDvFrom,
  individualMax,
  type NatureMods,
  type StatKey,
  type StatNumbers,
} from '../team-builder/statMath'

/**
 * Standalone Stat Calculator.
 *
 * WHAT TEAM BUILDING ALREADY OWNS, REUSED RATHER THAN REBUILT. `statMath.ts` is
 * the whole formula layer (era-correct DV/Stat Exp vs IV/EV, Hidden Power, the
 * HP-DV parity rule) and this screen adds nothing to it — it is a quick lookup
 * for "what are this Pokemon's stats", without opening the Build Form and
 * without the spread belonging to a saved team member.
 *
 * A REAL NATURE, NOT AN INDEPENDENT PER-STAT TOGGLE. A nature always raises
 * exactly one stat and lowers exactly one other (or neither, for the five
 * neutral ones) — offering "boost this stat" checkboxes per row would let a
 * reader build a nature combination the games do not have.
 *
 * HP'S DV IS READ-ONLY BEFORE GEN 3, the same as the Build Form: it is the low
 * bit of the other four DVs, packed, so there is nothing to type into it.
 */

function defaultVariety(species: Species): Variety {
  return species.varieties.find((v) => v.is_default) ?? species.varieties[0]
}

const GEN12_KEYS: readonly StatKey[] = ['hp', 'attack', 'defense', 'special', 'speed']
const GEN34_KEYS: readonly StatKey[] = [
  'hp',
  'attack',
  'defense',
  'special-attack',
  'special-defense',
  'speed',
]

const STAT_LABELS: Record<StatKey, string> = {
  hp: 'HP',
  attack: 'Attack',
  defense: 'Defense',
  special: 'Special',
  'special-attack': 'Sp. Atk',
  'special-defense': 'Sp. Def',
  speed: 'Speed',
}

export function StatCalculator() {
  const { generation } = useVersionGroup()
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])
  const natures = useMemo(() => listNatures(), [])
  const hasNatures = generation >= 3
  const keys = generation <= 1 ? GEN12_KEYS : GEN34_KEYS

  const [speciesId, setSpeciesId] = useState<number>(species[0]?.id ?? 0)
  const [level, setLevel] = useState(50)
  const [individual, setIndividual] = useState<StatNumbers>({})
  const [effort, setEffort] = useState<StatNumbers>({})
  const [natureId, setNatureId] = useState<number>(natures[0]?.id ?? 0)

  const target = getSpecies(speciesId)
  const nature = natures.find((n) => n.id === natureId)
  const natureMods: NatureMods = useMemo(
    () =>
      hasNatures
        ? {
            increased: (nature?.increased_stat as StatKey | null) ?? null,
            decreased: (nature?.decreased_stat as StatKey | null) ?? null,
          }
        : { increased: null, decreased: null },
    [hasNatures, nature],
  )

  const individualMaxValue = individualMax(generation)
  const effortMaxValue = effortMax(generation)

  const individualFor = useCallback(
    (key: StatKey): number => {
      if (key === 'hp' && generation <= 2) return hpDvFrom(individual)
      return individual[key] ?? individualMaxValue
    },
    [generation, individual, individualMaxValue],
  )

  const rows = useMemo(() => {
    if (!target) return []
    const variety = defaultVariety(target)
    const bases = resolveStatsForGeneration(variety, generation)
    return keys.map((key) => {
      const base = bases.find((s) => s.stat === key)?.base_stat ?? 0
      const iv = individualFor(key)
      const ev = effort[key] ?? 0
      const value = computeStat({
        generation,
        level,
        base,
        key,
        effort: { [key]: ev },
        individual: { [key]: iv },
        nature: natureMods,
      })
      return { key, base, iv, ev, value }
    })
  }, [target, generation, level, keys, effort, natureMods, individualFor])

  const hp = generation >= 2 ? hiddenPower(generation, individual) : null

  return (
    <div className="calc-tool" data-testid="calc-stat">
      <p className="calc-tool-note">
        A species' real stats at a level and spread, without opening the Build Form.
      </p>

      <div className="calc-section">
        <div className="calc-row">
          <SelectField
            label="Species"
            options={species.map((s) => ({ value: String(s.id), label: s.display_name }))}
            value={String(speciesId)}
            onChange={(e) => setSpeciesId(Number(e.target.value))}
          />
          <TextField
            label="Level"
            type="number"
            min={1}
            max={100}
            value={level}
            onChange={(e) => setLevel(Math.min(100, Math.max(1, Number(e.target.value))))}
          />
          {hasNatures && (
            <SelectField
              label="Nature"
              options={natures.map((n) => ({ value: String(n.id), label: n.display_name }))}
              value={String(natureId)}
              onChange={(e) => setNatureId(Number(e.target.value))}
            />
          )}
        </div>
      </div>

      <div className="calc-section">
        <h2 className="calc-section-heading">
          {generation <= 2 ? 'DVs and Stat Experience' : 'IVs and EVs'}
        </h2>
        {keys.map((key) => {
          const readOnly = key === 'hp' && generation <= 2
          return (
            <div className="calc-row" key={key}>
              <TextField
                label={`${STAT_LABELS[key]} ${generation <= 2 ? 'DV' : 'IV'} (0–${individualMaxValue})`}
                type="number"
                min={0}
                max={individualMaxValue}
                value={individualFor(key)}
                disabled={readOnly}
                state={readOnly ? 'disabled' : 'default'}
                helper={
                  readOnly ? 'Derived from the other four DVs — not independently set.' : undefined
                }
                onChange={(e) =>
                  setIndividual((prev) => ({
                    ...prev,
                    [key]: Math.min(individualMaxValue, Math.max(0, Number(e.target.value))),
                  }))
                }
              />
              <TextField
                label={`${STAT_LABELS[key]} ${generation <= 2 ? 'Stat Exp' : 'EV'} (0–${effortMaxValue})`}
                type="number"
                min={0}
                max={effortMaxValue}
                value={effort[key] ?? 0}
                onChange={(e) =>
                  setEffort((prev) => ({
                    ...prev,
                    [key]: Math.min(effortMaxValue, Math.max(0, Number(e.target.value))),
                  }))
                }
              />
            </div>
          )
        })}
      </div>

      {rows.length > 0 && (
        <div className="calc-result" data-testid="calc-stat-result">
          <StatList>
            {rows.map((row) => (
              <StatRow
                key={row.key}
                label={STAT_LABELS[row.key]}
                value={<span className="num">{row.value}</span>}
              />
            ))}
          </StatList>
          {hp && (
            <p className="calc-result-note">
              Hidden Power: <span className="num">{hp.type}</span>, power{' '}
              <span className="num">{hp.power}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
