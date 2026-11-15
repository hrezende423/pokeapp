import { IconSquare, IconSquareCheck } from '@tabler/icons-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { speciesEntries } from '../../dex/entrySources'
import { FRONTIER_GENERATION, type FrontierData, type LevelMode } from '../data'
import { battleLabel } from '../format'
import { itemName, moveNames, speciesName } from '../names'
import { Joined, Muted, SpeciesLink } from '../parts'
import {
  endRun,
  isSetStart,
  logBattle,
  newId,
  rentalsAt,
  setDomeTeam,
  today,
  type BattleEntry,
  type Rental,
  type RunView,
} from './model'
import { trackerDocument } from './trackerStore'

/**
 * Logging a battle (the mockup's state 4), the Dome's three and the symbol
 * toggles. A species is chosen from the Gen 3 Pokédex list (#1-386, the dex's
 * own scoped list, in Pokédex order) or as an explicit "Unknown".
 */

/** A symbol: a checkbox icon and a semibold label when held. Not the accent Toggle. */
export function SymbolToggle({
  label,
  on,
  onClick,
  testId,
}: {
  label: string
  on: boolean
  onClick: () => void
  testId?: string
}) {
  return (
    <button type="button" className="bf-sym" aria-pressed={on} data-testid={testId} onClick={onClick}>
      {on ? <IconSquareCheck size={20} stroke={1.5} aria-hidden /> : <IconSquare size={20} stroke={1.5} aria-hidden />}
      <span>{label}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ the species picker */

/** undefined = not chosen yet; null = Unknown (only where `allowUnknown`). */
type Pick = number | null | undefined

const MATCHES = 6

export function SpeciesPicker({
  label,
  area,
  value,
  onChange,
  allowUnknown = true,
  testId,
  focusOnMount = false,
  additive = false,
}: {
  label: string
  area?: string
  value: Pick
  onChange: (v: number | null) => void
  allowUnknown?: boolean
  testId: string
  /** Focus (and so open) on mount: the Pyramid's Trainer mode, one tap from its options. */
  focusOnMount?: boolean
  /**
   * Each pick ADDS an entry (the Pyramid): a tap on the field reopens the list for
   * the next one, and with text typed Enter takes the first match, not Unknown.
   */
  additive?: boolean
}) {
  const list = useMemo(() => speciesEntries({ generation: FRONTIER_GENERATION, isAll: false }), [])
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusOnMount) input.current?.focus()
  }, [focusOnMount])
  const shown = value === undefined ? '' : value === null ? 'Unknown' : speciesName(value)
  const q = text.trim().toLowerCase()
  const matches = (q ? list.filter((s) => s.display_name.toLowerCase().startsWith(q)) : list).slice(0, MATCHES)
  const options: { id: number | null; label: string }[] = [
    ...(allowUnknown ? [{ id: null, label: 'Unknown (not seen)' }] : []),
    ...matches.map((s) => ({ id: s.id, label: speciesName(s.id) })),
  ]
  const pick = (o: { id: number | null }) => {
    onChange(o.id)
    setOpen(false)
  }
  return (
    <label className="bf-field bf-picker" style={area ? { gridArea: area } : undefined} data-layout="species-picker">
      <span className="bf-cap">{label}</span>
      <input
        ref={input}
        className="bf-uf"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        placeholder="Search species"
        data-testid={testId}
        value={open ? text : shown}
        onFocus={(e) => {
          setText(shown)
          setActive(0)
          setOpen(true)
          e.target.select()
        }}
        onClick={() => {
          if (!additive || open) return
          setText(shown)
          setActive(0)
          setOpen(true)
        }}
        onChange={(e) => {
          setText(e.target.value)
          setActive(additive && allowUnknown && e.target.value.trim() ? 1 : 0)
          setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, options.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (options[active]) pick(options[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && options.length > 0 && (
        <ul className="bf-picker-list" role="listbox" id={listId} data-testid={`${testId}-list`}>
          {options.map((o, i) => (
            <li
              key={o.id ?? 'unknown'}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-species-id={o.id ?? 'unknown'}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </label>
  )
}

/** A rental's (or a Pyramid trainer's) set, optional: any of that species' Frontier sets the level mode can draw. */
export function SetSelect({
  data,
  species,
  levelMode,
  value,
  onChange,
  area,
  testId,
}: {
  data: FrontierData
  species: number | undefined
  levelMode: LevelMode
  value: number | undefined
  onChange: (v: number | undefined) => void
  area?: string
  testId: string
}) {
  const sets =
    species == null ? [] : data.sets().filter((s) => s.species_id === species && (levelMode === 'open' || !s.openOnly))
  return (
    <label className="bf-field" style={area ? { gridArea: area } : undefined}>
      <span className="bf-cap">Set (optional)</span>
      <select
        className="bf-uf"
        data-testid={testId}
        disabled={species == null}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      >
        <option value="">Any of its sets</option>
        {sets.map((s) => (
          <option key={s.index} value={s.index}>
            #{s.index} · {itemName(s.item_id)} · {moveNames(s.moves)}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ------------------------------------------------------------------ the Dome's three */

/** The owner's three, once per run: chosen until the first battle, then fixed. */
export function RunTeam({ v }: { v: RunView }) {
  const team = v.run.dome?.team
  const [picks, setPicks] = useState<Pick[]>(team ?? [undefined, undefined, undefined])
  const editable = v.battles.length === 0
  const choose = (i: number, id: number | null) => {
    const next = picks.slice()
    next[i] = id ?? undefined
    setPicks(next)
    if (next.every((x) => x != null)) trackerDocument.update((d) => setDomeTeam(d, v.run.id, next as number[]))
  }
  return (
    <section data-layout="run-team" data-testid="run-team">
      <p className="bf-sec">Your three</p>
      {editable ? (
        <div className="bf-three" data-layout="run-team-pick">
          {[0, 1, 2].map((i) => (
            <SpeciesPicker
              key={i}
              label={'ABC'[i]}
              area={'abc'[i]}
              allowUnknown={false}
              value={picks[i]}
              testId={`dome-team-${i}`}
              onChange={(id) => choose(i, id)}
            />
          ))}
        </div>
      ) : (
        <p>
          <Joined
            sep={<Muted> · </Muted>}
            items={(team ?? []).map((id, i) => (
              <span key={i}>
                <Muted>{'ABC'[i]}</Muted> <SpeciesLink id={id} />
              </span>
            ))}
          />
        </p>
      )}
      <p className="bf-cap">Each battle records the pair you brought (2 of these 3).</p>
    </section>
  )
}

/* ------------------------------------------------------------------ logging a battle */

export function LogAdd({ data, v }: { data: FrontierData; v: RunView }) {
  const { run } = v
  const n = (v.battles.at(-1)?.n ?? 0) + 1
  const dome = run.facility === 'dome'
  const factory = run.facility === 'factory'
  const draftHere = isSetStart(run, n, v.perSet)
  const current = factory && !draftHere ? (rentalsAt(run, n) ?? []) : []
  const team = run.dome?.team

  const [opps, setOpps] = useState<Pick[]>([undefined, undefined, undefined])
  const [note, setNote] = useState('')
  const [pair, setPair] = useState<number[]>([])
  const [dropped, setDropped] = useState<1 | 2 | 3 | null>(null)
  const [draft, setDraft] = useState<(Rental | undefined)[]>([undefined, undefined, undefined])
  const [swapOut, setSwapOut] = useState(-1)
  const [swapIn, setSwapIn] = useState<Rental | undefined>()
  const [retiring, setRetiring] = useState(false)

  const missing: string[] = []
  if (opps.some((o) => o === undefined)) missing.push('the three opponents (or Unknown)')
  if (dome && !team) missing.push('your three, above')
  if (dome && pair.length !== 2) missing.push('the pair you brought')
  if (draftHere && draft.some((r) => !r)) missing.push('your three rentals')
  if (swapOut >= 0 && !swapIn) missing.push('the rental you swapped in')
  const ready = missing.length === 0

  const log = (result: 'W' | 'L') => {
    if (!ready) return
    const entry: BattleEntry = { opponents: opps.map((o) => (o === undefined ? null : o)), result }
    if (dome) entry.dome = { pair, dropped }
    if (note.trim()) entry.note = note.trim()
    if (draftHere) entry.draft = draft as Rental[]
    if (factory && swapOut >= 0 && swapIn) entry.swap = { out: current[swapOut], in: swapIn }
    trackerDocument.update((d) => logBattle(d, data, run.id, entry, today(), { battle: newId('b'), line: newId('bp') }))
  }

  const variant = dome ? 'bf-addrow-dome' : draftHere ? 'bf-addrow-draft' : factory && n > 1 ? 'bf-addrow-swap' : ''
  const setOpp = (i: number, id: number | null) => setOpps((o) => o.map((x, j) => (j === i ? id : x)))
  const setRental = (i: number, r: Rental | undefined) => setDraft((d) => d.map((x, j) => (j === i ? r : x)))

  return (
    // A div: the old bare `.panel .bf section` reset would zero this row's padding.
    <div className={`bf-addrow ${variant}`} data-layout="log-add" data-testid="log-add">
      <span className="bf-mono" style={{ gridArea: 'n' }} data-testid="log-add-n">
        {n}
      </span>
      <span style={{ gridArea: 'label' }} className="bf-nw">
        {battleLabel(run.facility, n)}
      </span>
      {[0, 1, 2].map((i) => (
        <SpeciesPicker
          key={i}
          label={`Opponent ${i + 1}`}
          area={`s${i + 1}`}
          value={opps[i]}
          testId={`log-opponent-${i}`}
          onChange={(id) => setOpp(i, id)}
        />
      ))}

      {dome && (
        <>
          <div className="bf-field" style={{ gridArea: 'pair' }}>
            <span className="bf-cap">Your pair (2 of your 3)</span>
            <div className="bf-pair" data-layout="log-pair">
              {(team ?? []).map((id, i) => (
                <SymbolToggle
                  key={i}
                  label={`${'ABC'[i]} ${speciesName(id)}`}
                  on={pair.includes(id)}
                  testId={`log-pair-${i}`}
                  onClick={() =>
                    setPair((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : p))
                  }
                />
              ))}
            </div>
          </div>
          <label className="bf-field" style={{ gridArea: 'drop' }}>
            <span className="bf-cap">Dropped (their Pokémon that sat out)</span>
            <select
              className="bf-uf"
              data-testid="log-dropped"
              value={dropped ?? ''}
              onChange={(e) => setDropped(e.target.value === '' ? null : (Number(e.target.value) as 1 | 2 | 3))}
            >
              <option value="">Not recorded</option>
              {([1, 2, 3] as const).map((s) => (
                <option key={s} value={s}>
                  {s} ·{' '}
                  {opps[s - 1] === undefined ? `opponent ${s}` : opps[s - 1] === null ? 'Unknown' : speciesName(opps[s - 1] as number)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {draftHere &&
        [0, 1, 2].map((i) => (
          <div key={i} className="bf-stack bf-rental-pick" style={{ gridArea: `r${i + 1}` }} data-layout="log-rental">
            <SpeciesPicker
              label={`${battleLabel(run.facility, n).split(' · ')[0]} rental ${i + 1}`}
              allowUnknown={false}
              value={draft[i]?.species}
              testId={`log-rental-${i}`}
              onChange={(id) => setRental(i, id == null ? undefined : { species: id })}
            />
            <SetSelect
              data={data}
              species={draft[i]?.species}
              levelMode={run.levelMode}
              value={draft[i]?.setIndex}
              testId={`log-rental-${i}-set`}
              onChange={(s) => {
                const r = draft[i]
                if (r) setRental(i, s == null ? { species: r.species } : { species: r.species, setIndex: s })
              }}
            />
          </div>
        ))}

      {factory && !draftHere && n > 1 && (
        <>
          <label className="bf-field" style={{ gridArea: 'sout' }}>
            <span className="bf-cap">Swap out (optional)</span>
            <select
              className="bf-uf"
              data-testid="log-swap-out"
              value={swapOut}
              onChange={(e) => setSwapOut(Number(e.target.value))}
            >
              <option value={-1}>No swap</option>
              {current.map((r, i) => (
                <option key={i} value={i}>
                  {speciesName(r.species)}
                  {r.setIndex != null ? ` #${r.setIndex}` : ''}
                </option>
              ))}
            </select>
          </label>
          {swapOut >= 0 && (
            <>
              <SpeciesPicker
                label="Swap in"
                area="sin"
                allowUnknown={false}
                value={swapIn?.species}
                testId="log-swap-in"
                onChange={(id) => setSwapIn(id == null ? undefined : { species: id })}
              />
              <SetSelect
                data={data}
                area="sset"
                species={swapIn?.species}
                levelMode={run.levelMode}
                value={swapIn?.setIndex}
                testId="log-swap-in-set"
                onChange={(s) =>
                  setSwapIn((r) => (r ? (s == null ? { species: r.species } : { species: r.species, setIndex: s }) : r))
                }
              />
            </>
          )}
        </>
      )}

      <label className="bf-field" style={{ gridArea: 'note' }}>
        <span className="bf-cap">Note (optional)</span>
        <input
          className="bf-uf"
          placeholder="Anything worth remembering about this battle"
          aria-label="Note"
          data-testid="log-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <span className="bf-actions" style={{ gridArea: 'result' }}>
        <button
          type="button"
          className="bf-ghost"
          disabled={!ready}
          title={ready ? undefined : `Still to fill in: ${missing.join(', ')}`}
          data-testid="log-won"
          onClick={() => log('W')}
        >
          Won
        </button>
        <button
          type="button"
          className="bf-ghost"
          disabled={!ready}
          title={ready ? undefined : `Still to fill in: ${missing.join(', ')}`}
          data-testid="log-lost"
          onClick={() => log('L')}
        >
          Lost
        </button>
      </span>
      {/* The caption style on the wrapper: `.bf-link`'s `font: inherit` would undo it on the button. */}
      <span className="bf-actions bf-retire bf-cap" style={{ gridArea: 'retire' }}>
        <button
          type="button"
          className="bf-link"
          data-testid="run-retire"
          onClick={() => (retiring ? trackerDocument.update((d) => endRun(d, run.id, 'retired', today())) : setRetiring(true))}
        >
          {retiring ? 'Confirm: end this run as retired' : 'Retire the run'}
        </button>
      </span>
    </div>
  )
}
