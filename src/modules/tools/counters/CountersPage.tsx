import { useEffect, useRef } from 'react'
import { IconMinus, IconPlus, IconX } from '@tabler/icons-react'
import { ScrollArea } from '../../../components/ScrollArea'
import { scrollKey } from '../../../components/scrollMemory'
import { TextField } from '../../../components/ds/TextField'
import '../../../components/ds/ds.css'
import '../../calculators/calculators.css'
import '../tools.css'
import './counters.css'
import {
  isReached,
  makeCounter,
  nudge,
  progress,
  resetCounter,
  setGoal,
  setMode,
  stepOf,
  statusText,
  NAME_MAX,
  type Counter,
} from './countersMath'
import { countersDocument } from './countersStore'

let idSeq = 0
const newId = () => `c${Date.now().toString(36)}${(idSeq++).toString(36)}`

/**
 * The Multi-Counter tool: any number of independent counters, each with an
 * optional goal. Device only (countersStore.ts). Not generation-scoped: it has no
 * game data, so it takes no selector and is not an exception to it.
 *
 * NAMED REGIONS: `counters` with areas `head` and `body`; the head holds
 * `counters-header`, the body `counters-grid` (or `counters-empty`); each card is
 * `counter-card` with `counter-head`, `counter-value`, `counter-controls`,
 * `counter-goal`, `counter-progress`, `counter-status`.
 */
export function CountersTool() {
  const doc = countersDocument.useDocument()
  const { counters } = doc
  const focusId = useRef<string | null>(null)

  const save = (next: Counter[]) => countersDocument.write({ ...doc, counters: next })
  const patch = (id: string, fn: (c: Counter) => Counter) =>
    save(counters.map((c) => (c.id === id ? fn(c) : c)))

  const add = () => {
    const id = newId()
    focusId.current = id
    save([...counters, makeCounter(id, `Counter ${counters.length + 1}`)])
  }

  // The new counter's name field takes focus with its text selected, once it exists.
  useEffect(() => {
    const id = focusId.current
    if (!id) return
    focusId.current = null
    const input = document.querySelector<HTMLInputElement>(`[data-testid="counter-name-${id}"]`)
    input?.focus()
    input?.select()
  }, [counters])

  return (
    <div className="calc tool-page counters" data-layout="counters" data-testid="tool-page-counters">
      <div className="calc-head tool-head counters-header" data-layout="counters-header">
        <h1 className="calc-title">Counters</h1>
        <div className="counters-actions" data-layout="counters-actions">
          <button type="button" className="counters-ghost" data-testid="counters-new" onClick={add}>
            New counter
          </button>
          <button
            type="button"
            className="counters-ghost"
            data-testid="counters-reset-all"
            onClick={() => save(counters.map(resetCounter))}
          >
            Reset all
          </button>
        </div>
      </div>
      <ScrollArea className="tool-scroll" testId="tool-scroll-area" memoryKey={scrollKey('tool', 'counters')}>
        <div className="calc-content counters-body">
          {counters.length === 0 ? (
            <div className="counters-empty" data-layout="counters-empty" data-testid="counters-empty">
              <p>No counters yet.</p>
              <button type="button" className="counters-ghost" onClick={add}>
                New counter
              </button>
            </div>
          ) : (
            <div className="counters-grid" data-layout="counters-grid" data-testid="counters-grid">
              {counters.map((c) => (
                <CounterCard
                  key={c.id}
                  counter={c}
                  onChange={(fn) => patch(c.id, fn)}
                  onRemove={() => save(counters.filter((x) => x.id !== c.id))}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function CounterCard({
  counter: c,
  onChange,
  onRemove,
}: {
  counter: Counter
  onChange: (fn: (c: Counter) => Counter) => void
  onRemove: () => void
}) {
  const pct = progress(c)
  const reached = isReached(c)
  const step = stepOf(c)
  const label = c.name || 'counter'
  return (
    <article
      className="counter-card"
      data-layout="counter-card"
      data-testid={`counter-${c.id}`}
      data-reached={reached}
      aria-label={label}
    >
      <div className="counter-head" data-layout="counter-head">
        <TextField
          label={`Name of ${label}`}
          hideLabel
          type="text"
          maxLength={NAME_MAX}
          value={c.name}
          data-testid={`counter-name-${c.id}`}
          onChange={(e) => onChange((x) => ({ ...x, name: e.target.value }))}
        />
        <button
          type="button"
          className="counters-icon"
          aria-label={`Remove ${label}`}
          data-testid={`counter-remove-${c.id}`}
          onClick={onRemove}
        >
          <IconX size={20} stroke={1.5} aria-hidden />
        </button>
      </div>
      <div className="counter-value" data-layout="counter-value">
        <button
          type="button"
          className="counters-icon"
          aria-label={`Subtract ${step} from ${label}`}
          data-testid={`counter-minus-${c.id}`}
          onClick={() => onChange((x) => nudge(x, -1))}
        >
          <IconMinus size={20} stroke={1.5} aria-hidden />
        </button>
        <output className="counter-num" aria-label={`Value of ${label}`} data-testid={`counter-value-${c.id}`}>
          {c.value}
        </output>
        <button
          type="button"
          className="counters-icon"
          aria-label={`Add ${step} to ${label}`}
          data-testid={`counter-plus-${c.id}`}
          onClick={() => onChange((x) => nudge(x, 1))}
        >
          <IconPlus size={20} stroke={1.5} aria-hidden />
        </button>
      </div>
      <div className="counter-controls" data-layout="counter-controls">
        <TextField
          label="Increment"
          type="text"
          inputMode="decimal"
          value={String(c.step)}
          aria-label={`Increment for ${label}`}
          data-testid={`counter-step-${c.id}`}
          onChange={(e) => onChange((x) => ({ ...x, step: e.target.value }))}
        />
        <div className="counter-seg" role="group" aria-label={`Direction of ${label}`}>
          {(['up', 'down'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={c.mode === m}
              data-testid={`counter-mode-${m}-${c.id}`}
              onClick={() => onChange((x) => setMode(x, m))}
            >
              {m === 'up' ? 'Ascending' : 'Descending'}
            </button>
          ))}
        </div>
      </div>
      <div className="counter-goal" data-layout="counter-goal">
        <TextField
          label="Goal"
          type="text"
          inputMode="decimal"
          placeholder="None"
          value={String(c.goal)}
          aria-label={`Goal for ${label}`}
          data-testid={`counter-goal-${c.id}`}
          onChange={(e) => onChange((x) => setGoal(x, e.target.value))}
        />
      </div>
      <div className="counter-progress" data-layout="counter-progress" aria-hidden="true" data-has-goal={pct != null}>
        {pct != null && <span style={{ width: `${pct}%` }} data-testid={`counter-bar-${c.id}`} />}
      </div>
      <p className="counter-status" data-layout="counter-status" role="status" data-testid={`counter-status-${c.id}`}>
        {statusText(c)}
      </p>
    </article>
  )
}
