/**
 * The games' own rules for what a trainer's Pokemon turns out to be, where the
 * party data leaves it implicit. Each function here is a transcription of the
 * disassembly code named in its comment, so a question about a result is
 * answered by reading that routine, not this file.
 */

/**
 * Gen 4 LCRNG (pokeplatinum LCRNG_Next / pokeheartgold LCRandom): the seed steps
 * by *0x41C64E6D + 0x6073 and each draw is its top 16 bits.
 */
export function lcrngDraws(seed, count) {
  let s = seed >>> 0
  let last = seed >>> 0
  for (let i = 0; i < count; i += 1) {
    s = (Math.imul(s, 0x41c64e6d) + 0x6073) >>> 0
    last = s >>> 16
  }
  return last
}

/**
 * Gen 4 trainer personality (TrainerData_BuildParty / TrainerData_CreateParty):
 * seed = difficulty + level + species + trainer id, draw once per trainer-class
 * index, then (draw << 8) + the gender selector. With zero draws the value is
 * the seed itself, exactly as the loop leaves it.
 */
export function gen4Personality({
  difficulty,
  level,
  species,
  trainerId,
  classIndex,
  genderSelector,
}) {
  const seed = (difficulty + level + species + trainerId) >>> 0
  const r = lcrngDraws(seed, classIndex)
  return ((r << 8) + genderSelector) >>> 0
}

/**
 * HGSS's TrMon_OverridePidGender. Note it rewrites the SHARED selector: an
 * override on one Pokemon carries into every later Pokemon of that party, a quirk
 * of the original that this reproduces rather than fixes.
 */
export function hgssOverrideSelector(selector, { genderOverride, abilityOverride, genderRatio }) {
  let s = selector
  if (genderOverride === 0 && abilityOverride === 0) return s
  if (genderOverride !== 0) s = genderOverride === 1 ? genderRatio + 2 : genderRatio - 2
  if (abilityOverride === 1) s &= ~1
  else if (abilityOverride === 2) s |= 1
  return s >>> 0
}

/** The games' nature order: index = personality % 25. */
export const NATURE_ORDER = [
  'hardy',
  'lonely',
  'brave',
  'adamant',
  'naughty',
  'bold',
  'docile',
  'relaxed',
  'impish',
  'lax',
  'timid',
  'hasty',
  'serious',
  'jolly',
  'naive',
  'modest',
  'mild',
  'quiet',
  'bashful',
  'rash',
  'calm',
  'gentle',
  'sassy',
  'careful',
  'quirky',
]

/** PokeAPI's gender_rate (eighths female, -1 genderless) -> the games' 0-255 threshold. */
export function genderThreshold(genderRate) {
  if (genderRate < 0) return 255
  return (
    { 0: 0, 1: 31, 2: 63, 4: 127, 6: 191, 7: 225, 8: 254 }[genderRate] ??
    Math.round((genderRate / 8) * 256)
  )
}

/** Gen 3-4 GetGenderFromSpeciesAndPersonality: female when the low byte is under the threshold. */
export function genderFromPersonality(personality, genderRate) {
  const t = genderThreshold(genderRate)
  if (t === 255) return null
  if (t === 254) return 'F'
  if (t === 0) return 'M'
  return (personality & 0xff) < t ? 'F' : 'M'
}

/**
 * The move a freshly created Pokemon knows (Gen 3 GiveMonInitialMoveset, Gen 4
 * the same routine, Gen 2 FillMoves, Gen 1 WriteMonMoves after its base moves):
 * walk the level-up list in order, every move at or below the level, skipping one
 * already known, pushing the oldest out once four are known.
 *
 * `learnset` is [[level, moveKey], ...] in the game's own order -- which is why
 * this reads the disassembly tables and not PokeAPI's, whose same-level ties are
 * sorted by move id.
 */
export function defaultMoves(learnset, level, initial = []) {
  const known = [...initial]
  for (const [lv, move] of learnset) {
    if (lv > level) continue
    if (known.includes(move)) continue
    if (known.length === 4) known.shift()
    known.push(move)
  }
  return known
}

/** Gen 3 / Gen 4 uniform IV from the party's 0-255 value (iv * 31 / 255, integer division). */
export const uniformIv = (value) => Math.floor((value * 31) / 255)

/**
 * Gen 4's version, faithfully: TrainerData_BuildParty computes the IV into a
 * u8 (`u8 ivs = ivScale * 31 / 255`), and CreateMon treats a value of 32 or more
 * as "roll random IVs". The scale is stored as u16, so a value above 255 in the
 * data -- Platinum's Volkner's Electivire has 2500 -- overflows into a random
 * spread in the real game. Returns null for that case.
 */
export function gen4Iv(ivScale) {
  const ivs = Math.floor((ivScale * 31) / 255) & 0xff
  return ivs < 32 ? ivs : null
}
