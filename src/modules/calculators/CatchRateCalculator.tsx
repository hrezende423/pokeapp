import { useMemo, useState } from 'react'
import { getSpecies, resolveStatsForGeneration } from '../../data'
import type { Species, Variety } from '../../data'
import { SelectField } from '../../components/ds/SelectField'
import { TextField } from '../../components/ds/TextField'
import { useVersionGroup } from '../version-group/context'
import { speciesEntries } from '../dex/entrySources'
import { computeStat, effortMax, individualMax } from '../team-builder/statMath'
import {
  BALL_BONUS,
  STATUS_BONUS,
  catchProbability,
  oneInN,
  type CatchStatus,
  type PokeBall,
} from './catchRateMath'

/**
 * Catch Rate Calculator.
 *
 * HP IS A PERCENTAGE, NOT A TYPED-IN NUMBER, because the number that matters to
 * the formula is a fraction of max HP and asking for two absolute numbers that
 * must stay in a sane relationship to each other is a worse UI for the same
 * question. Max HP itself still comes from a real level/IV/EV spread — capture
 * rate depends on it, so a fixed "100 max HP" placeholder would be a wrong
 * number wearing a right-shaped formula.
 */

function defaultVariety(species: Species): Variety {
  return species.varieties.find((v) => v.is_default) ?? species.varieties[0]
}

const BALLS: { value: PokeBall; label: string }[] = [
  { value: 'poke', label: 'Poké Ball' },
  { value: 'great', label: 'Great Ball' },
  { value: 'ultra', label: 'Ultra Ball' },
  { value: 'master', label: 'Master Ball' },
]

const STATUSES: { value: CatchStatus; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'paralyze-poison-burn', label: 'Paralyzed / Poisoned / Burned' },
  { value: 'sleep-freeze', label: 'Asleep / Frozen' },
]

export function CatchRateCalculator() {
  const { generation } = useVersionGroup()
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])

  const [speciesId, setSpeciesId] = useState<number>(species[0]?.id ?? 0)
  const [level, setLevel] = useState(50)
  const [hpPercent, setHpPercent] = useState(50)
  const [ball, setBall] = useState<PokeBall>('poke')
  const [status, setStatus] = useState<CatchStatus>('none')

  const target = getSpecies(speciesId)

  const result = useMemo(() => {
    if (!target) return null
    const variety = defaultVariety(target)
    const hpBase =
      resolveStatsForGeneration(variety, generation).find((s) => s.stat === 'hp')?.base_stat ?? 0
    const maxHp = computeStat({
      generation,
      level,
      base: hpBase,
      key: 'hp',
      effort: { hp: effortMax(generation) },
      individual: { hp: individualMax(generation) },
      nature: { increased: null, decreased: null },
    })
    const currentHp = Math.max(1, Math.round((maxHp * hpPercent) / 100))
    const captureRate = target.capture_rate ?? 45

    return {
      maxHp,
      currentHp,
      captureRate,
      ...catchProbability({ currentHp, maxHp, captureRate, ball, status }),
    }
  }, [target, generation, level, hpPercent, ball, status])

  return (
    <div className="calc-tool" data-testid="calc-catch-rate">
      <p className="calc-tool-note">
        One throw's catch chance. The shake-value formula below is Generation III's — see the header
        note in catchRateMath.ts for why Gen 1-2 shares it rather than a guessed variant.
      </p>

      <div className="calc-section">
        <h2 className="calc-section-heading">Target</h2>
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
          <TextField
            label="Current HP (%)"
            type="number"
            min={1}
            max={100}
            value={hpPercent}
            onChange={(e) => setHpPercent(Math.min(100, Math.max(1, Number(e.target.value))))}
          />
        </div>
        {result && (
          <p className="calc-tool-note">
            <span className="num">{result.currentHp}</span> /{' '}
            <span className="num">{result.maxHp}</span> HP at a max-IV,{' '}
            {effortMax(generation) === 252 ? 'max-EV' : 'max-Stat-Exp'} spread · capture rate{' '}
            <span className="num">{result.captureRate}</span>
          </p>
        )}
      </div>

      <div className="calc-section">
        <h2 className="calc-section-heading">Throw</h2>
        <div className="calc-row">
          <SelectField
            label="Ball"
            options={BALLS.map((b) => ({
              value: b.value,
              label: `${b.label} (×${BALL_BONUS[b.value]})`,
            }))}
            value={ball}
            onChange={(e) => setBall(e.target.value as PokeBall)}
          />
          <SelectField
            label="Status"
            options={STATUSES.map((s) => ({
              value: s.value,
              label: `${s.label} (×${STATUS_BONUS[s.value]})`,
            }))}
            value={status}
            onChange={(e) => setStatus(e.target.value as CatchStatus)}
          />
        </div>
      </div>

      {result && (
        <div className="calc-result" data-testid="calc-catch-rate-result">
          {result.guaranteed ? (
            <p className="calc-result-headline">Guaranteed catch</p>
          ) : (
            <>
              <p className="calc-result-headline">
                <span className="num">{(result.probability * 100).toFixed(1)}%</span> per throw
              </p>
              <p className="calc-result-note">
                About 1 in <span className="num">{oneInN(result.probability)}</span> throws
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
