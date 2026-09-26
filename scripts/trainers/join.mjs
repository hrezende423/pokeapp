/**
 * Walkthrough sightings <-> disassembly trainers.
 *
 * THE KEY IS THE PARTY. A sighting and a decomp trainer are the same fight when
 * their parties list the same species at the same levels in the same order.
 * The name then chooses between candidates that share a party (two Lasses with
 * one Pidgey each), the class breaks what the name cannot (Gen 1, where trainers
 * have no names at all), and an unclaimed candidate is preferred to a claimed
 * one so that identical twins in the data land on the two sightings they are.
 *
 * NOTHING IS FORCED. A sighting with no party-identical trainer stays unmatched
 * and is reported with its page and header; a trainer no sighting claims keeps
 * its data and has no walkthrough position. The build prints both lists.
 */

import { squash } from './names.mjs'

/** Classes whose trainer name the player chooses: the rival. */
const PLAYER_NAMED = /RIVAL/

const sig = (party) => party.map((m) => `${m.species_id}:${m.level}`).join(',')
const bag = (party) =>
  party
    .map((m) => `${m.species_id}:${m.level}`)
    .sort()
    .join(',')

/**
 * @param trainers  completed trainers (party with species_id, level)
 * @param sightings [{ ..., party: [{ ndex, species, level }] }] in play order
 * @param speciesIdFor (sightingMon) -> national id | null
 */
export function joinSightings(trainers, sightings, speciesIdFor) {
  const bySig = new Map()
  const byBag = new Map()
  for (const t of trainers) {
    t.sightings = []
    const s = sig(t.party)
    if (!bySig.has(s)) bySig.set(s, [])
    bySig.get(s).push(t)
    const b = bag(t.party)
    if (!byBag.has(b)) byBag.set(b, [])
    byBag.get(b).push(t)
  }

  const unmatched = []
  const claims = new Map()
  const wikiNames = new Map()
  sightings.forEach((s, order) => {
    const party = s.party.map((m) => ({ species_id: speciesIdFor(m), level: m.level }))
    if (!party.length || party.some((m) => m.species_id == null || m.level == null)) {
      unmatched.push({
        ...s,
        order,
        reason: party.length ? 'unreadable party' : 'no party on the page',
      })
      return
    }
    let candidates = bySig.get(sig(party)) ?? []
    let loose = false
    if (!candidates.length) {
      candidates = byBag.get(bag(party)) ?? []
      loose = candidates.length > 0
    }
    if (!candidates.length) {
      unmatched.push({ ...s, order, reason: 'no trainer with this party' })
      return
    }
    const nameKey = s.name ? squash(s.name) : null
    const classKey = s.className ? squash(s.className) : null
    const score = (t) => {
      let v = 0
      if (nameKey && t.name && squash(t.name) === nameKey) v += 8
      // A rival's name is typed by the player, so the data holds a placeholder
      // ("Cedric", "?", "Terry"): a different name is expected there, and among
      // identical parties the rival is the likelier fight than, say, the other
      // player character who carries the same starter.
      else if (nameKey && PLAYER_NAMED.test(t.class_const)) v += 3
      else if (nameKey && t.name) v -= 4
      if (classKey && squash(t.class_const).includes(classKey)) v += 2
      if (!claims.has(t)) v += 1
      return v
    }
    const best = [...candidates].sort(
      (a, b) => score(b) - score(a) || a.source_index - b.source_index,
    )[0]
    // One trainer, one person: a sighting may not claim a trainer the wiki has
    // already placed under another name, unless the game's own name agrees with
    // this one. (Platinum's Route 202 catching demonstration shows Lucas with the
    // same Lv. 5 starter as the rival's first battle; it is not a trainer battle
    // at all, and must not become a second appearance of Barry.)
    const earlier = wikiNames.get(best)
    if (
      nameKey &&
      earlier &&
      !earlier.has(nameKey) &&
      !(best.name && squash(best.name) === nameKey)
    ) {
      unmatched.push({
        ...s,
        order,
        reason: 'party matches a trainer already placed under another name',
      })
      return
    }
    if (nameKey && best.name && squash(best.name) !== nameKey && !best.nameMismatch) {
      // Same party, different name: still the likeliest fight (the wiki and the
      // game spell some names differently), but say so in the report. The first
      // sighting's name is the one kept.
      best.nameMismatch = { wiki: s.name, game: best.name }
    }
    if (nameKey) wikiNames.set(best, (wikiNames.get(best) ?? new Set()).add(nameKey))
    claims.set(best, (claims.get(best) ?? 0) + 1)
    best.sightings.push({ ...s, order, loose })
  })

  return { unmatched, unclaimed: trainers.filter((t) => !t.sightings.length) }
}
