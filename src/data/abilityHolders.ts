/**
 * Reverse lookup: which species have a given ability, in a given generation.
 *
 * This is a join over species.json's ability references, not new data. It
 * deliberately goes through `resolveAbilitiesForGeneration` rather than reading
 * `variety.abilities` directly, so the answer agrees with what the species detail
 * view shows for the same selection. Reading the raw slots would list Gen 5
 * hidden abilities under a Gen 4 game and would ignore `past_abilities`, i.e. it
 * would contradict the species page for the same ability.
 *
 * Alternate forms are scanned too (Rotom's appliance forms, Deoxys, Wormadam's
 * cloaks), because a form can carry an ability the default form does not. Results
 * are deduplicated per species, keeping the lowest slot, so a species appears once.
 */

import { resolveAbilitiesForGeneration } from './era'
import { isSpeciesInGeneration } from './generations'
import { listSpecies } from './loader'
import type { Species } from './types'

export interface AbilityHolder {
  species: Species
  /** Lowest slot the ability occupies on any form of this species. */
  slot: number
  /** True only when every form that has it has it as a hidden ability. */
  is_hidden: boolean
  /** Non-default form names that carry it, when the default form does not. */
  forms: string[]
}

/**
 * Species that had `abilityId` in `generation`, in national dex order.
 *
 * Species introduced after the selected generation are excluded, so a Gen 3
 * selection cannot list Leafeon among Chlorophyll's carriers.
 */
export function speciesWithAbility(abilityId: number, generation: number): AbilityHolder[] {
  const holders: AbilityHolder[] = []

  for (const species of listSpecies()) {
    if (!isSpeciesInGeneration(species.id, generation)) continue

    let slot: number | null = null
    let allHidden = true
    let defaultHasIt = false
    const forms: string[] = []

    for (const variety of species.varieties) {
      const match = resolveAbilitiesForGeneration(variety, generation).find(
        (a) => a.ability.id === abilityId,
      )
      if (!match) continue
      if (slot == null || match.slot < slot) slot = match.slot
      if (!match.is_hidden) allHidden = false
      if (variety.is_default) defaultHasIt = true
      else forms.push(variety.name)
    }

    if (slot == null) continue
    holders.push({
      species,
      slot,
      is_hidden: allHidden,
      forms: defaultHasIt ? [] : forms,
    })
  }

  return holders
}
