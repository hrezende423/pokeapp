/**
 * #13 Compare Pokémon: two or more species side by side, every field read AS OF
 * the app's generation.
 *
 * PURE, AND UI-FREE. Every era-sensitive field goes through the data layer's
 * resolvers (types, abilities, base stats -- era.ts), never the raw record, so
 * Gen 1 shows one Special, Clefairy is Normal before Gen 6, and abilities and
 * hidden abilities only appear where they existed. Fields a generation did not
 * have (abilities before Gen 3, eggs and gender before Gen 2, EV yield before
 * Gen 3) are left out, not shown blank.
 */

import {
  genderRatio,
  getEggGroup,
  getType,
  resolveAbilitiesForGeneration,
  resolveStatsForGeneration,
  resolveTypesForGeneration,
  type Species,
  type Variety,
} from '../../../data'
import { evYield, hatchSteps, statTotal, titleCase } from '../../pokedex/speciesFacts'

export interface CompareField {
  key: string
  label: string
  values: string[]
  /** For numeric rows: the raw numbers, so the best can be marked. */
  numbers?: (number | null)[]
}

const STAT_LABEL: Record<string, string> = {
  hp: 'HP',
  attack: 'Attack',
  defense: 'Defense',
  special: 'Special',
  'special-attack': 'Sp. Atk',
  'special-defense': 'Sp. Def',
  speed: 'Speed',
}

const variety = (s: Species): Variety => s.varieties.find((v) => v.is_default) ?? s.varieties[0]

export function compareSpecies(generation: number, species: Species[]): CompareField[] {
  const v = species.map(variety)
  const stats = v.map((x) => resolveStatsForGeneration(x, generation))
  const fields: CompareField[] = []
  const text = (key: string, label: string, values: string[]) => fields.push({ key, label, values })
  const num = (
    key: string,
    label: string,
    numbers: (number | null)[],
    fmt = (n: number) => String(n),
  ) => fields.push({ key, label, numbers, values: numbers.map((n) => (n == null ? '—' : fmt(n))) })

  text(
    'types',
    'Types',
    v.map((x) =>
      resolveTypesForGeneration(x, generation)
        .map((t) => titleCase(getType(t.type_id)?.name ?? ''))
        .join(' / '),
    ),
  )
  if (generation >= 3) {
    text(
      'abilities',
      'Abilities',
      v.map((x) =>
        resolveAbilitiesForGeneration(x, generation)
          .map((a) => `${a.ability.display_name}${a.is_hidden ? ' (hidden)' : ''}`)
          .join(', '),
      ),
    )
  }
  for (const stat of (stats[0] ?? []).map((s) => s.stat).filter((x): x is string => x != null)) {
    num(
      `stat-${stat}`,
      STAT_LABEL[stat] ?? stat,
      stats.map((list) => list.find((s) => s.stat === stat)?.base_stat ?? null),
    )
  }
  num('bst', 'Base stat total', stats.map(statTotal))
  num(
    'height',
    'Height',
    v.map((x) => x.height),
    (n) => `${(n / 10).toFixed(1)} m`,
  )
  num(
    'weight',
    'Weight',
    v.map((x) => x.weight),
    (n) => `${(n / 10).toFixed(1)} kg`,
  )
  num(
    'catch',
    'Catch rate',
    species.map((s) => s.capture_rate),
  )
  text(
    'growth',
    'Growth rate',
    species.map((s) => titleCase(s.growth_rate ?? '—')),
  )
  num(
    'exp',
    'Base experience',
    v.map((x) => x.base_experience),
  )
  if (generation >= 2) {
    text(
      'eggs',
      'Egg groups',
      species.map(
        (s) =>
          s.egg_group_ids.map((id) => titleCase(getEggGroup(id)?.name ?? '')).join(', ') || '—',
      ),
    )
    text(
      'gender',
      'Gender',
      species.map((s) => {
        const g = genderRatio(s.gender_rate)
        return g ? `${g.male}% ♂ · ${g.female}% ♀` : 'Genderless'
      }),
    )
    num(
      'hatch',
      'Hatch steps',
      species.map((s) => hatchSteps(s.hatch_counter)),
    )
    num(
      'friendship',
      'Base friendship',
      species.map((s) => s.base_happiness),
    )
  }
  if (generation >= 3) {
    text(
      'ev-yield',
      'EV yield',
      stats.map(
        (list) =>
          evYield(list)
            .map((e) => `${e.effort} ${STAT_LABEL[e.stat] ?? e.stat}`)
            .join(', ') || '—',
      ),
    )
  }
  return fields
}

/** Which columns hold the highest number in a numeric row (ties all marked); none when all equal. */
export function bestOf(numbers: (number | null)[]): Set<number> {
  const real = numbers.filter((n): n is number => n != null)
  if (real.length < 2) return new Set()
  const max = Math.max(...real)
  if (real.every((n) => n === max)) return new Set()
  return new Set(numbers.flatMap((n, i) => (n === max ? [i] : [])))
}
