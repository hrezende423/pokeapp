/**
 * Showdown text against the bundle: a Build to text, and text to Builds.
 *
 * WHAT A GENERATION HOLDS IS DECIDED HERE, and the table is in docs/SPEC.md,
 * slice A. Import is forgiving on purpose: a field the generation cannot hold is
 * dropped and said so, one report line each, so a paste from anywhere still gives
 * a Build the reader can finish. Only a species the generation does not have
 * refuses a Pokémon.
 *
 * IMPORT NEVER OVERWRITES. `resolveImport` writes nothing; the commit functions
 * only create records.
 */

import { getItem, getMove, getNature, listItems, listNatures } from '../../data'
import type { Species, Variety } from '../../data'
import { formAvailable } from '../calculators/damageCalcState'
import { speciesEntries } from '../dex/entrySources'
import {
  abilityName,
  abilityOptionsFor,
  buildSpecies,
  genderOptionsFor,
  itemOptionsFor,
  newBuildInit,
} from './buildFacts'
import { getLegalMoveset } from './legalMoveset'
import { MAX_EV_TOTAL, MOVE_SLOTS, NICKNAME_MAX, TEAM_SIZE, type Build, type Team } from './model'
import {
  SD_STATS,
  dvFromIv,
  evFromStatExp,
  formatSets,
  ivFromDv,
  parseShowdown,
  statExpFromEv,
  type SdSpread,
  type SdStat,
  type ShowdownSet,
} from './showdown'
import { MAX_DV, MAX_EV, MAX_IV, hiddenPower, isShinyByDvs } from './statMath'
import type { StatKey, StatNumbers } from './statMath'
import { createBuild, createTeam } from './store'

const MODERN_KEY: Record<SdStat, StatKey> = {
  HP: 'hp',
  Atk: 'attack',
  Def: 'defense',
  SpA: 'special-attack',
  SpD: 'special-defense',
  Spe: 'speed',
}

const OLD_DV_KEY: Partial<Record<SdStat, StatKey>> = {
  Atk: 'attack',
  Def: 'defense',
  SpA: 'special',
  Spe: 'speed',
}

/** Names compare as lowercase letters and digits, so punctuation never matters. */
const toId = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const titleCase = (name: string): string =>
  name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-')

/* ------------------------------------------------------------------ export */

function effortText(generation: number, effort: StatNumbers): SdSpread {
  if (generation >= 3) {
    const out: SdSpread = {}
    for (const stat of SD_STATS) {
      const v = effort[MODERN_KEY[stat]] ?? 0
      if (v > 0) out[stat] = v
    }
    return out
  }
  /* THE BUILD FORM STORES GEN 2 SPECIAL IN TWO KEYS: its stat rows are Sp. Atk and
     Sp. Def, while the battle code and the Collection use `special`. */
  const all: SdSpread = {
    HP: evFromStatExp(effort.hp ?? 0),
    Atk: evFromStatExp(effort.attack ?? 0),
    Def: evFromStatExp(effort.defense ?? 0),
    SpA: evFromStatExp(effort['special-attack'] ?? effort.special ?? 0),
    ...(generation === 2
      ? { SpD: evFromStatExp(effort['special-defense'] ?? effort.special ?? 0) }
      : {}),
    Spe: evFromStatExp(effort.speed ?? 0),
  }
  const shown = Object.fromEntries(Object.entries(all).filter(([, v]) => v > 0)) as SdSpread
  // No EVs line means full in Gen 1-2, so a blank spread has to say it is blank.
  return Object.keys(shown).length ? shown : { HP: 0 }
}

function individualText(generation: number, individual: StatNumbers): SdSpread {
  const out: SdSpread = {}
  if (generation >= 3) {
    for (const stat of SD_STATS) {
      const v = individual[MODERN_KEY[stat]] ?? 0
      if (v !== MAX_IV) out[stat] = v
    }
    return out
  }
  for (const stat of ['Atk', 'Def', 'SpA', 'Spe'] as const) {
    const dv = individual[OLD_DV_KEY[stat]!] ?? 0
    if (dv !== MAX_DV) out[stat] = ivFromDv(dv)
  }
  if (generation === 2 && out.SpA != null) out.SpD = out.SpA
  return out
}

function speciesText(species: Species, variety: Variety): string {
  return variety.is_default ? species.display_name : titleCase(variety.name)
}

function moveText(moveId: number, build: Build): string | null {
  const move = getMove(moveId)
  if (!move) return null
  if (move.name !== 'hidden-power') return move.display_name
  const type = hiddenPower(build.generation, build.individual).type
  return `Hidden Power [${titleCase(type)}]`
}

/** The Build reduced to what its own generation holds. Null if the species is unknown. */
export function buildToSet(build: Build): ShowdownSet | null {
  const facts = buildSpecies(build)
  if (!facts) return null
  const g = build.generation
  const canPickGender = (genderOptionsFor(facts.species)?.length ?? 0) === 2
  return {
    nickname: build.nickname.trim(),
    species: speciesText(facts.species, facts.variety),
    gender:
      g >= 2 && canPickGender && build.gender ? (build.gender === 'male' ? 'M' : 'F') : null,
    item: g >= 2 && build.itemId != null ? (getItem(build.itemId)?.display_name ?? null) : null,
    ability: g >= 3 && build.abilityId != null ? abilityName(build.abilityId) : null,
    level: build.level,
    shiny: g >= 3 ? build.shiny : g === 2 ? isShinyByDvs(build.individual) : false,
    happiness: g >= 2 ? build.friendship : null,
    nature: g >= 3 && build.natureId != null ? (getNature(build.natureId)?.display_name ?? null) : null,
    evs: effortText(g, build.effort),
    ivs: individualText(g, build.individual),
    moves: build.moveIds
      .map((id) => (id == null ? null : moveText(id, build)))
      .filter((m): m is string => m != null),
  }
}

export const exportBuilds = (builds: Build[]): string =>
  formatSets(builds.map(buildToSet).filter((s): s is ShowdownSet => s != null))

/** A Gen 1-2 spread holding Stat Exp that does not land on one of Showdown's steps. */
export const exportIsLossy = (builds: Build[]): boolean =>
  builds.some(
    (b) =>
      b.generation <= 2 &&
      Object.values(b.effort).some((v) => {
        const n = v ?? 0
        return statExpFromEv(evFromStatExp(n)) !== n
      }),
  )

/* ------------------------------------------------------------------ import */

export interface ImportItem {
  /** The name to report under. */
  label: string
  /** Null when this Pokémon cannot be imported. */
  build: Omit<Build, 'id'> | null
  notes: string[]
}

export interface ImportPlan {
  generation: number
  teamName: string | null
  items: ImportItem[]
  /** Notes about the text as a whole. */
  notes: string[]
}

function speciesIndex(generation: number): Map<string, { species: Species; variety: Variety }> {
  const index = new Map<string, { species: Species; variety: Variety }>()
  for (const species of speciesEntries({ generation, isAll: false })) {
    const standard = species.varieties.find((v) => v.is_default) ?? species.varieties[0]
    if (!standard) continue
    for (const variety of species.varieties) {
      if (formAvailable(variety, generation)) index.set(toId(variety.name), { species, variety })
    }
    index.set(toId(species.name), { species, variety: standard })
    index.set(toId(species.display_name), { species, variety: standard })
  }
  return index
}

function readEffort(set: ShowdownSet, generation: number, notes: string[]): StatNumbers {
  const effort: StatNumbers = {}
  if (generation >= 3) {
    for (const stat of SD_STATS) {
      const raw = set.evs?.[stat] ?? 0
      if (raw > MAX_EV) notes.push(`${stat} EVs lowered to ${MAX_EV}, the most a stat can hold.`)
      effort[MODERN_KEY[stat]] = Math.min(MAX_EV, raw)
    }
    const total = Object.values(effort).reduce<number>((sum, v) => sum + (v ?? 0), 0)
    if (total > MAX_EV_TOTAL) notes.push(`EVs total ${total}, over the ${MAX_EV_TOTAL} limit.`)
    return effort
  }
  // No EVs line means full Stat Exp, which is how Showdown treats Gen 1-2.
  const read = (stat: SdStat) => {
    const raw = set.evs ? (set.evs[stat] ?? 0) : MAX_EV
    if (raw > MAX_EV) notes.push(`${stat} EVs lowered to ${MAX_EV}, the most a stat can hold.`)
    return statExpFromEv(raw)
  }
  effort.hp = read('HP')
  effort.attack = read('Atk')
  effort.defense = read('Def')
  effort.speed = read('Spe')
  effort.special = read('SpA')
  if (generation === 2) {
    // One value, in every key a reader of a Gen 2 Build uses.
    effort['special-attack'] = effort.special
    effort['special-defense'] = effort.special
  }
  if (set.evs?.SpD != null && set.evs.SpD !== set.evs.SpA) {
    notes.push('Separate Sp. Def EVs ignored: this generation has one Special.')
  }
  return effort
}

function readIndividual(set: ShowdownSet, generation: number, notes: string[]): StatNumbers {
  const individual: StatNumbers = {}
  if (generation >= 3) {
    for (const stat of SD_STATS) {
      individual[MODERN_KEY[stat]] = Math.min(MAX_IV, Math.max(0, set.ivs?.[stat] ?? MAX_IV))
    }
    return individual
  }
  for (const stat of ['Atk', 'Def', 'SpA', 'Spe'] as const) {
    individual[OLD_DV_KEY[stat]!] = dvFromIv(set.ivs?.[stat] ?? MAX_IV)
  }
  if (set.ivs?.SpD != null && dvFromIv(set.ivs.SpD) !== individual.special) {
    notes.push('Separate Sp. Def IV ignored: this generation has one Special DV.')
  }
  return individual
}

async function readMoves(
  set: ShowdownSet,
  build: Omit<Build, 'id'>,
  notes: string[],
): Promise<(number | null)[]> {
  const legal = await getLegalMoveset({
    speciesId: build.speciesId,
    level: build.level,
    generation: build.generation,
    pokemonId: build.pokemonId,
  })
  if (legal.failed.length) notes.push(`Some move data did not load: ${legal.failed.join(', ')}.`)
  const byId = new Map(legal.moves.map((m) => [toId(m.name), m.move_id]))
  const moveIds: (number | null)[] = []
  for (const text of set.moves) {
    const id = /^hidden\s*power/i.test(text) ? byId.get('hiddenpower') : byId.get(toId(text))
    if (id == null) {
      notes.push(`${text} left out: not learnable in Gen ${build.generation}.`)
      continue
    }
    if (moveIds.includes(id)) continue
    if (moveIds.length === MOVE_SLOTS) {
      notes.push(`${text} left out: a Pokémon has four moves.`)
      continue
    }
    moveIds.push(id)
    const named = /^hidden\s*power\s*\[?\s*([a-z]+)/i.exec(text)?.[1]
    const actual = hiddenPower(build.generation, build.individual).type
    if (named && named.toLowerCase() !== actual.toLowerCase()) {
      notes.push(`Hidden Power is ${titleCase(actual)} with these IVs, not ${titleCase(named)}.`)
    }
  }
  while (moveIds.length < MOVE_SLOTS) moveIds.push(null)
  return moveIds
}

function readItem(set: ShowdownSet, generation: number, notes: string[]): number | null {
  if (!set.item) return null
  if (generation < 2) {
    notes.push('Item dropped: Gen 1 has no held items.')
    return null
  }
  const held = new Set(itemOptionsFor(generation).map((o) => o.value))
  // By slug too: older games and other tools say Stick where the bundle says Leek.
  const wanted = toId(set.item)
  const found = listItems().find((i) => toId(i.display_name) === wanted || toId(i.name) === wanted)
  if (!found || !held.has(found.id)) {
    notes.push(`${set.item} dropped: not a held item in Gen ${generation}.`)
    return null
  }
  return found.id
}

function readAbility(
  set: ShowdownSet,
  variety: Variety,
  generation: number,
  fallback: number | null,
  speciesName: string,
  notes: string[],
): number | null {
  const options = abilityOptionsFor(variety, generation)
  if (!set.ability) return fallback
  const found = options.find((o) => toId(o.label) === toId(set.ability!))
  if (found) return found.value
  notes.push(`${set.ability} dropped: not an ability of ${speciesName} in Gen ${generation}.`)
  return fallback
}

function readNature(set: ShowdownSet, notes: string[]): number | null {
  if (!set.nature) return null
  const found = listNatures().find((n) => toId(n.display_name) === toId(set.nature!))
  if (!found) notes.push(`${set.nature} is not a nature.`)
  return found?.id ?? null
}

async function readSet(
  set: ShowdownSet,
  generation: number,
  index: ReturnType<typeof speciesIndex>,
): Promise<ImportItem> {
  const exact = index.get(toId(set.species))
  /* A form the bundle has no variety for (Gastrodon-East, Unown-B, Arceus-Fire), or
     one the generation lacks (Garchomp-Mega), reads as the species, and says so. */
  const hit = exact ?? index.get(toId(set.species.split('-')[0]))
  if (!hit) {
    return {
      label: set.species,
      build: null,
      notes: [`Not imported: ${set.species} is not in Gen ${generation}.`],
    }
  }
  const { species, variety } = hit
  const notes: string[] = []
  if (!exact) notes.push(`${set.species} read as ${species.display_name}: no such form here.`)
  const init = newBuildInit(generation, species.id)
  const formAbility = abilityOptionsFor(variety, generation)[0]?.value ?? null
  const level = Math.min(100, Math.max(1, set.level == null || !set.level ? 100 : set.level))
  const nickname = set.nickname.slice(0, NICKNAME_MAX)
  if (set.nickname.length > NICKNAME_MAX) {
    notes.push(`Nickname cut to ${NICKNAME_MAX} characters.`)
  }

  if (generation < 3 && set.ability && set.nature) {
    notes.push(`Ability and nature dropped: Gen ${generation} has neither.`)
  } else if (generation < 3 && (set.ability || set.nature)) {
    notes.push(`${set.ability ? 'Ability' : 'Nature'} dropped: Gen ${generation} has none.`)
  }
  if (generation === 1 && set.gender) notes.push('Gender dropped: Gen 1 has none.')
  if (generation === 1 && set.shiny) notes.push('Shiny dropped: Gen 1 has none.')
  if (generation === 1 && set.happiness != null) notes.push('Happiness dropped: Gen 1 has none.')

  const genders = genderOptionsFor(species)
  const wanted = set.gender === 'F' ? 'female' : set.gender === 'M' ? 'male' : null
  let gender = generation === 1 ? null : init.gender
  if (generation >= 2 && wanted && genders) {
    if (genders.includes(wanted)) gender = wanted
    else notes.push(`${species.display_name} cannot be ${wanted}.`)
  }

  const individual = readIndividual(set, generation, notes)
  if (generation === 2 && set.shiny && !isShinyByDvs(individual)) {
    notes.push('Shiny dropped: in Gen 2 the DVs decide, and these are not shiny.')
  }

  const build: Omit<Build, 'id'> = {
    ...init,
    pokemonId: variety.pokemon_id,
    nickname,
    gender,
    shiny: generation >= 3 ? set.shiny : generation === 2 ? isShinyByDvs(individual) : false,
    level,
    friendship: generation >= 2 ? Math.min(255, Math.max(0, set.happiness ?? 255)) : 0,
    itemId: readItem(set, generation, notes),
    abilityId:
      generation >= 3
        ? readAbility(set, variety, generation, formAbility, species.display_name, notes)
        : null,
    natureId: generation >= 3 ? readNature(set, notes) : null,
    effort: readEffort(set, generation, notes),
    individual,
  }
  build.moveIds = await readMoves(set, build, notes)
  return { label: species.display_name, build, notes }
}

/** Read pasted text into a plan. Writes nothing. */
export async function resolveImport(
  text: string,
  generation: number,
  mode: 'team' | 'build',
): Promise<ImportPlan> {
  const parsed = parseShowdown(text)
  const limit = mode === 'team' ? TEAM_SIZE : 1
  const index = speciesIndex(generation)
  const items = await Promise.all(
    parsed.sets.slice(0, limit).map((set) => readSet(set, generation, index)),
  )
  const notes: string[] = []
  const extra = parsed.sets.length - limit
  if (extra > 0) {
    notes.push(
      mode === 'team'
        ? `${extra} past the sixth left out: a team has six.`
        : `Only the first Pokémon was read; ${extra} more left out.`,
    )
  }
  if (parsed.extraTeams > 0) notes.push(`Only the first team was read; ${parsed.extraTeams} more left out.`)
  return { generation, teamName: parsed.teamName, items, notes }
}

const planBuilds = (plan: ImportPlan) =>
  plan.items.flatMap((item) => (item.build ? [item.build] : []))

export function commitTeam(plan: ImportPlan): Team {
  const ids = planBuilds(plan).map((build) => createBuild(build).id)
  return createTeam(plan.generation, ids, plan.teamName ? { name: plan.teamName } : {})
}

export function commitBuild(plan: ImportPlan): Build | null {
  const [first] = planBuilds(plan)
  return first ? createBuild(first) : null
}
