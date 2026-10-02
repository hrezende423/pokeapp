/**
 * Where battlers come from: the reader's Team Builder builds (S1) and the Trainer
 * Dex's parties (S2/S3), both turned into BattlerSpecs with EXACT values.
 *
 * TRAINER VALUES ARE THE GAME'S, AS THE BUNDLE ALREADY DERIVED THEM from the
 * disassemblies (data/trainers.ts, scripts/trainers/): Gen 1 trainer DVs are
 * 9/8/8/8; Gen 2 DVs come from the class; Gen 3-4 a single IV for all six stats
 * from the party's IV scale, the nature and ability slot from the personality
 * value. Trainer Pokemon carry no EVs or Stat Exp in Gen 1-4. A Gen 4 IV scale
 * that overflows the game's byte (Platinum Volkner's Electivire) rolls random IVs
 * in the game, so it becomes the RANGE 0-31 here -- outputs widen, never guess.
 */

import { getSpecies, resolveAbilitiesForGeneration } from '../../data'
import type {
  Facility,
  FacilitySet,
  Trainer,
  TrainerPartition,
  TrainerPokemon,
} from '../../data/trainers'
import { trainerLabel } from '../../data/trainers'
import type { Build } from '../team-builder/model'
import { exactSpread, spreadKeys, type BattlerSpec, type SpreadSpec } from './battler'
import type { TrainerInfo } from './session'
import type { GameContext } from './game'
import { point, range } from './range'

const pad4 = (ids: (number | null)[]) =>
  ids.filter((x): x is number => x != null && x > 0).slice(0, 4)

function abilityFromSlot(
  speciesId: number,
  pokemonId: number,
  gen: number,
  slot: number | undefined,
): number | null {
  if (gen < 3) return null
  const sp = getSpecies(speciesId)
  const v = sp?.varieties.find((x) => x.pokemon_id === pokemonId) ?? sp?.varieties[0]
  if (!v) return null
  const normal = resolveAbilitiesForGeneration(v, gen).filter((a) => !a.is_hidden)
  return (normal[slot ?? 0] ?? normal[0])?.ability.id ?? null
}

function varietyName(speciesId: number, pokemonId: number): string {
  const sp = getSpecies(speciesId)
  return (
    sp?.varieties.find((v) => v.pokemon_id === pokemonId)?.name ??
    sp?.varieties.find((v) => v.is_default)?.name ??
    sp?.name ??
    ''
  )
}

export function buildToSpec(b: Build, ctx: GameContext, slot: number): BattlerSpec {
  const gen = ctx.generation
  const species = getSpecies(b.speciesId)
  return {
    key: `mine:${slot}:${b.id}`,
    side: 'mine',
    source: 'build',
    label: b.nickname.trim() || species?.display_name || `#${b.speciesId}`,
    speciesId: b.speciesId,
    varietyName: varietyName(b.speciesId, b.pokemonId),
    level: b.level,
    spreadMode: 'current',
    scenarioId: null,
    spread: exactSpread(gen, b.individual, b.effort, gen >= 3 ? b.natureId : null),
    moves: pad4(b.moveIds),
    itemId: gen >= 2 ? b.itemId : null,
    abilityId: gen >= 3 ? b.abilityId : null,
    gender: b.gender === 'male' ? 'M' : b.gender === 'female' ? 'F' : 'N',
    origin: { buildId: b.id },
  }
}

function trainerSpread(mon: TrainerPokemon, ctx: GameContext): SpreadSpec {
  const gen = ctx.generation
  const keys = spreadKeys(gen)
  if (gen <= 2) {
    const d = mon.dvs ?? { attack: 9, defense: 8, speed: 8, special: 8 }
    return {
      individual: {
        attack: point(d.attack),
        defense: point(d.defense),
        speed: point(d.speed),
        special: point(d.special),
      },
      effort: Object.fromEntries(keys.effort.map((k) => [k, point(0)])),
      natureIds: [],
      ceiling: false,
    }
  }
  const iv = mon.iv_random ? range(0, 31) : point(mon.iv ?? 0)
  return {
    individual: Object.fromEntries(keys.individual.map((k) => [k, iv])),
    effort: Object.fromEntries(keys.effort.map((k) => [k, point(0)])),
    natureIds: mon.nature_id != null ? [mon.nature_id] : [],
    ceiling: false,
  }
}

export function trainerToSpecs(trainer: Trainer, ctx: GameContext): BattlerSpec[] {
  return trainer.party.map((mon, i) => {
    const species = getSpecies(mon.species_id)
    return {
      key: `theirs:${trainer.id}:${i}`,
      side: 'theirs',
      source: 'trainer',
      label: species?.display_name ?? `#${mon.species_id}`,
      speciesId: mon.species_id,
      varietyName: varietyName(mon.species_id, mon.pokemon_id),
      level: mon.level,
      spreadMode: 'current',
      scenarioId: null,
      spread: trainerSpread(mon, ctx),
      moves: pad4(mon.moves),
      itemId: ctx.generation >= 2 ? mon.item_id : null,
      abilityId: abilityFromSlot(mon.species_id, mon.pokemon_id, ctx.generation, mon.ability_slot),
      gender: mon.gender ?? 'N',
      origin: { trainerId: trainer.id, slot: i, versionGroup: ctx.versionGroup },
    }
  })
}

/** "Champion Cynthia", "Leader Wallace (Rematch 2)". */
export function trainerTitle(p: TrainerPartition, t: Trainer): string {
  const cls = p.classes[t.class_id]?.name ?? t.class_id
  const variant = t.appearances[0]?.variant
  return `${trainerLabel(cls, t.name)}${variant ? ` (${variant})` : ''}`
}

/** Boss-ish trainers for the picker's first group and the batch scan (R2). */
export function isBoss(p: TrainerPartition, t: Trainer): boolean {
  const cls = (p.classes[t.class_id]?.name ?? t.class_id).toLowerCase()
  return (
    /leader|elite|champion|rival|boss|giovanni|lance|frontier|brain|admin|commander|head/.test(
      cls,
    ) || /RIVAL|LEADER|ELITE|CHAMPION|LANCE|GIOVANNI|CYRUS|ARCHIE|MAXIE/.test(t.id)
  )
}

/** The opponent's bag: Gen 1 class routines need none (they are code); Gen 2-4 read the party's items. */
export function trainerBag(t: Trainer): number[] {
  return [...t.items]
}

// --------------------------------------------------------- facilities (R6)

export interface PoolEntry {
  spec: BattlerSpec
  /** Probability this set appears on the opponent's team. */
  p: number
  setKey: string
}

/**
 * R6: a facility trainer as a PROBABILISTIC pool. The trainer draws three sets at
 * random from its set list (`rules` on the facility says how), so each set's
 * chance of appearing is 3 / n -- a pool, not a fixed team. Fixed-team facility
 * trainers (Trainer Tower, Trainer Hill, the Brains) are returned with p = 1.
 */
export function facilityPool(
  f: Facility,
  trainerKey: string,
  ctx: GameContext,
  level: number,
  group?: number,
): PoolEntry[] {
  const t = f.trainers.find((x) => x.key === trainerKey)
  if (!t) return []
  if (t.party) {
    return t.party.map((mon, i) => ({
      spec: facilityMonSpec(mon, ctx, `theirs:${f.id}:${t.key}:${i}`, level),
      p: 1,
      setKey: `${t.key}:${i}`,
    }))
  }
  // Crystal's Battle Tower draws from the chosen level bracket's sets (set_group 'any', no set list).
  const keys = t.set_keys?.length
    ? t.set_keys
    : f.sets.filter((s) => group == null || s.group == null || s.group === group).map((s) => s.key)
  const sets = keys
    .map((k) => f.sets.find((s) => s.key === k))
    .filter((s): s is FacilitySet => !!s && (s.species_id != null || s.pokemon_id != null))
  const n = sets.length
  return sets.map((s) => ({
    spec: facilitySetSpec(s, ctx, `theirs:${f.id}:${s.key}`, level),
    p: Math.min(1, 3 / Math.max(1, n)),
    setKey: s.key,
  }))
}

function facilitySetSpec(
  s: FacilitySet,
  ctx: GameContext,
  key: string,
  level: number,
): BattlerSpec {
  const gen = ctx.generation
  const speciesId = s.species_id ?? s.pokemon_id ?? 0
  const keys = spreadKeys(gen)
  const evMap: Record<string, string> = {
    hp: 'hp',
    attack: 'attack',
    defense: 'defense',
    'special-attack': 'special-attack',
    'special-defense': 'special-defense',
    speed: 'speed',
    special: 'special',
  }
  const spread: SpreadSpec = {
    individual: Object.fromEntries(
      keys.individual.map((k) => [
        k,
        gen <= 2 ? point(s.dvs?.[k as 'attack'] ?? 15) : range(0, 31),
      ]),
    ),
    effort: Object.fromEntries(
      keys.effort.map((k) => [
        k,
        point(gen <= 2 ? (s.stat_exp?.[evMap[k]] ?? 0) : (s.evs?.[k as 'hp'] ?? 0)),
      ]),
    ),
    natureIds: s.nature_id != null ? [s.nature_id] : [],
    ceiling: false,
  }
  const species = getSpecies(speciesId)
  return {
    key,
    side: 'theirs',
    source: 'facility',
    label: species?.display_name ?? key,
    speciesId,
    varietyName: varietyName(speciesId, s.pokemon_id ?? speciesId),
    level: s.level ?? level,
    spreadMode: 'current',
    scenarioId: null,
    spread,
    moves: pad4(s.moves),
    itemId: gen >= 2 ? s.item_id : null,
    abilityId: abilityFromSlot(speciesId, s.pokemon_id ?? speciesId, gen, 0),
    gender: 'N',
  }
}

function facilityMonSpec(
  mon: NonNullable<Facility['trainers'][number]['party']>[number],
  ctx: GameContext,
  key: string,
  level: number,
): BattlerSpec {
  const gen = ctx.generation
  const speciesId = mon.species_id ?? mon.pokemon_id ?? 0
  const keys = spreadKeys(gen)
  const spread: SpreadSpec = {
    individual: Object.fromEntries(
      keys.individual.map((k) => [
        k,
        mon.ivs?.[k as 'hp'] != null ? point(mon.ivs[k as 'hp']!) : range(0, 31),
      ]),
    ),
    effort: Object.fromEntries(keys.effort.map((k) => [k, point(mon.evs?.[k as 'hp'] ?? 0)])),
    natureIds: mon.nature_id != null ? [mon.nature_id] : [],
    ceiling: false,
  }
  const species = getSpecies(speciesId)
  return {
    key,
    side: 'theirs',
    source: 'facility',
    label: species?.display_name ?? key,
    speciesId,
    varietyName: varietyName(speciesId, mon.pokemon_id ?? speciesId),
    level,
    spreadMode: 'current',
    scenarioId: null,
    spread,
    moves: pad4(mon.moves),
    itemId: gen >= 2 ? mon.item_id : null,
    abilityId: abilityFromSlot(speciesId, mon.pokemon_id ?? speciesId, gen, mon.ability_slot),
    gender: mon.gender ?? 'N',
  }
}

/** The AI identity the opponent model reads: Gen 1-2 by class constant, Gen 3-4 by flags. */
export function trainerInfo(t: Trainer, versionGroup: string): TrainerInfo {
  return { classId: t.class_id, aiFlags: [...t.ai], versionGroup, bag: trainerBag(t) }
}

/**
 * A facility trainer's AI, from the game's own code (facility trainers carry no
 * flags in their data):
 *   Gen 2 Crystal Battle Tower: the trainer CLASS's AI, as for any trainer.
 *   Gen 3 pokeemerald battle_ai_script_commands.c BattleAI_SetupFlags -- Frontier,
 *     Trainer Hill: CHECK_BAD_MOVE | CHECK_VIABILITY | TRY_TO_FAINT; the Slateport
 *     tent (a Factory-type rental) 0 (battle_factory.c GetAiScriptsInBattleFactory);
 *     pokeruby Battle Tower 7 (the same three); pokefirered Trainer Tower the same three.
 *   Gen 4 pokeplatinum ov104 Battle Tower: BASIC | EVAL_ATTACK | EXPERT. Diamond and
 *     Pearl and HGSS keep it in code not yet decompiled: Platinum's flags assumed,
 *     LOW CONFIDENCE (the caller shows it).
 */
export function facilityTrainerInfo(
  f: Facility,
  trainerKey: string,
  ctx: GameContext,
): { info: TrainerInfo; lowConfidence: string | null } {
  const t = f.trainers.find((x) => x.key === trainerKey)
  const classId = t?.class_id ?? ''
  const vg = ctx.versionGroup
  if (ctx.generation <= 2)
    return { info: { classId, aiFlags: [], versionGroup: vg, bag: [] }, lowConfidence: null }
  if (ctx.generation === 3) {
    const flags =
      f.id === 'slateport-battle-tent' ? [] : ['check_bad_move', 'check_viability', 'try_to_faint']
    return { info: { classId, aiFlags: flags, versionGroup: vg, bag: [] }, lowConfidence: null }
  }
  return {
    info: { classId, aiFlags: ['basic', 'eval_attack', 'expert'], versionGroup: vg, bag: [] },
    lowConfidence:
      vg === 'platinum'
        ? null
        : 'Facility AI flags assumed from Platinum (not decompiled in this game)',
  }
}
