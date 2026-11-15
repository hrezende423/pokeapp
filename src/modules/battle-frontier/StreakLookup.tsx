import { useState, type ReactNode } from 'react'
import type { FacilityId, FrontierData, FrontierFormat, LevelMode } from './data'
import { battleLabel, FACILITY_ORDER, FORMAT_LABEL, LEVEL_LABEL, loaderStreak } from './format'
import { Appearance, Kv, Num, Range } from './parts'

/**
 * What the Streak lookup opens on. Reusable on purpose: the Challenge Tracker
 * (its own branch) opens it for a log row with that row's values. The fields
 * seed the form once, when it mounts; to open it on another row, give it a new
 * React `key` (the row's id).
 *
 * `streak` is the battles WON so far, counted the way the owner's log counts
 * them, so the battle looked up is `streak + 1` ("streak 49" is battle 50). The
 * Dome's log counts battles too (4 per tournament); the loader's own streak (the
 * Dome's counts tournaments) is derived here, never shown.
 */
export interface StreakLookupInput {
  facility: FacilityId
  levelMode: LevelMode
  streak: number
  /** Default Singles. Frontier Brains appear in Singles only. */
  format?: FrontierFormat
  /** Symbols held at this facility: they decide whether the Brain is due. Default none. */
  symbols?: 0 | 1 | 2
  /** Factory only: the Battle Tower Lv50 streak its IVs read (left blank when absent). */
  towerLv50Streak?: number
}

const DEFAULT_INPUT: StreakLookupInput = { facility: 'tower', levelMode: 'lv50', streak: 0, symbols: 0 }
const SYMBOLS = ['None', 'Silver', 'Silver and Gold'] as const

/** A whole number ≥ min from a field's text, or null. */
const whole = (text: string, min: number): number | null => {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text)
  return Number.isSafeInteger(n) && n >= min ? n : null
}

function Select<T extends string>({
  label,
  area,
  testId,
  value,
  options,
  onChange,
}: {
  label: string
  area: string
  testId: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <label className="bf-field" style={{ gridArea: area }}>
      <span className="bf-cap">{label}</span>
      <select className="bf-uf" data-testid={testId} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function StreakLookup({ data, initial = DEFAULT_INPUT }: { data: FrontierData; initial?: StreakLookupInput }) {
  const [facility, setFacility] = useState<FacilityId>(initial.facility)
  const [format, setFormat] = useState<FrontierFormat>(initial.format ?? 'singles')
  const [levelMode, setLevelMode] = useState<LevelMode>(initial.levelMode)
  const [battleText, setBattleText] = useState(String(initial.streak + 1))
  const [symbols, setSymbols] = useState<0 | 1 | 2>(initial.symbols ?? 0)
  const [towerText, setTowerText] = useState(initial.towerLv50Streak == null ? '' : String(initial.towerLv50Streak))
  const facilities = data.facilities()
  const names = new Map(facilities.map((f) => [f.id, f.name]))
  const formats = facilities.find((f) => f.id === facility)?.formats.map((x) => x.id) ?? ['singles']
  // A format the facility does not have reads as Singles (the Arena has nothing else).
  const fmt: FrontierFormat = formats.includes(format) ? format : 'singles'
  const battle = whole(battleText, 1)
  const tower = facility === 'factory' ? whole(towerText, 0) : null

  return (
    <div className="bf-stack bf-lookup" data-layout="streak-lookup" data-testid="streak-lookup">
      <h2 className="bf-name" style={{ gridArea: 'title' }}>
        Streak lookup
      </h2>
      <p className="bf-cap" style={{ gridArea: 'hint' }}>
        Facility, level mode, the battle you are about to fight, and the symbols you hold here (they decide whether the
        Brain is due).
      </p>
      <form
        className={facility === 'factory' ? 'bf-lookup-form bf-six' : 'bf-lookup-form bf-five'}
        style={{ gridArea: 'form' }}
        data-layout="streak-lookup-form"
        onSubmit={(e) => e.preventDefault()}
      >
        <Select
          label="Facility"
          area="a"
          testId="lookup-facility"
          value={facility}
          options={FACILITY_ORDER.map((id) => ({ value: id, label: names.get(id) ?? id }))}
          onChange={setFacility}
        />
        <Select
          label="Format"
          area="b"
          testId="lookup-format"
          value={fmt}
          options={formats.map((id) => ({ value: id, label: FORMAT_LABEL[id] }))}
          onChange={setFormat}
        />
        <Select
          label="Level"
          area="c"
          testId="lookup-level"
          value={levelMode}
          options={(['lv50', 'open'] as const).map((m) => ({ value: m, label: LEVEL_LABEL[m] }))}
          onChange={setLevelMode}
        />
        <label className="bf-field" style={{ gridArea: 'd' }}>
          <span className="bf-cap">Battle number (as you log it)</span>
          <input
            className="bf-uf bf-num"
            inputMode="numeric"
            data-testid="lookup-battle"
            value={battleText}
            onChange={(e) => setBattleText(e.target.value)}
          />
        </label>
        <Select
          label="Symbols held here"
          area="e"
          testId="lookup-symbols"
          value={String(symbols) as '0' | '1' | '2'}
          options={SYMBOLS.map((l, i) => ({ value: String(i) as '0' | '1' | '2', label: l }))}
          onChange={(v) => setSymbols(Number(v) as 0 | 1 | 2)}
        />
        {facility === 'factory' && (
          <label className="bf-field" style={{ gridArea: 'f' }}>
            <span className="bf-cap">Battle Tower Lv50 streak (Factory IVs read it)</span>
            <input
              className="bf-uf bf-num"
              inputMode="numeric"
              placeholder="Optional"
              data-testid="lookup-tower-streak"
              value={towerText}
              onChange={(e) => setTowerText(e.target.value)}
            />
          </label>
        )}
      </form>
      <div style={{ gridArea: 'result' }} data-layout="streak-lookup-result" data-testid="streak-lookup-result">
        {battle == null ? (
          <p className="bf-cap">Enter the battle number, 1 or more.</p>
        ) : (
          <LookupFacts
            data={data}
            facility={facility}
            format={fmt}
            levelMode={levelMode}
            battle={battle}
            symbols={symbols}
            tower={tower}
          />
        )}
      </div>
    </div>
  )
}

function LookupFacts({
  data,
  facility,
  format,
  levelMode,
  battle,
  symbols,
  tower,
}: {
  data: FrontierData
  facility: FacilityId
  format: FrontierFormat
  levelMode: LevelMode
  battle: number
  symbols: 0 | 1 | 2
  tower: number | null
}) {
  const streak = loaderStreak(facility, battle)
  const pyramid = facility === 'pyramid'
  const pool = data.trainerPoolForStreak({
    facility,
    format,
    levelMode,
    streak,
    // The Pyramid's Brain is not a floor's opponent: he waits at the top AFTER
    // floor 7, when the streak already counts it (below), so the floor's own
    // pool never carries him.
    ...(pyramid ? {} : { symbols }),
    ...(tower != null ? { towerLv50Streak: tower } : {}),
  })
  const trainers = data.trainers()
  const who = data.brains().find((b) => b.facility === facility)
  const band = pool.ivBand

  const ivs: ReactNode =
    band.rule === 'trainer-id' ? (
      (band.byTrainerId ?? []).map((s, i) => (
        <span key={s.from}>
          {i > 0 && ', '}
          <Num n={s.iv} /> for IDs <Range from={s.from} to={s.to} />
        </span>
      ))
    ) : (
      <>
        {band.min === band.max ? <Num n={band.min} /> : <Range from={band.min} to={band.max} />} (Factory table, read
        at your Battle Tower Lv50 streak: {tower == null ? 'not given' : <Num n={tower} />})
      </>
    )

  const draws: ReactNode =
    pool.draws.length > 1
      ? pool.draws.map((d, i) => (
          <span key={i}>
            {i > 0 && '; '}
            {d.count ? (
              <>
                <Num n={d.count} /> from{' '}
              </>
            ) : null}
            <Range from={d.idRange.from} to={d.idRange.to} />
            {d.hard ? ' (Hard)' : ''}: {d.when}
          </span>
        ))
      : null

  const level: ReactNode =
    pool.level.mode === 'lv50' ? (
      <>
        Level <Num n={pool.level.level} />
      </>
    ) : (
      <>
        Your highest level, at least <Num n={pool.level.min} />
      </>
    )

  /* The Pyramid: the floor's streak counts it once cleared, and the top waits after floor 7. */
  const top =
    pyramid && battle % 7 === 0
      ? data.trainerPoolForStreak({ facility, format, levelMode, streak: battle, symbols }).brain
      : undefined
  const due = pyramid ? top : pool.brain
  let brain: ReactNode
  if (format !== 'singles') {
    brain = 'None: Frontier Brains appear in Singles only.'
  } else if (due && who) {
    const sym = due.symbol === 'gold' ? 'Gold' : 'Silver'
    brain =
      facility === 'dome' ? (
        `${who.name} (${sym}) takes one entrant’s place and waits in this tournament’s final.`
      ) : pyramid ? (
        `${who.name} (${sym}) waits at the top, after this floor.`
      ) : (
        <>
          {who.name} ({sym}) is this battle’s opponent
          {who.teamKind === 'generated' ? (
            <>
              , with a generated team at IVs <Num n={who.ivs[due.symbol]} />
            </>
          ) : null}
          ; the trainer pool does not apply.
        </>
      )
  } else {
    // The Pyramid asks from the end of this floor, so a Brain at its top is never "next" once past it.
    const next = data.nextBrainAt({ facility, format, levelMode, streak: pyramid ? battle : streak, symbols })
    brain = next ? (
      <>
        Not this battle. Next: {next.symbol === 'silver' ? 'Silver' : 'Gold'} at <Appearance a={next} />
      </>
    ) : (
      'None in this streak'
    )
  }

  const rows: [string, ReactNode][] = [
    [
      'Battle',
      <>
        <Num n={battle} /> · {battleLabel(facility, battle)}
      </>,
    ],
    [
      'Trainer IDs',
      <>
        <Range from={pool.idRange.from} to={pool.idRange.to} /> ({trainers[pool.idRange.from]?.name} …{' '}
        {trainers[pool.idRange.to]?.name})
      </>,
    ],
    ...(draws ? [['Drawn as', draws] as [string, ReactNode]] : []),
    ['Hard 7th battle', pool.hard ? 'Yes' : 'No'],
    ['IVs', ivs],
    ['Level', level],
    ...(pool.factorySetRange
      ? [
          [
            'Opponent sets',
            <>
              <Range from={pool.factorySetRange.from} to={pool.factorySetRange.to} hash="#" /> (rental range, not the
              trainer’s list)
            </>,
          ] as [string, ReactNode],
        ]
      : []),
    ['Brain', brain],
  ]
  return <Kv rows={rows} />
}
