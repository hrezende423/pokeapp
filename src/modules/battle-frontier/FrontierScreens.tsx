import { Brains } from './Brains'
import { Facilities } from './Facilities'
import { Gen4Brains } from './Gen4Brains'
import { Gen4Facilities, TrainerTowerFacilities } from './OtherFacilities'
import { FrontierShell } from './parts'
import { SetsTrainers } from './SetsTrainers'
import { SpeedFacilityView } from './SpeedFacilities'
import { speedNotice } from './reference/games'
import { TRAINER_HILL, TRAINER_TOWER } from './reference/speed'
import './frontier.css'

/**
 * The Battle Frontier tab's three read-only reference screens (the lazy chunk's
 * entry; see pages.ts). Each is the shell plus its body: under any generation but
 * Gen 3 the shell shows the one notice and the loader fetches nothing.
 */

export function FacilitiesPage() {
  return (
    <FrontierShell
      page="facilities"
      title="Facilities"
      other={(game) =>
        game === 'firered-leafgreen' ? (
          <TrainerTowerFacilities refData={TRAINER_TOWER} />
        ) : game === 'emerald' ? null : (
          <Gen4Facilities game={game} />
        )
      }
    >
      {(data) => <Facilities data={data} />}
    </FrontierShell>
  )
}

export function BrainsPage() {
  return (
    <FrontierShell
      page="brains"
      title="Brains"
      other={(game) => (game === 'platinum' || game === 'heartgold-soulsilver' ? <Gen4Brains game={game} /> : null)}
    >
      {(data) => <Brains data={data} />}
    </FrontierShell>
  )
}

export function SetsTrainersPage() {
  return (
    <FrontierShell page="sets" title="Sets & Trainers">
      {(data) => <SetsTrainers data={data} />}
    </FrontierShell>
  )
}

/**
 * Trainer Hill & Tower: Emerald's Trainer Hill, FireRed/LeafGreen's Trainer
 * Tower, from the Trainer Dex partition (never the Frontier loader); any other
 * game gets its notice.
 */
export function SpeedPage() {
  return (
    <FrontierShell
      page="speed"
      title="Trainer Hill & Tower"
      gameText={speedNotice}
      anyGame={(game) =>
        game === 'emerald' ? (
          <SpeedFacilityView key="hill" refData={TRAINER_HILL} />
        ) : game === 'firered-leafgreen' ? (
          <SpeedFacilityView key="tower" refData={TRAINER_TOWER} />
        ) : null
      }
    />
  )
}
