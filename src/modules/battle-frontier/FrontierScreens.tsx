import { Brains } from './Brains'
import { Facilities } from './Facilities'
import { Gen4Facilities, TrainerTowerFacilities } from './OtherFacilities'
import { FrontierShell } from './parts'
import { SetsTrainers } from './SetsTrainers'
import { TRAINER_TOWER } from './reference/speed'
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
    <FrontierShell page="brains" title="Brains">
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
