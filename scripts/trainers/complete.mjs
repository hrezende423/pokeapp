/**
 * Raw decomp trainers -> the bundle's trainer records.
 *
 * Resolves every constant to a bundle id (names.mjs), fills the moves the game
 * leaves to the level-up list, and derives what the game derives from the
 * personality value. The per-generation parsers stay free of bundle knowledge;
 * everything that needs species data happens here, once.
 *
 * WHAT IS STORED, AND WHAT IS LEFT TO THE APP:
 *   - `ability_slot`, not an ability id. The slot (personality bit 0) is the
 *     game's own fact; which ability sits in that slot for a given generation is
 *     era.ts's job (resolveAbilitiesForGeneration), and duplicating that here
 *     would give the bundle two answers to one question.
 *   - `iv` (Gen 3-4, one value for all six) or `dvs` (Gen 1-2), never a derived
 *     stat. Stats are statMath.ts's job, with the calculator's own inputs.
 */

import {
  NATURE_ORDER,
  defaultMoves,
  gen4Iv,
  gen4Personality,
  genderFromPersonality,
  hgssOverrideSelector,
  uniformIv,
} from './mechanics.mjs'

export function makeCompleter({ names, natures, speciesById }) {
  const natureId = Object.fromEntries(Object.values(natures).map((n) => [n.name, n.id]))

  const moveRef = (raw, ctx) => {
    if (typeof raw === 'number') {
      const m = names.moveById(raw)
      if (!m) names.misses.move.set(`#${raw}`, new Set([ctx]))
      return m ?? null
    }
    return names.move(raw, ctx)
  }

  /** Species constant (+ form index) -> { species, variety }. */
  const speciesRef = (raw, form, ctx) => {
    const sp = names.species(raw, ctx)
    if (!sp) return null
    const full = speciesById.get(sp.id)
    const varieties = full.varieties
    const variety =
      (form > 0 && varieties[form]) || varieties.find((v) => v.is_default) || varieties[0]
    return { species: full, variety }
  }

  /**
   * One Gen 4 trainer. `learnset(nationalId)` gives the game-order level-up
   * list; `vg` picks the HGSS personality override.
   */
  function gen4Trainer(t, vg, learnset) {
    const ctx = `${vg} ${t.srcId}`
    let selector = t.classGender === 'female' ? 0x78 : 0x88
    const party = []
    for (const m of t.party) {
      const ref = speciesRef(m.species, m.form, ctx)
      if (!ref) continue
      const national = ref.species.id
      if (vg === 'heartgold-soulsilver') {
        selector = hgssOverrideSelector(selector, {
          genderOverride: m.genderOverride,
          abilityOverride: m.abilityOverride,
          genderRatio: genderThresholdFor(ref.species.gender_rate),
        })
      }
      const personality = gen4Personality({
        difficulty: m.difficulty,
        level: m.level,
        species: national,
        trainerId: t.id,
        classIndex: t.classIndex,
        genderSelector: selector,
      })
      let moveIds
      let explicit
      if (m.moves && m.moves.length) {
        moveIds = m.moves.map((x) => moveRef(x, ctx)?.id).filter((x) => x != null)
        explicit = true
      } else {
        const list = learnset(national)
        if (!list) throw new Error(`${ctx}: no learnset for #${national}`)
        const keys = defaultMoves(list, m.level)
        moveIds = keys.map((x) => moveRef(x, `${ctx} (level-up)`)?.id).filter((x) => x != null)
        explicit = false
      }
      party.push({
        species_id: national,
        pokemon_id: ref.variety.pokemon_id,
        form: m.form || null,
        level: m.level,
        moves: moveIds,
        moves_explicit: explicit,
        item_id: m.item ? (names.item(m.item, ctx)?.id ?? null) : null,
        iv: gen4Iv(m.difficulty) ?? undefined,
        // The data's scale overflows the game's u8 into random IVs (see gen4Iv).
        iv_random: gen4Iv(m.difficulty) == null ? true : undefined,
        nature_id: natureId[NATURE_ORDER[personality % 25]],
        ability_slot: personality & 1,
        gender: genderFromPersonality(personality, ref.species.gender_rate),
        personality,
      })
    }
    const last = party.at(-1)?.level ?? 0
    return {
      source_id: t.srcId,
      source_index: t.id,
      class_const: t.classConst,
      name: t.name,
      double: t.double,
      items: t.items.map((x) => names.item(x, ctx)?.id).filter((x) => x != null),
      ai: t.ai.map((f) => f.replace(/^AI_FLAG_/, '').toLowerCase()),
      // Platinum's BattleScript_CalcPrizeMoney: last level * 4 * the class
      // multiplier, doubled for a double battle. DP and HGSS take the
      // walkthrough's figure in the join (their tables are not extracted).
      prize: t.prizeMultiplier != null ? t.prizeMultiplier * 4 * last * (t.double ? 2 : 1) : null,
      // DP/Platinum fill unused slots with one Lv. 5 Rattata (DP names them
      // Mickey and Angelica); a trainer holding only that is a placeholder.
      placeholder:
        /DUMMY/.test(t.srcId) ||
        (party.length > 0 &&
          party.every((m) => m.species_id === 19 && m.level === 5) &&
          /^(Mickey|Angelica)$/i.test(t.name ?? '')),
      party,
    }
  }

  /**
   * One Gen 3 trainer. The personality is already computed by the parser (it
   * needs the game's character codes); the rest follows from it the same way as
   * Gen 4. Prize: 4 * last level * the class's money value, doubled for a
   * double battle (GetTrainerMoneyToGive).
   */
  function gen3Trainer(t, vg, learnsetBySpecies) {
    const ctx = `${vg} ${t.srcId}`
    const party = []
    for (const m of t.party) {
      const ref = speciesRef(m.species, 0, ctx)
      if (!ref) continue
      let moveIds
      let explicit
      if (m.moves && m.moves.length) {
        moveIds = m.moves.map((x) => moveRef(x, ctx)?.id).filter((x) => x != null)
        explicit = true
      } else {
        const list = learnsetBySpecies(m.species)
        if (!list) throw new Error(`${ctx}: no learnset for ${m.species}`)
        moveIds = defaultMoves(list, m.level)
          .map((x) => moveRef(x, `${ctx} (level-up)`)?.id)
          .filter((x) => x != null)
        explicit = false
      }
      const personality = m.personality
      party.push({
        species_id: ref.species.id,
        pokemon_id: ref.variety.pokemon_id,
        form: null,
        level: m.level,
        moves: moveIds,
        moves_explicit: explicit,
        item_id: m.item ? (names.item(m.item, ctx)?.id ?? null) : null,
        iv: uniformIv(m.iv),
        nature_id: natureId[NATURE_ORDER[personality % 25]],
        ability_slot: personality & 1,
        gender: genderFromPersonality(personality, ref.species.gender_rate),
        personality,
      })
    }
    const last = party.at(-1)?.level ?? 0
    return {
      source_id: t.srcId,
      source_index: t.id,
      class_const: t.classConst,
      name: titleCase(t.name),
      double: t.double,
      items: t.items.map((x) => names.item(x, ctx)?.id).filter((x) => x != null),
      ai: t.ai.map((f) => f.replace(/^AI_SCRIPT_/, '').toLowerCase()),
      prize: t.prizeValue != null ? 4 * last * t.prizeValue * (t.double ? 2 : 1) : null,
      placeholder: !!t.placeholder,
      party,
    }
  }

  /**
   * One Gen 1 or Gen 2 trainer.
   *   moves  explicit (Gen 2 TRAINERTYPE_*MOVES) or the level-up default (Gen 1
   *          starting from the species' base moves), then Gen 1's special moves
   *          written over their slots exactly as ReadTrainer does.
   *   DVs    Gen 1: 9/8/8/8 for every trainer Pokemon; Gen 2: the class's row.
   *   gender Gen 2 only, from the Attack DV against the species' ratio (female
   *          when Attack DV <= 1 / 3 / 7 / 11 for 12.5 / 25 / 50 / 75 % female).
   *   prize  Gen 1: base money / 100 * last level; Gen 2: base reward * 4 * last
   *          level. Both are checked against the walkthrough's figures.
   */
  function gen12Trainer(t, vg, parsed) {
    const ctx = `${vg} ${t.srcId}`
    const gen = parsed.generation
    const party = []
    t.party.forEach((m) => {
      const ref = speciesRef(m.species, 0, ctx)
      if (!ref) return
      let keys
      let explicit = false
      if (m.moves && m.moves.length) {
        keys = m.moves
        explicit = true
      } else {
        const list = parsed.learnsetFor(m.species)
        if (!list) throw new Error(`${ctx}: no learnset for ${m.species}`)
        const initial = gen === 1 ? (parsed.baseMovesFor(m.species) ?? []) : []
        keys = defaultMoves(list, m.level, initial)
      }
      party.push({ ref, level: m.level, keys, explicit, item: m.item ?? null })
    })

    // Gen 1 special moves (see gen12.mjs): slot writes over the default list.
    if (gen === 1) {
      for (const sp of parsed.specials) {
        if (sp.classConst !== t.classConst) continue
        if (sp.number != null && sp.number !== t.classNumber) continue
        const writes = sp.champion ? championWrites(party) : sp.moves
        for (const w of writes) {
          const mon = party[w.mon]
          if (!mon) continue
          const slots = [...mon.keys]
          while (slots.length < w.slot) slots.push(null)
          slots[w.slot] = w.move
          mon.keys = slots.filter(Boolean)
          mon.special = true
        }
      }
    }

    const dvs = gen === 1 ? { attack: 9, defense: 8, speed: 8, special: 8 } : t.dvs
    const out = party.map((m) => ({
      species_id: m.ref.species.id,
      pokemon_id: m.ref.variety.pokemon_id,
      form: null,
      level: m.level,
      moves: m.keys.map((x) => moveRef(x, ctx)?.id).filter((x) => x != null),
      moves_explicit: m.explicit || !!m.special,
      item_id: m.item ? (names.item(m.item, ctx)?.id ?? null) : null,
      item_name: m.item ? (names.itemEraName(m.item) ?? undefined) : undefined,
      dvs,
      gender: gen === 2 ? gen2Gender(dvs.attack, m.ref.species.gender_rate) : null,
    }))
    const last = out.at(-1)?.level ?? 0
    return {
      source_id: t.srcId,
      source_index: t.id,
      class_const: t.classConst,
      class_number: t.classNumber,
      name: titleCase(t.name),
      double: false,
      items: t.items.map((x) => names.item(x, ctx)?.id).filter((x) => x != null),
      ai: t.ai.map((f) => f.replace(/^AI_/, '').toLowerCase()),
      prize:
        gen === 1
          ? t.baseMoney != null
            ? (t.baseMoney / 100) * last
            : null
          : t.reward != null
            ? t.reward * 4 * last
            : null,
      source_location: t.sourceLocation ?? null,
      unused_hint: !!t.unusedHint,
      class_name_game: t.className ?? null,
      party: out,
    }
  }

  return { gen12Trainer, gen3Trainer, gen4Trainer, speciesRef, moveRef, natureId }
}

/**
 * Red/Blue's Champion (ReadTrainer.ChampionRival): Sky Attack in Pidgeot's third
 * slot, and a third-slot move on the starter by which starter it is.
 */
function championWrites(party) {
  const writes = [{ mon: 0, slot: 2, move: 'SKY_ATTACK' }]
  const starter = party[5]?.ref.species.name
  const move = { venusaur: 'MEGA_DRAIN', charizard: 'FIRE_BLAST', blastoise: 'BLIZZARD' }[starter]
  if (move) writes.push({ mon: 5, slot: 2, move })
  return writes
}

/** Gen 2 gender: female when the Attack DV is at or under the ratio's cut. */
function gen2Gender(attackDv, genderRate) {
  if (genderRate < 0) return null
  if (genderRate === 0) return 'M'
  if (genderRate === 8) return 'F'
  const cut = { 1: 1, 2: 3, 4: 7, 6: 11, 7: 13 }[genderRate]
  return attackDv <= cut ? 'F' : 'M'
}

/**
 * The Game Boy games store names in capitals ("ROXANNE", "GABBY & TY"); the
 * app shows them the way the later games and the wiki do.
 */
export function titleCase(name) {
  if (!name) return null
  return name.toLowerCase().replace(/(^|[\s&.'-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase())
}

/** The games' 0-255 gender threshold for a PokeAPI gender_rate (eighths female). */
function genderThresholdFor(genderRate) {
  if (genderRate < 0) return 255
  return { 0: 0, 1: 31, 2: 63, 4: 127, 6: 191, 7: 225, 8: 254 }[genderRate]
}
