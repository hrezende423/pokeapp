/**
 * The design system's number stepper: "− value +" (design-system/components/
 * input.md, "Number stepper"). Signs are ghost buttons, regular weight, bold on
 * hover, press and keyboard focus, no background; keyboard focus adds the 2px
 * ring. All of that is CSS (`.tb-stepper`); this file is behaviour only.
 *
 * THE VALUE IS STILL A TYPED FIELD. `type="number"` with its native spinners
 * hidden: Up/Down step it for free, typing is the precise path, and every test
 * that fills `tb-level` / `tb-friendship` keeps working.
 *
 * HOLD REPEATS. A press steps once at once, then repeats after a pause. The
 * pointer path and the keyboard path are kept apart -- pointerdown steps, a click
 * only steps when it came from the keyboard (`detail === 0`) -- or every mouse
 * press would step twice.
 */

import { useEffect, useRef } from 'react'

const REPEAT_DELAY = 400
const REPEAT_EVERY = 60

export function NumberStepper({
  value,
  min,
  max,
  onChange,
  testId,
  label,
}: {
  value: number
  min: number
  max: number
  onChange: (next: number) => void
  testId?: string
  /** Accessible name for the two buttons ("Level" -> "Decrease Level"). */
  label: string
}) {
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])
  const timer = useRef<number | null>(null)

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)))
  const stop = () => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])

  const step = (dir: 1 | -1) => {
    const next = clamp(latest.current + dir)
    latest.current = next
    onChange(next)
  }
  const start = (dir: 1 | -1) => {
    step(dir)
    const repeat = () => {
      step(dir)
      timer.current = window.setTimeout(repeat, REPEAT_EVERY)
    }
    timer.current = window.setTimeout(repeat, REPEAT_DELAY)
  }

  const sign = (dir: 1 | -1) => (
    <button
      type="button"
      className="tb-stepper-btn"
      aria-label={`${dir < 0 ? 'Decrease' : 'Increase'} ${label}`}
      disabled={dir < 0 ? value <= min : value >= max}
      data-testid={testId ? `${testId}-${dir < 0 ? 'minus' : 'plus'}` : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        start(dir)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={(e) => {
        if (e.detail === 0) step(dir)
      }}
    >
      {dir < 0 ? '−' : '+'}
    </button>
  )

  return (
    <span className="tb-stepper" role="group" aria-label={label}>
      {sign(-1)}
      <input
        type="number"
        className="tb-stepper-value"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        data-testid={testId}
        onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
      />
      {sign(1)}
    </span>
  )
}
