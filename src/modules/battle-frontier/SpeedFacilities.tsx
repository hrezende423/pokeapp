import { useState, type FormEvent } from 'react'
import { trainerLabel, type FacilityPokemon, type FacilityTrainer } from '../../data/trainers'
import { deepLink } from '../../lib/entities'
import { followLink } from '../../lib/entities/appContext'
import { useNav } from '../nav/navContext'
import { itemName, moveNames, natureName } from './names'
import { SpeedFacilitySection } from './OtherFacilities'
import { Evs, MonCell, Muted, Num } from './parts'
import { modeFloors, type ModeFloors, type SpeedFacilityRef } from './reference/speed'
import { useTrainerPartition } from './reference/useTrainerPartition'
import { dateText, newId, speedModesOf, today, updateSpeedModes } from './tracker/model'
import {
  addAttempt,
  bestOf,
  deleteAttempt,
  formatTime,
  latestOf,
  newestFirst,
  parseTime,
  type SpeedAttempt,
  type SpeedModes,
} from './tracker/speed'
import { trackerDocument } from './tracker/trackerStore'
import './tracker/tracker.css'

/**
 * Trainer Hill & Tower: Emerald's Trainer Hill or FireRed/LeafGreen's Trainer
 * Tower, a speed climb rather than a streak. The facility's rules (the
 * Facilities section, reused), your record per mode, then one mode at a time
 * (a view tab: the screen's second accent, the nav tab is the first): its log
 * and its floors, each trainer with the FIXED team the Trainer Dex holds.
 *
 * The modes, floors and teams are the Trainer Dex partition's own facility
 * (`modeFloors`); the record lives in the Challenge Tracker's document
 * (`games`, tracker/speed.ts), so it syncs and exports with it.
 */

const slug = (mode: string) => mode.toLowerCase().replace(/[^a-z0-9]+/g, '-')

export function SpeedFacilityView({ refData }: { refData: SpeedFacilityRef }) {
  const load = useTrainerPartition(refData.versionGroup)
  const facility = load.status === 'ready' ? load.partition.facilities.find((f) => f.id === refData.id) : undefined
  const modes = facility ? modeFloors(facility) : []
  const doc = trackerDocument.useDocument()
  const logs = speedModesOf(doc, refData.id)
  const [picked, setPicked] = useState<string | null>(null)
  const current = modes.find((m) => m.mode === picked) ?? modes[0]
  return (
    <div className="bf-speed" data-layout="speed" data-facility={refData.id}>
      <SpeedFacilitySection refData={refData} area="facts" />
      {load.status === 'loading' && (
        <p className="bf-notice" style={{ gridArea: 'modes' }}>
          Loading the Trainer Dex…
        </p>
      )}
      {load.status === 'error' && (
        <p className="bf-notice" role="alert" style={{ gridArea: 'modes' }}>
          Could not load the Trainer Dex: {load.message}.{' '}
          <button type="button" className="bf-link" onClick={load.retry}>
            Try again
          </button>
        </p>
      )}
      {load.status === 'ready' && !current && (
        <p className="bf-notice" style={{ gridArea: 'modes' }}>
          No trainers in the Trainer Dex for the {refData.name}.
        </p>
      )}
      {current && (
        <>
          <Record modes={modes} logs={logs} />
          <div className="bf-stack bf-speed-mode" data-layout="speed-mode" data-mode={current.mode} style={{ gridArea: 'modes' }}>
            <div className="bf-vtabs" role="tablist" data-layout="speed-views" style={{ gridArea: 'views' }}>
              {modes.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  role="tab"
                  aria-selected={m === current}
                  data-testid={`speed-mode-${slug(m.mode)}`}
                  onClick={() => setPicked(m.mode)}
                >
                  {m.mode}
                </button>
              ))}
            </div>
            <ModeLog key={current.mode} refData={refData} mode={current} attempts={logs[current.mode]?.attempts ?? []} />
            <Floors refData={refData} mode={current} />
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ the record */

function BestText({ attempts, floors }: { attempts: SpeedAttempt[]; floors: number }) {
  const best = bestOf(attempts, floors)
  if (!best) return <Muted>No attempt yet</Muted>
  if (best.kind === 'furthest') {
    return (
      <>
        Furthest: floor <Num n={best.floors} />
      </>
    )
  }
  return (
    <>
      <span className="bf-mono">{formatTime(best.attempt.timeCs)}</span> <Muted>· {dateText(best.attempt.at)}</Muted>
    </>
  )
}

function CurrentText({ attempts, floors }: { attempts: SpeedAttempt[]; floors: number }) {
  const last = latestOf(attempts)
  if (!last) return <Muted>—</Muted>
  return (
    <>
      <Num n={last.floors} /> of <Num n={floors} /> floors · <span className="bf-mono">{formatTime(last.timeCs)}</span>{' '}
      <Muted>· {dateText(last.at)}</Muted>
    </>
  )
}

/** Every mode's best clear and current run, at a glance. */
function Record({ modes, logs }: { modes: ModeFloors[]; logs: SpeedModes }) {
  return (
    <section className="bf-speed-record" data-layout="speed-record" style={{ gridArea: 'record' }} aria-label="Your record">
      <p className="bf-sec">Your record</p>
      <div className="bf-tw">
        <table className="bf-t" data-testid="speed-record">
          <thead>
            <tr>
              <th>Mode</th>
              <th>Best clear</th>
              <th>Current run</th>
            </tr>
          </thead>
          <tbody>
            {modes.map((m) => {
              const attempts = logs[m.mode]?.attempts ?? []
              return (
                <tr key={m.mode} data-testid={`speed-record-${slug(m.mode)}`}>
                  <td>{m.mode}</td>
                  <td data-testid="speed-best">
                    <BestText attempts={attempts} floors={m.floors.length} />
                  </td>
                  <td data-testid="speed-current">
                    <CurrentText attempts={attempts} floors={m.floors.length} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ one mode's log */

function ModeLog({ refData, mode, attempts }: { refData: SpeedFacilityRef; mode: ModeFloors; attempts: SpeedAttempt[] }) {
  const n = mode.floors.length
  const [floors, setFloors] = useState(String(n))
  const [time, setTime] = useState('')
  const [at, setAt] = useState(today())
  const [error, setError] = useState<string | null>(null)
  const save = (e: FormEvent) => {
    e.preventDefault()
    const f = /^\d+$/.test(floors.trim()) ? Number(floors.trim()) : NaN
    if (!(f >= 0 && f <= n)) return setError(`Floors cleared: a whole number from 0 to ${n}.`)
    const t = parseTime(time)
    if ('error' in t) return setError(t.error)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) return setError('Pick the date of the attempt.')
    const attempt: SpeedAttempt = { id: newId('spd'), at, floors: f, timeCs: t.cs }
    trackerDocument.update((d) => updateSpeedModes(d, refData.id, (m) => addAttempt(m, mode.mode, attempt)))
    setError(null)
    setTime('')
  }
  const remove = (id: string) =>
    trackerDocument.update((d) => updateSpeedModes(d, refData.id, (m) => deleteAttempt(m, mode.mode, id)))
  return (
    <section className="bf-speed-log" data-layout="speed-log" style={{ gridArea: 'log' }} aria-label={`${mode.mode} attempts`}>
      <form className="bf-speed-form" data-layout="speed-form" onSubmit={save} noValidate>
        <label className="bf-field" style={{ gridArea: 'floors' }}>
          <span className="bf-cap">Floors cleared (of {n})</span>
          <input
            className="bf-uf bf-num"
            inputMode="numeric"
            data-testid="speed-floors"
            value={floors}
            onChange={(e) => setFloors(e.target.value)}
          />
        </label>
        <label className="bf-field" style={{ gridArea: 'time' }}>
          <span className="bf-cap">Time (mm:ss.cs)</span>
          <input
            className="bf-uf bf-num"
            placeholder="12:03.45"
            data-testid="speed-time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <label className="bf-field" style={{ gridArea: 'date' }}>
          <span className="bf-cap">Date</span>
          <input className="bf-uf" type="date" data-testid="speed-date" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <div className="bf-actions" style={{ gridArea: 'act' }}>
          <button type="submit" className="bf-ghost" data-testid="speed-log-attempt">
            Log attempt
          </button>
        </div>
        {error && (
          <p className="bf-cap" role="alert" data-testid="speed-error" style={{ gridArea: 'msg' }}>
            {error}
          </p>
        )}
      </form>
      {attempts.length > 0 && (
        <div className="bf-tw">
          <table className="bf-t" data-testid="speed-attempts">
            <thead>
              <tr>
                <th>Date</th>
                <th className="bf-r">Floors</th>
                <th className="bf-r">Time</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {newestFirst(attempts).map((a) => (
                <tr key={a.id} data-attempt-id={a.id}>
                  <td className="bf-nw">{dateText(a.at)}</td>
                  <td className="bf-r bf-mono">
                    {a.floors} / {n}
                  </td>
                  <td className="bf-r bf-mono">{formatTime(a.timeCs)}</td>
                  <td className="bf-r">
                    <button type="button" className="bf-ghost bf-speed-delete" onClick={() => remove(a.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ floors and teams */

function Floors({ refData, mode }: { refData: SpeedFacilityRef; mode: ModeFloors }) {
  return (
    <div className="bf-speed-floors" data-layout="speed-floors" style={{ gridArea: 'floors' }}>
      {mode.floors.map((f) => (
        <section key={f.floor} className="bf-speed-floor" data-layout="speed-floor" data-floor={f.floor} aria-label={`Floor ${f.floor}`}>
          <p className="bf-sec">Floor {f.floor}</p>
          {f.trainers.map((t) => (
            <Trainer key={t.key} t={t} versionGroup={refData.versionGroup} />
          ))}
        </section>
      ))}
    </div>
  )
}

/**
 * A trainer and the team they always field. The link opens the Trainer Dex
 * PAGE only: the entity engine cannot open a Trainer Dex entry (deepLink's
 * `trainer` is page-only, src/lib/entities/engine.ts).
 */
function Trainer({ t, versionGroup }: { t: FacilityTrainer; versionGroup: string }) {
  const nav = useNav()
  const name = trainerLabel(t.class_name ?? 'Trainer', t.name)
  const target = deepLink({ kind: 'trainer', game: versionGroup, id: t.key.replace(/[^A-Za-z0-9_]/g, '_') })
  return (
    <div className="bf-speed-trainer" data-layout="speed-trainer" data-trainer-key={t.key}>
      <header className="bf-speed-trainer-head">
        <span style={{ gridArea: 'name' }} data-testid="speed-trainer-name">
          {name}
        </span>
        {target && (
          <button
            type="button"
            className="bf-link bf-muted"
            style={{ gridArea: 'link' }}
            title="Opens the Trainer Dex"
            data-testid="speed-trainer-dex"
            onClick={() => followLink(target, nav)}
          >
            Trainer Dex
          </button>
        )}
      </header>
      {t.party?.length ? (
        <PartyTable party={t.party} versionGroup={versionGroup} />
      ) : (
        <Muted>No fixed team in the Trainer Dex</Muted>
      )}
    </div>
  )
}

/** The Brains' team table (Brains.tsx), with the game's own sprites. */
function PartyTable({ party, versionGroup }: { party: FacilityPokemon[]; versionGroup: string }) {
  return (
    <div className="bf-tw">
      <table className="bf-t bf-team" data-layout="speed-team">
        <colgroup>
          <col style={{ width: '18%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '26%' }} />
          <col style={{ width: '32%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Pokémon</th>
            <th>Item</th>
            <th>Nature</th>
            <th>EVs</th>
            <th>Moves</th>
          </tr>
        </thead>
        <tbody>
          {party.map((m, i) => (
            <tr key={i} data-species-id={m.species_id}>
              <td className="bf-nw">
                <MonCell speciesId={m.species_id} pokemonId={m.pokemon_id} versionGroup={versionGroup} />
              </td>
              <td className="bf-nw">{itemName(m.item_id)}</td>
              <td>{natureName(m.nature_id)}</td>
              <td>
                <Evs evs={m.evs} />
              </td>
              <td>{moveNames(m.moves)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
