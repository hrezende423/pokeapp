/**
 * Showdown text: the format itself, with no data-layer reads.
 *
 * `parseShowdown` turns pasted text into raw strings; `showdownImport.ts` resolves
 * those against the bundle. `formatSet` writes a set already reduced to what its
 * generation holds. The rules for which fields each generation carries are in
 * docs/SPEC.md (slice A) and live in `showdownImport.ts`, where the data is.
 *
 * GEN 1-2 SPEAK EVs AND IVs IN THIS TEXT, by Showdown's own convention, so a paste
 * works in both directions:
 *   - EV 252 is full Stat Exp: `statExpBonus` tops out at 63, and 63 x 4 is 252.
 *     Partial Stat Exp rounds down to Showdown's steps of 4, which is lossy.
 *   - An IV is a DV doubled; DV 15 is the default and is left out.
 *   - HP is never written or read: its DV is derived from the other four.
 */

import { statExpBonus } from './statMath'

export const SD_STATS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'] as const
export type SdStat = (typeof SD_STATS)[number]
export type SdSpread = Partial<Record<SdStat, number>>

export interface ShowdownSet {
  /** Empty when the set has no nickname. */
  nickname: string
  species: string
  gender: 'M' | 'F' | null
  item: string | null
  ability: string | null
  level: number | null
  shiny: boolean
  happiness: number | null
  nature: string | null
  evs: SdSpread | null
  ivs: SdSpread | null
  moves: string[]
}

export interface ParsedText {
  /** From a `=== [format] Name ===` header. */
  teamName: string | null
  sets: ShowdownSet[]
  /** Teams after the first, which are not read. */
  extraTeams: number
}

/** Stat Exp to the EV Showdown shows for it. 65535 is 252. */
export const evFromStatExp = (statExp: number): number => statExpBonus(statExp) * 4

/** The EV back to Stat Exp. 252 is full, not 252 squared, so a round trip holds. */
export const statExpFromEv = (ev: number): number => {
  const capped = Math.min(252, Math.max(0, ev))
  return capped >= 252 ? 65535 : capped * capped
}

export const ivFromDv = (dv: number): number => dv * 2
export const dvFromIv = (iv: number): number => Math.floor(Math.min(31, Math.max(0, iv)) / 2)

const STAT_ALIASES: Record<string, SdStat> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spc: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
}

function parseSpread(text: string): SdSpread {
  const out: SdSpread = {}
  for (const part of text.split('/')) {
    const m = /^\s*(\d+)\s+([A-Za-z]+)\s*$/.exec(part)
    if (!m) continue
    const stat = STAT_ALIASES[m[2].toLowerCase()]
    if (stat) out[stat] = Number(m[1])
  }
  return out
}

/** "Nick (Species) (M) @ Item", where every part but the species is optional. */
function parseHeadline(raw: string): Pick<ShowdownSet, 'nickname' | 'species' | 'gender' | 'item'> {
  let line = raw.trim()
  let item: string | null = null
  const at = line.lastIndexOf(' @ ')
  if (at >= 0) {
    item = line.slice(at + 3).trim() || null
    line = line.slice(0, at).trim()
  }
  let gender: 'M' | 'F' | null = null
  const g = /\s\((M|F)\)$/.exec(line)
  if (g) {
    gender = g[1] as 'M' | 'F'
    line = line.slice(0, g.index).trim()
  }
  const open = line.lastIndexOf(' (')
  if (line.endsWith(')') && open > 0) {
    return { nickname: line.slice(0, open).trim(), species: line.slice(open + 2, -1).trim(), gender, item }
  }
  return { nickname: '', species: line, gender, item }
}

const emptySet = (head: ReturnType<typeof parseHeadline>): ShowdownSet => ({
  ...head,
  ability: null,
  level: null,
  shiny: false,
  happiness: null,
  nature: null,
  evs: null,
  ivs: null,
  moves: [],
})

/**
 * Read pasted text. Unknown lines are skipped rather than refused: later
 * generations add lines (Tera Type, Gigantamax) that mean nothing here.
 */
export function parseShowdown(text: string): ParsedText {
  const sets: ShowdownSet[] = []
  let teamName: string | null = null
  let headers = 0
  let current: ShowdownSet | null = null

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') {
      current = null
      continue
    }
    const header = /^===\s*(?:\[[^\]]*\]\s*)?(.*?)\s*===$/.exec(line)
    if (header) {
      headers++
      if (headers === 1) teamName = header[1] || null
      else break
      current = null
      continue
    }
    if (!current) {
      current = emptySet(parseHeadline(line))
      sets.push(current)
      continue
    }
    if (line.startsWith('- ') || line.startsWith('~ ')) {
      current.moves.push(line.slice(2).trim())
      continue
    }
    const nature = /^(.+?)\s+Nature$/i.exec(line)
    if (nature) {
      current.nature = nature[1].trim()
      continue
    }
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (key === 'ability' || key === 'trait') current.ability = value
    else if (key === 'level') current.level = Number(value)
    else if (key === 'shiny') current.shiny = /^(yes|true)$/i.test(value)
    else if (key === 'happiness') current.happiness = Number(value)
    else if (key === 'evs') current.evs = parseSpread(value)
    else if (key === 'ivs') current.ivs = parseSpread(value)
  }

  const further = text.split(/\r?\n/).filter((l) => /^\s*===.*===\s*$/.test(l)).length
  return { teamName, sets, extraTeams: Math.max(0, further - 1) }
}

const spreadLine = (spread: SdSpread): string =>
  SD_STATS.filter((s) => spread[s] != null)
    .map((s) => `${spread[s]} ${s}`)
    .join(' / ')

/** One set as Showdown writes it. Nulls and defaults are left out. */
export function formatSet(set: ShowdownSet): string {
  const name = set.nickname ? `${set.nickname} (${set.species})` : set.species
  const gender = set.gender ? ` (${set.gender})` : ''
  const item = set.item ? ` @ ${set.item}` : ''
  const lines = [`${name}${gender}${item}`]
  if (set.ability) lines.push(`Ability: ${set.ability}`)
  if (set.level != null && set.level !== 100) lines.push(`Level: ${set.level}`)
  if (set.shiny) lines.push('Shiny: Yes')
  if (set.happiness != null && set.happiness !== 255) lines.push(`Happiness: ${set.happiness}`)
  if (set.evs && Object.keys(set.evs).length) lines.push(`EVs: ${spreadLine(set.evs)}`)
  if (set.nature) lines.push(`${set.nature} Nature`)
  if (set.ivs && Object.keys(set.ivs).length) lines.push(`IVs: ${spreadLine(set.ivs)}`)
  for (const move of set.moves) lines.push(`- ${move}`)
  return lines.join('\n')
}

/** Teams separate with a blank line. No `===` header: see docs/SPEC.md. */
export const formatSets = (sets: ShowdownSet[]): string => sets.map(formatSet).join('\n\n')
