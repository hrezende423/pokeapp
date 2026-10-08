/**
 * Breeding chain planner — a standalone page, detached from the app shell.
 *
 * Built on the v2 design system only (design-system/dist/tokens.css): compact
 * density, ghost controls, underline fields, no accent (there is no nav and no
 * tab here, so nothing is "you are here"). It reuses the app's data layer and
 * its generation-scoped species list rather than reading the bundle itself.
 */

import '../../design-system/dist/tokens.css'
// Only for the bundled IBM Plex Sans / Martian Mono @font-face rules.
import '../design-tokens.css'
import './planner.css'

import {
  genderRatio,
  getEggGroup,
  getMove,
  getSpriteUrl,
  getType,
  initDataLayer,
  resolveTypesForGeneration,
} from '../data'
import type { Species, VersionGroup } from '../data'
import { resolveMoveTypeNameForGeneration } from '../data/moveEra'
import {
  UNDISCOVERED_GROUP,
  breedingGames,
  breedingsFor,
  eggMovesOf,
  fatherOf,
  hatchlingFor,
  loadGame,
  planMove,
  sourceFather,
} from './planner'
import { renderChainArt } from './chainArt'
import type { Chain, EggMove, Game, How, Knower, Line, Plan } from './planner'

interface State {
  game: string
  speciesId: number
  moveId: number | null
  sketch: boolean
  showAll: boolean
}

const DEFAULTS = { game: 'heartgold-soulsilver', speciesId: 133 }
const CHAINS_SHOWN = 8

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const CHEVRON =
  '<svg class="bp-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6l6 -6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'

function readUrl(): State {
  const q = new URLSearchParams(location.search)
  const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null)
  return {
    game: q.get('game') ?? DEFAULTS.game,
    speciesId: num(q.get('species')) ?? DEFAULTS.speciesId,
    moveId: num(q.get('move')),
    sketch: q.get('sketch') === '1',
    showAll: false,
  }
}

function writeUrl(s: State): void {
  const q = new URLSearchParams({ game: s.game, species: String(s.speciesId) })
  if (s.moveId != null) q.set('move', String(s.moveId))
  if (s.sketch) q.set('sketch', '1')
  history.replaceState(null, '', `${location.pathname}?${q}`)
}

const state = readUrl()
let game: Game | null = null

/* ---------- small renderers ---------- */

function typeLabel(name: string | null): string {
  if (!name) return ''
  // Curse's Gen 2-4 type has no colour token; it reads as the games print it.
  if (name === 'unknown') return '<span class="bp-type bp-muted">???</span>'
  return `<span class="bp-type" style="color: var(--color-type-text-${esc(name)})">${esc(name)}</span>`
}

function speciesTypes(s: Species, generation: number): string {
  const variety = s.varieties.find((v) => v.is_default) ?? s.varieties[0]
  if (!variety) return ''
  return resolveTypesForGeneration(variety, generation)
    .map((slot) => typeLabel(getType(slot.type_id)?.name ?? null))
    .join('<span class="bp-sep" aria-hidden="true">·</span>')
}

const groupName = (id: number): string => getEggGroup(id)?.display_name ?? String(id)

const names = (list: Species[]): string => list.map((s) => esc(s.display_name)).join(' / ')

function howText(how: How): string {
  switch (how.kind) {
    case 'level':
      return how.level <= 1 ? 'Knows it from Lv 1' : `Learns it at Lv ${how.level}`
    case 'machine':
      return `Learns it from ${esc(how.label)}`
    case 'tutor':
      return 'Learns it from a move tutor'
    case 'sketch':
      return 'Sketches it (needs to see it used)'
  }
}

function knowerText(k: Knower, line: Line): string {
  const via = k.species !== sourceFather(k, line) ? ` (as ${esc(k.species.display_name)})` : ''
  return `${howText(k.how)}${via}`
}

function kv(rows: [string, string][]): string {
  return `<dl class="bp-kv">${rows
    .map(([k, v]) => `<div class="bp-kv-row"><dt>${esc(k)}</dt><dd>${v}</dd></div>`)
    .join('')}</dl>`
}

/* ---------- identity ---------- */

function renderIdentity(g: Game, line: Line, s: Species): string {
  const sprite = getSpriteUrl(s.id, { hasGenderDifference: s.has_gender_differences })
  const ratio = genderRatio(s.gender_rate)
  const gender = ratio
    ? `<span class="bp-mono">${ratio.male}% ♂ · ${ratio.female}% ♀</span>`
    : '<span class="bp-muted">Genderless</span>'
  const groups = s.egg_group_ids.map(groupName).map(esc).join(' · ')
  const hatches = line.incense
    ? `${esc(line.root.display_name)} <span class="bp-muted">with ${esc(line.incense.item)} held${
        line.incense.otherwise ? `, otherwise ${esc(line.incense.otherwise.display_name)}` : ''
      }</span>`
    : esc(line.root.display_name)
  const mothers = line.mothers.length
    ? names(line.mothers)
    : '<span class="bp-muted">None — cannot inherit egg moves</span>'
  return `
    <div class="bp-portrait">
      <span class="bp-watermark" aria-hidden="true">${String(s.id).padStart(3, '0')}</span>
      ${sprite ? `<img class="bp-sprite" src="${esc(sprite)}" alt="" width="160" height="160" />` : ''}
    </div>
    <p class="bp-id"><span class="bp-muted bp-mono">#${String(s.id).padStart(3, '0')}</span></p>
    <h2 class="bp-name">${esc(s.display_name)}</h2>
    <p class="bp-types">${speciesTypes(s, g.generation)}</p>
    ${kv([
      ['Egg groups', groups],
      ['Gender', gender],
      ['Hatches as', hatches],
      ['Mother', mothers],
      ['Egg cycles', `<span class="bp-mono">${s.hatch_counter ?? '—'}</span>`],
    ])}`
}

/* ---------- egg move list ---------- */

interface MoveEntry {
  egg: EggMove
  name: string
  breedings: number | null
}

function moveEntries(g: Game, line: Line): MoveEntry[] {
  return eggMovesOf(g, line)
    .map((egg) => ({
      egg,
      name: getMove(egg.moveId)?.display_name ?? `Move ${egg.moveId}`,
      breedings: egg.holders.length ? breedingsFor(g, line, egg.moveId, state.sketch) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function renderMoves(g: Game, entries: MoveEntry[]): string {
  if (entries.length === 0) {
    return `<h3 class="bp-caps">Egg moves</h3><p class="bp-empty">No egg moves in ${esc(gameName(g))}.</p>`
  }
  const rows = entries
    .map((e) => {
      const move = getMove(e.egg.moveId)
      const type = move ? resolveMoveTypeNameForGeneration(move, g.generation) : null
      const cell =
        e.breedings != null
          ? `<span class="bp-mono">${e.breedings}</span>`
          : e.egg.lightBall && !e.egg.holders.length
            ? '<span class="bp-muted">Light Ball</span>'
            : '<span class="bp-muted">—</span>'
      const selected = e.egg.moveId === state.moveId
      return `<li><button type="button" class="bp-move${selected ? ' is-selected' : ''}" data-move="${e.egg.moveId}" aria-pressed="${selected}">
        <span class="bp-move-name">${esc(e.name)}</span>${typeLabel(type)}<span class="bp-move-steps">${cell}</span>
      </button></li>`
    })
    .join('')
  return `
    <h3 class="bp-caps">Egg moves <span class="bp-count">${entries.length}</span></h3>
    <div class="bp-move-head" aria-hidden="true"><span>Move</span><span>Type</span><span>Breedings</span></div>
    <ul class="bp-move-list">${rows}</ul>`
}

/* ---------- chains ---------- */

function chainSummary(g: Game, c: Chain, moveId: number): string {
  return c.lines
    .map((l, i) =>
      esc((i === 0 ? sourceFather(c.source, l) : i === c.lines.length - 1 ? hatchlingFor(g, l, moveId) : fatherOf(l)).display_name),
    )
    .join(' → ')
}

function renderStep(g: Game, c: Chain, i: number, moveId: number, moveName: string, last: boolean): string {
  const father = c.lines[i]
  const child = c.lines[i + 1]
  const fatherName = (i === 0 ? sourceFather(c.source, father) : fatherOf(father)).display_name
  const knowsIt = i === 0 ? knowerText(c.source, father) : `Hatched with it in breeding ${i}`
  const hatchling = hatchlingFor(g, child, moveId)
  const incense = child.incense
    ? ` <span class="bp-muted">(${hatchling === child.root ? 'hold' : 'no'} ${esc(child.incense.item)})</span>`
    : ''
  const raise = fatherOf(child) !== hatchling ? ` and evolve it into ${esc(fatherOf(child).display_name)}` : ''
  const result = `${esc(hatchling.display_name)} hatches knowing ${esc(moveName)}${incense}${
    last ? '' : ` — raise a male${raise}`
  }`
  return `
    <li class="bp-step">
      <p class="bp-caps">Breeding ${i + 1}</p>
      ${kv([
        ['Father', `${esc(fatherName)} ♂ <span class="bp-muted">${knowsIt}</span>`],
        ['Mother', `${names(child.mothers)} ♀`],
        ['Shared group', esc(groupName(c.groups[i]))],
        ['Egg', result],
      ])}
    </li>`
}

function renderChain(g: Game, c: Chain, n: number, moveId: number, moveName: string): string {
  const steps = c.lines
    .slice(0, -1)
    .map((_, i) => renderStep(g, c, i, moveId, moveName, i === c.lines.length - 2))
    .join('')
  const breedings = c.lines.length - 1
  return `
    <section class="bp-section bp-chain" aria-label="Chain ${n + 1}: ${chainSummary(g, c, moveId)}">
      <p class="bp-caps bp-muted">Chain ${n + 1} · ${breedings} breeding${breedings === 1 ? '' : 's'}</p>
      ${renderChainArt(g, c, moveId, String(n))}
      <h4 class="bp-section-head">
        <button type="button" aria-expanded="false" data-chain="${n}">
          <span class="bp-caps">Steps</span>
          <span class="bp-section-summary bp-muted">Father, mother and egg for each breeding</span>
          ${CHEVRON}
        </button>
      </h4>
      <ol class="bp-steps" hidden>${steps}</ol>
    </section>`
}

function renderPlan(g: Game, line: Line, target: Species, entry: MoveEntry | undefined): string {
  if (!entry) {
    return `<p class="bp-empty">Pick an egg move to see who can pass it down.</p>`
  }
  const moveName = entry.name
  const plan: Plan = planMove(g, line, entry.egg.moveId, state.sketch)
  const notes: string[] = []

  if (entry.egg.lightBall) {
    notes.push(
      `<p class="bp-note"><span class="bp-caps">Light Ball</span>Breed a Pikachu or Raichu holding a Light Ball and the Pichu hatches knowing ${esc(moveName)}. No father needed.</p>`,
    )
  }
  if (plan.selfLearn) {
    notes.push(
      `<p class="bp-note"><span class="bp-caps">No breeding needed</span>${esc(target.display_name)}'s line also ${knowerText(plan.selfLearn, line).toLowerCase()} in this game.</p>`,
    )
  }
  if (entry.egg.holders.length && entry.egg.holders.some((h) => h !== line.root)) {
    notes.push(
      `<p class="bp-note"><span class="bp-caps">Hatchling</span>Only ${names(entry.egg.holders)} hatches with it${
        line.incense
          ? ` — breed ${entry.egg.holders.includes(line.root) ? 'with' : 'without'} the ${esc(line.incense.item)} held`
          : ''
      }.</p>`,
    )
  }

  let body: string
  if (line.mothers.length === 0) {
    body = `<p class="bp-empty">${esc(target.display_name)} has no female that can breed${
      target.egg_group_ids.includes(UNDISCOVERED_GROUP) ? ' (Undiscovered egg group)' : ''
    }, so it cannot inherit egg moves in Gen 2–4.</p>`
  } else if (!entry.egg.holders.length) {
    body = ''
  } else if (plan.breedings == null) {
    body = `<p class="bp-empty">No chain in ${esc(gameName(g))}: no compatible line's males can learn ${esc(moveName)}${
      state.sketch ? '' : '. Turning on Smeargle may open one'
    }.</p>`
  } else {
    const shown = state.showAll ? plan.chains : plan.chains.slice(0, CHAINS_SHOWN)
    const more =
      plan.chains.length > shown.length
        ? `<button type="button" class="bp-ghost" data-action="show-all">Show all ${plan.chains.length} chains</button>`
        : ''
    const capped =
      plan.chainCount > plan.chains.length
        ? `<p class="bp-muted bp-small">Showing the first ${plan.chains.length} of ${plan.chainCount} chains.</p>`
        : ''
    body = `
      ${kv([
        ['Fewest breedings', `<span class="bp-mono">${plan.breedings}</span>`],
        ['Chains', `<span class="bp-mono">${plan.chainCount}</span>`],
      ])}
      <div class="bp-chain-list">${shown.map((c, i) => renderChain(g, c, i, entry.egg.moveId, moveName)).join('')}</div>
      ${capped}${more}`
  }

  return `
    <h3 class="bp-plan-title">${esc(moveName)} <span class="bp-muted">→ ${esc(target.display_name)}</span></h3>
    ${notes.join('')}
    ${body}`
}

/* ---------- page ---------- */

const VERSION_NAMES: Record<string, string> = {
  firered: 'FireRed',
  leafgreen: 'LeafGreen',
  heartgold: 'HeartGold',
  soulsilver: 'SoulSilver',
}

const versionsLabel = (vg: VersionGroup): string =>
  vg.versions
    .filter((v): v is string => !!v)
    .map((v) => VERSION_NAMES[v] ?? v.charAt(0).toUpperCase() + v.slice(1))
    .join(' / ')

const gameName = (g: Game): string => versionsLabel(g.vg)

function render(): void {
  const g = game
  if (!g) return
  const target = g.species.find((s) => s.id === state.speciesId)
  const field = $<HTMLInputElement>('#bp-species')
  const error = $<HTMLParagraphElement>('#bp-species-error')
  if (!target) {
    error.textContent = `Not in ${gameName(g)}.`
    field.setAttribute('aria-invalid', 'true')
    return
  }
  error.textContent = ''
  field.removeAttribute('aria-invalid')
  if (document.activeElement !== field) field.value = target.display_name

  const line = g.lineOf.get(target.id) as Line
  const entries = moveEntries(g, line)
  if (!entries.some((e) => e.egg.moveId === state.moveId)) {
    const firstReachable = entries.find((e) => e.breedings != null) ?? entries[0]
    state.moveId = firstReachable?.egg.moveId ?? null
  }
  writeUrl(state)

  $('#bp-identity').innerHTML = renderIdentity(g, line, target)
  $('#bp-moves').innerHTML = renderMoves(g, entries)
  $('#bp-plan').innerHTML = renderPlan(
    g,
    line,
    target,
    entries.find((e) => e.egg.moveId === state.moveId),
  )
  document.title = `${target.display_name} · Breeding chain planner`
}

async function selectGame(name: string): Promise<void> {
  const games = breedingGames()
  const vg = games.find((v) => v.name === name) ?? games[games.length - 1]
  state.game = vg.name
  $('#bp-status').textContent = 'Loading learnsets…'
  $('#bp-body').setAttribute('aria-busy', 'true')
  game = await loadGame(vg)
  $('#bp-status').textContent = ''
  $('#bp-body').removeAttribute('aria-busy')

  $('#bp-species-options').innerHTML = game.species
    .map((s) => `<option value="${esc(s.display_name)}"></option>`)
    .join('')
  if (!game.species.some((s) => s.id === state.speciesId)) state.speciesId = DEFAULTS.speciesId
  render()
}

function pickSpecies(value: string): void {
  if (!game) return
  const wanted = value.trim().toLowerCase()
  const hit = game.species.find((s) => s.display_name.toLowerCase() === wanted)
  if (!hit) {
    $('#bp-species-error').textContent = wanted ? `No Pokémon called “${value.trim()}” in ${gameName(game)}.` : ''
    $('#bp-species').setAttribute('aria-invalid', 'true')
    return
  }
  state.speciesId = hit.id
  state.moveId = null
  state.showAll = false
  render()
}

function wire(): void {
  const select = $<HTMLSelectElement>('#bp-game')
  select.addEventListener('change', () => {
    state.moveId = null
    state.showAll = false
    void selectGame(select.value)
  })

  const field = $<HTMLInputElement>('#bp-species')
  field.addEventListener('change', () => pickSpecies(field.value))
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') pickSpecies(field.value)
  })
  field.addEventListener('focus', () => field.select())

  const sketch = $<HTMLButtonElement>('#bp-sketch')
  sketch.setAttribute('aria-checked', String(state.sketch))
  sketch.addEventListener('click', () => {
    state.sketch = !state.sketch
    sketch.setAttribute('aria-checked', String(state.sketch))
    render()
  })

  $('#bp-body').addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('button')
    if (!el) return
    if (el.dataset.move) {
      state.moveId = Number(el.dataset.move)
      state.showAll = false
      render()
      if (matchMedia('(max-width: 899px)').matches) $('#bp-plan').scrollIntoView({ block: 'start' })
    } else if (el.dataset.chain) {
      const open = el.getAttribute('aria-expanded') !== 'true'
      el.setAttribute('aria-expanded', String(open))
      const section = el.closest('.bp-section') as HTMLElement
      section.classList.toggle('is-open', open)
      ;(section.querySelector('.bp-steps') as HTMLElement).hidden = !open
    } else if (el.dataset.action === 'show-all') {
      state.showAll = true
      render()
    }
  })
}

async function boot(): Promise<void> {
  wire()
  try {
    $('#bp-status').textContent = 'Loading Pokémon data…'
    await initDataLayer()
    const select = $<HTMLSelectElement>('#bp-game')
    select.innerHTML = breedingGames()
      .map((vg) => `<option value="${vg.name}">${esc(versionsLabel(vg))} · Gen ${vg.generation_id}</option>`)
      .join('')
    await selectGame(state.game)
    select.value = state.game
  } catch (err) {
    $('#bp-status').textContent = `Could not load the data: ${err instanceof Error ? err.message : String(err)}`
  }
}

void boot()
