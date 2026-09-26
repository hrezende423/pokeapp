/**
 * Walkthrough wikitext -> trainer sightings, in page order.
 *
 * NOT A WIKITEXT PARSER. It reads exactly the templates the walkthroughs use for
 * trainers, which are the same across all ten games:
 *
 *   {{trainerentry|sprite|class|name|prize|count|ndex|species|gender|level|item|...}}
 *     one row per ordinary trainer; five positional fields per Pokemon. Named
 *     arguments (game=, 36= Japanese name, 37= romaji, 38= a note) are split off.
 *   {{Party ...}} {{Pokémon ...}} ... {{Party/end}}
 *     a boss or rival: named fields, then one Pokemon template per member, with
 *     moves. {{Party/2}} is the two-trainer form -- a tag battle when both sides
 *     fight, or `or = yes` when the second is the alternative (the rival who is
 *     Brendan or May depending on the player).
 *
 * Location comes from the section headers above each template (`==Route 203==`,
 * `===Trainer's School===`) and, inside a {{WalkthroughGym}} block, from the
 * gym's own name. Order is document order, which is play order.
 *
 * REMATCH SHORTHAND. One trainerentry can carry several fights at once, written
 * `{{tt|19|First rematch}}/{{tt|25|Second rematch}}` in any field. Those expand
 * into one sighting per alternative, labelled with the tt caption.
 */

/** A Pokemon row without the parser's own "which side of a Party/2" marker. */
function dropSecond(mon) {
  const out = { ...mon }
  delete out.second
  return out
}

/** Balanced `{{...}}` starting at `start` (which must point at "{{"); returns the end index. */
function templateEnd(text, start) {
  let depth = 0
  for (let i = start; i < text.length - 1; i += 1) {
    if (text[i] === '{' && text[i + 1] === '{') {
      depth += 1
      i += 1
    } else if (text[i] === '}' && text[i + 1] === '}') {
      depth -= 1
      i += 1
      if (depth === 0) return i + 1
    }
  }
  return text.length
}

/** Split a template body on top-level pipes (not inside nested {{ }} or [[ ]]). */
function splitArgs(body) {
  const out = []
  let depth = 0
  let link = 0
  let cur = ''
  for (let i = 0; i < body.length; i += 1) {
    const two = body.slice(i, i + 2)
    if (two === '{{') {
      depth += 1
      cur += two
      i += 1
      continue
    }
    if (two === '}}') {
      depth -= 1
      cur += two
      i += 1
      continue
    }
    if (two === '[[') {
      link += 1
      cur += two
      i += 1
      continue
    }
    if (two === ']]') {
      link -= 1
      cur += two
      i += 1
      continue
    }
    if (body[i] === '|' && depth === 0 && link === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += body[i]
  }
  out.push(cur)
  return out
}

/** A template occurrence -> { name, positional[], named{} }. */
function parseTemplate(raw) {
  const body = raw.slice(2, -2)
  const [head, ...rest] = splitArgs(body)
  const positional = []
  const named = {}
  for (const arg of rest) {
    // `key=value`, where key is a word or a number (the 36=/37=/38= name and note slots).
    const m = /^\s*([A-Za-z][A-Za-z0-9_ -]*|\d+)\s*=([\s\S]*)$/.exec(arg)
    if (m) {
      named[m[1].trim().toLowerCase()] = m[2].trim()
    } else {
      positional.push(arg.trim())
    }
  }
  return { name: head.trim().toLowerCase().replace(/_/g, ' '), positional, named }
}

/** Visible text of a wikitext fragment: links, colour templates and markup reduced to their text. */
export function plain(s) {
  if (s == null) return ''
  let t = String(s)
  for (let pass = 0; pass < 4; pass += 1) {
    t = t
      .replace(/\{\{color2\|[^|{}]*\|[^|{}]*\|([^{}]*)\}\}/gi, '$1')
      .replace(/\{\{(?:tt|explain)\|([^|{}]*)\|[^{}]*\}\}/gi, '$1')
      .replace(/\{\{(?:PK)\}\}\{\{(?:MN)\}\}/gi, 'PKMN')
      .replace(
        /\{\{(?:p|pkmn|m|a|i|type|ga|g|rt|tc|pdollar|PDollar|Pdollar)\|([^|{}]*)(?:\|([^{}]*))?\}\}/gi,
        (_, a, b) => b || a,
      )
      .replace(/\{\{(?:pdollar|PDollar|Pdollar)\}\}/gi, '')
      .replace(/\{\{(?:PK)\}\}/gi, 'PK')
      .replace(/\{\{(?:MN)\}\}/gi, 'MN')
      // A rival's starter-dependent team: {{PlayerChoice|0387|Turtwig}}.
      .replace(/\{\{PlayerChoice\|[^|{}]*\|([^|{}]*)\}\}/gi, 'If you chose $1')
      // Game links show the game: {{game|Ruby and Sapphire|s}} -> "Ruby and Sapphire".
      .replace(/\{\{(?:game|g|gdis|game2)\|([^|{}]*)(?:\|[^{}]*)?\}\}/gi, '$1')
      // Superscript game tags ({{sup/3|E}}) are annotations, not text.
      .replace(/\{\{sup\/[^{}]*\}\}/gi, '')
      // Any other template shows its last argument ({{DL|Time|Morning 2|Morning}}
      // reads "Morning"); one with no arguments shows nothing.
      .replace(/\{\{([^{}]*)\}\}/g, (_, inner) => {
        const parts = inner.split('|')
        return parts.length > 1 ? parts.at(-1) : ''
      })
  }
  return t
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `{{tt|19|First rematch}}/{{tt|25|Second}}` -> [{ value: '19', label: 'First rematch' }, ...]. */
function alternatives(field) {
  const f = (field ?? '').trim()
  const tts = [...f.matchAll(/\{\{tt\|([^|{}]*)\|([^{}]*)\}\}/gi)]
  if (tts.length > 1 || (tts.length === 1 && f.replace(tts[0][0], '').trim() !== '')) {
    return tts.map((m) => ({ value: m[1].trim(), label: plain(m[2]) }))
  }
  return [{ value: tts.length === 1 ? tts[0][1].trim() : f, label: null }]
}

const num = (s) => {
  const n = Number(String(s ?? '').replace(/[^0-9]/g, ''))
  return Number.isFinite(n) && String(s ?? '').match(/\d/) ? n : null
}

/** Headers with their positions: [{ at, level, text }]. */
function headers(text) {
  const out = []
  const re = /^(={2,6})\s*([^=\n].*?)\s*\1\s*$/gm
  let m
  while ((m = re.exec(text))) out.push({ at: m.index, level: m[1].length, text: plain(m[2]) })
  return out
}

function contextAt(hs, at) {
  const ctx = {}
  for (const h of hs) {
    if (h.at > at) break
    ctx[h.level] = h.text
    for (let l = h.level + 1; l <= 6; l += 1) delete ctx[l]
  }
  const deepest = [6, 5, 4, 3, 2].map((l) => ctx[l]).find(Boolean) ?? null
  // Every heading above the template, outermost first.
  const path = [2, 3, 4, 5, 6].map((l) => ctx[l]).filter(Boolean)
  return { location: ctx[2] ?? null, sublocation: ctx[3] ?? ctx[4] ?? null, heading: deepest, path }
}

/** One trainerentry -> one or more sightings (rematch shorthand expands). */
function fromTrainerentry(t) {
  const p = t.positional
  const [sprite, cls, nameField, prize, count] = p
  // "Richard<br><small>(Morning only)</small>": the name, then a note under it.
  const [name, ...under] = (nameField ?? '').split(/<br\s*\/?>/i)
  const nameNote = plain(under.join(' ')).replace(/^\((.*)\)$/, '$1') || null
  const n = num(count) ?? 0
  const monFields = []
  for (let i = 0; i < n; i += 1) monFields.push(p.slice(5 + i * 5, 10 + i * 5))
  // How many alternatives does this row encode? The largest tt-split in any field.
  const fields = [prize, ...monFields.flat()]
  const width = Math.max(1, ...fields.map((f) => alternatives(f).length))
  const pick = (f, k) => {
    const alts = alternatives(f)
    return alts[Math.min(k, alts.length - 1)]
  }
  const out = []
  for (let k = 0; k < width; k += 1) {
    const party = []
    for (const [ndex, species, gender, level, item] of monFields) {
      const sp = plain(pick(species, k).value)
      if (!sp) continue
      party.push({
        ndex: num(pick(ndex, k).value),
        species: sp,
        gender: plain(gender) || null,
        level: num(pick(level, k).value),
        item: (() => {
          const v = plain(pick(item, k).value)
          return v && v.toLowerCase() !== 'none' ? v : null
        })(),
        moves: null,
      })
    }
    out.push({
      kind: 'entry',
      sprite: plain(sprite),
      className: plain(cls),
      name: plain(name) || null,
      prize: num(pick(prize, k).value),
      variant:
        width > 1
          ? (pick(
              fields.find((f) => alternatives(f).length === width),
              k,
            ).label ?? `#${k + 1}`)
          : null,
      note:
        [nameNote, t.named['38'] ? plain(t.named['38']) : null].filter(Boolean).join('; ') || null,
      game: t.named.game ?? null,
      party,
    })
  }
  return out
}

function monFromPokemonTemplate(t) {
  const a = t.named
  const moves = []
  for (let i = 1; i <= 4; i += 1) if (a[`move${i}`]) moves.push(plain(a[`move${i}`]))
  const held = a.held ?? a.item ?? a.helditem ?? null
  return {
    ndex: num(a.ndex),
    species: plain(a.pokemon),
    gender: a.gender ? plain(a.gender) : null,
    level: num(a.level),
    item: held && plain(held).toLowerCase() !== 'none' ? plain(held) : null,
    ability: a.ability ? plain(a.ability) : null,
    moves: moves.length ? moves : null,
  }
}

/**
 * Every trainer sighting on one page, in order.
 * Returns [{ kind, className, name, prize, party[], location, sublocation, ... }].
 */
export function sightings(wikitext) {
  const hs = headers(wikitext)
  const out = []
  const re = /\{\{\s*(trainerentry|party\/2|party|walkthroughgym)\s*[|\n}]/gi
  const gyms = []
  let m
  while ((m = re.exec(wikitext))) {
    const start = m.index
    const end = templateEnd(wikitext, start)
    const raw = wikitext.slice(start, end)
    const kind = m[1].toLowerCase()
    if (kind === 'walkthroughgym') {
      const t = parseTemplate(raw)
      gyms.push({ start, end, name: plain(t.named.name) })
      // Do not skip its body: the entries inside are found by the same scan.
      re.lastIndex = start + 2
      continue
    }
    re.lastIndex = end
    const gym = gyms.find((g) => start > g.start && start < g.end)
    const ctx = contextAt(hs, start)
    if (gym) ctx.sublocation = gym.name
    const t = parseTemplate(raw)
    if (kind === 'trainerentry') {
      for (const s of fromTrainerentry(t)) out.push({ ...s, ...ctx, at: start })
      continue
    }
    // A Party: collect the Pokémon templates up to the matching Party/end.
    const endTag = /\{\{\s*party\/end\s*\}\}/gi
    endTag.lastIndex = end
    const close = endTag.exec(wikitext)
    const stop = close ? close.index : end
    const body = wikitext.slice(end, stop)
    const mons = []
    // Facility bosses (Frontier Brains) list their teams as {{lop/facility}} rows:
    // ndex|species|item|move|type x4|nature|HP|Atk|Def|SpA|SpD|Spe EVs.
    for (const lm of body.matchAll(/\{\{\s*lop\/facility\s*\|/gi)) {
      const ft = parseTemplate(body.slice(lm.index, templateEnd(body, lm.index)))
      const q = ft.positional
      const ev = (k) => num(q[12 + k]) ?? 0
      // A {{lop/facility/rowhead|Team 2}} above the row starts another variant.
      const heads = [
        ...body.slice(0, lm.index).matchAll(/\{\{\s*lop\/facility\/rowhead\s*\|([^}]*)\}\}/gi),
      ]
      const team = heads.length ? plain(heads.at(-1)[1]) : null
      mons.push({
        team,
        ndex: num(q[0]),
        species: plain(q[1]),
        gender: null,
        level: null,
        item: plain(q[2]) || null,
        ability: null,
        moves: [q[3], q[5], q[7], q[9]].map(plain).filter(Boolean),
        nature: plain(q[11]) || null,
        evs: {
          hp: ev(0),
          attack: ev(1),
          defense: ev(2),
          'special-attack': ev(3),
          'special-defense': ev(4),
          speed: ev(5),
        },
        second: false,
      })
    }
    const monRe = /\{\{\s*pok[ée]mon(\/2)?\s*[|\n]/gi
    let mm
    while ((mm = monRe.exec(body))) {
      const e = templateEnd(body, mm.index)
      const pt = parseTemplate(body.slice(mm.index, e))
      mons.push({ ...monFromPokemonTemplate(pt), second: mm[1] === '/2' })
      monRe.lastIndex = e
    }
    const a = t.named
    const base = {
      kind: kind === 'party/2' ? 'party2' : 'party',
      sprite: plain(a.sprite),
      prize: num(plain(a.prize)),
      game: a.game ?? null,
      caption: a.caption ? plain(a.caption) : null,
      location: a.locationname ? plain(a.locationname) : ctx.location,
      sublocation: ctx.sublocation,
      pageLocation: ctx.location,
      heading: ctx.heading,
      path: ctx.path,
      at: start,
    }
    const first = {
      ...base,
      className: plain(a.class ?? '') || null,
      name: plain(a.name) || null,
      party: mons.filter((x) => !x.second).map(dropSecond),
    }
    if (kind === 'party/2') {
      const firstCount = num(a.pokemon) ?? first.party.length
      const allMons = mons.map(dropSecond)
      const second = {
        ...base,
        className: plain(a.class2 ?? '') || null,
        name: plain(a.name2) || null,
        party: mons.some((x) => x.second)
          ? mons.filter((x) => x.second).map(dropSecond)
          : allMons.slice(firstCount),
      }
      first.party = mons.some((x) => x.second) ? first.party : allMons.slice(0, firstCount)
      const alternative = /^yes$/i.test(a.or ?? '')
      out.push({ ...first, pairing: alternative ? 'or' : 'tag' })
      out.push({ ...second, pairing: alternative ? 'or' : 'tag' })
    } else {
      out.push(first)
    }
  }
  return out
}
