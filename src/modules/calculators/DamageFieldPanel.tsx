import { CompactFieldStrip, FormSectionLabel } from '../../components/ds/FormParts'
import { SelectField } from '../../components/ds/SelectField'
import { Toggle } from '../../components/ds/Toggle'
import { FIELD_RULES, type CalcField, type SideConditions, type Weather } from './damage'

/**
 * Field conditions, offered per generation from FIELD_RULES -- the engine's own
 * table of what exists when. Gen 1 has no weather and no hazards, so its field is
 * the two screens and nothing else; Gen 2 adds Sun/Rain/Sand (no Hail) and one
 * layer of Spikes; Gen 3 Hail, three layers and Charge; Gen 4 Stealth Rock and
 * Gravity. A condition the era does not have is not rendered.
 *
 * Every toggle here is a binary state (the accent's second sanctioned use, via the
 * ds Toggle). Screens and hazards are the DEFENDER's side; Charge is the attacker's.
 * Nothing from after Gen 4 -- terrain, rooms, Tailwind's doubles partners -- has a
 * control, because nothing in the engine could read it.
 */

const WEATHER_LABEL: Record<Weather, string> = {
  sun: 'Sun',
  rain: 'Rain',
  sand: 'Sandstorm',
  hail: 'Hail',
}

export function DamageFieldPanel({
  gen,
  field,
  onChange,
}: {
  gen: number
  field: CalcField
  onChange: (next: CalcField) => void
}) {
  const rules = FIELD_RULES[gen]
  const def = field.defenderSide
  const setDef = (patch: Partial<SideConditions>) =>
    onChange({ ...field, defenderSide: { ...def, ...patch } })

  return (
    <div className="dcalc-panel dcalc-field" data-layout="dcalc-field" data-testid="dcalc-field">
      <FormSectionLabel>Field</FormSectionLabel>
      {(rules.weathers.length > 0 || rules.maxSpikes > 0) && (
        <CompactFieldStrip testId="dcalc-field-strip">
          {rules.weathers.length > 0 && (
            <SelectField
              label="Weather"
              options={[
                { value: '', label: 'None' },
                ...rules.weathers.map((w) => ({ value: w, label: WEATHER_LABEL[w] })),
              ]}
              value={field.weather ?? ''}
              data-testid="dcalc-weather"
              onChange={(e) =>
                onChange({ ...field, weather: (e.target.value || null) as Weather | null })
              }
            />
          )}
          {rules.maxSpikes > 0 && (
            <SelectField
              label="Spikes (defender)"
              options={Array.from({ length: rules.maxSpikes + 1 }, (_, n) => ({
                value: String(n),
                label:
                  n === 0
                    ? 'None'
                    : rules.maxSpikes === 1
                      ? 'Spikes'
                      : `${n} layer${n > 1 ? 's' : ''}`,
              }))}
              value={String(def.spikes)}
              data-testid="dcalc-spikes"
              onChange={(e) => setDef({ spikes: Number(e.target.value) })}
            />
          )}
        </CompactFieldStrip>
      )}
      <div className="dcalc-inline-toggles" data-testid="dcalc-field-toggles">
        <Toggle on={def.reflect} label="Reflect" onChange={(v) => setDef({ reflect: v })} />
        <Toggle
          on={def.lightScreen}
          label="Light Screen"
          onChange={(v) => setDef({ lightScreen: v })}
        />
        {rules.stealthRock && (
          <Toggle
            on={def.stealthRock}
            label="Stealth Rock"
            onChange={(v) => setDef({ stealthRock: v })}
          />
        )}
        {rules.foresight && (
          <Toggle on={def.foresight} label="Foresight" onChange={(v) => setDef({ foresight: v })} />
        )}
        {rules.pursuit && (
          <Toggle
            on={def.switchingOut}
            label="Defender switching out"
            onChange={(v) => setDef({ switchingOut: v })}
          />
        )}
        {rules.charge && (
          <Toggle
            on={field.attackerSide.charge}
            label="Attacker charged"
            onChange={(v) =>
              onChange({ ...field, attackerSide: { ...field.attackerSide, charge: v } })
            }
          />
        )}
        {rules.gravity && (
          <Toggle
            on={field.gravity}
            label="Gravity"
            onChange={(v) => onChange({ ...field, gravity: v })}
          />
        )}
      </div>
    </div>
  )
}
