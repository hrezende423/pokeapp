import { useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { TextField } from '../../../components/ds/TextField'
import { typesInGeneration } from '../../../data'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import {
  HINTS,
  LUCY_HEAL_COUNTS,
  ROOMS,
  ROOM_HINT,
  STATUSES,
  STATUS_IMMUNE_TYPES,
  STATUS_SOURCE,
  hallwayStreakProblem,
  hintCategoryOdds,
  hintOdds,
  lucyFight,
  nextLucy,
  otherDoorOddsByHint,
  placeOf,
  stateProblem,
  statusOdds,
  statusTargets,
  unhintedDoorOdds,
  type PikeHint,
  type PikeRoom,
  type PikeSlot,
  type PikeState,
  type PikeStatus,
} from './pikeMath'

const TOOL = findTool('24')!

const ROOM_LABEL: Record<PikeRoom, string> = {
  single: 'Single battle',
  'heal-full': 'Full heal',
  npc: 'A person, no battle',
  status: 'Status attack',
  'heal-part': 'Heal one or two',
  wild: 'Wild Pokémon',
  hard: 'Hard battle',
  double: 'Double battle',
}
const HINT_LABEL: Record<PikeHint, string> = {
  people: 'People',
  whispering: 'Whispering',
  nostalgia: 'Nostalgia',
  pokemon: 'Pokémon',
}
const STATUS_LABEL: Record<PikeStatus, string> = {
  toxic: 'Toxic',
  freeze: 'Freeze',
  paralysis: 'Paralysis',
  sleep: 'Sleep',
  burn: 'Burn',
}
const SYMBOL_LABEL = ['No symbol', 'Silver Symbol', 'Gold Symbol'] as const
const DOOR_GROUPS = [
  { doors: '1–2', door: 1 },
  { doors: '3–4', door: 3 },
  { doors: '5–7', door: 5 },
] as const

type Condition = 'healthy' | 'status' | 'fainted'
interface SlotDraft {
  condition: Condition
  type1: string
  type2: string
}

/**
 * Battle Pike room odds: at a hallway the hint lady names one door's hint; the
 * page gives what each door can hold, when Lucy waits, and what the status room
 * does -- all from the game's own room routine.
 */
export function PikeTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!} gamePicker>
      {({ game }) => (game ? <PikeBody /> : null)}
    </ToolShell>
  )
}

const pct = (p: number) => `${(p * 100).toFixed((p * 100) % 1 === 0 ? 0 : 1)}%`

function PikeBody() {
  const types = typesInGeneration(3)
  const [healingOff, setHealingOff] = useState(true)
  const [slots, setSlots] = useState<SlotDraft[]>(() =>
    [0, 1, 2].map(() => ({ condition: 'healthy', type1: '', type2: '' })),
  )
  const [streakText, setStreakText] = useState('0')
  const [symbols, setSymbols] = useState(0)

  const state: PikeState = {
    healingDisabled: healingOff,
    aliveCount: slots.filter((s) => s.condition !== 'fainted').length,
    anyHealthy: slots.some((s) => s.condition === 'healthy'),
  }
  const party: PikeSlot[] = slots.map((s) => ({
    healthy: s.condition === 'healthy',
    types: [s.type1, s.type2].filter(Boolean),
  }))
  const streak = streakText.trim() === '' ? NaN : Number(streakText)

  const reason =
    state.aliveCount === 0
      ? 'All three have fainted: the challenge is over.'
      : (stateProblem(state) ?? hallwayStreakProblem(streak))
  const lucy = reason ? null : lucyFight(streak, symbols)
  const here = reason ? null : placeOf(streak)
  const next = reason ? null : nextLucy(streak, symbols)

  const setSlot = (i: number, patch: Partial<SlotDraft>) =>
    setSlots((ss) => ss.map((s, k) => (k === i ? { ...s, ...patch } : s)))
  const typeOptions = [
    { value: '', label: '—' },
    ...types.map((t) => ({ value: t.name, label: t.display_name })),
  ]

  return (
    <>
      <ToolInputs>
        <SelectField
          label="Healing rooms"
          options={[
            {
              value: 'off',
              label: 'Off: first hallway, or party fully healed when you left the last room',
            },
            { value: 'on', label: 'On: someone is hurt, has a status or is missing PP' },
          ]}
          value={healingOff ? 'off' : 'on'}
          data-testid="pike-healing"
          onChange={(e) => setHealingOff(e.target.value === 'off')}
        />
        {slots.map((s, i) => (
          <div className="calc-row" key={i}>
            <SelectField
              label={`Pokémon ${i + 1}`}
              options={[
                { value: 'healthy', label: 'Able, no status' },
                { value: 'status', label: 'Able, has a status' },
                { value: 'fainted', label: 'Fainted' },
              ]}
              value={s.condition}
              data-testid={`pike-slot-${i + 1}`}
              onChange={(e) => setSlot(i, { condition: e.target.value as Condition })}
            />
            <SelectField
              label="Type"
              options={typeOptions}
              value={s.type1}
              data-testid={`pike-slot-${i + 1}-type1`}
              onChange={(e) => setSlot(i, { type1: e.target.value })}
            />
            <SelectField
              label="Second type"
              options={typeOptions}
              value={s.type2}
              data-testid={`pike-slot-${i + 1}-type2`}
              onChange={(e) => setSlot(i, { type2: e.target.value })}
            />
          </div>
        ))}
        <div className="calc-row">
          <TextField
            label="Win streak at this hallway"
            type="number"
            min={0}
            step={2}
            value={streakText}
            data-testid="pike-streak"
            onChange={(e) => setStreakText(e.target.value)}
          />
          <SelectField
            label="Pike symbols held"
            options={SYMBOL_LABEL.map((l, n) => ({ value: String(n), label: l }))}
            value={String(symbols)}
            data-testid="pike-symbols"
            onChange={(e) => setSymbols(Number(e.target.value))}
          />
        </div>
        <p className="calc-result-note">
          Party in the game’s order. Types matter only to the status room. The streak counts two per
          door choice (the hallway and the room), fourteen per challenge: challenge 2, door 7 is 26.
        </p>
      </ToolInputs>
      <ToolResult reason={reason}>
        {here && (
          <>
            <p className="calc-result-note" data-testid="pike-place">
              Streak {here.streak}: challenge {here.challenge}, door choice {here.door} of 7 (room{' '}
              {here.room}).
            </p>
            {lucy ? (
              <LucyHere fight={lucy} />
            ) : (
              <>
                <HintedTable state={state} />
                <OtherTable state={state} />
              </>
            )}
            {!lucy && (
              <p className="calc-result-note" data-testid="pike-next-lucy">
                {next
                  ? `Lucy next: streak ${next.streak} — challenge ${next.challenge}, door choice ${next.door} (room ${next.room}).`
                  : symbols === 0
                    ? 'With no symbol Lucy waits only at room 28 (challenge 2, door 7): a streak past it means you beat her and hold the Silver Symbol.'
                    : 'With the Silver Symbol Lucy waits only at room 140 (challenge 10, door 7): a streak past it means you beat her and hold the Gold Symbol.'}
              </p>
            )}
            <StatusTable party={party} anyHealthy={state.anyHealthy} />
            <Rules />
          </>
        )}
      </ToolResult>
    </>
  )
}

function LucyHere({ fight }: { fight: 'silver' | 'gold' | 'rematch' }) {
  return (
    <section className="calc-section" data-testid="pike-lucy" data-fight={fight}>
      <h2 className="calc-section-heading">Lucy</h2>
      <p className="tool-reason">
        Lucy is behind every door (
        {fight === 'silver'
          ? 'the Silver Symbol battle'
          : fight === 'gold'
            ? 'the Gold Symbol battle'
            : 'a rematch'}
        ).
      </p>
      <p className="calc-result-note">
        Before her, each door heals {LUCY_HEAL_COUNTS.join(', ')} of your Pokémon — one third each,
        a different number behind each door.
      </p>
    </section>
  )
}

function HintedTable({ state }: { state: PikeState }) {
  const odds = hintOdds(state)
  const byHint = hintCategoryOdds(state)
  return (
    <section className="calc-section">
      <h2 className="calc-section-heading">Behind the hinted door</h2>
      <div className="tools-compare-scroll">
        <table className="tools-compare" data-testid="pike-hinted">
          <thead>
            <tr>
              <th scope="col">Hint · room</th>
              <th scope="col">Chance</th>
              <th scope="col">Given the hint</th>
            </tr>
          </thead>
          <tbody>
            {HINTS.map((h) => (
              <HintRows key={h} hint={h} total={byHint[h]} odds={odds} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function HintRows({
  hint,
  total,
  odds,
}: {
  hint: PikeHint
  total: number
  odds: Record<PikeRoom, number>
}) {
  return (
    <>
      <tr data-testid={`pike-hint-${hint}`}>
        <th scope="row">{HINT_LABEL[hint]}</th>
        <td className="num" data-p={total}>
          {pct(total)}
        </td>
        <td />
      </tr>
      {ROOMS.filter((r) => ROOM_HINT[r] === hint).map((r) => (
        <tr key={r} data-testid={`pike-hinted-${r}`}>
          <th scope="row">
            <span className="tools-blurb">{ROOM_LABEL[r]}</span>
          </th>
          <td className="num" data-p={odds[r]}>
            {pct(odds[r])}
          </td>
          <td className="num" data-p={total ? odds[r] / total : 0}>
            {total ? pct(odds[r] / total) : 'never hinted'}
          </td>
        </tr>
      ))}
    </>
  )
}

function OtherTable({ state }: { state: PikeState }) {
  const cols = HINTS.map((h) => ({
    key: h,
    label: HINT_LABEL[h],
    odds: otherDoorOddsByHint(h, state),
  }))
  const any = unhintedDoorOdds(state)
  return (
    <section className="calc-section">
      <h2 className="calc-section-heading">Behind either other door, by the hint heard</h2>
      <div className="tools-compare-scroll">
        <table className="tools-compare" data-testid="pike-other">
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
              <th scope="col">Not known</th>
            </tr>
          </thead>
          <tbody>
            {ROOMS.map((r) => (
              <tr key={r} data-testid={`pike-other-${r}`}>
                <th scope="row">{ROOM_LABEL[r]}</th>
                {cols.map((c) => (
                  <td key={c.key} className="num" data-p={c.odds[r]}>
                    {pct(c.odds[r])}
                  </td>
                ))}
                <td className="num" data-p={any[r]} data-testid={`pike-any-${r}`}>
                  {pct(any[r])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function StatusTable({ party, anyHealthy }: { party: PikeSlot[]; anyHealthy: boolean }) {
  const cols = DOOR_GROUPS.map((g) => ({
    ...g,
    targets: statusTargets(g.door),
    odds: statusOdds(party, statusTargets(g.door)),
  }))
  return (
    <section className="calc-section" data-testid="pike-status">
      <h2 className="calc-section-heading">The status room</h2>
      {!anyHealthy || cols.some((c) => !c.odds) ? (
        <p className="tool-reason">
          No Pokémon is free of a status, so the status room cannot come up.
        </p>
      ) : (
        <div className="tools-compare-scroll">
          <table className="tools-compare">
            <thead>
              <tr>
                <th />
                <th scope="col">By, with</th>
                {cols.map((c) => (
                  <th key={c.doors} scope="col">
                    Doors {c.doors} · hits {c.targets}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STATUSES.map((st) => (
                <tr key={st} data-testid={`pike-status-${st}`}>
                  <th scope="row">{STATUS_LABEL[st]}</th>
                  <td>
                    {STATUS_SOURCE[st].by}, {STATUS_SOURCE[st].move}
                  </td>
                  {cols.map((c) => (
                    <td key={c.doors} className="num" data-p={c.odds![st]}>
                      {pct(c.odds![st])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const immune = (st: PikeStatus) =>
  STATUS_IMMUNE_TYPES[st].length
    ? STATUS_IMMUNE_TYPES[st].map((t) => t[0].toUpperCase() + t.slice(1)).join(' or ')
    : 'nothing'

function Rules() {
  const rules = [
    'The hint lady names one of the three doors, at random, and a hint for it: People (single battle, full heal), Whispering (a person, double battle), Nostalgia (status attack, heal one or two), Pokémon (wild Pokémon, hard battle).',
    'Healing rooms are off in the first hallway and whenever the party left the last room fully healed (HP, status and PP).',
    'With healing off the lady’s list is Single, Person, Status, Wild and two unfilled places that read as Single: Single battle is hinted half the time; Hard and Double battles never are.',
    'With healing on, all eight rooms are equally likely to be hinted.',
    'A Status hint with no Pokémon free of a status, or a Double hint with fewer than two able to battle, becomes a person instead.',
    'Either other door is any room not in the hint’s category, equally likely, without Double (fewer than two able), Status (none free of a status) and the heals (healing off).',
    'Lucy waits behind every door at streak 26 with no symbol, 138 with the Silver Symbol; with both, at 26, 138, then every 56 from 194.',
    'The status room hits the first 1, 2 or 3 Pokémon free of a status in a shuffled party order (doors 1–2, 3–4, 5–7).',
    `It rolls Toxic 35, Freeze 25, Paralysis 20, Sleep 10, Burn 10 out of 100, and rolls again if every target’s type blocks it: Toxic by ${immune('toxic')}, Freeze by ${immune('freeze')}, Paralysis by ${immune('paralysis')}, Burn by ${immune('burn')}, Sleep by ${immune('sleep')}.`,
    'An ability that blocks the status (Immunity, Limber, Insomnia…) stops it on that Pokémon only; it never causes a reroll.',
  ]
  return (
    <section className="calc-section" data-testid="pike-rules">
      <h2 className="calc-section-heading">How the game decides</h2>
      {rules.map((r) => (
        <p key={r} className="calc-result-note">
          {r}
        </p>
      ))}
    </section>
  )
}
