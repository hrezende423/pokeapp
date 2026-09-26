import { useMemo, useState } from 'react'
import { getSpecies } from '../../data'
import type { Species, Variety } from '../../data'
import { SelectField } from '../../components/ds/SelectField'
import { StatRow, StatList } from '../../components/ds/DataRows'
import { TextField } from '../../components/ds/TextField'
import { useVersionGroup } from '../version-group/context'
import { speciesEntries } from '../dex/entrySources'
import {
  GROWTH_RATE_LABELS,
  MAX_LEVEL,
  expForLevel,
  expGainedFromDefeat,
  expToNextLevel,
  type GrowthRate,
} from './experienceMath'

/**
 * Experience / Level-Up Calculator.
 *
 * TWO QUESTIONS, ONE SCREEN: how much EXP a level costs (the species' own
 * growth rate curve), and how much EXP defeating that species pays out (its
 * base_experience). They share the species picker because both read off the
 * same one, not because they are the same computation.
 */

function defaultVariety(species: Species): Variety {
  return species.varieties.find((v) => v.is_default) ?? species.varieties[0]
}

export function ExperienceCalculator() {
  const { generation } = useVersionGroup()
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])

  const [speciesId, setSpeciesId] = useState<number>(species[0]?.id ?? 0)
  const [level, setLevel] = useState(50)
  const [defeatedLevel, setDefeatedLevel] = useState(50)
  const [isTrainerBattle, setIsTrainerBattle] = useState(false)
  const [participants, setParticipants] = useState(1)
  const [hasLuckyEgg, setHasLuckyEgg] = useState(false)

  const target = getSpecies(speciesId)
  const rate = (target?.growth_rate as GrowthRate | null) ?? 'medium'
  const variety = target ? defaultVariety(target) : null
  const baseExperience = variety?.base_experience ?? 0

  const total = expForLevel(rate, level)
  const toNext = expToNextLevel(rate, level)
  const gained = expGainedFromDefeat({ baseExperience, level: defeatedLevel, isTrainerBattle, participants, hasLuckyEgg })

  return (
    <div className="calc-tool" data-testid="calc-experience">
      <div className="calc-section">
        <div className="calc-row">
          <SelectField
            label="Species"
            options={species.map((s) => ({ value: String(s.id), label: s.display_name }))}
            value={String(speciesId)}
            onChange={(e) => setSpeciesId(Number(e.target.value))}
          />
        </div>
        {target && (
          <p className="calc-tool-note">
            {GROWTH_RATE_LABELS[rate]} growth rate · base experience{' '}
            <span className="num">{baseExperience}</span>
          </p>
        )}
      </div>

      <div className="calc-section">
        <h2 className="calc-section-heading">EXP to reach a level</h2>
        <div className="calc-row">
          <TextField
            label="Level"
            type="number"
            min={1}
            max={MAX_LEVEL}
            value={level}
            onChange={(e) => setLevel(Math.min(MAX_LEVEL, Math.max(1, Number(e.target.value))))}
          />
        </div>
        <StatList>
          <StatRow label="Total EXP" value={<span className="num">{total.toLocaleString()}</span>} />
          <StatRow
            label="EXP to next level"
            value={<span className="num">{toNext == null ? '—' : toNext.toLocaleString()}</span>}
          />
        </StatList>
      </div>

      <div className="calc-section">
        <h2 className="calc-section-heading">EXP from defeating this species</h2>
        <div className="calc-row">
          <TextField
            label="Defeated level"
            type="number"
            min={1}
            max={MAX_LEVEL}
            value={defeatedLevel}
            onChange={(e) => setDefeatedLevel(Math.min(MAX_LEVEL, Math.max(1, Number(e.target.value))))}
          />
          <TextField
            label="Participants sharing it"
            type="number"
            min={1}
            max={6}
            value={participants}
            onChange={(e) => setParticipants(Math.min(6, Math.max(1, Number(e.target.value))))}
          />
        </div>
        <div className="calc-toggle-row">
          <label className="calc-checkbox">
            <input
              type="checkbox"
              checked={isTrainerBattle}
              onChange={(e) => setIsTrainerBattle(e.target.checked)}
            />
            Trainer battle (×1.5)
          </label>
          <label className="calc-checkbox">
            <input type="checkbox" checked={hasLuckyEgg} onChange={(e) => setHasLuckyEgg(e.target.checked)} />
            Holding a Lucky Egg (×1.5)
          </label>
        </div>
        <div className="calc-result" data-testid="calc-experience-result">
          <p className="calc-result-headline">
            <span className="num">{gained.toLocaleString()}</span> EXP
          </p>
        </div>
      </div>
    </div>
  )
}
