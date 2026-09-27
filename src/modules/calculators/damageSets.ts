/**
 * The damage calculator's set list: every Pokemon the reader can load into a side
 * in one pick, the way KinglerCalc's species dropdown works -- "Abomasnow (Skier
 * Andrea | Rematch 2 | Pt)" beside the bare species.
 *
 * TWO SOURCES TODAY, ONE SHAPE FOR THE NEXT:
 *   - the in-game trainers of the selected game (the Trainer Dex's bundle,
 *     data/trainers.ts), story fights and rematches -- never the unused slots;
 *   - the reader's own Team Builder builds for that generation.
 * Smogon's sets are meant to arrive as a third `CalcSet` producer; nothing here
 * assumes only two.
 *
 * A SET IS WHAT THE GAME USES, NOT A GUESS. Trainer Pokemon carry no Stat Exp or
 * EVs in Gen 1-4 (LoadEnemyMon computes Gen 1-2 enemy stats with none, and Gen
 * 3-4 CreateMon starts every trainer mon at zero), so a loaded trainer set has an
 * empty spread and the party's own DVs / IVs, nature and ability slot.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  getSpecies,
  resolveAbilitiesForGeneration,
  type Species,
  type Variety,
} from '../../data'
import {
  hasTrainerData,
  loadTrainers,
  peekTrainers,
  trainerLabel,
  type TrainerPartition,
  type TrainerPokemon,
} from '../../data/trainers'
import type { SearchOption } from '../../components/ds/SearchSelect'
import { orderedBuilds, listedTeams, uiId, type Build, type TeamBuilderData } from '../team-builder/model'
import type { StatNumbers } from '../team-builder/statMath'
import { MAX_IV } from '../team-builder/statMath'
import { speciesEntries } from '../dex/entrySources'
import {
  MOVE_SLOT_COUNT,
  defaultVariety,
  formAvailable,
  withSpecies,
  type SideState,
} from './damageCalcState'

export interface CalcSet {
  /** Option value: `t:<vg>:<trainer id>:<party index>` or `b:<build id>`. */
  key: string
  source: 'trainer' | 'build'
  speciesId: number
  varietyName: string
  /** "Abomasnow (Skier Andrea | Rematch 2 | Pt)". */
  label: string
  hint: string
  /** What loading the set writes over the side. */
  apply: (side: SideState, gen: number) => SideState
}

const GAME_ABBR: Record<string, string> = {
  'red-blue': 'RB',
  yellow: 'Y',
  'gold-silver': 'GS',
  crystal: 'C',
  'ruby-sapphire': 'RS',
  emerald: 'E',
  'firered-leafgreen': 'FRLG',
  'diamond-pearl': 'DP',
  platinum: 'Pt',
  'heartgold-soulsilver': 'HGSS',
}


const varietyFor = (species: Species, pokemonId: number): Variety =>
  species.varieties.find((v) => v.pokemon_id === pokemonId) ?? defaultVariety(species)

const padMoves = (ids: number[]): (number | null)[] => {
  const out: (number | null)[] = ids.slice(0, MOVE_SLOT_COUNT)
  while (out.length < MOVE_SLOT_COUNT) out.push(null)
  return out
}

/** A zeroed spread in the era's keys, so the reset is visible in the form. */
function zeroEffort(gen: number): StatNumbers {
  const keys =
    gen <= 2
      ? (['hp', 'attack', 'defense', 'special', 'speed'] as const)
      : (['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'] as const)
  return Object.fromEntries(keys.map((k) => [k, 0]))
}

/** A fresh side for the set's Pokemon: the old side's field-facing state is dropped too. */
function base(side: SideState, speciesId: number, varietyName: string, gen: number): SideState {
  return {
    ...withSpecies(side, speciesId, varietyName, gen),
    status: 'healthy',
    boosts: {},
    currentHp: null,
    remembered: {},
  }
}

/** "If you chose Turtwig" reads as "Turtwig start" in a label this tight. */
const shortVariant = (v: string) => v.replace(/^If you chose (.+)$/, '$1 start')

function trainerSets(p: TrainerPartition): CalcSet[] {
  const game = GAME_ABBR[p.version_group] ?? p.version_group
  const out: CalcSet[] = []
  for (const t of p.trainers) {
    if (t.unused) continue
    const className = p.classes[t.class_id]?.name ?? t.class_id
    const first = t.appearances[0]
    const who = trainerLabel(className, t.name)
    // Gen 1's nameless trainers ("Youngster") are told apart by where they stand.
    const where = !t.name ? (first?.location ?? null) : null
    const variant = first?.variant ? shortVariant(first.variant) : null
    const tail = [who, variant, where, game].filter(Boolean).join(' | ')
    t.party.forEach((mon, i) => {
      const species = getSpecies(mon.species_id)
      if (!species) return
      const variety = varietyFor(species, mon.pokemon_id)
      out.push({
        key: `t:${p.version_group}:${t.id}:${i}`,
        source: 'trainer',
        speciesId: species.id,
        varietyName: variety.name,
        label: `${species.display_name} (${tail})`,
        hint: `Lv ${mon.level}`,
        apply: (side, g) => applyTrainerMon(side, g, species.id, variety, mon),
      })
    })
  }
  return out
}

function applyTrainerMon(
  side: SideState,
  gen: number,
  speciesId: number,
  variety: Variety,
  mon: TrainerPokemon,
): SideState {
  const next = base(side, speciesId, variety.name, gen)
  let individual: StatNumbers
  if (gen <= 2) {
    const d = mon.dvs ?? { attack: 9, defense: 8, speed: 8, special: 8 }
    individual = { attack: d.attack, defense: d.defense, speed: d.speed, special: d.special }
  } else {
    // iv_random: the game rolls them (Platinum Volkner's Electivire); max is the
    // conservative read for a defender and the usual one for an attacker.
    const iv = mon.iv ?? MAX_IV
    individual = Object.fromEntries(
      ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'].map((k) => [k, iv]),
    )
  }
  let abilityId = next.abilityId
  if (gen >= 3 && mon.ability_slot != null) {
    const normal = resolveAbilitiesForGeneration(variety, gen).filter((a) => !a.is_hidden)
    abilityId = (normal[mon.ability_slot] ?? normal[0])?.ability.id ?? abilityId
  }
  return {
    ...next,
    level: mon.level,
    moves: padMoves(mon.moves),
    itemId: gen >= 2 ? mon.item_id : null,
    natureId: gen >= 3 ? (mon.nature_id ?? next.natureId) : null,
    abilityId: gen >= 3 ? abilityId : null,
    gender: gen >= 4 && mon.gender ? mon.gender : 'N',
    effort: zeroEffort(gen),
    individual,
  }
}

function buildSets(data: TeamBuilderData, gen: number): CalcSet[] {
  const teams = listedTeams(data)
  const teamOf = new Map<string, string>()
  teams.forEach((t, i) => {
    for (const id of t.memberIds) if (id && !teamOf.has(id)) teamOf.set(id, `Team ${uiId(i)}`)
  })
  const out: CalcSet[] = []
  for (const b of orderedBuilds(data)) {
    if (b.generation !== gen) continue
    const species = getSpecies(b.speciesId)
    if (!species) continue
    const variety = varietyFor(species, b.pokemonId)
    const who = b.nickname.trim() || 'My build'
    const tail = [who, teamOf.get(b.id), 'Team Builder'].filter(Boolean).join(' | ')
    out.push({
      key: `b:${b.id}`,
      source: 'build',
      speciesId: species.id,
      varietyName: variety.name,
      label: `${species.display_name} (${tail})`,
      hint: `Lv ${b.level}`,
      apply: (side, g) => applyBuild(side, g, species.id, variety, b),
    })
  }
  return out
}

function applyBuild(
  side: SideState,
  gen: number,
  speciesId: number,
  variety: Variety,
  b: Build,
): SideState {
  const next = base(side, speciesId, variety.name, gen)
  const abilities = resolveAbilitiesForGeneration(variety, gen)
  return {
    ...next,
    level: b.level,
    moves: padMoves(b.moveIds.filter((m): m is number => m != null)),
    itemId: gen >= 2 ? b.itemId : null,
    natureId: gen >= 3 ? (b.natureId ?? next.natureId) : null,
    abilityId:
      gen >= 3 && abilities.some((a) => a.ability.id === b.abilityId) ? b.abilityId : next.abilityId,
    gender: gen >= 4 ? (b.gender === 'male' ? 'M' : b.gender === 'female' ? 'F' : 'N') : 'N',
    effort: { ...zeroEffort(gen), ...b.effort },
    individual: { ...b.individual },
  }
}

/**
 * The selected game's trainer partition, loading on mount -- none for a game
 * with no trainer data (Colosseum, XD). It is the Trainer Dex's own file, so a
 * game already opened there is instant here.
 */
export function useTrainerSetPartitions(versionGroup: string): TrainerPartition[] {
  const games = useMemo(
    () => (hasTrainerData(versionGroup) ? [versionGroup] : []),
    [versionGroup],
  )
  const [loaded, setLoaded] = useState<Record<string, TrainerPartition>>({})
  useEffect(() => {
    let cancelled = false
    for (const vg of games) {
      if (peekTrainers(vg)) continue
      loadTrainers(vg)
        .then((p) => {
          if (!cancelled) setLoaded((l) => ({ ...l, [vg]: p }))
        })
        // A game that fails to load just contributes no sets; the species stay.
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [games])
  return useMemo(
    () =>
      games
        .map((vg) => loaded[vg] ?? peekTrainers(vg))
        .filter((p): p is TrainerPartition => p != null),
    [games, loaded],
  )
}

function formLabel(speciesName: string, varietyName: string, speciesSlug: string): string {
  if (!varietyName.startsWith(`${speciesSlug}-`)) return speciesName
  const form = varietyName
    .slice(speciesSlug.length + 1)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-')
  return `${speciesName}-${form}`
}

/** Every species and battle-available form of the era, as `<id>:<variety>` options. */
export function speciesPickerOptions(gen: number): SearchOption[] {
  const out: SearchOption[] = []
  for (const s of speciesEntries({ generation: gen, isAll: false })) {
    for (const v of s.varieties) {
      if (!formAvailable(v, gen)) continue
      out.push({
        value: `${s.id}:${v.name}`,
        label: v.is_default ? s.display_name : formLabel(s.display_name, v.name, s.name),
        hint: `#${String(s.id).padStart(3, '0')}`,
      })
    }
  }
  return out
}

export interface SetCatalog {
  options: SearchOption[]
  byKey: Map<string, CalcSet>
}

/**
 * Species and sets as one picker, grouped by species in dex order: the bare
 * species first (the blank set, and the exact match typing its name finds), then
 * the reader's builds, then the trainers in game and walkthrough order.
 */
export function setCatalog(
  speciesOptions: SearchOption[],
  partitions: TrainerPartition[],
  builds: TeamBuilderData,
  gen: number,
): SetCatalog {
  const sets = [...buildSets(builds, gen), ...partitions.flatMap(trainerSets)]
  const byKey = new Map(sets.map((s) => [s.key, s]))
  // A set whose form the era's list does not offer (a Castform weather form)
  // files under the species' first entry rather than vanishing.
  const listed = new Set(speciesOptions.map((o) => o.value))
  const firstOf = new Map<string, string>()
  for (const o of speciesOptions) {
    const id = o.value.split(':')[0]
    if (!firstOf.has(id)) firstOf.set(id, o.value)
  }
  const bySpecies = new Map<string, CalcSet[]>()
  for (const s of sets) {
    const own = `${s.speciesId}:${s.varietyName}`
    const k = listed.has(own) ? own : firstOf.get(String(s.speciesId))
    if (!k) continue
    const list = bySpecies.get(k)
    if (list) list.push(s)
    else bySpecies.set(k, [s])
  }
  const options: SearchOption[] = []
  for (const o of speciesOptions) {
    const group = o.label
    options.push({ ...o, group })
    for (const s of bySpecies.get(o.value) ?? []) {
      options.push({ value: s.key, label: s.label, hint: s.hint, group })
    }
  }
  return { options, byKey }
}
