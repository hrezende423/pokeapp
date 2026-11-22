import type { ReactNode } from 'react'
import { Kv, Muted, Num, SpeciesLink } from './parts'
import {
  GEN4_BANNED,
  GEN4_ENTRY,
  GEN4_FACILITIES,
  HGSS_EXTRA_BAN,
  HGSS_FLAG,
  type Gen4Facility,
  type Gen4Game,
} from './reference/gen4'
import { modeFloors, type SpeedFacilityRef } from './reference/speed'
import { useTrainerPartition } from './reference/useTrainerPartition'

/**
 * The Facilities screen beyond Emerald's Frontier: Trainer Hill (Emerald),
 * Trainer Tower (FireRed/LeafGreen) and the Gen 4 Frontier (Platinum, and
 * HeartGold/SoulSilver flagged as reusing Platinum). Same parts and wording as
 * Facilities.tsx: a section per facility (`.bf-fac`), key-value rows (`Kv`), the
 * shared rules last (`.bf-shared`).
 */

/* ------------------------------------------------------------------ Trainer Hill / Tower */

/** "Normal · Variety · Unique · Expert: 4 floors, 8 trainers each", from the Trainer Dex. */
function modesText(ref: SpeedFacilityRef, modes: ReturnType<typeof modeFloors>): ReactNode {
  if (!modes.length) return <Muted>No trainers in the Trainer Dex for the {ref.name}</Muted>
  return modes.map((m, i) => {
    const trainers = m.floors.reduce((n, f) => n + f.trainers.length, 0)
    return (
      <span key={m.mode}>
        {i > 0 && <Muted> · </Muted>}
        {m.mode} <Muted>(</Muted>
        <Num n={m.floors.length} /> <Muted>floors,</Muted> <Num n={trainers} /> <Muted>trainers)</Muted>
      </span>
    )
  })
}

/** A speed facility's section: the static rules, plus its modes and floors from the Trainer Dex. */
export function SpeedFacilitySection({ refData, area }: { refData: SpeedFacilityRef; area?: string }) {
  const load = useTrainerPartition(refData.versionGroup)
  const facility = load.status === 'ready' ? load.partition.facilities.find((f) => f.id === refData.id) : undefined
  const modes =
    load.status === 'ready' ? (
      modesText(refData, facility ? modeFloors(facility) : [])
    ) : load.status === 'error' ? (
      <Muted>Could not load the Trainer Dex: {load.message}</Muted>
    ) : (
      <Muted>Loading…</Muted>
    )
  const rows: [string, ReactNode][] = [
    ['Entry', refData.entry],
    ...refData.facts,
    ['Modes', modes],
    ...refData.reward,
  ]
  return (
    <section
      className="bf-fac"
      data-layout="facility"
      data-facility={refData.id}
      style={area ? { gridArea: area } : undefined}
      aria-label={refData.name}
    >
      <h2 className="bf-name">{refData.name}</h2>
      <p className="bf-rule">{refData.rule}</p>
      <Kv rows={rows} layout="facility-facts" />
    </section>
  )
}

/** FireRed/LeafGreen: the Trainer Tower alone. */
export function TrainerTowerFacilities({ refData }: { refData: SpeedFacilityRef }) {
  return (
    <div className="bf-fac-grid bf-fac-grid-one" data-layout="facility-grid">
      <SpeedFacilitySection refData={refData} area="one" />
    </div>
  )
}

/* ------------------------------------------------------------------ Gen 4 Frontier */

function Gen4Section({ f }: { f: Gen4Facility }) {
  const rows: [string, ReactNode][] = [
    ['Party', f.party],
    ['Challenge', f.challenge],
    ['Level', f.level],
    ['Brain', `${f.brain.title} ${f.brain.name}${f.brainWhen ? ` · ${f.brainWhen}` : ''}`],
    [
      'Silver Print',
      <>
        battle <Num n={f.silver} />
      </>,
    ],
    [
      'Gold Print',
      <>
        battle <Num n={f.gold} />
      </>,
    ],
    ['Brain team', f.brainTeam],
    ...(f.mechanic ? [f.mechanic] : []),
    ...f.bp,
  ]
  return (
    <section className="bf-fac" data-layout="facility" data-facility={f.id} style={{ gridArea: f.id }} aria-label={f.name}>
      <h2 className="bf-name">{f.name}</h2>
      <p className="bf-rule">{f.rule}</p>
      <Kv rows={rows} layout="facility-facts" />
    </section>
  )
}

export function Gen4Facilities({ game }: { game: Gen4Game }) {
  return (
    <div className="bf-fac-grid bf-fac-grid-g4" data-layout="facility-grid" data-game={game}>
      {game === 'heartgold-soulsilver' && (
        <p className="bf-flag" data-layout="frontier-flag" data-testid="frontier-hgss-flag" style={{ gridArea: 'flag' }}>
          {HGSS_FLAG}
        </p>
      )}
      {GEN4_FACILITIES.map((f) => (
        <Gen4Section key={f.id} f={f} />
      ))}
      <section className="bf-shared bf-shared-g4" data-layout="frontier-shared" aria-label="Across the Frontier">
        <h2 className="bf-name" style={{ gridArea: 'title' }}>
          Across the Frontier
        </h2>
        <div style={{ gridArea: 'symbols' }} data-layout="frontier-symbols">
          <p className="bf-sec">Prints</p>
          <div className="bf-tw">
            <table className="bf-t">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Brain</th>
                  <th>Silver</th>
                  <th>Gold</th>
                </tr>
              </thead>
              <tbody>
                {GEN4_FACILITIES.map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td>{f.brain.name}</td>
                    <td>
                      battle <Num n={f.silver} />
                    </td>
                    <td>
                      battle <Num n={f.gold} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ gridArea: 'levels' }} data-layout="frontier-entry">
          <p className="bf-sec">Entry</p>
          <Kv
            rows={[
              ['Opens', GEN4_ENTRY[game]],
              ['Prints', 'Each Brain gives a Silver Print, then a Gold Print, at the battles above'],
            ]}
          />
        </div>
        <div style={{ gridArea: 'banned' }} data-layout="frontier-banned">
          <p className="bf-sec">Banned species ({GEN4_BANNED.length + (game === 'heartgold-soulsilver' ? 1 : 0)})</p>
          <p className="bf-banned">
            {GEN4_BANNED.map((id) => (
              <SpeciesLink key={id} id={id} />
            ))}
            {game === 'heartgold-soulsilver' && <span>{HGSS_EXTRA_BAN}</span>}
          </p>
        </div>
      </section>
    </div>
  )
}
