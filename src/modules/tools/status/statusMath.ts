/**
 * #11 Status move finder: which moves inflict which status, AS EACH GAME HAS IT.
 *
 * PURE, AND UI-FREE. PokéAPI's `meta.ailment` is the modern data, so it cannot
 * say that Tri Attack did nothing extra in Gen 1 or that Sky Attack only began to
 * flinch in Gen 3. This reads the GAME's own move table instead (battle data,
 * extracted from the pinned disassemblies): each move's effect constant and its
 * chance. Gen 1 has no chance byte -- the chance is in the effect's name
 * (pokered engine/battle/effects.asm: ..._SIDE_EFFECT1 10%, ..._SIDE_EFFECT2
 * 30%, poison 20% / 40%, side-effect confusion 10%).
 *
 * "GUARANTEED" means the status is the move's purpose (it still has to hit);
 * "secondary" carries the chance a damaging move adds it.
 */

import type { GameMove } from '../../battle/battleData'

export type Ailment =
  | 'sleep'
  | 'poison'
  | 'badly-poison'
  | 'paralysis'
  | 'burn'
  | 'freeze'
  | 'confusion'
  | 'flinch'
  | 'infatuation'
  | 'drowsy'

export const AILMENTS: { id: Ailment; label: string }[] = [
  { id: 'sleep', label: 'Sleep' },
  { id: 'drowsy', label: 'Drowsy (sleep next turn)' },
  { id: 'poison', label: 'Poison' },
  { id: 'badly-poison', label: 'Bad poison' },
  { id: 'paralysis', label: 'Paralysis' },
  { id: 'burn', label: 'Burn' },
  { id: 'freeze', label: 'Freeze' },
  { id: 'confusion', label: 'Confusion' },
  { id: 'flinch', label: 'Flinch' },
  { id: 'infatuation', label: 'Infatuation' },
]

export interface Inflict {
  ailment: Ailment
  /** Percent for a secondary effect; null when the status is the move's purpose. */
  chance: number | null
  note?: string
}

type Rule = (gm: GameMove, moveId: number) => Inflict[]
const status =
  (ailment: Ailment, note?: string): Rule =>
  () => [{ ailment, chance: null, note }]
const side =
  (ailments: Ailment[], note?: string): Rule =>
  (gm) =>
    gm.c ? ailments.map((ailment) => ({ ailment, chance: gm.c ?? null, note })) : []
const fixed =
  (ailment: Ailment, chance: number, note?: string): Rule =>
  () => [{ ailment, chance, note }]

const TOXIC = 92

const GEN1: Record<string, Rule> = {
  SLEEP_EFFECT: status('sleep'),
  POISON_EFFECT: (_gm, id) => [{ ailment: id === TOXIC ? 'badly-poison' : 'poison', chance: null }],
  PARALYZE_EFFECT: status('paralysis'),
  CONFUSION_EFFECT: status('confusion'),
  POISON_SIDE_EFFECT1: fixed('poison', 20),
  POISON_SIDE_EFFECT2: fixed('poison', 40),
  TWINEEDLE_EFFECT: fixed('poison', 20, 'each hit'),
  BURN_SIDE_EFFECT1: fixed('burn', 10),
  BURN_SIDE_EFFECT2: fixed('burn', 30),
  FREEZE_SIDE_EFFECT1: fixed('freeze', 10),
  FREEZE_SIDE_EFFECT2: fixed('freeze', 30),
  PARALYZE_SIDE_EFFECT1: fixed('paralysis', 10),
  PARALYZE_SIDE_EFFECT2: fixed('paralysis', 30),
  FLINCH_SIDE_EFFECT1: fixed('flinch', 10),
  FLINCH_SIDE_EFFECT2: fixed('flinch', 30),
  CONFUSION_SIDE_EFFECT: fixed('confusion', 10),
}

/** Gen 2-3 share pokecrystal/pokeemerald's EFFECT_* names. */
const GEN23: Record<string, Rule> = {
  EFFECT_SLEEP: status('sleep'),
  EFFECT_POISON: status('poison'),
  EFFECT_TOXIC: status('badly-poison'),
  EFFECT_PARALYZE: status('paralysis'),
  EFFECT_CONFUSE: status('confusion'),
  EFFECT_ATTRACT: status('infatuation'),
  EFFECT_SWAGGER: status('confusion', 'and raises its Attack 2 stages'),
  EFFECT_FLATTER: status('confusion', 'and raises its Sp. Atk 1 stage'),
  EFFECT_TEETER_DANCE: status('confusion', 'every other Pokémon'),
  EFFECT_WILL_O_WISP: status('burn'),
  EFFECT_YAWN: status('drowsy'),
  EFFECT_POISON_HIT: side(['poison']),
  EFFECT_POISON_MULTI_HIT: side(['poison'], 'each hit'),
  EFFECT_TWINEEDLE: side(['poison'], 'each hit'),
  EFFECT_POISON_TAIL: side(['poison']),
  EFFECT_POISON_FANG: side(['badly-poison']),
  EFFECT_BURN_HIT: side(['burn']),
  EFFECT_BLAZE_KICK: side(['burn']),
  EFFECT_FREEZE_HIT: side(['freeze']),
  EFFECT_PARALYZE_HIT: side(['paralysis']),
  EFFECT_THUNDER: side(['paralysis']),
  EFFECT_CONFUSE_HIT: side(['confusion']),
  EFFECT_FLINCH_HIT: side(['flinch']),
  EFFECT_FLINCH_HIT_2: side(['flinch']),
  EFFECT_STOMP: side(['flinch']),
  EFFECT_TWISTER: side(['flinch']),
  EFFECT_SNORE: side(['flinch'], 'only while asleep'),
  EFFECT_FLINCH_MINIMIZE_HIT: side(['flinch']),
  EFFECT_SKY_ATTACK: side(['flinch']),
  EFFECT_FAKE_OUT: fixed('flinch', 100, 'first turn out only'),
  EFFECT_TRI_ATTACK: side(['burn', 'freeze', 'paralysis'], 'one of the three'),
  EFFECT_SECRET_POWER: side(
    ['paralysis'],
    'in a building; the effect depends on where the battle is',
  ),
}

const GEN4: Record<string, Rule> = {
  BATTLE_EFFECT_STATUS_SLEEP: status('sleep'),
  BATTLE_EFFECT_STATUS_POISON: status('poison'),
  BATTLE_EFFECT_STATUS_BADLY_POISON: status('badly-poison'),
  BATTLE_EFFECT_STATUS_PARALYZE: status('paralysis'),
  BATTLE_EFFECT_STATUS_BURN: status('burn'),
  BATTLE_EFFECT_STATUS_CONFUSE: status('confusion'),
  BATTLE_EFFECT_CONFUSE_ALL: status('confusion', 'every other Pokémon'),
  BATTLE_EFFECT_ATK_UP_2_STATUS_CONFUSION: status('confusion', 'and raises its Attack 2 stages'),
  BATTLE_EFFECT_SP_ATK_UP_CAUSE_CONFUSION: status('confusion', 'and raises its Sp. Atk 1 stage'),
  BATTLE_EFFECT_STATUS_SLEEP_NEXT_TURN: status('drowsy'),
  BATTLE_EFFECT_INFATUATE: status('infatuation'),
  BATTLE_EFFECT_TOXIC_SPIKES: status('poison', 'on switching in; two layers badly poison'),
  BATTLE_EFFECT_POISON_HIT: side(['poison']),
  BATTLE_EFFECT_POISON_MULTI_HIT: side(['poison'], 'each hit'),
  BATTLE_EFFECT_HIGH_CRITICAL_POISON_HIT: side(['poison']),
  BATTLE_EFFECT_BADLY_POISON_HIT: side(['badly-poison']),
  BATTLE_EFFECT_BURN_HIT: side(['burn']),
  BATTLE_EFFECT_HIGH_CRITICAL_BURN_HIT: side(['burn']),
  BATTLE_EFFECT_RECOIL_BURN_HIT: side(['burn']),
  BATTLE_EFFECT_THAW_AND_BURN_HIT: side(['burn']),
  BATTLE_EFFECT_FREEZE_HIT: side(['freeze']),
  BATTLE_EFFECT_PARALYZE_HIT: side(['paralysis']),
  BATTLE_EFFECT_THUNDER: side(['paralysis']),
  BATTLE_EFFECT_BOUNCE: side(['paralysis']),
  BATTLE_EFFECT_RECOIL_PARALYZE_HIT: side(['paralysis']),
  BATTLE_EFFECT_CONFUSE_HIT: side(['confusion']),
  BATTLE_EFFECT_CHATTER: side(['confusion'], 'depends on the recorded cry'),
  BATTLE_EFFECT_FLINCH_HIT: side(['flinch']),
  BATTLE_EFFECT_FLINCH_MINIMIZE_DOUBLE_HIT: side(['flinch']),
  BATTLE_EFFECT_FLINCH_DOUBLE_DAMAGE_FLY_OR_BOUNCE: side(['flinch']),
  BATTLE_EFFECT_DAMAGE_WHILE_ASLEEP: side(['flinch'], 'only while asleep'),
  BATTLE_EFFECT_CHARGE_TURN_HIGH_CRIT_FLINCH: side(['flinch']),
  BATTLE_EFFECT_ALWAYS_FLINCH_FIRST_TURN_ONLY: fixed('flinch', 100, 'first turn out only'),
  BATTLE_EFFECT_FLINCH_BURN_HIT: side(['burn', 'flinch'], 'each, separately'),
  BATTLE_EFFECT_FLINCH_FREEZE_HIT: side(['freeze', 'flinch'], 'each, separately'),
  BATTLE_EFFECT_FLINCH_PARALYZE_HIT: side(['paralysis', 'flinch'], 'each, separately'),
  BATTLE_EFFECT_TRI_ATTACK: side(['burn', 'freeze', 'paralysis'], 'one of the three'),
  BATTLE_EFFECT_SECRET_POWER: side(
    ['paralysis'],
    'on plain ground; the effect depends on where the battle is',
  ),
}

/**
 * Effect names that mention a status without inflicting one on the target (they
 * cure it, need it, or hit the user). The finder's completeness check reads this
 * list: any other status-looking name with no rule is a gap.
 */
export const NOT_INFLICTING = new Set([
  'DREAM_EATER_EFFECT',
  'SUPER_FANG_EFFECT',
  'EFFECT_DREAM_EATER',
  'EFFECT_SLEEP_TALK',
  'EFFECT_SUPER_FANG',
  'BATTLE_EFFECT_CONTINUE_AND_CONFUSE_SELF',
  'BATTLE_EFFECT_DOUBLE_POWER_AND_CURE_PARALYSIS',
  'BATTLE_EFFECT_DOUBLE_POWER_HEAL_SLEEP',
  'BATTLE_EFFECT_RECOVER_DAMAGE_SLEEP',
  'BATTLE_EFFECT_USE_RANDOM_LEARNED_MOVE_SLEEP',
  'BATTLE_EFFECT_DOUBLE_DAMAGE_FLY_OR_BOUNCE',
])

export function tableFor(generation: number): Record<string, Rule> {
  return generation === 1 ? GEN1 : generation <= 3 ? GEN23 : GEN4
}

/** What a move inflicts in this game, as the game stores it. */
export function inflictsOf(
  generation: number,
  gm: GameMove | undefined,
  moveId: number,
): Inflict[] {
  if (!gm) return []
  const rule = tableFor(generation)[gm.e]
  return rule ? rule(gm, moveId) : []
}
