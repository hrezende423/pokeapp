/**
 * The effort and individual spreads, which are four different controls wearing
 * two column headings.
 *
 * GEN 1-2 -- "Stat Exp" and "DV":
 *   Stat Exp is a NUMERIC STEPPER, not a slider. Its range is 0-65535; a slider
 *   over 65,536 values cannot be aimed, and the numbers people actually type
 *   (65535, or a square like 63504) are unreachable by dragging.
 *   DV is a slider, 0-15.
 *   THE HP DV IS NEVER EDITABLE. It is not stored -- it is the parity of the other
 *   four DVs -- so it renders as a read-only computed value. A slider there would
 *   be a control that silently does nothing.
 *
 * GEN 2 SHINY LOCK: a Gen 2 Pokemon is shiny exactly when Def, Spe and Spc DVs are
 * all 10 and the Atk DV is one of eight values. So shininess is not a toggle, it
 * is a spread. Turning the lock on pins the three and switches Attack to a
 * SKIP-AWARE STEPPER over {2,3,6,7,10,11,14,15} -- a constrained continuous slider
 * would let a drag land on 4 and silently drop shininess.
 *
 * GEN 3-4 -- "EV" and "IV":
 *   EV sliders, 0-252 each, with a running total HARD-CAPPED at 510. The cap is
 *   enforced by clamping the slider being moved rather than by refusing the input,
 *   so dragging past the budget stops at the budget instead of snapping back.
 *   IV sliders, 0-31, with no total, because IVs have no budget.
 */

import { IconMinus, IconPlus } from '@tabler/icons-react'
import { STAT_LABEL } from '../buildFacts'
import { spreadStatKeys, statKeysForGeneration, type Build } from '../model'
import {
  MAX_DV,
  MAX_EV,
  MAX_EV_TOTAL,
  MAX_IV,
  MAX_STAT_EXP,
  SHINY_ATTACK_DVS,
  SHINY_FIXED_DV,
  effortTotal,
  hpDvFrom,
  isShinyByDvs,
  nextShinyAttackDv,
  type StatKey,
  type StatNumbers,
} from '../statMath'

export function SpreadControls({
  build,
  shinyLock,
  onShinyLock,
  onEffort,
  onIndividual,
}: {
  build: Build
  shinyLock: boolean
  onShinyLock: (next: boolean) => void
  onEffort: (next: StatNumbers) => void
  onIndividual: (next: StatNumbers) => void
}) {
  const modern = build.generation >= 3
  const effortKeys = statKeysForGeneration(build.generation)
  const dvKeys = spreadStatKeys(build.generation)
  const total = effortTotal(build.effort, effortKeys)

  const setEffort = (key: StatKey, value: number) => {
    if (modern) {
      const others = effortKeys
        .filter((k) => k !== key)
        .reduce((sum, k) => sum + (build.effort[k] ?? 0), 0)
      // Clamp the slider being dragged to whatever budget is left.
      const capped = Math.min(value, MAX_EV, Math.max(0, MAX_EV_TOTAL - others))
      onEffort({ ...build.effort, [key]: capped })
      return
    }
    onEffort({ ...build.effort, [key]: clamp(value, 0, MAX_STAT_EXP) })
  }

  const setIndividual = (key: StatKey, value: number) => {
    onIndividual({ ...build.individual, [key]: clamp(value, 0, modern ? MAX_IV : MAX_DV) })
  }

  return (
    <div className="tb-spreads" data-testid="tb-spreads">
      <div className="tb-spread-col" data-testid="tb-effort-col">
        <div className="tb-spread-head">
          <span className="tb-field-label">{modern ? 'EV Spread' : 'Stat Exp'}</span>
        </div>
        {effortKeys.map((key) => (
          <div className="tb-spread-row" key={key} data-stat={key}>
            <span className="tb-spread-name">{STAT_LABEL[key]}</span>
            <span className="tb-spread-value num" data-testid={`tb-ev-${key}-value`}>
              {build.effort[key] ?? 0}
            </span>
            <Stepper
              onStep={(dir) => setEffort(key, (build.effort[key] ?? 0) + dir * (modern ? 4 : 256))}
              testId={`tb-ev-${key}`}
            />
            {modern ? (
              <input
                type="range"
                className="tb-range"
                min={0}
                max={MAX_EV}
                value={build.effort[key] ?? 0}
                data-testid={`tb-ev-${key}-slider`}
                onChange={(e) => setEffort(key, Number(e.target.value))}
              />
            ) : (
              /* A stepper, not a slider: see this file's header. */
              <input
                type="number"
                className="tb-number"
                min={0}
                max={MAX_STAT_EXP}
                value={build.effort[key] ?? 0}
                data-testid={`tb-ev-${key}-input`}
                onChange={(e) => setEffort(key, Number(e.target.value))}
              />
            )}
          </div>
        ))}
        {modern && (
          <div className="tb-spread-total">
            <span className="tb-field-label">Total</span>
            <span
              className="tb-spread-value num"
              data-over={total > MAX_EV_TOTAL ? 'true' : undefined}
              data-testid="tb-ev-total"
            >
              {total}
            </span>
          </div>
        )}
      </div>

      <div className="tb-spread-col" data-testid="tb-individual-col">
        <div className="tb-spread-head">
          <span className="tb-field-label">{modern ? 'IV Spread' : 'DV Spread'}</span>
          {/*
            GEN 2 ONLY. Shininess there is a property of the DV spread, so the way
            to "make it shiny" is to pin the spread -- there is no shiny flag to
            flip. Gen 1 has no shininess and Gen 3-4 store a real flag.
          */}
          {build.generation === 2 && (
            <button
              type="button"
              className="tb-ghost tb-ghost-sm"
              data-active={shinyLock ? 'true' : undefined}
              data-testid="tb-shiny-lock"
              onClick={() => {
                const next = !shinyLock
                onShinyLock(next)
                if (next) {
                  onIndividual({
                    ...build.individual,
                    defense: SHINY_FIXED_DV,
                    speed: SHINY_FIXED_DV,
                    special: SHINY_FIXED_DV,
                    attack: SHINY_ATTACK_DVS.includes(build.individual.attack ?? 0)
                      ? (build.individual.attack ?? SHINY_ATTACK_DVS[0])
                      : SHINY_ATTACK_DVS[0],
                  })
                }
              }}
            >
              {shinyLock ? 'Shiny DVs locked' : 'Lock to shiny DVs'}
            </button>
          )}
        </div>

        {/* HP first and read-only in Gen 1-2: it is derived, not stored. */}
        {!modern && (
          <div className="tb-spread-row" data-stat="hp" data-derived="true">
            <span className="tb-spread-name">HP</span>
            <span className="tb-spread-value num" data-testid="tb-dv-hp-value">
              {hpDvFrom(build.individual)}
            </span>
            <span className="tb-spread-note">from the other four</span>
          </div>
        )}

        {dvKeys.map((key) => {
          const locked =
            build.generation === 2 &&
            shinyLock &&
            (key === 'defense' || key === 'speed' || key === 'special')
          const skipAware = build.generation === 2 && shinyLock && key === 'attack'
          const value = build.individual[key] ?? 0

          return (
            <div
              className="tb-spread-row"
              key={key}
              data-stat={key}
              data-locked={locked || undefined}
            >
              <span className="tb-spread-name">{STAT_LABEL[key]}</span>
              <span className="tb-spread-value num" data-testid={`tb-iv-${key}-value`}>
                {value}
              </span>
              {skipAware ? (
                /* Only the eight legal Attack DVs, stepped through in order. */
                <Stepper
                  onStep={(dir) => setIndividual(key, nextShinyAttackDv(value, dir))}
                  testId={`tb-iv-${key}`}
                />
              ) : (
                <Stepper
                  onStep={(dir) => setIndividual(key, value + dir)}
                  testId={`tb-iv-${key}`}
                  disabled={locked}
                />
              )}
              <input
                type="range"
                className="tb-range"
                min={0}
                max={modern ? MAX_IV : MAX_DV}
                value={value}
                disabled={locked || skipAware}
                data-testid={`tb-iv-${key}-slider`}
                onChange={(e) => setIndividual(key, Number(e.target.value))}
              />
            </div>
          )
        })}

        {build.generation === 2 && (
          <p className="tb-spread-note" data-testid="tb-shiny-state">
            {isShinyByDvs(build.individual) ? 'This spread is shiny.' : 'This spread is not shiny.'}
          </p>
        )}
      </div>
    </div>
  )
}

function Stepper({
  onStep,
  testId,
  disabled = false,
}: {
  onStep: (direction: 1 | -1) => void
  testId?: string
  disabled?: boolean
}) {
  return (
    <span className="tb-stepper">
      <button
        type="button"
        aria-label="Decrease"
        disabled={disabled}
        data-testid={testId ? `${testId}-minus` : undefined}
        onClick={() => onStep(-1)}
      >
        <IconMinus size={13} stroke={1.5} />
      </button>
      <button
        type="button"
        aria-label="Increase"
        disabled={disabled}
        data-testid={testId ? `${testId}-plus` : undefined}
        onClick={() => onStep(1)}
      >
        <IconPlus size={13} stroke={1.5} />
      </button>
    </span>
  )
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}
