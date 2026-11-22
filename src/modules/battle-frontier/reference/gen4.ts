/**
 * The Platinum and HeartGold/SoulSilver Battle Frontier: rules, format, entry
 * requirement and reward, per facility. Static reference, PURE.
 *
 * SOURCES (pret disassemblies; never Serebii or Smogon):
 * - pokeplatinum @ 485c400f9d7bad10d906d556ba23e5e46d5b3e5e
 *   - include/constants/battle_frontier.h: FRONTIER_CHALLENGE_* (formats),
 *     FRONTIER_NEXT_BATTLE_* (normal / silver / gold).
 *   - Tower: src/battle_tower.c BattleTower_GetPartySizeForChallengeMode (party
 *     3 / 4 / 2 / 3), BattleTower_GiveBattlePointsReward (the BP rows below);
 *     src/battle_tower_trainers.c BattleTower_GetOpponentTrainerID (Palmer at
 *     round 2 and round 6, last battle, Single only); TOWER_BATTLES_PER_ROUND 7.
 *   - Factory: FACTORY_BATTLES_PER_ROUND 7, FACTORY_STREAK_SILVER_BATTLE 21 /
 *     _GOLD_BATTLE 49, FACTORY_INITIAL_RENTAL_OPTIONS 6, FACTORY_PARTY_SIZE_SOLO 3
 *     / _MULTI 2; src/battle_factory_save.c isOpenLevel (Lv50 / Open Level).
 *   - Hall: HALL_BATTLES_PER_ROUND 10, HALL_STREAK_SILVER_BATTLE 50 / _GOLD 170,
 *     HALL_MAX_TYPE_RANK 10.
 *   - Castle: CASTLE_BATTLES_PER_ROUND 7, CASTLE_STREAK_* 21 / 49,
 *     CASTLE_PARTY_SIZE_SOLO 3 / _MULTI 2, CASTLE_MAX_LEVEL 50,
 *     BATTLE_CASTLE_RANK_* (three ranks).
 *   - Arcade: ARCADE_BATTLES_PER_ROUND 7, ARCADE_STREAK_* 21 / 49,
 *     ARCADE_PARTY_SIZE_SOLO 3 / _MULTI 2, ARCADE_MAX_LEVEL 50, ARCADE_EFFECT_*
 *     (32 effects) in ARCADE_EFFECT_CATEGORY_* (4 groups).
 *   - Banned species: src/pokemon.c sBattleFrontierBanlist (18).
 * - pokeheartgold @ 4e9563397ab4e5c407271472935f9e270ac6a804: src/pokemon.c
 *   IsPokemonBannedFromBattleFrontier (the same 18, plus Spiky-eared Pichu).
 * - Bulbapedia (CC; prose only, where the code did not settle it): the entry
 *   requirements, the Tower's level-50 rule, the Hall's type ranks and level
 *   scaling, Castle Points, Thorton's and Argenta's Pokémon.
 *
 * NOT TRACED, AND SAID SO ON SCREEN (never invented): Battle Points for the
 * Factory, Hall, Castle and Arcade, and for the Tower's Double and Multi.
 *
 * HEARTGOLD/SOULSILVER: every value here is Platinum's. Only the banned list was
 * checked in pokeheartgold; the rest is the flagged "reuses Platinum,
 * unconfirmed" (docs/tools/PLAN.md), like its rental pool.
 */

export type Gen4FacilityId = 'tower' | 'factory' | 'hall' | 'castle' | 'arcade'
export type Gen4Game = 'platinum' | 'heartgold-soulsilver'

export interface Gen4Facility {
  id: Gen4FacilityId
  name: string
  /** One or two sentences, in the Emerald Facilities' voice. */
  rule: string
  party: string
  challenge: string
  level: string
  brain: { title: string; name: string }
  /** The battle of the streak the Brain is met at, for the Silver and the Gold Print. */
  silver: number
  gold: number
  brainWhen?: string
  brainTeam: string
  /** The facility's own mechanic, when it has one. */
  mechanic?: [string, string]
  /** Battle Points rows, label -> text; a facility without a traced table says so. */
  bp: [string, string][]
}

const NOT_TRACED = 'Not traced from the disassembly yet'

export const GEN4_FACILITY_ORDER: readonly Gen4FacilityId[] = ['tower', 'factory', 'hall', 'castle', 'arcade']

export const GEN4_FACILITIES: readonly Gen4Facility[] = [
  {
    id: 'tower',
    name: 'Battle Tower',
    rule: 'Seven battles per set against trainers drawn by streak. Single, Double, Multi (with a partner) and Wi-Fi battles.',
    party: 'Single 3 · Double 4 · Multi 2 · Wi-Fi 3',
    challenge: '7 battles per set; the streak counts battles',
    level: 'Level 50: Pokémon above it are lowered to 50',
    brain: { title: 'Tower Tycoon', name: 'Palmer' },
    silver: 21,
    gold: 49,
    brainWhen: 'Single Battle streaks only',
    brainTeam: 'Fixed (see the Trainer Dex)',
    bp: [
      ['BP · Single', 'Sets 1–2 → 3 · 3–4 → 4 · 5–6 → 5 · 7 on → 7; the set that beats Palmer → 20'],
      ['BP · Link Multi', 'Sets 1 → 8 · 2 → 9 · 3 → 11 · 4 → 12 · 5 → 14 · 6 → 15 · 7 on → 18'],
      ['BP · Wi-Fi', 'By rank 1–10: 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 10 · 10'],
      ['BP · Double, Multi', NOT_TRACED],
    ],
  },
  {
    id: 'factory',
    name: 'Battle Factory',
    rule: 'Seven battles per set with rental Pokémon: pick three of six, and after each win you may swap one for one of the beaten trainer’s.',
    party: '3 rentals of 6 offered · 2 each in Multi',
    challenge: '7 battles per set; the streak counts battles',
    level: 'Level 50 or Open Level',
    brain: { title: 'Factory Head', name: 'Thorton' },
    silver: 21,
    gold: 49,
    brainTeam: 'Rentals, drawn like yours: no fixed team',
    bp: [['BP', NOT_TRACED]],
  },
  {
    id: 'hall',
    name: 'Battle Hall',
    rule: 'One Pokémon of level 30 or higher against one opponent of a type you pick from 18 panels. Each type has its own rank, 1 to 10; a win raises it, and a type at rank 10 cannot be picked again.',
    party: '1 Pokémon, level 30 or higher',
    challenge: '10 battles per set; the streak counts battles',
    level: 'Opponents rise with the type’s rank and with how many types are at rank 2 or higher, up to your Pokémon’s level',
    brain: { title: 'Hall Matron', name: 'Argenta' },
    silver: 50,
    gold: 170,
    brainTeam: 'One Pokémon from your Pokémon’s base-stat group, at its level: no fixed team',
    bp: [['BP', NOT_TRACED]],
  },
  {
    id: 'castle',
    name: 'Battle Castle',
    rule: 'Seven battles per set with your own Pokémon, paid for in Castle Points: healing, rented held items, a look at the opponent and its level, all cost CP.',
    party: '3 · 2 each in Multi',
    challenge: '7 battles per set; the streak counts battles',
    level: 'Level 50 cap',
    brain: { title: 'Castle Valet', name: 'Darach' },
    silver: 21,
    gold: 49,
    brainTeam: 'Fixed (see the Trainer Dex)',
    mechanic: [
      'Castle Points',
      '10 CP when a streak starts; each win pays CP for the HP, PP and Pokémon left (up to 50). Spend them on healing, rented items, the opponent’s team, or its level ±5. Three ranks: healing, rentals, information.',
    ],
    bp: [['BP', NOT_TRACED]],
  },
  {
    id: 'arcade',
    name: 'Battle Arcade',
    rule: 'Seven battles per set. Before each one a game board stops on one of 32 effects that changes the battle.',
    party: '3 · 2 each in Multi',
    challenge: '7 battles per set; the streak counts battles',
    level: 'Level 50 cap',
    brain: { title: 'Arcade Star', name: 'Dahlia' },
    silver: 21,
    gold: 49,
    brainTeam: 'Fixed (see the Trainer Dex)',
    mechanic: [
      'Game board',
      '32 effects in 4 groups: to either side (HP lowered, a status, a Berry or item, a level up); the field (sun, rain, sandstorm, hail, fog, Trick Room); and bonuses (cursor speed, a Pokémon swap, +1 or +3 BP, a skipped battle, or no event).',
    ],
    bp: [['BP', 'The board’s +1 and +3 BP squares; the per-set award is not traced yet']],
  },
]

/** Where the Frontier is and when it opens. */
export const GEN4_ENTRY: Record<Gen4Game, string> = {
  platinum: 'After the Hall of Fame: the Battle Frontier in the Fight Area, by ferry from Snowpoint City.',
  'heartgold-soulsilver': 'After the Hall of Fame: the Battle Frontier west of Olivine City.',
}

/** sBattleFrontierBanlist: the 18 species no facility accepts. */
export const GEN4_BANNED: readonly number[] = [
  150, 151, 249, 250, 251, 382, 383, 384, 385, 386, 483, 484, 487, 489, 490, 491, 492, 493,
]

/** HGSS's one extra ban: a form, not a species (Pichu itself is allowed). */
export const HGSS_EXTRA_BAN = 'Spiky-eared Pichu'

export const HGSS_FLAG =
  'HeartGold and SoulSilver: these rules are Platinum’s. Their own Frontier data is not extracted, so they are unconfirmed here; only the banned list was checked (it adds Spiky-eared Pichu).'
