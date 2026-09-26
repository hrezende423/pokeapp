/**
 * Raw facility data (facilities.mjs) -> bundle ids.
 *
 * Diamond/Pearl's tower arrives as numbers (species, move and item indices,
 * nature index); everything else as constants. Both resolve through names.mjs,
 * so a miss stops the build the same way a trainer's does.
 *
 * DP SETS ARE COMPARED WITH PLATINUM'S, set by set: a DP set shares Platinum's
 * key only when species, moves, item, nature and EVs are all identical, and the
 * count goes into `checks.dp_vs_platinum` (Platinum revised most of the pool).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NATURE_ORDER, genderFromPersonality } from './mechanics.mjs'
import { titleCase } from './complete.mjs'

export function completeFacilities(vg, facilities, ctx) {
  const { names, natureId, speciesById, classNames, dirs } = ctx
  const where = (f) => `${vg} ${f}`
  const natureRef = (n) => {
    if (n == null) return null
    if (typeof n === 'number') return natureId[NATURE_ORDER[n]] ?? null
    return (
      natureId[
        String(n)
          .replace(/^NATURE_/, '')
          .toLowerCase()
      ] ?? null
    )
  }
  const species = (raw, form, at) => {
    const sp = typeof raw === 'number' ? speciesById.get(raw) : names.species(raw, at)
    if (!sp) {
      if (typeof raw === 'number') names.misses.species.set(`#${raw}`, new Set([at]))
      return null
    }
    const full = speciesById.get(sp.id)
    const v =
      (form > 0 && full.varieties[form]) ||
      full.varieties.find((x) => x.is_default) ||
      full.varieties[0]
    return {
      species_id: full.id,
      pokemon_id: v.pokemon_id,
      form: form || null,
      gender_rate: full.gender_rate,
    }
  }
  const moves = (list, at) =>
    list
      .map((m) => (typeof m === 'number' ? names.moveById(m)?.id : names.move(m, at)?.id))
      .filter((x) => x != null)
  const item = (raw, at) => (raw ? (names.item(raw, at)?.id ?? null) : null)

  // Gen 4 item indices (DP's binaries) follow Platinum's generated/items.txt order.
  const gen4Items = dirs.pokeplatinum
    ? readFileSync(join(dirs.pokeplatinum, 'generated/items.txt'), 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.startsWith('ITEM_'))
    : []
  const gen4Classes = dirs.pokeplatinum
    ? readFileSync(join(dirs.pokeplatinum, 'generated/trainer_classes.txt'), 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.startsWith('TRAINER_CLASS_'))
    : []

  const className = (c) => {
    if (!c) return null
    if (classNames[c]) return classNames[c]
    const bare = String(c).replace(/^(FACILITY_CLASS_|TRAINER_CLASS_)/, '')
    const hit = Object.entries(classNames).find(
      ([k]) => k.replace(/^(TRAINER_?CLASS_)/, '') === bare,
    )
    if (hit) return hit[1]
    return bare
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ')
  }

  let dpCheck = null
  const out = facilities.map((f) => {
    let sets
    if (f.binary) {
      // DP: resolve its numbers, resolve Platinum's pool the ordinary way, then
      // share Platinum's key (and trainer name) only where they are identical.
      const [pt] = completeFacilities(
        'platinum',
        [{ id: 'pt', sets: f.platinum.sets, trainers: f.platinum.trainers }],
        ctx,
      )
      const ptKeyAt = f.platinum.setOrder // index -> Platinum set key
      const ptByKey = new Map(pt.sets.map((s) => [s.key, s]))
      let same = 0
      const keyOfIndex = new Map()
      sets = f.sets.map((s) => {
        const at = where(`dp-set-${s.index}`)
        const ref = species(s.speciesId, s.form, at)
        const row = {
          key: `dp_${s.index}`,
          ...(ref
            ? { species_id: ref.species_id, pokemon_id: ref.pokemon_id, form: ref.form }
            : {}),
          moves: moves(s.moveIds, at),
          item_id: s.itemIndex ? item(gen4Items[s.itemIndex], at) : null,
          nature_id: natureRef(s.natureIndex),
          evs: s.evs,
        }
        const p = ptByKey.get(ptKeyAt[s.index])
        if (
          p &&
          p.species_id === row.species_id &&
          JSON.stringify(p.moves) === JSON.stringify(row.moves) &&
          p.item_id === row.item_id &&
          p.nature_id === row.nature_id &&
          JSON.stringify(p.evs) === JSON.stringify(row.evs)
        ) {
          row.key = p.key
          same += 1
        }
        keyOfIndex.set(s.index, row.key)
        return row
      })
      // Binary trainers carry set indices; the Brains appended after them do not.
      f.trainers = f.trainers.map((t) =>
        t.set_ids
          ? {
              key: t.key,
              class_const: gen4Classes[t.classIndex] ?? `CLASS_${t.classIndex}`,
              name: t.name,
              set_keys: t.set_ids.map((id) => keyOfIndex.get(id) ?? `dp_${id}`),
            }
          : t,
      )
      dpCheck = { sets: sets.length, sets_same_as_platinum: same }
    } else {
      sets = f.sets.map((s) => {
        const at = where(`${f.id} ${s.key}`)
        const ref = species(s.species, s.form ?? 0, at)
        return {
          key: s.key,
          ...(ref
            ? { species_id: ref.species_id, pokemon_id: ref.pokemon_id, form: ref.form }
            : {}),
          level: s.level ?? undefined,
          group: s.group ?? undefined,
          moves: moves(s.moves, at),
          item_id: item(s.item, at),
          item_name: s.item ? (names.itemEraName(s.item) ?? undefined) : undefined,
          nature_id: natureRef(s.nature) ?? undefined,
          evs: s.evs ?? undefined,
          dvs: s.dvs ?? undefined,
          stat_exp: s.stat_exp ?? undefined,
        }
      })
    }
    const trainers = f.trainers.map((t) => {
      const at = where(`${f.id} ${t.key}`)
      const base = {
        key: t.key,
        class_id: t.class_const ?? null,
        class_name: t.class_name_override ?? className(t.class_const),
        name: titleCase(t.name),
        group: t.group ?? undefined,
        note: t.note ?? undefined,
      }
      if (t.wikiParty) {
        // A Gen 4 Brain, from the wiki's spelling: resolved like the walkthrough's
        // names, and a miss is recorded like any other.
        base.source = 'bulbapedia'
        base.party = t.wikiParty.map((m) => {
          const sp =
            (m.ndex && speciesById.get(m.ndex)) ||
            names.speciesBySlug(m.species.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
          if (!sp) names.misses.species.set(m.species, new Set([at]))
          const full = sp ? speciesById.get(sp.id) : null
          const v = full ? full.varieties.find((x) => x.is_default) : null
          const mv = m.moves.map((x) => {
            const hit = names.moveQuiet(x)
            if (!hit) names.misses.move.set(x, new Set([at]))
            return hit?.id
          })
          const it = m.item ? names.itemQuiet(m.item) : null
          if (m.item && !it) names.misses.item.set(m.item, new Set([at]))
          return {
            ...(full ? { species_id: full.id, pokemon_id: v.pokemon_id } : {}),
            moves: mv.filter((x) => x != null),
            item_id: it?.id ?? null,
            nature_id: natureRef(m.nature),
            evs: m.evs,
          }
        })
      } else if (t.party) {
        base.party = t.party.map((m) => {
          const ref = species(m.species, 0, at)
          const p = m.personality
          return {
            ...(ref ? { species_id: ref.species_id, pokemon_id: ref.pokemon_id } : {}),
            moves: moves(m.moves, at),
            item_id: item(m.item, at),
            evs: m.evs,
            ivs: m.ivs,
            ability_slot: m.ability_slot ?? undefined,
            nature_id: m.nature
              ? natureRef(m.nature)
              : p != null
                ? natureId[NATURE_ORDER[p % 25]]
                : null,
            gender: p != null && ref ? genderFromPersonality(p, ref.gender_rate) : undefined,
          }
        })
      } else {
        base.set_keys = t.set_keys ?? []
        if (t.set_group) base.set_group = t.set_group
      }
      return base
    })
    return {
      id: f.id,
      name: f.name,
      rules: f.rules,
      source_note: f.source_note ?? undefined,
      sets,
      trainers,
    }
  })
  if (dpCheck) out.dpCheck = dpCheck
  return out
}
