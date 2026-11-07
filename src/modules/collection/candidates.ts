/**
 * Which of the reader's Builds a Collection entry could BE (docs/SPEC.md slice C,
 * "Candidate flags"). Computed on every read, never stored, same generation only.
 *
 *   Fits:  same species; gender, nature and ability agree wherever the Build
 *          sets them and the generation has them. A Build field left empty
 *          matches anything.
 *   Exact: Fits, plus every editable IV / DV equal. An IV or DV the entry does
 *          not record is UNKNOWN, not 0, so an entry missing one is never Exact
 *          -- which is why a migrated v1 entry (no IVs at all) never is. The
 *          Build side reads an unset value as 0, as the Build Form does.
 *
 * GENDER BY ERA: none in Gen 1, so skipped; Gen 2 compares what `buildGender`
 * derives for each side from its Attack DV (the entry through `entryToBuild`);
 * Gen 3-4 only when the Build stores one.
 */

import { getSpecies, type Species } from '../../data'
import { buildGender, buildLabel } from '../team-builder/buildFacts'
import { spreadStatKeys, type Build, type CollectionEntry } from '../team-builder/model'
import { entryToBuild } from './collectionSchema'

export type Candidate = 'exact' | 'fits' | null

export function candidate(
  entry: CollectionEntry,
  build: Build,
  species: Pick<Species, 'gender_rate'> | null | undefined = getSpecies(entry.speciesId),
): Candidate {
  if (entry.generation !== build.generation || entry.speciesId !== build.speciesId) return null
  const gen = entry.generation
  if (gen === 2 && buildGender(entryToBuild(entry), species) !== buildGender(build, species)) {
    return null
  }
  if (gen >= 3) {
    if (build.gender != null && entry.gender !== build.gender) return null
    if (build.natureId != null && entry.natureId !== build.natureId) return null
    if (build.abilityId != null && entry.abilityId !== build.abilityId) return null
  }
  const exact = spreadStatKeys(gen).every(
    (key) => entry.individual[key] != null && entry.individual[key] === (build.individual[key] ?? 0),
  )
  return exact ? 'exact' : 'fits'
}

export interface BestCandidate {
  kind: 'exact' | 'fits'
  build: Build
}

/**
 * The one Build an entry is shown against: its own target Build when that one
 * fits at all, else the first Exact, else the first Fits, in library order.
 */
export function bestCandidate(entry: CollectionEntry, builds: Build[]): BestCandidate | null {
  const species = getSpecies(entry.speciesId)
  const target = entry.buildId ? builds.find((b) => b.id === entry.buildId) : undefined
  if (target) {
    const kind = candidate(entry, target, species)
    if (kind) return { kind, build: target }
  }
  let fits: BestCandidate | null = null
  for (const build of builds) {
    const kind = candidate(entry, build, species)
    if (kind === 'exact') return { kind, build }
    if (kind === 'fits' && !fits) fits = { kind, build }
  }
  return fits
}

/** "Exact: Sandstorm Sweeper", "Fits: Dragon Dancer", or "No build". Text, never a badge. */
export function candidateText(best: BestCandidate | null): string {
  if (!best) return 'No build'
  const label = buildLabel(best.build, getSpecies(best.build.speciesId))
  return `${best.kind === 'exact' ? 'Exact' : 'Fits'}: ${label}`
}
