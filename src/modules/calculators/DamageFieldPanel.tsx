import { FormSectionLabel } from '../../components/ds/FormParts'
import { SelectField } from '../../components/ds/SelectField'
import { Toggle } from '../../components/ds/Toggle'
import { FIELD_RULES, type SideConditions, type Weather } from './damage'
import type { DualField } from './damageCalcState'

/**
 * The Field column, between the two Pokemon as in the reference: weather and
 * Gravity are shared; everything else belongs to one side, so each Pokemon gets
 * its own column of conditions (Pokemon 1's side on the left, 2's on the right).
 *
 * Offered per generation from FIELD_RULES, the engine's table of what exists
 * when: Gen 1 has screens only; Gen 2 adds Sun/Rain/Sand (no Hail), one layer of
 * Spikes, Foresight and Pursuit; Gen 3 Hail, three layers and Charge; Gen 4
 * Stealth Rock and Gravity. Nothing from after Gen 4 has a control.
 *
 * Every toggle is a binary state -- the ds Toggle, the accent's second sanctioned
 * use.
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
  names,
  onChange,
}: {
  gen: number
  field: DualField
  /** The two Pokemon's names, for the side headings. */
  names: [string, string]
  onChange: (next: DualField) => void
}) {
  const rules = FIELD_RULES[gen]
  const setSide = (i: 0 | 1, patch: Partial<SideConditions>) => {
    const sides: DualField['sides'] = [...field.sides]
    sides[i] = { ...sides[i], ...patch }
    onChange({ ...field, sides })
  }

  return (
    <div className="dcalc-panel dcalc-field" data-layout="dcalc-field" data-testid="dcalc-field">
      <FormSectionLabel>Field</FormSectionLabel>

      {(rules.weathers.length > 0 || rules.gravity) && (
        <div className="dcalc-field-shared">
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
          {rules.gravity && (
            <Toggle
              on={field.gravity}
              label="Gravity"
              onChange={(v) => onChange({ ...field, gravity: v })}
            />
          )}
        </div>
      )}

      <div className="dcalc-field-sides">
        {([0, 1] as const).map((i) => {
          const s = field.sides[i]
          return (
            <div key={i} className="dcalc-field-side" data-testid={`dcalc-field-side-${i + 1}`}>
              <span className="ds-field-label dcalc-field-side-name">{names[i]}’s side</span>
              {rules.maxSpikes > 0 && (
                <SelectField
                  label="Spikes"
                  options={Array.from({ length: rules.maxSpikes + 1 }, (_, n) => ({
                    value: String(n),
                    label:
                      n === 0
                        ? 'None'
                        : rules.maxSpikes === 1
                          ? 'Spikes'
                          : `${n} layer${n > 1 ? 's' : ''}`,
                  }))}
                  value={String(s.spikes)}
                  data-testid={`dcalc-spikes-${i + 1}`}
                  onChange={(e) => setSide(i, { spikes: Number(e.target.value) })}
                />
              )}
              <div className="dcalc-field-toggles" data-testid={`dcalc-field-toggles-${i + 1}`}>
                {rules.stealthRock && (
                  <Toggle
                    on={s.stealthRock}
                    label="Stealth Rock"
                    onChange={(v) => setSide(i, { stealthRock: v })}
                  />
                )}
                <Toggle
                  on={s.reflect}
                  label="Reflect"
                  onChange={(v) => setSide(i, { reflect: v })}
                />
                <Toggle
                  on={s.lightScreen}
                  label="Light Screen"
                  onChange={(v) => setSide(i, { lightScreen: v })}
                />
                {rules.foresight && (
                  <Toggle
                    on={s.foresight}
                    label="Foresight"
                    onChange={(v) => setSide(i, { foresight: v })}
                  />
                )}
                {rules.pursuit && (
                  <Toggle
                    on={s.switchingOut}
                    label="Switching out"
                    onChange={(v) => setSide(i, { switchingOut: v })}
                  />
                )}
                {rules.charge && (
                  <Toggle
                    on={s.charge}
                    label="Charge"
                    onChange={(v) => setSide(i, { charge: v })}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
