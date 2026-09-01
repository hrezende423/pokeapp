import { useMemo, useState } from 'react'
import {
  LATEST_GENERATION,
  getGenerationForSpecies,
  listVersionGroups,
  type VersionGroup,
} from '../../data'
import { useVersionGroup } from '../version-group/context'

/**
 * The species page's OWN game scope, for the tabs whose data is per-game.
 *
 * DELIBERATELY NOT THE APP-WIDE SELECTOR. Confirmed decision: on this page the
 * question "which games' moves do I want to see" is being asked about one species,
 * and answering it should not re-filter the whole app. It seeds from the app
 * selection so opening the page shows the era you were already browsing, and then
 * diverges freely.
 *
 * TWO AXES, GENERATION FIRST. The brief asks for a generation selector, and
 * generation is the axis a reader thinks in -- but the data is genuinely
 * per-version-group, and a generation holds up to five of them whose learnsets
 * really do differ (Ruby/Sapphire, Emerald, FireRed/LeafGreen, Colosseum and XD
 * are five different Gen 3 move tables). Merging them into one "Gen 3 learnset"
 * would have to either drop the disagreements or annotate every row with which
 * games it applies to. So generation is the primary control, and the games inside
 * it are a secondary row that only appears when there is more than one to pick --
 * which is exactly the generations where the difference is real. For Gen 2 the
 * second row appears with Gold/Silver and Crystal; for a species' introduction
 * generation with a single group it does not appear at all.
 *
 * Generations before the species existed are not offered: a Gen 4 species has no
 * Gen 1 learnset, and a disabled-looking option that reports "no data" is a worse
 * answer than not offering the era at all.
 */

export interface SpeciesGameScope {
  generation: number
  generations: number[]
  versionGroup: VersionGroup
  /** Groups inside the selected generation. Length 1 hides the secondary row. */
  groupsInGeneration: VersionGroup[]
  setGeneration: (generation: number) => void
  setVersionGroup: (name: string) => void
}

/** Newest group in a generation, by the bundle's own ordering. */
function newest(groups: VersionGroup[]): VersionGroup {
  return groups.reduce((best, g) => ((g.order ?? 0) > (best.order ?? 0) ? g : best), groups[0])
}

export function useSpeciesGameScope(speciesId: number): SpeciesGameScope | null {
  const app = useVersionGroup()

  const byGeneration = useMemo(() => {
    const introduced = getGenerationForSpecies(speciesId) ?? 1
    const map = new Map<number, VersionGroup[]>()
    for (const vg of listVersionGroups()) {
      const gen = vg.generation_id
      if (gen == null || gen < introduced || gen > LATEST_GENERATION) continue
      const list = map.get(gen)
      if (list) list.push(vg)
      else map.set(gen, [vg])
    }
    return map
  }, [speciesId])

  const generations = useMemo(() => [...byGeneration.keys()].sort((a, b) => a - b), [byGeneration])

  /*
    SEEDED FROM THE APP SELECTION, once, on mount. `useState` with an initialiser
    rather than an effect that syncs a prop into state: syncing would fight the
    user every time they picked a different era here, and the page is keyed by
    species so a new species remounts and re-seeds anyway.
  */
  const [seed] = useState(() => {
    const appGroup = app.versionGroup
    if (appGroup?.generation_id != null && byGeneration.has(appGroup.generation_id)) {
      return { generation: appGroup.generation_id, versionGroup: appGroup.name }
    }
    // "All" selected, or an era this species predates: newest era it exists in.
    const fallbackGen = generations[generations.length - 1]
    const groups = byGeneration.get(fallbackGen)
    return {
      generation: fallbackGen,
      versionGroup: groups ? newest(groups).name : null,
    }
  })

  const [generation, setGenerationState] = useState(seed.generation)
  const [groupName, setGroupName] = useState(seed.versionGroup)

  const groupsInGeneration = useMemo(
    () => byGeneration.get(generation) ?? [],
    [byGeneration, generation],
  )

  if (generations.length === 0 || groupsInGeneration.length === 0) return null

  const versionGroup =
    groupsInGeneration.find((g) => g.name === groupName) ?? newest(groupsInGeneration)

  return {
    generation,
    generations,
    versionGroup,
    groupsInGeneration,
    setGeneration: (next: number) => {
      setGenerationState(next)
      // Landing on the newest group of the new generation, not on a name that
      // belongs to the old one -- otherwise the fallback above silently decides.
      const groups = byGeneration.get(next)
      setGroupName(groups ? newest(groups).name : null)
    },
    setVersionGroup: setGroupName,
  }
}
