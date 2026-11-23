import type { Facility, FacilitySet } from '../../../data/trainers'
import type { Gen4Facility } from './gen4'

/** The Brain's trainer class in the frontier data, per facility. */
const BRAIN_CLASS: Record<Gen4Facility['id'], string> = {
  tower: 'TRAINER_CLASS_TOWER_TYCOON',
  factory: 'TRAINER_CLASS_FACTORY_HEAD',
  hall: 'TRAINER_CLASS_HALL_MATRON',
  castle: 'TRAINER_CLASS_CASTLE_VALET',
  arcade: 'TRAINER_CLASS_ARCADE_STAR',
}

/**
 * The sets each print's trainer draws from, in the data's order; empty = no fixed
 * team. Three sets ARE the team (Palmer, Dahlia). Darach has six, two per
 * Pokémon, and fields three of them: which three is not encoded here (the data's
 * order does not pair them into the two teams Bulbapedia lists), so the screen
 * shows all six rather than invent a pairing.
 */
export interface Gen4BrainTeams {
  silver: FacilitySet[]
  gold: FacilitySet[]
}

/** The Brain's Silver and Gold sets from the facility's own trainers (the first of its class is Silver). */
export function gen4BrainTeams(facility: Facility, id: Gen4Facility['id']): Gen4BrainTeams {
  const sets = new Map(facility.sets.map((s) => [s.key, s]))
  const trainers = facility.trainers.filter((t) => t.class_id === BRAIN_CLASS[id] && t.set_keys)
  const teams = (keys: string[] | undefined) =>
    (keys ?? []).map((k) => sets.get(k)).filter((s): s is FacilitySet => s != null)
  return { silver: teams(trainers[0]?.set_keys), gold: teams(trainers[1]?.set_keys) }
}
