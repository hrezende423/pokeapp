/**
 * The games a screen can be pinned to, grouped under their generation -- the
 * shape of a "Gen 1 / Red/Blue, Yellow / Gen 2 / ..." picker.
 *
 * The Japanese-only Red/Green and Blue are left out: their data is Red/Blue's,
 * and a list offering both reads as a duplicate.
 */

import { listVersionGroups } from '../../data'
import { versionGroupLabel } from '../pokedex/speciesFacts'

const HIDDEN = new Set(['red-green-japan', 'blue-japan'])

/** "Red/Blue", "HeartGold/SoulSilver", "XD: Gale of Darkness". */
export const gameLabel = (vg: string): string => versionGroupLabel(vg).replace(/ \/ /g, '/')

export interface GameGroup {
  generation: number
  label: string
  options: { value: string; label: string }[]
}

export function gameGroups({
  maxGeneration = 4,
  include = () => true,
}: { maxGeneration?: number; include?: (vg: string) => boolean } = {}): GameGroup[] {
  const groups = new Map<number, GameGroup>()
  const vgs = listVersionGroups()
    .filter((v) => v.generation_id != null && v.generation_id <= maxGeneration)
    .filter((v) => !HIDDEN.has(v.name) && include(v.name))
    .sort((a, b) => (a.generation_id ?? 0) - (b.generation_id ?? 0) || (a.order ?? 0) - (b.order ?? 0))
  for (const v of vgs) {
    const gen = v.generation_id!
    let g = groups.get(gen)
    if (!g) {
      g = { generation: gen, label: `Gen ${gen}`, options: [] }
      groups.set(gen, g)
    }
    g.options.push({ value: v.name, label: gameLabel(v.name) })
  }
  return [...groups.values()]
}

/** The generation a game belongs to, from the same list. */
export function generationOfGame(vg: string): number | null {
  return listVersionGroups().find((v) => v.name === vg)?.generation_id ?? null
}
