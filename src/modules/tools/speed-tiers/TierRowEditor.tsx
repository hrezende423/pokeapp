import { SelectField } from '../../../components/ds/SelectField'
import { TextField } from '../../../components/ds/TextField'
import { Toggle } from '../../../components/ds/Toggle'
import {
  getAbility,
  getItem,
  getSpecies,
  resolveAbilitiesForGeneration,
  type Species,
} from '../../../data'
import type { GameContext } from '../../battle/game'
import type { Side, TierRow } from './speedTiersMath'

/*
  One Pokemon's Speed inputs, shared by #5 Speed tiers and #6 Speed EV
  minimizer: species, level, Speed DV/IV and Stat Exp/EV, nature, item, ability,
  stage and the Speed-relevant statuses. A row loaded from a build shows only
  what can still change in battle.
*/

export function TierRowEditor({
  index,
  row,
  ctx,
  species,
  items,
  onChange,
  onRemove,
  title,
  showSide = true,
  showEffort = true,
}: {
  index: number
  row: TierRow
  ctx: GameContext
  species: Species[]
  items: { id: number; display_name: string }[]
  onChange: (p: Partial<TierRow>) => void
  /** Absent: the row cannot be removed (a fixed slot, as on #6). */
  onRemove?: () => void
  /** The heading; defaults to "Pokémon n". */
  title?: string
  showSide?: boolean
  /** #6 solves for the Speed effort, so it does not ask for it. */
  showEffort?: boolean
}) {
  const gen = ctx.generation
  const sp = row.speciesId != null ? getSpecies(row.speciesId) : undefined
  const variety = sp?.varieties.find((v) => v.is_default) ?? sp?.varieties[0]
  const abilities =
    variety && ctx.hasAbilities
      ? resolveAbilitiesForGeneration(variety, gen).filter((a) => !a.is_hidden)
      : []
  const abilityName =
    row.abilityId != null
      ? getAbility(row.abilityId)?.name
      : row.build?.abilityId != null
        ? getAbility(row.build.abilityId)?.name
        : undefined
  const n = index + 1
  return (
    <div className="calc-section" data-testid={`tiers-row-${n}`}>
      <h3 className="calc-section-heading">
        {row.build ? `${row.build.label} (from your team)` : (title ?? `Pokémon ${n}`)}
        {onRemove && (
          <>
            {' · '}
            <button
              type="button"
              className="tools-link"
              data-testid={`tiers-remove-${n}`}
              onClick={onRemove}
            >
              Remove
            </button>
          </>
        )}
      </h3>
      <div className="calc-row">
        {showSide && (
          <SelectField
            label="Side"
            options={[
              { value: 'mine', label: 'Yours' },
              { value: 'theirs', label: 'Theirs' },
            ]}
            value={row.side}
            data-testid={`tiers-side-${n}`}
            onChange={(e) => onChange({ side: e.target.value as Side })}
          />
        )}
        {!row.build && (
          <>
            <SelectField
              label="Pokémon"
              options={species.map((s) => ({ value: String(s.id), label: s.display_name }))}
              value={row.speciesId != null ? String(row.speciesId) : ''}
              data-testid={`tiers-species-${n}`}
              onChange={(e) => onChange({ speciesId: Number(e.target.value), abilityId: null })}
            />
            <TextField
              label="Level"
              type="number"
              min={1}
              max={100}
              value={row.level}
              data-testid={`tiers-level-${n}`}
              onChange={(e) => onChange({ level: e.target.value })}
            />
            <TextField
              label={gen <= 2 ? 'Speed DV' : 'Speed IV'}
              type="number"
              value={row.speedIndividual}
              data-testid={`tiers-iv-${n}`}
              onChange={(e) => onChange({ speedIndividual: e.target.value })}
            />
            {showEffort && (
              <TextField
                label={gen <= 2 ? 'Speed Stat Exp' : 'Speed EVs'}
                type="number"
                value={row.speedEffort}
                data-testid={`tiers-ev-${n}`}
                onChange={(e) => onChange({ speedEffort: e.target.value })}
              />
            )}
            {ctx.hasNatures && (
              <SelectField
                label="Nature"
                options={[
                  { value: 'up', label: '+Speed' },
                  { value: 'neutral', label: 'Neutral' },
                  { value: 'down', label: '−Speed' },
                ]}
                value={row.nature}
                data-testid={`tiers-nature-${n}`}
                onChange={(e) => onChange({ nature: e.target.value as TierRow['nature'] })}
              />
            )}
            {ctx.hasItems && (
              <SelectField
                label="Item"
                options={[
                  { value: '', label: 'None' },
                  ...items.map((i) => ({ value: String(i.id), label: i.display_name })),
                ]}
                value={row.itemId != null ? String(row.itemId) : ''}
                data-testid={`tiers-item-${n}`}
                onChange={(e) =>
                  onChange({ itemId: e.target.value ? Number(e.target.value) : null })
                }
              />
            )}
            {abilities.length > 0 && (
              <SelectField
                label="Ability"
                options={abilities.map((a) => ({
                  value: String(a.ability.id),
                  label: a.ability.display_name,
                }))}
                value={String(row.abilityId ?? abilities[0].ability.id)}
                data-testid={`tiers-ability-${n}`}
                onChange={(e) => onChange({ abilityId: Number(e.target.value) })}
              />
            )}
          </>
        )}
        <SelectField
          label="Speed stage"
          options={Array.from({ length: 13 }, (_, k) => ({
            value: String(k - 6),
            label: k - 6 > 0 ? `+${k - 6}` : String(k - 6),
          }))}
          value={String(row.stage)}
          data-testid={`tiers-stage-${n}`}
          onChange={(e) => onChange({ stage: Number(e.target.value) })}
        />
      </div>
      <div className="calc-toggle-row">
        <Toggle on={row.paralyzed} label="Paralyzed" onChange={(v) => onChange({ paralyzed: v })} />
        {abilityName === 'quick-feet' && (
          <Toggle on={row.statused} label="Statused" onChange={(v) => onChange({ statused: v })} />
        )}
        {abilityName === 'unburden' && (
          <Toggle
            on={row.unburden}
            label="Item used up"
            onChange={(v) => onChange({ unburden: v })}
          />
        )}
        {abilityName === 'slow-start' && (
          <Toggle
            on={row.slowStart}
            label="Slow Start active"
            onChange={(v) => onChange({ slowStart: v })}
          />
        )}
      </div>
      {row.build && row.itemId == null && row.build.itemId != null && (
        <p className="calc-result-note">Holds {getItem(row.build.itemId)?.display_name}.</p>
      )}
    </div>
  )
}
