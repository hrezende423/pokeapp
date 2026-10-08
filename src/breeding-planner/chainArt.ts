/**
 * A breeding chain drawn the way the species page draws an evolution chain.
 *
 * Same vocabulary, different meaning on the connector: official artwork for each
 * Pokémon, the evolution chart's tapered chevron wedge between them (geometry
 * shared through pokedex/evoArrow.ts), and the requirement sitting under the
 * wedge as an item sprite plus a short label. On an evolution chart that is the
 * Rare Candy and "Lv.16"; here the wedge is a breeding, so it carries the Mystery
 * Egg and the egg group the two parents share, and the HOW-it-learns-it item
 * (Rare Candy + level, or the TM disc) sits under the source instead.
 *
 * Positions come from the chart's own layoutEvolution, fed a synthetic linear
 * chain of the species in the plan, so spacing and arrow lengths are the chart's.
 * Below the art there is a band the chart does not have: names, because unlike
 * the species page nothing here already says who is who.
 */

import { evolutionThumbUrl, getEggGroup, getItem, getMove } from '../data'
import type { EvolutionNode, Species } from '../data'
import { AH, AW, CHEVRON_TIPS, WEDGE_POINTS, chevronPoints } from '../modules/pokedex/evoArrow'
import { A, layoutEvolution } from '../modules/pokedex/evoLayout'
import { fatherOf, hatchlingFor, sourceFather } from './planner'
import type { Chain, Game, How } from './planner'

const RARE_CANDY_ITEM_ID = 50
const MYSTERY_EGG_ITEM_ID = 483
/**
 * Raw units below the artwork for the name and how-it-learns lines, and either
 * side of it so a centred name wider than its artwork is not cut at the edge.
 * Sized for the smallest scale the drawing allows (min-width in planner.css).
 */
const NAME_BAND = 90
const PAD_X = 40

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function art(s: Species): string {
  const variety = s.varieties.find((v) => v.is_default) ?? s.varieties[0]
  return (variety && evolutionThumbUrl(variety, false)) || ''
}

function sprite(itemId: number | null | undefined): string {
  const src = itemId != null ? getItem(itemId)?.sprite : null
  return src ? `<img class="bp-art-icon" src="${esc(src)}" alt="" loading="lazy" />` : ''
}

function learnRow(g: Game, how: How, moveId: number): string {
  switch (how.kind) {
    case 'level':
      return `${sprite(RARE_CANDY_ITEM_ID)}<span class="bp-mono">Lv.${Math.max(how.level, 1)}</span>`
    case 'machine': {
      const machine = getMove(moveId)?.machines.find((m) => m.version_group === g.vg.name)
      return `${sprite(machine?.item_id)}<span class="bp-mono">${esc(how.label)}</span>`
    }
    case 'tutor':
      return '<span>Tutor</span>'
    case 'sketch':
      return '<span>Sketch</span>'
  }
}

export function renderChainArt(g: Game, c: Chain, moveId: number, key: string): string {
  // Who stands at each point of the drawing: the source's breeding male, then
  // each line's hatchling. A hatchling that must evolve before it can breed says
  // so in its name band.
  const stages = c.lines.map((line, i) => {
    if (i === 0) return { species: sourceFather(c.source, line), evolveTo: null }
    const hatchling = hatchlingFor(g, line, moveId)
    const father = fatherOf(line)
    const last = i === c.lines.length - 1
    return { species: hatchling, evolveTo: !last && father !== hatchling ? father : null }
  })

  let root: EvolutionNode | null = null
  for (const stage of [...stages].reverse()) {
    root = { species_id: stage.species.id, evolution_details: [], evolves_to: root ? [root] : [] }
  }
  const layout = layoutEvolution(root as EvolutionNode)
  const W = layout.width + PAD_X * 2
  const H = layout.height + NAME_BAND
  const x = (v: number) => `${((v + PAD_X) / W) * 100}%`
  const w = (v: number) => `${(v / W) * 100}%`
  const y = (v: number) => `${(v / H) * 100}%`

  const arrows = layout.arrows
    .map((a, i) => {
      const id = `bp-wedge-${key}-${i}`
      return `<svg class="bp-art-arrow" viewBox="0 0 ${AW} ${AH}" aria-hidden="true" focusable="false"
        style="left:${x(a.mx - a.len / 2)};top:${y(a.my - a.thick / 2)};width:${w(a.len)};height:${y(a.thick)};transform:rotate(${a.angle}deg)">
        <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="currentColor" stop-opacity="0" />
          <stop offset="1" stop-color="currentColor" stop-opacity="1" />
        </linearGradient></defs>
        <polygon class="bp-art-wedge" fill="url(#${id})" points="${WEDGE_POINTS}" />
        ${CHEVRON_TIPS.map((t) => `<polygon class="bp-art-chevron" points="${chevronPoints(t)}" />`).join('')}
      </svg>`
    })
    .join('')

  // layoutEvolution lists arrows in its own walk order, not chain order, so each
  // one is matched to its breeding by the child it points at.
  const stepOf = (childId: number) => stages.findIndex((st) => st.species.id === childId) - 1

  const conditions = layout.arrows
    .map((a) => {
      const i = stepOf(a.child.species_id)
      const group = getEggGroup(c.groups[i])?.display_name ?? ''
      const mothers = c.lines[i + 1].mothers
      const mother = mothers[0]?.display_name ?? ''
      return `<div class="bp-art-cond" style="left:${x(a.cx)};top:${y(a.cy)}">
        <span class="bp-art-cond-row">${sprite(MYSTERY_EGG_ITEM_ID)}<span>${esc(group)}</span></span>
        <span class="bp-art-cond-sub">♀ ${esc(mother)}</span>
      </div>`
    })
    .join('')

  const nodes = layout.nodes
    .map((placed) => {
      const i = stages.findIndex((st) => st.species.id === placed.node.species_id)
      const stage = stages[i]
      const last = i === stages.length - 1
      const name = `${esc(stage.species.display_name)}${last ? '' : stage.evolveTo ? '' : ' ♂'}`
      const sub =
        i === 0
          ? `<span class="bp-art-sub">${learnRow(g, c.source.how, moveId)}</span>`
          : stage.evolveTo
            ? `<span class="bp-art-sub bp-muted">→ ${esc(stage.evolveTo.display_name)} ♂</span>`
            : last
              ? '<span class="bp-art-sub bp-muted">Hatches with it</span>'
              : ''
      const src = art(stage.species)
      return `
        <div class="bp-art-node" style="left:${x(placed.x)};top:${y(placed.y)};width:${w(A)};height:${y(A)}">
          ${src ? `<img class="bp-art-img" src="${esc(src)}" alt="${esc(stage.species.display_name)}" loading="lazy" />` : ''}
        </div>
        <div class="bp-art-label" style="left:${x(placed.x + A / 2)};top:${y(placed.y + A + 4)}">
          <span class="bp-art-name">${name}</span>${sub}
        </div>`
    })
    .join('')

  return `<div class="bp-art-scroll"><div class="bp-art" style="aspect-ratio:${W} / ${H};--bp-art-w:${W}">
    ${arrows}${conditions}${nodes}
  </div></div>`
}
