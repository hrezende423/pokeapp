import {
  IconBackpack,
  IconChevronDown,
  IconChevronRight,
  IconMinus,
  IconPaw,
  IconPlus,
  IconUser,
  IconX,
} from '@tabler/icons-react'
import { Fragment, useId, useMemo, useState, type ReactNode } from 'react'
import { itemEntries } from '../../dex/entrySources'
import {
  FRONTIER_GENERATION,
  type BrainAppearance,
  type FrontierData,
  type FrontierTrainer,
} from '../data'
import { itemName, speciesName } from '../names'
import { Joined, MonCell, MonSprite, Muted, Num } from '../parts'
import { StreakLookup } from '../StreakLookup'
import { SetSelect, SpeciesPicker } from './LogAdd'
import { BrainCell, ItemSprite, Opponents } from './LogParts'
import {
  brainAt,
  endRun,
  floorPoolArgs,
  newId,
  today,
  type Battle,
  type OpenFloor,
  type PyramidFloor,
  type PyramidTrainer,
  type RunView,
  type TrackerView,
} from './model'
import {
  addItem,
  addTrainer,
  addWild,
  categoryAt,
  categoryById,
  closeFloor,
  editLoggedBattle,
  editLoggedFloor,
  editOpenFloor,
  EMPTY_FLOOR,
  floorLabel,
  loseToTrainer,
  openFloorOf,
  pyramidInsights,
  pyramidTotals,
  removeItem,
  removeTrainer,
  removeWild,
  roundItems,
  roundOf,
  setCategory,
  setTrainer,
  stepItem,
  stepWild,
} from './pyramid'
import { PYRAMID_CATEGORIES } from './pyramidData'
import { trackerDocument } from './trackerStore'

/**
 * The Battle Pyramid's run: floor by floor, the trainers met (ONE Pokémon each),
 * the wild Pokémon defeated and the items found, in as few taps as possible.
 * Every tap saves at once (no form, no Save): the open floor is the run's
 * `openFloor`, and "Next floor" closes it into a Battle (pyramid.ts).
 *
 * Replaces the logging row and the log rows of a Pyramid run only; every other
 * facility keeps LogAdd and RunLog (TrackerPage.tsx).
 */

/** Which floor an editor writes to: the open one, or a logged one reopened. */
type Target = { kind: 'open'; runId: string } | { kind: 'logged'; battleId: string }
type Edit = (fn: (f: PyramidFloor) => PyramidFloor) => void

const editorFor =
  (t: Target): Edit =>
  (fn) =>
    trackerDocument.update((d) =>
      t.kind === 'open'
        ? editOpenFloor(d, t.runId, (o) => ({ ...o, pyramid: fn(o.pyramid) }))
        : editLoggedFloor(d, t.battleId, fn),
    )

const ids = () => ({ battle: newId('b'), line: newId('bp') })
const trainerText = (t: FrontierTrainer) => [t.className, t.name].filter(Boolean).join(' ') || t.key
const shown = (species: number | null) => (species == null ? 'Unknown' : speciesName(species))

/* ------------------------------------------------------------------ the open floor */

export function PyramidAdd({ data, v }: { data: FrontierData; v: RunView }) {
  const open = openFloorOf(v.run, v.battles)
  const { n } = open
  const brain = brainAt(data, v.run, n, v.symbolsAtEnd)
  const category = categoryAt(v.run, v.battles, n, v.perSet)
  const [retiring, setRetiring] = useState(false)
  const edit = editorFor({ kind: 'open', runId: v.run.id })
  const areas = ['head', 'strip', ...(brain ? ['brain'] : []), 'entries', 'actions']
  const withNote = (o: OpenFloor, text: string): OpenFloor => {
    const next = { ...o }
    if (text) next.note = text
    else delete next.note
    return next
  }

  return (
    <div
      className="bf-pyr bf-pyr-open"
      style={{ gridTemplateAreas: areas.map((a) => `'${a}'`).join(' ') }}
      data-layout="pyramid-add"
      data-testid="pyramid-add"
    >
      <header className="bf-pyr-head" style={{ gridArea: 'head' }} data-layout="pyramid-head">
        <p className="bf-sec">
          Add to floor <span data-testid="pyramid-floor-n">{n}</span>
        </p>
        <span className="bf-muted" data-testid="pyramid-floor-label">
          {floorLabel(n, v.perSet)}
        </span>
      </header>
      <FloorStrip
        data={data}
        v={v}
        n={n}
        floor={open.pyramid}
        category={category}
        edit={edit}
        tid="pyramid-"
        onLost={(i) =>
          trackerDocument.update((d) => loseToTrainer(d, data, v.run.id, i, today(), ids()))
        }
      />
      {brain && <BrainPick key={n} data={data} v={v} open={open} brain={brain} />}
      <FloorEntries data={data} floor={open.pyramid} edit={edit} tid="pyramid-" />
      <div
        className="bf-pyr-actions"
        style={{ gridArea: 'actions' }}
        data-layout="pyramid-floor-actions"
      >
        <label className="bf-field" style={{ gridArea: 'note' }}>
          <span className="bf-cap">Floor note (optional)</span>
          <input
            className="bf-uf"
            placeholder="Anything worth remembering about this floor"
            data-testid="pyramid-note"
            value={open.note ?? ''}
            onChange={(e) => {
              const text = e.target.value
              trackerDocument.update((d) => editOpenFloor(d, v.run.id, (o) => withNote(o, text)))
            }}
          />
        </label>
        <span className="bf-actions" style={{ gridArea: 'next' }}>
          <button
            type="button"
            className="bf-ghost"
            title={
              brain
                ? 'Floor cleared and the Brain beaten: the next floor opens'
                : 'Floor cleared: the next floor opens'
            }
            data-testid="pyramid-next-floor"
            onClick={() =>
              trackerDocument.update((d) => closeFloor(d, data, v.run.id, 'W', today(), ids()))
            }
          >
            Next floor
          </button>
        </span>
        <span className="bf-actions bf-retire bf-cap" style={{ gridArea: 'retire' }}>
          <button
            type="button"
            className="bf-link"
            data-testid="run-retire"
            onClick={() =>
              retiring
                ? trackerDocument.update((d) => endRun(d, v.run.id, 'retired', today()))
                : setRetiring(true)
            }
          >
            {retiring ? 'Confirm: end this run as retired' : 'Retire the run'}
          </button>
        </span>
      </div>
    </div>
  )
}

/** Brandon at the top of a Brain floor: his three, as the other facilities log a Brain. */
function BrainPick({
  data,
  v,
  open,
  brain,
}: {
  data: FrontierData
  v: RunView
  open: OpenFloor
  brain: BrainAppearance
}) {
  const name = data.brains().find((b) => b.facility === 'pyramid')?.name ?? 'The Brain'
  const [picks, setPicks] = useState<(number | null | undefined)[]>(
    open.opponents ?? [undefined, undefined, undefined],
  )
  const choose = (i: number, id: number | null) => {
    const next = picks.map((p, j) => (j === i ? id : p))
    setPicks(next)
    trackerDocument.update((d) =>
      editOpenFloor(d, v.run.id, (o) => ({ ...o, opponents: next.map((p) => p ?? null) })),
    )
  }
  return (
    <div
      className="bf-pyr-brain"
      style={{ gridArea: 'brain' }}
      data-layout="pyramid-brain"
      data-testid="pyramid-brain"
    >
      <p className="bf-sec" style={{ gridArea: 'title' }}>
        {name} · {brain.symbol === 'silver' ? 'Silver' : 'Gold'} · at the top, after this floor
      </p>
      {[0, 1, 2].map((i) => (
        <SpeciesPicker
          key={i}
          label={`${name}’s Pokémon ${i + 1}`}
          area={`s${i + 1}`}
          value={picks[i]}
          testId={`pyramid-brain-${i}`}
          onChange={(id) => choose(i, id)}
        />
      ))}
      <span className="bf-actions" style={{ gridArea: 'lost' }}>
        <button
          type="button"
          className="bf-ghost"
          data-testid="pyramid-brain-lost"
          onClick={() =>
            trackerDocument.update((d) => closeFloor(d, data, v.run.id, 'L', today(), ids()))
          }
        >
          Lost to {name}
        </button>
      </span>
      <p className="bf-cap" style={{ gridArea: 'cap' }}>
        Next floor records the win over {name}; the log compares his team with the known one.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ the strip: Wild, Trainer, Item */

type Mode = 'wild' | 'trainer' | 'item'
const MODES: { id: Mode; label: string; Icon: typeof IconPaw }[] = [
  { id: 'wild', label: 'Wild', Icon: IconPaw },
  { id: 'trainer', label: 'Trainer', Icon: IconUser },
  { id: 'item', label: 'Item', Icon: IconBackpack },
]

function FloorStrip({
  data,
  v,
  n,
  floor,
  category,
  edit,
  tid,
  onLost,
}: {
  data: FrontierData
  v: RunView
  n: number
  floor: PyramidFloor
  category: number | undefined
  edit: Edit
  tid: string
  onLost?: (trainerIndex: number | null) => void
}) {
  const [mode, setMode] = useState<Mode>('wild')
  // A mode the owner tapped (not the default): Trainer then opens its picker at once.
  const [tapped, setTapped] = useState(false)
  return (
    <div className="bf-pyr-strip" style={{ gridArea: 'strip' }} data-layout="pyramid-strip">
      <div
        className="bf-pyr-modes"
        role="group"
        aria-label={`Add to floor ${n}`}
        data-layout="pyramid-modes"
      >
        {MODES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="bf-pyr-mode"
            style={{ gridArea: id }}
            aria-pressed={mode === id}
            data-testid={`${tid}mode-${id}`}
            onClick={() => {
              setMode(id)
              setTapped(true)
            }}
          >
            <Icon size={24} stroke={1.5} aria-hidden />
            {label}
          </button>
        ))}
      </div>
      {mode === 'wild' && <WildPane floor={floor} category={category} edit={edit} tid={tid} />}
      {mode === 'item' && (
        <ItemPane round={roundOf(n, v.perSet)} floor={floor} edit={edit} tid={tid} />
      )}
      {mode === 'trainer' && (
        <TrainerPane
          data={data}
          v={v}
          n={n}
          floor={floor}
          edit={edit}
          tid={tid}
          focus={tapped}
          onLost={onLost}
        />
      )}
    </div>
  )
}

function WildPane({
  floor,
  category,
  edit,
  tid,
}: {
  floor: PyramidFloor
  category: number | undefined
  edit: Edit
  tid: string
}) {
  const [choosing, setChoosing] = useState(false)
  const cat = categoryById(category)
  return (
    <div
      className="bf-pyr-pane"
      style={{ gridTemplateAreas: cat && !choosing ? "'cat' 'picks' 'search'" : "'cat' 'search'" }}
      data-layout="pyramid-wild"
    >
      {cat && !choosing ? (
        <p
          className="bf-pyr-catline"
          style={{ gridArea: 'cat' }}
          data-layout="pyramid-category"
          data-testid={`${tid}category`}
        >
          <span>{cat.hint[0]}</span> <Muted>· {cat.tactic}</Muted>{' '}
          <span className="bf-cap">
            <button
              type="button"
              className="bf-link"
              data-testid={`${tid}category-change`}
              onClick={() => setChoosing(true)}
            >
              Change
            </button>
          </span>
        </p>
      ) : (
        <div style={{ gridArea: 'cat' }} data-layout="pyramid-category">
          <p className="bf-cap">
            The wild category: what the old man in the lobby said (kept for the whole round)
          </p>
          <div
            className="bf-pyr-cats"
            data-layout="pyramid-categories"
            data-testid={`${tid}categories`}
          >
            {PYRAMID_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className="bf-pyr-cat"
                aria-pressed={c.id === category}
                data-testid={`${tid}category-${c.id}`}
                onClick={() => {
                  edit((f) => setCategory(f, c.id))
                  setChoosing(false)
                }}
              >
                <span>{c.hint[0]}</span>
                <span className="bf-cap">{c.tactic}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {cat && !choosing && (
        <div
          className="bf-pyr-picks"
          style={{ gridArea: 'picks' }}
          data-layout="pyramid-wild-picks"
          data-testid={`${tid}wild-picks`}
        >
          {cat.species.map((id) => {
            const count = floor.wild.find((w) => w.species === id)?.count
            return (
              <button
                key={id}
                type="button"
                className="bf-pyr-pick"
                title={`One more ${speciesName(id)} defeated`}
                data-species-id={id}
                data-testid={`${tid}wild-${id}`}
                onClick={() => edit((f) => addWild(f, id))}
              >
                <MonSprite speciesId={id} />
                <span>{speciesName(id)}</span>
                {count ? <span className="bf-mono bf-muted">×{count}</span> : null}
              </button>
            )
          })}
        </div>
      )}
      <div style={{ gridArea: 'search' }} data-layout="pyramid-wild-search">
        <SpeciesPicker
          label="Another wild Pokémon (any Gen 3 species)"
          value={undefined}
          testId={`${tid}wild-search`}
          additive
          onChange={(id) => edit((f) => addWild(f, id))}
        />
      </div>
    </div>
  )
}

function ItemPane({
  round,
  floor,
  edit,
  tid,
}: {
  round: number
  floor: PyramidFloor
  edit: Edit
  tid: string
}) {
  const list = roundItems(round)
  return (
    <div
      className="bf-pyr-pane"
      style={{ gridTemplateAreas: "'picks' 'search'" }}
      data-layout="pyramid-item"
    >
      {list.length ? (
        <div
          className="bf-pyr-picks"
          style={{ gridArea: 'picks' }}
          data-layout="pyramid-item-picks"
          data-testid={`${tid}item-picks`}
        >
          {list.map((id) => {
            const qty = floor.items.find((x) => x.itemId === id)?.qty
            return (
              <button
                key={id}
                type="button"
                className="bf-pyr-pick"
                title={`One more ${itemName(id)}`}
                data-item-id={id}
                data-testid={`${tid}item-${id}`}
                onClick={() => edit((f) => addItem(f, id))}
              >
                <ItemSprite id={id} />
                <span>{itemName(id)}</span>
                {qty ? <span className="bf-mono bf-muted">×{qty}</span> : null}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="bf-cap" style={{ gridArea: 'picks' }} data-testid={`${tid}item-none`}>
          Round {round} has no item list: search for the item.
        </p>
      )}
      <div style={{ gridArea: 'search' }} data-layout="pyramid-item-search">
        <ItemPicker
          label="Another item (any Gen 3 item)"
          testId={`${tid}item-search`}
          onPick={(id) => edit((f) => addItem(f, id))}
        />
      </div>
    </div>
  )
}

function TrainerPane({
  data,
  v,
  n,
  floor,
  edit,
  tid,
  focus,
  onLost,
}: {
  data: FrontierData
  v: RunView
  n: number
  floor: PyramidFloor
  edit: Edit
  tid: string
  focus: boolean
  onLost?: (trainerIndex: number | null) => void
}) {
  const [more, setMore] = useState(false)
  const [which, setWhich] = useState<number | null>(null)
  const last = floor.trainers.length - 1
  const lastT: PyramidTrainer | undefined = floor.trainers[last]
  // More edits the trainer chosen in its "For" list, the latest one by default.
  const i = which != null && floor.trainers[which] ? which : last
  const t: PyramidTrainer | undefined = floor.trainers[i]
  // The loader's trainer range for this floor (the floors cleared before it).
  const range = data.trainerPoolForStreak(floorPoolArgs(v.run, n)).idRange
  const inRange = data.trainers().filter((x) => x.id >= range.from && x.id <= range.to)
  const lostTo = lastT && lastT.result === 'W' ? last : null
  return (
    <div className="bf-pyr-pane bf-pyr-trainer" data-layout="pyramid-trainer">
      <SpeciesPicker
        label="A trainer’s Pokémon (one each; saved as defeated)"
        area="pick"
        value={undefined}
        testId={`${tid}trainer-species`}
        focusOnMount={focus}
        additive
        onChange={(id) => {
          setWhich(null)
          edit((f) => addTrainer(f, id))
        }}
      />
      {/* Beside the picker, never under it: its open list would cover anything below. */}
      <span className="bf-actions" style={{ gridArea: 'lost' }}>
        {onLost && (
          <button
            type="button"
            className="bf-ghost"
            title="The run ends on this floor"
            data-testid={`${tid}trainer-lost`}
            onClick={() => onLost(lostTo)}
          >
            {lostTo != null && lastT ? `Lost to ${shown(lastT.species)}` : 'Lost'}
          </button>
        )}
        {onLost && lostTo != null && (
          <button
            type="button"
            className="bf-ghost"
            title="A trainer whose Pokémon you did not see: the run ends on this floor"
            data-testid={`${tid}trainer-lost-other`}
            onClick={() => onLost(null)}
          >
            Lost to another
          </button>
        )}
        <span className="bf-cap">
          <button
            type="button"
            className="bf-link bf-pyr-disclose"
            aria-expanded={more}
            title="The trainer and the set (optional)"
            data-testid={`${tid}trainer-more`}
            onClick={() => setMore(!more)}
          >
            {more ? (
              <IconChevronDown size={20} stroke={1.5} aria-hidden />
            ) : (
              <IconChevronRight size={20} stroke={1.5} aria-hidden />
            )}
            More{t ? ` for ${shown(t.species)}` : ''}
          </button>
        </span>
      </span>
      {more && (
        <div
          className="bf-pyr-more"
          style={{ gridArea: 'more' }}
          data-layout="pyramid-trainer-more"
        >
          {t ? (
            <div
              className={`bf-pyr-more-fields${floor.trainers.length > 1 ? ' bf-pyr-more-which' : ''}`}
              data-layout="pyramid-trainer-more-fields"
            >
              {floor.trainers.length > 1 && (
                <label className="bf-field" style={{ gridArea: 'which' }}>
                  <span className="bf-cap">For</span>
                  <select
                    className="bf-uf"
                    data-testid={`${tid}trainer-which`}
                    value={i}
                    onChange={(e) => setWhich(Number(e.target.value))}
                  >
                    {floor.trainers.map((x, k) => (
                      <option key={k} value={k}>
                        Trainer {k + 1} · {shown(x.species)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="bf-field" style={{ gridArea: 'trainer' }}>
                <span className="bf-cap">
                  Trainer (optional): ids {range.from}–{range.to} on floor {n}
                </span>
                <select
                  className="bf-uf"
                  data-testid={`${tid}trainer-id`}
                  value={t.trainerId ?? ''}
                  onChange={(e) =>
                    edit((f) =>
                      setTrainer(f, i, {
                        trainerId: e.target.value === '' ? undefined : Number(e.target.value),
                      }),
                    )
                  }
                >
                  <option value="">Not recorded</option>
                  {inRange.map((x) => (
                    <option key={x.id} value={x.id}>
                      #{x.id} · {trainerText(x)}
                    </option>
                  ))}
                </select>
              </label>
              <SetSelect
                data={data}
                area="set"
                species={t.species ?? undefined}
                levelMode={v.run.levelMode}
                value={t.setIndex}
                testId={`${tid}trainer-set`}
                onChange={(s) => edit((f) => setTrainer(f, i, { setIndex: s }))}
              />
            </div>
          ) : (
            <p className="bf-cap">Add the trainer’s Pokémon first.</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Search any Gen 3 item (the Itemdex's own list): a pick adds one. */
function ItemPicker({
  label,
  testId,
  onPick,
}: {
  label: string
  testId: string
  onPick: (id: number) => void
}) {
  const list = useMemo(
    () =>
      itemEntries({ generation: FRONTIER_GENERATION, isAll: false })
        .slice()
        .sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [],
  )
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const q = text.trim().toLowerCase()
  const options = q
    ? list
        .filter((i) => {
          const name = i.display_name.toLowerCase()
          return name.startsWith(q) || name.includes(` ${q}`)
        })
        .slice(0, 6)
    : []
  const pick = (id: number) => {
    onPick(id)
    setText('')
    setOpen(false)
  }
  return (
    <label className="bf-field bf-picker" data-layout="item-picker">
      <span className="bf-cap">{label}</span>
      <input
        className="bf-uf"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        placeholder="Search items"
        data-testid={testId}
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
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
            if (options[active]) pick(options[active].id)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && options.length > 0 && (
        <ul className="bf-picker-list" role="listbox" id={listId} data-testid={`${testId}-list`}>
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-item-id={o.id}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o.id)}
            >
              {o.display_name}
            </li>
          ))}
        </ul>
      )}
    </label>
  )
}

/* ------------------------------------------------------------------ a floor's entries */

function StepButton({
  label,
  icon,
  onClick,
  testId,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  testId: string
}) {
  return (
    <button
      type="button"
      className="bf-ghost bf-pyr-step"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

const MINUS = <IconMinus size={20} stroke={1.5} aria-hidden />
const PLUS = <IconPlus size={20} stroke={1.5} aria-hidden />
const REMOVE = <IconX size={20} stroke={1.5} aria-hidden />

function FloorEntries({
  data,
  floor,
  edit,
  tid,
}: {
  data: FrontierData
  floor: PyramidFloor
  edit: Edit
  tid: string
}) {
  const trainers = data.trainers()
  const none = <p className="bf-cap">None yet</p>
  return (
    <div
      className="bf-pyr-entries"
      style={{ gridArea: 'entries' }}
      data-layout="pyramid-entries"
      data-testid={`${tid}entries`}
    >
      <div style={{ gridArea: 'trainers' }} data-layout="pyramid-entries-trainers">
        <p className="bf-sec">
          Trainers <span className="bf-mono">{floor.trainers.length}</span>
        </p>
        {floor.trainers.length ? (
          <ul className="bf-pyr-list">
            {floor.trainers.map((t, i) => (
              <li key={i} className="bf-pyr-entry" data-testid={`${tid}trainer-${i}`}>
                <span className="bf-pyr-what">
                  <MonCell speciesId={t.species ?? undefined} />
                  {t.trainerId != null && (
                    <span className="bf-cap">
                      #{t.trainerId}
                      {trainers[t.trainerId] ? ` ${trainerText(trainers[t.trainerId])}` : ''}
                    </span>
                  )}
                  {t.setIndex != null && <span className="bf-cap bf-mono">set #{t.setIndex}</span>}
                  {t.result === 'L' && <span className="bf-cap">lost</span>}
                </span>
                <span className="bf-pyr-acts">
                  <StepButton
                    label={`Remove trainer ${i + 1} (${shown(t.species)})`}
                    icon={REMOVE}
                    testId={`${tid}trainer-${i}-remove`}
                    onClick={() => edit((f) => removeTrainer(f, i))}
                  />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          none
        )}
      </div>
      <div style={{ gridArea: 'wild' }} data-layout="pyramid-entries-wild">
        <p className="bf-sec">
          Wild defeated{' '}
          <span className="bf-mono">{floor.wild.reduce((s, w) => s + w.count, 0)}</span>
        </p>
        {floor.wild.length ? (
          <ul className="bf-pyr-list">
            {floor.wild.map((w, i) => {
              const key = w.species ?? 'unknown'
              const name = shown(w.species)
              return (
                <li key={key} className="bf-pyr-entry" data-testid={`${tid}wild-entry-${key}`}>
                  <span className="bf-pyr-what">
                    <MonCell speciesId={w.species ?? undefined} />
                    <span className="bf-mono">×{w.count}</span>
                  </span>
                  <span className="bf-pyr-acts">
                    <StepButton
                      label={`One fewer ${name}`}
                      icon={MINUS}
                      testId={`${tid}wild-entry-${key}-minus`}
                      onClick={() => edit((f) => stepWild(f, i, -1))}
                    />
                    <StepButton
                      label={`One more ${name}`}
                      icon={PLUS}
                      testId={`${tid}wild-entry-${key}-plus`}
                      onClick={() => edit((f) => stepWild(f, i, 1))}
                    />
                    <StepButton
                      label={`Remove ${name}`}
                      icon={REMOVE}
                      testId={`${tid}wild-entry-${key}-remove`}
                      onClick={() => edit((f) => removeWild(f, i))}
                    />
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          none
        )}
      </div>
      <div style={{ gridArea: 'items' }} data-layout="pyramid-entries-items">
        <p className="bf-sec">
          Items <span className="bf-mono">{floor.items.reduce((s, x) => s + x.qty, 0)}</span>
        </p>
        {floor.items.length ? (
          <ul className="bf-pyr-list">
            {floor.items.map((x, i) => {
              const name = itemName(x.itemId)
              return (
                <li
                  key={x.itemId}
                  className="bf-pyr-entry"
                  data-testid={`${tid}item-entry-${x.itemId}`}
                >
                  <span className="bf-pyr-what">
                    <ItemSprite id={x.itemId} />
                    <span>{name}</span>
                    <span className="bf-mono">×{x.qty}</span>
                  </span>
                  <span className="bf-pyr-acts">
                    <StepButton
                      label={`One fewer ${name}`}
                      icon={MINUS}
                      testId={`${tid}item-entry-${x.itemId}-minus`}
                      onClick={() => edit((f) => stepItem(f, i, -1))}
                    />
                    <StepButton
                      label={`One more ${name}`}
                      icon={PLUS}
                      testId={`${tid}item-entry-${x.itemId}-plus`}
                      onClick={() => edit((f) => stepItem(f, i, 1))}
                    />
                    <StepButton
                      label={`Remove ${name}`}
                      icon={REMOVE}
                      testId={`${tid}item-entry-${x.itemId}-remove`}
                      onClick={() => edit((f) => removeItem(f, i))}
                    />
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          none
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ the floor log */

/** A logged floor's three lists, with sprites; an empty list is left out. */
function FloorLists({ data, floor }: { data: FrontierData; floor: PyramidFloor }) {
  const trainers = data.trainers()
  const lines: [string, ReactNode[]][] = []
  if (floor.trainers.length)
    lines.push([
      'Trainers',
      floor.trainers.map((t, i) => (
        <span key={i} className="bf-pyr-met">
          <MonCell speciesId={t.species ?? undefined} />
          {t.trainerId != null && trainers[t.trainerId] && (
            <Muted>{trainerText(trainers[t.trainerId])}</Muted>
          )}
          {t.result === 'L' && <Muted>(lost)</Muted>}
        </span>
      )),
    ])
  if (floor.wild.length)
    lines.push([
      'Wild',
      floor.wild.map((w) => (
        <span key={w.species ?? 'unknown'} className="bf-pyr-met">
          <MonCell speciesId={w.species ?? undefined} />
          <span className="bf-mono">×{w.count}</span>
        </span>
      )),
    ])
  if (floor.items.length)
    lines.push([
      'Items',
      floor.items.map((x) => (
        <span key={x.itemId} className="bf-pyr-met">
          <ItemSprite id={x.itemId} />
          <span>{itemName(x.itemId)}</span>
          <span className="bf-mono">×{x.qty}</span>
        </span>
      )),
    ])
  if (!lines.length) return <Muted>Nothing logged</Muted>
  return (
    <div className="bf-pyr-lines" data-layout="floor-lists">
      {lines.map(([label, items]) => (
        <div key={label} className="bf-pyr-line" data-list={label.toLowerCase()}>
          <span className="bf-cap">{label}</span>
          <span className="bf-pyr-line-items">{items}</span>
        </div>
      ))}
    </div>
  )
}

const counts = (f: PyramidFloor) =>
  `${f.trainers.length} / ${f.wild.reduce((s, w) => s + w.count, 0)} / ${f.items.reduce((s, x) => s + x.qty, 0)}`

export function PyramidLog({ data, v }: { data: FrontierData; v: RunView }) {
  const [lookup, setLookup] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const cols = 6
  // A run retired mid-floor keeps that floor's entries: shown, read-only, after the last floor.
  const unclosed = openFloorOf(v.run, v.battles)
  const retiredOn =
    v.run.outcome === 'retired' &&
    (unclosed.pyramid.trainers.length ||
      unclosed.pyramid.wild.length ||
      unclosed.pyramid.items.length)
      ? unclosed
      : null
  const row = (b: Battle) => {
    const f = b.pyramid ?? EMPTY_FLOOR
    const brain = v.brains.get(b.id)
    // A floor lost to one of its trainers never reached the top: no Brain row.
    const reachedTop = !(b.result === 'L' && f.trainers.some((t) => t.result === 'L'))
    return (
      <Fragment key={b.id}>
        <tr data-battle-n={b.n}>
          <td className="bf-r bf-mono">{b.n}</td>
          <td className="bf-nw">
            <button
              type="button"
              className="bf-link"
              aria-expanded={lookup === b.id}
              title="Open the Streak lookup for this floor"
              data-testid={`floor-${b.n}-lookup`}
              onClick={() => setLookup(lookup === b.id ? null : b.id)}
            >
              {floorLabel(b.n, v.perSet)}
            </button>
          </td>
          <td className="bf-r bf-mono bf-nw" data-testid={`floor-${b.n}-counts`}>
            {counts(f)}
          </td>
          <td>
            <FloorLists data={data} floor={f} />
            {b.note && <span className="bf-cap bf-note">{b.note}</span>}
          </td>
          <td>{b.result === 'W' ? 'Cleared' : 'Lost'}</td>
          <td>
            <button
              type="button"
              className="bf-link"
              aria-expanded={editing === b.id}
              data-testid={`floor-${b.n}-edit`}
              onClick={() => setEditing(editing === b.id ? null : b.id)}
            >
              {editing === b.id ? 'Done' : 'Edit'}
            </button>
          </td>
        </tr>
        {brain && reachedTop && (
          <tr className="bf-pyr-brain-row" data-brain={brain.symbol} data-brain-after={b.n}>
            <td />
            <td colSpan={2} className="bf-brain-cell">
              <BrainCell data={data} facility="pyramid" b={brain} opponents={b.opponents} />
            </td>
            <td className="bf-nw">
              <Opponents ids={b.opponents} />
            </td>
            <td>{b.result === 'W' ? 'Won' : 'Lost'}</td>
            <td />
          </tr>
        )}
        {lookup === b.id && (
          <tr className="bf-lookup-row" data-testid={`floor-${b.n}-lookup-row`}>
            <td colSpan={cols}>
              <StreakLookup
                key={b.id}
                data={data}
                initial={{
                  facility: v.run.facility,
                  levelMode: v.run.levelMode,
                  format: v.run.format,
                  // The floors cleared before it; the lookup converts at its own loader call.
                  streak: b.n - 1,
                  symbols: v.heldAt.get(b.id) ?? 0,
                }}
              />
            </td>
          </tr>
        )}
        {editing === b.id && (
          <tr className="bf-lookup-row" data-testid={`floor-${b.n}-edit-row`}>
            <td colSpan={cols}>
              <FloorEditor data={data} v={v} b={b} />
            </td>
          </tr>
        )}
      </Fragment>
    )
  }
  return (
    <section data-layout="run-log" data-testid="run-log">
      <p className="bf-sec">Floor log</p>
      <div className="bf-tw">
        <table className="bf-t bf-log bf-pyr-log">
          <thead>
            <tr>
              <th className="bf-r">#</th>
              <th>Floor</th>
              <th className="bf-r">Trainers / wild / items</th>
              <th>Met and found</th>
              <th>Result</th>
              <th aria-label="Edit" />
            </tr>
          </thead>
          <tbody>
            {v.battles.map(row)}
            {retiredOn && (
              <tr data-retired-floor={retiredOn.n}>
                <td className="bf-r bf-mono">{retiredOn.n}</td>
                <td className="bf-nw">{floorLabel(retiredOn.n, v.perSet)}</td>
                <td className="bf-r bf-mono bf-nw">{counts(retiredOn.pyramid)}</td>
                <td>
                  <FloorLists data={data} floor={retiredOn.pyramid} />
                  {retiredOn.note && <span className="bf-cap bf-note">{retiredOn.note}</span>}
                </td>
                <td>Retired</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!v.battles.length && !retiredOn && <p className="bf-cap">No floor closed yet.</p>}
    </section>
  )
}

/** A logged floor reopened: the same strip and entries, its note and Brandon's three, written at every tap. */
function FloorEditor({ data, v, b }: { data: FrontierData; v: RunView; b: Battle }) {
  const edit = editorFor({ kind: 'logged', battleId: b.id })
  const tid = `floor-${b.n}-`
  const f = b.pyramid ?? EMPTY_FLOOR
  const brain = v.brains.get(b.id)
  const reachedTop = !(b.result === 'L' && f.trainers.some((t) => t.result === 'L'))
  const name = data.brains().find((x) => x.facility === 'pyramid')?.name ?? 'The Brain'
  const save = (fn: (x: Battle) => Battle) =>
    trackerDocument.update((d) => editLoggedBattle(d, b.id, fn))
  const areas = ['head', 'strip', ...(brain && reachedTop ? ['brain'] : []), 'entries', 'note']
  return (
    <div
      className="bf-pyr"
      style={{ gridTemplateAreas: areas.map((a) => `'${a}'`).join(' ') }}
      data-layout="floor-edit"
      data-testid={`${tid}editor`}
    >
      <header className="bf-pyr-head" style={{ gridArea: 'head' }} data-layout="pyramid-head">
        <p className="bf-sec">Edit floor {b.n}</p>
        <span className="bf-cap">
          Each change saves at once; the floor stays {b.result === 'W' ? 'cleared' : 'lost'}.
        </span>
      </header>
      <FloorStrip
        data={data}
        v={v}
        n={b.n}
        floor={f}
        category={categoryAt(v.run, v.battles, b.n, v.perSet)}
        edit={edit}
        tid={tid}
      />
      {brain && reachedTop && (
        <div
          className="bf-pyr-brain bf-pyr-brain-edit"
          style={{ gridArea: 'brain' }}
          data-layout="floor-edit-brain"
        >
          <p className="bf-sec" style={{ gridArea: 'title' }}>
            {name} · {brain.symbol === 'silver' ? 'Silver' : 'Gold'} · at the top, after this floor
          </p>
          {[0, 1, 2].map((i) => (
            <SpeciesPicker
              key={i}
              label={`${name}’s Pokémon ${i + 1}`}
              area={`s${i + 1}`}
              value={b.opponents[i]}
              testId={`${tid}brain-${i}`}
              onChange={(id) =>
                save((x) => ({ ...x, opponents: x.opponents.map((o, j) => (j === i ? id : o)) }))
              }
            />
          ))}
        </div>
      )}
      <FloorEntries data={data} floor={f} edit={edit} tid={tid} />
      <label className="bf-field" style={{ gridArea: 'note' }}>
        <span className="bf-cap">Floor note (optional)</span>
        <input
          className="bf-uf"
          placeholder="Anything worth remembering about this floor"
          data-testid={`${tid}note`}
          value={b.note ?? ''}
          onChange={(e) => {
            const text = e.target.value
            save((x) => {
              const next = { ...x }
              if (text) next.note = text
              else delete next.note
              return next
            })
          }}
        />
      </label>
    </div>
  )
}

/* ------------------------------------------------------------------ the run head, home */

const plural = (n: number, one: string, many = `${one}s`) => (
  <>
    <Num n={n} /> {n === 1 ? one : many}
  </>
)

/** "12 floors · 9 trainers · 31 wild defeated · 14 items": the run's totals, the open floor included. */
export function PyramidTotalsLine({ v }: { v: RunView }) {
  const t = pyramidTotals(v)
  return (
    <span className="bf-pyr-totals" data-layout="run-totals" data-testid="run-totals">
      <Joined
        sep=" · "
        items={[
          <Fragment key="f">{plural(t.floors, 'floor')}</Fragment>,
          <Fragment key="t">{plural(t.trainers, 'trainer')}</Fragment>,
          <Fragment key="w">
            <Num n={t.wild} /> wild defeated
          </Fragment>,
          <Fragment key="i">{plural(t.items, 'item')}</Fragment>,
        ]}
      />
    </span>
  )
}

/** Home, once there is a Pyramid run: the top 10 wild species, items and trainers' Pokémon, across runs. */
export function PyramidInsights({ view }: { view: TrackerView }) {
  const top = pyramidInsights(view, { species: speciesName, item: itemName })
  const table = (rows: [number, number][], cell: (id: number) => ReactNode, testId: string) =>
    rows.length ? (
      <table className="bf-t bf-pyr-ins" data-testid={testId}>
        <tbody>
          {rows.map(([id, n]) => (
            <tr key={id} data-id={id}>
              <td>{cell(id)}</td>
              <td className="bf-r bf-mono">{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="bf-cap">Nothing logged yet</p>
    )
  return (
    <section className="bf-three" data-layout="insight-pyramid" data-testid="insight-pyramid">
      <div style={{ gridArea: 'a' }} data-layout="insight-pyramid-wild">
        <p className="bf-sec">Pyramid: wild Pokémon defeated</p>
        {table(
          top.wild,
          (id) => (
            <MonCell speciesId={id} />
          ),
          'insight-pyramid-wild',
        )}
      </div>
      <div style={{ gridArea: 'b' }} data-layout="insight-pyramid-items">
        <p className="bf-sec">Pyramid: items obtained</p>
        {table(
          top.items,
          (id) => (
            <span className="bf-pyr-met">
              <ItemSprite id={id} />
              <span>{itemName(id)}</span>
            </span>
          ),
          'insight-pyramid-items',
        )}
      </div>
      <div style={{ gridArea: 'c' }} data-layout="insight-pyramid-trainers">
        <p className="bf-sec">Pyramid: trainers’ Pokémon seen</p>
        {table(
          top.trainers,
          (id) => (
            <MonCell speciesId={id} />
          ),
          'insight-pyramid-trainers',
        )}
      </div>
    </section>
  )
}
