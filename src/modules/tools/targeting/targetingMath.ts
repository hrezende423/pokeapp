/**
 * #12 Doubles targeting guide: what each move hits in a double battle, in the
 * game's own words.
 *
 * PURE, AND UI-FREE. The target is the game's move table (`tg` in battle data,
 * extracted from pokeruby/pokeemerald/pokefirered battle_moves.h and
 * pokeplatinum's move data), not PokéAPI's modern target -- Surf hits both foes in
 * Gen 3 and every adjacent battler, the ally included, from Gen 4. Every constant
 * the games use is mapped here explicitly; the suite checks none is missing.
 */

export type TargetKind =
  | 'single'
  | 'both-foes'
  | 'all-adjacent'
  | 'random'
  | 'self'
  | 'ally'
  | 'user-or-ally'
  | 'user-side'
  | 'foe-side'
  | 'field'
  | 'depends'

export const TARGET_LABEL: Record<TargetKind, string> = {
  single: 'One Pokémon you pick',
  'both-foes': 'Both foes (spread)',
  'all-adjacent': 'Both foes and your ally (spread)',
  random: 'A random foe',
  self: 'Itself',
  ally: 'Its ally',
  'user-or-ally': 'Itself or its ally',
  'user-side': 'Its own side of the field',
  'foe-side': 'The foes’ side of the field',
  field: 'The whole field',
  depends: 'Depends on the battle (Counter, Metronome…)',
}

/** pokeruby (TARGET_*), pokeemerald/pokefirered (MOVE_TARGET_*), pokeplatinum (RANGE_*). */
const BY_CONSTANT: Record<string, TargetKind> = {
  TARGET_SELECTED_POKEMON: 'single',
  MOVE_TARGET_SELECTED: 'single',
  RANGE_SINGLE_TARGET: 'single',
  RANGE_SINGLE_TARGET_ME_FIRST: 'single',
  TARGET_BOTH_ENEMIES: 'both-foes',
  MOVE_TARGET_BOTH: 'both-foes',
  RANGE_ADJACENT_OPPONENTS: 'both-foes',
  TARGET_ALL_EXCEPT_USER: 'all-adjacent',
  MOVE_TARGET_FOES_AND_ALLY: 'all-adjacent',
  RANGE_ALL_ADJACENT: 'all-adjacent',
  TARGET_RANDOM: 'random',
  MOVE_TARGET_RANDOM: 'random',
  RANGE_RANDOM_OPPONENT: 'random',
  TARGET_USER: 'self',
  MOVE_TARGET_USER: 'self',
  RANGE_USER: 'self',
  RANGE_ALLY: 'ally',
  RANGE_USER_OR_ALLY: 'user-or-ally',
  RANGE_USER_SIDE: 'user-side',
  TARGET_ENEMY_SIDE: 'foe-side',
  MOVE_TARGET_OPPONENTS_FIELD: 'foe-side',
  RANGE_OPPONENT_SIDE: 'foe-side',
  RANGE_FIELD: 'field',
  TARGET_SPECIAL: 'depends',
  MOVE_TARGET_DEPENDS: 'depends',
  RANGE_SINGLE_TARGET_SPECIAL: 'depends',
}

export const isKnownTarget = (tg: string | undefined): boolean => tg != null && tg in BY_CONSTANT

export function targetOf(tg: string | undefined): TargetKind | null {
  return tg != null ? (BY_CONSTANT[tg] ?? null) : null
}

/**
 * What a move can HIT, for the "changed since Gen 3" mark: the side-of-field
 * kinds collapse with "itself", because Gen 3 files Reflect under TARGET_USER and
 * Gen 4 under RANGE_USER_SIDE without any change in what it does.
 */
export function hitClass(kind: TargetKind | null): string {
  if (kind === 'user-side' || kind === 'field' || kind === 'self') return 'no-target'
  return kind ?? 'unknown'
}
