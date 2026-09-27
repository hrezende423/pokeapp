/**
 * Search, filter and sort for the Build Library and the Team Library, declared
 * as the same config the dexes use (dex/query/dexQuery.ts) -- so both open from
 * the app bar's own Search/Filter and Sort menus and behave like every other
 * list in the app.
 *
 * WHAT A ROW CARRIES. The build plus the facts a filter or a sort asks about,
 * resolved once for the build's OWN generation: its era types, its computed
 * stats (the same computeStat the Build Form's stat table shows) and its base
 * stat total. A team row carries its members' rows.
 *
 * A TEAM FILTER ASKS ABOUT ANY MEMBER -- "which of my teams has a Steel type",
 * "which runs Earthquake" -- and a team's ranges are over its averages, the one
 * number a team as a whole has.
 *
 * SORTS ARE NUMBERS AND NAMES ONLY. Type, move and ability are filters and never
 * sorts: there is no order of "Fire before Water" that answers a question.
 */

import { getAbility, getItem, getMove, typesInGeneration } from '../../data'
import type { DexFilter, FilterSection, SortField } from '../dex/query/dexQuery'
import { gameLabel } from '../version-group/games'
import { baseStatFor, buildSpecies, displayName, natureModsFor, typeIdsFor } from './buildFacts'
import {
  TEAM_PURPOSES,
  listedTeams,
  orderedBuilds,
  statKeysForGeneration,
  type Build,
  type Team,
  type TeamBuilderData,
} from './model'
import { computeStat } from './statMath'

const STATS = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: 'Attack' },
  { key: 'defense', label: 'Defense' },
  { key: 'special-attack', label: 'Sp. Atk' },
  { key: 'special-defense', label: 'Sp. Def' },
  { key: 'speed', label: 'Speed' },
] as const

type StatName = (typeof STATS)[number]['key']

export interface BuildRow {
  build: Build
  /** Position in the library: the "#001" order. */
  index: number
  name: string
  speciesName: string
  speciesId: number
  typeIds: number[]
  level: number
  /** Computed totals at the build's level and spread. Gen 1's Special fills both halves. */
  stats: Record<StatName, number>
  bst: number
}

export interface TeamRow {
  team: Team
  index: number
  name: string
  members: BuildRow[]
  avgLevel: number | null
  avgBst: number | null
}

function buildRow(build: Build, index: number): BuildRow | null {
  const facts = buildSpecies(build)
  if (!facts) return null
  const nature = natureModsFor(build.natureId)
  const stats = {} as Record<StatName, number>
  let bst = 0
  for (const key of statKeysForGeneration(build.generation)) {
    const base = baseStatFor(facts.stats, key)
    bst += base
    const total = computeStat({
      generation: build.generation,
      level: build.level,
      base,
      key,
      effort: build.effort,
      individual: build.individual,
      nature,
    })
    if (key === 'special') {
      stats['special-attack'] = total
      stats['special-defense'] = total
    } else {
      stats[key as StatName] = total
    }
  }
  return {
    build,
    index,
    name: displayName(build, facts.species).primary,
    speciesName: facts.species.display_name,
    speciesId: facts.species.id,
    typeIds: typeIdsFor(facts.variety, build.generation),
    level: build.level,
    stats,
    bst,
  }
}

export function buildRows(data: TeamBuilderData): BuildRow[] {
  return orderedBuilds(data)
    .map((b, i) => buildRow(b, i))
    .filter((r): r is BuildRow => r != null)
}

const mean = (xs: number[]): number | null =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null

export function teamRows(data: TeamBuilderData): TeamRow[] {
  const byId = new Map(buildRows(data).map((r) => [r.build.id, r]))
  return listedTeams(data).map((team, index) => {
    const members = team.memberIds
      .filter((m): m is string => m != null)
      .map((id) => byId.get(id))
      .filter((r): r is BuildRow => r != null)
    return {
      team,
      index,
      name: team.name ?? '',
      members,
      avgLevel: mean(members.map((m) => m.level)),
      avgBst: mean(members.map((m) => m.bst)),
    }
  })
}

// ------------------------------------------------------------------ shared

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)]

/** The ids present across the rows, as options sorted by name. */
function presentOptions(
  ids: (number | null)[],
  label: (id: number) => string | undefined,
): { value: string; label: string }[] {
  return uniq(ids.filter((x): x is number => x != null))
    .map((id) => ({ value: String(id), label: label(id) ?? String(id) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Type, then ability / move / item: the same four questions of a build or of any team member. */
function setSections<R>(
  membersOf: (row: R) => BuildRow[],
  all: BuildRow[],
  prefix: string,
): FilterSection<R>[] {
  const any = (row: R, test: (m: BuildRow) => boolean) => membersOf(row).some(test)
  const select = (
    key: string,
    label: string,
    ids: (number | null)[],
    name: (id: number) => string | undefined,
    has: (m: BuildRow, id: string) => boolean,
  ): DexFilter<R> => ({
    kind: 'select',
    key,
    label,
    anyLabel: 'Any',
    options: presentOptions(ids, name),
    match: (row, v) => any(row, (m) => has(m, v)),
  })
  return [
    {
      id: 'type',
      label: 'Type',
      filters: [
        {
          kind: 'types',
          key: 'type',
          label: 'Filter by type',
          available: typesInGeneration(4),
          testIdPrefix: `${prefix}-type`,
          match: (row, selected) => any(row, (m) => m.typeIds.some((id) => selected.includes(id))),
        },
      ],
    },
    {
      id: 'set',
      label: 'Set',
      filters: [
        select(
          'ability',
          'Ability',
          all.map((m) => m.build.abilityId),
          (id) => getAbility(id)?.display_name,
          (m, v) => String(m.build.abilityId) === v,
        ),
        select(
          'move',
          'Move',
          all.flatMap((m) => m.build.moveIds),
          (id) => getMove(id)?.display_name,
          (m, v) => m.build.moveIds.some((id) => String(id) === v),
        ),
        select(
          'item',
          'Item',
          all.map((m) => m.build.itemId),
          (id) => getItem(id)?.display_name,
          (m, v) => String(m.build.itemId) === v,
        ),
      ],
    },
  ]
}

// ------------------------------------------------------------------- builds

export function buildFilterSections(rows: BuildRow[]): FilterSection<BuildRow>[] {
  const gens = uniq(rows.map((r) => r.build.generation)).sort()
  return [
    {
      id: 'name',
      label: 'Name',
      filters: [
        {
          kind: 'text',
          key: 'name',
          label: 'Search builds by nickname or species',
          testId: 'tb-builds-search',
          match: (r, term) =>
            r.name.toLowerCase().includes(term) || r.speciesName.toLowerCase().includes(term),
        },
        {
          kind: 'multi',
          key: 'generation',
          label: 'Generation',
          options: gens.map((g) => ({ value: String(g), label: `Gen ${g}` })),
          match: (r, selected) => selected.includes(String(r.build.generation)),
        },
      ],
    },
    ...setSections<BuildRow>((r) => [r], rows, 'tb-builds'),
    {
      id: 'stats',
      label: 'Level and stats',
      more: true,
      filters: [
        { kind: 'range', key: 'level', label: 'Level', value: (r) => r.level, bounds: { min: 1, max: 100 } },
        {
          kind: 'range',
          key: 'bst',
          label: 'Base stat total',
          value: (r) => r.bst,
          bounds: { min: 175, max: 720 },
        },
        ...STATS.map(
          (s): DexFilter<BuildRow> => ({
            kind: 'range',
            key: `stat-${s.key}`,
            label: s.label,
            value: (r) => r.stats[s.key] ?? null,
            bounds: { min: 1, max: 999 },
          }),
        ),
      ],
    },
  ]
}

export function buildSortFields(): SortField<BuildRow>[] {
  return [
    { key: 'order', label: 'Library order', value: (r) => r.index },
    { key: 'name', label: 'Nickname', value: (r) => r.name },
    { key: 'species', label: 'Species (dex #)', value: (r) => r.speciesId },
    { key: 'level', label: 'Level', value: (r) => r.level },
    { key: 'bst', label: 'Base stat total', value: (r) => r.bst },
    ...STATS.map((s) => ({
      key: s.key,
      label: s.label,
      value: (r: BuildRow) => r.stats[s.key] ?? null,
    })),
  ]
}

// -------------------------------------------------------------------- teams

export function teamFilterSections(rows: TeamRow[]): FilterSection<TeamRow>[] {
  const games = uniq(rows.map((r) => r.team.versionGroup ?? '')).filter(Boolean)
  const purposes = uniq(rows.map((r) => r.team.purpose ?? '')).filter(Boolean)
  return [
    {
      id: 'name',
      label: 'Name',
      filters: [
        {
          kind: 'text',
          key: 'name',
          label: 'Search teams by name or member',
          testId: 'tb-teams-search',
          match: (r, term) =>
            r.name.toLowerCase().includes(term) ||
            r.members.some(
              (m) =>
                m.name.toLowerCase().includes(term) || m.speciesName.toLowerCase().includes(term),
            ),
        },
        {
          kind: 'multi',
          key: 'game',
          label: 'Game',
          options: games.map((g) => ({ value: g, label: gameLabel(g) })),
          match: (r, selected) => selected.includes(r.team.versionGroup ?? ''),
        },
        {
          kind: 'multi',
          key: 'purpose',
          label: 'Purpose',
          options: TEAM_PURPOSES.filter((p) => purposes.includes(p.value)).map((p) => ({
            value: p.value,
            label: p.label,
          })),
          match: (r, selected) => selected.includes(r.team.purpose ?? ''),
        },
      ],
    },
    ...setSections<TeamRow>(
      (r) => r.members,
      rows.flatMap((r) => r.members),
      'tb-teams',
    ),
    {
      id: 'stats',
      label: 'Team averages',
      more: true,
      filters: [
        {
          kind: 'range',
          key: 'avg-level',
          label: 'Average level',
          value: (r) => r.avgLevel,
          bounds: { min: 1, max: 100 },
        },
        {
          kind: 'range',
          key: 'avg-bst',
          label: 'Average base stat total',
          value: (r) => r.avgBst,
          bounds: { min: 175, max: 720 },
        },
      ],
    },
  ]
}

export function teamSortFields(): SortField<TeamRow>[] {
  return [
    { key: 'order', label: 'Library order', value: (r) => r.index },
    { key: 'name', label: 'Team name', value: (r) => r.name || null },
    { key: 'generation', label: 'Generation', value: (r) => r.team.generation },
    { key: 'size', label: 'Members', value: (r) => r.members.length },
    { key: 'level', label: 'Average level', value: (r) => r.avgLevel },
    { key: 'bst', label: 'Average base stat total', value: (r) => r.avgBst },
  ]
}
