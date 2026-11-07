/**
 * #14 Similarity finder: the Pokemon most like a given one, in a generation.
 *
 * PURE, AND UI-FREE. The score is a stated formula, printed on the page, with
 * the weights agreed for it (docs/tools/PLAN.md): out of 100,
 *
 *   40 x stat shape     -- cosine similarity of the base stat vectors: the same
 *                          spread at any size reads alike (Pichu and Raichu)
 *   30 x defences       -- how alike the two defensive type charts are, one step
 *                          per tier (x0, x1/4, x1/2, x1, x2, x4) per attacking type
 *   20 x size           -- 1 - |BST a - BST b| / max(BST a, BST b)
 *   10 x shared type    -- the share of the target's types the other one has
 *
 * Everything is read as of the generation: Gen 1 stats have one Special, the type
 * chart is that generation's, and only that generation's species are compared.
 */

import {
  resolveStatsForGeneration,
  resolveTypesForGeneration,
  typeEffectivenessAgainst,
  type Species,
  type Variety,
} from '../../../data'

export const WEIGHTS = { shape: 40, defences: 30, size: 20, types: 10 } as const

export interface Profile {
  speciesId: number
  stats: number[]
  bst: number
  typeIds: number[]
  /** Tier index per attacking type, in the generation's type order. */
  defence: number[]
}

export interface Similarity {
  speciesId: number
  score: number
  parts: { shape: number; defences: number; size: number; types: number }
}

const variety = (s: Species): Variety => s.varieties.find((v) => v.is_default) ?? s.varieties[0]
const TIERS = [0, 0.25, 0.5, 1, 2, 4]
const tierOf = (m: number) => {
  const i = TIERS.indexOf(m)
  return i >= 0 ? i : TIERS.findIndex((t) => t > m)
}

export function profileOf(generation: number, s: Species): Profile {
  const v = variety(s)
  const stats = resolveStatsForGeneration(v, generation).map((x) => x.base_stat)
  const typeIds = resolveTypesForGeneration(v, generation).map((t) => t.type_id)
  return {
    speciesId: s.id,
    stats,
    bst: stats.reduce((a, b) => a + b, 0),
    typeIds,
    defence: typeEffectivenessAgainst(typeIds, generation).map((e) => tierOf(e.multiplier)),
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export function similarity(target: Profile, other: Profile): Similarity {
  const shape = cosine(target.stats, other.stats)
  const steps = target.defence.reduce((sum, t, i) => sum + Math.abs(t - (other.defence[i] ?? t)), 0)
  const defences = 1 - steps / (target.defence.length * (TIERS.length - 1))
  const size = 1 - Math.abs(target.bst - other.bst) / Math.max(target.bst, other.bst, 1)
  const types =
    target.typeIds.filter((t) => other.typeIds.includes(t)).length / target.typeIds.length
  const score =
    WEIGHTS.shape * shape +
    WEIGHTS.defences * defences +
    WEIGHTS.size * size +
    WEIGHTS.types * types
  return { speciesId: other.speciesId, score, parts: { shape, defences, size, types } }
}

/** Every other species in the pool, most similar first (ties by dex number). */
export function mostSimilar(
  generation: number,
  target: Species,
  pool: Species[],
  limit = 20,
): Similarity[] {
  const t = profileOf(generation, target)
  return pool
    .filter((s) => s.id !== target.id)
    .map((s) => similarity(t, profileOf(generation, s)))
    .sort((a, b) => b.score - a.score || a.speciesId - b.speciesId)
    .slice(0, limit)
}
