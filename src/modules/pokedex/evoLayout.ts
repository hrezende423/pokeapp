/**
 * Geometry for the evolution chart, in raw units where one artwork box is 100.
 *
 * EVERY CONSTANT IS READ OUT OF THE FIGMA LAYOUT FRAMES, not chosen. The file
 * carries nine hand-composed reference layouts beside the DetailPage itself
 * (layout-evo-single-stage 139:1170, -2-stage 139:1173, -3-stage 139:1179,
 * -2-branch 139:1181, -3-branch 139:1183, -2-stage-ghost 139:1187,
 * -2-branch-long 139:1193, -y-branch 139:1209, -eevee 139:1233). They draw the
 * artwork at 199 raw, so a raw value divided by 1.99 is a unit here:
 *
 *   poke-artwork          199        -> A            100
 *   horizontal art gap    192        -> HGAP_LINEAR   96
 *   branch x offset        83        -> HGAP_BRANCH    42
 *   sibling centre pitch  262 (-A)   -> VGAP           32
 *   text-xp-value       90 x 38      -> LABEL_SIZE     17
 *
 * The icon sizes come from layout-evo-eevee (139:1233) instead, which draws the
 * artwork at 205 and is the only frame with every icon register in it:
 *
 *   image-rare-candy / -evo-stone / -moss-rock / -ice-rock / -sun / -moon
 *                    81..98 raw of 205  = 0.40..0.48 A  -> ICON       45
 *   icon-add ("+")   45..46  raw of 205 = 0.22 A        -> PLUS       22
 *
 * The DetailPage's own evo chart (57:796) draws all of these much smaller (26 raw
 * against a 103 artwork, 0.25 A) because it is a cramped 550 x 516 box holding
 * eight nodes. The dedicated layout frames are the presentation spec, so they win.
 *
 * THE ARROW LENGTH FOLLOWS THE SPAN, at the reference's own ratio. arrow-evo-chain
 * is 280 x 61.5 in the linear frames, on a centre-to-centre span of 391 raw -- so
 * it is span minus 111 raw, which is 0.55 A, and it overlaps 0.22 A into each
 * artwork. The eevee frame stretches the same instance to ~570 x 90 on a 2.3 A
 * radial span, confirming the arrow is drawn to the gap rather than at one fixed
 * length.
 *
 * Thickness is derived rather than given: length / 4.55, which is 280 / 61.5. That
 * is the one thing a constant would break -- the SVG viewBox is 280 x 61.5, so any
 * other ratio stretches the chevrons.
 *
 * The diagonal instances are the same arrow rotated: their bounding boxes are
 * 273.237 x 193.261, and 280cos30 + 61.5sin30 = 273.24 with
 * 280sin30 + 61.5cos30 = 193.26.
 *
 * RADIAL IS FIGMA'S TOO, for Eevee. layout-evo-eevee puts Eevee's box centre at
 * (564.5, 548.5) with its seven children at radii of 2.13 to 2.45 A (mean 2.31) on
 * angles of -140.6, -90.3, -34.5, 16.6, 62.4, 117.7 and 163.3 degrees -- an even
 * 360/7 = 51.4 apart with one child straight up. That is exactly
 * `-90 + k * 360 / n`, so the radial case is a formula rather than a transcription.
 * (The DetailPage's cramped chart agrees on the angles and reads 1.92 A on the
 * radius; the dedicated frame's 2.30 is the one used.)
 */

import type { EvolutionNode } from '../../data'

/** One artwork box. Every other constant is expressed against it. */
export const A = 100

export const HGAP_LINEAR = 96
export const HGAP_BRANCH = 42
/*
  0.40 A rather than the frames' 0.317: the reference places each branch's label by
  hand to miss its neighbours, and a renderer that cannot do that has to buy the
  clearance with the gap instead.
*/
export const VGAP = 40
/*
  A three-way fan needs more, because its MIDDLE branch is horizontal: its arrow
  runs level with the parent, so the condition group beside that arrow lands in the
  same band as the parent's artwork and the siblings above and below it. 0.80 A is
  what clears all three. Two-way fans are unaffected -- both their arrows are
  diagonal, so the groups are already off the parent's row.

  Both of these are deliberate deviations from the frames, and the only ones in
  this file.
*/
export const VGAP_WIDE = 80
export const VGAP_WIDE_FROM = 3

/** Span minus this is the drawn arrow length. 111 raw of a 199 artwork. */
export const ARROW_INSET = 55
/** Never shorter than this, so a tight fan still draws a readable wedge. */
export const ARROW_MIN = 90
/** 280 / 61.5, the arrow artwork's own ratio. Thickness is length / this. */
export const ARROW_RATIO = 280 / 61.5

/*
  The icon registers, mid-range of the frames rather than either extreme: the
  branch frames draw image-rare-candy at 0.372 A and their secondary icons at
  0.327 A, while layout-evo-eevee draws everything at 0.40..0.48 A. 0.40 / 0.36
  sits between them, which is what a renderer serving both layouts needs -- eevee's
  own sizes made "Lv.37" and the King's Rock overrun Slowbro on the branch charts.
*/
export const ITEM_ICON = 40
export const COND_ICON = 36
export const PLUS = 22
export const LABEL_SIZE = 15

/** Radial radius, and the branch count at which a fan becomes a circle. */
export const RADIAL_R = 230
export const RADIAL_FROM = 4

/**
 * How far the condition group sits off the arrow's centreline on a fan or linear
 * step. 0.34 A, from image-evo-stone's 169 raw centre against the arrow's 99.75.
 */
export const COND_OFFSET = 34

/**
 * Where along a RADIAL ray the condition group sits, as a fraction of the span.
 *
 * Not the midpoint: layout-evo-eevee puts Umbreon's three icons at radii of
 * 1.33, 1.73 and 1.92 A on a 2.30 A ray, so the group is centred around 0.63 of
 * the way out. The midpoint is also where neighbouring rays are still close
 * together -- at 0.5 the seven groups collided with each other, which is a real
 * reason as well as the reference's.
 */
export const RADIAL_COND_AT = 0.62

export interface PlacedNode {
  node: EvolutionNode
  /** Top-left of the A x A artwork box. */
  x: number
  y: number
}

export interface PlacedArrow {
  parent: EvolutionNode
  child: EvolutionNode
  /** Arrow midpoint -- the centre of the rotated len x thick box. */
  mx: number
  my: number
  /** Degrees clockwise from pointing right. */
  angle: number
  /** Drawn size, derived from the span. See ARROW_INSET / ARROW_RATIO. */
  len: number
  thick: number
  /** Where the condition group is centred. */
  cx: number
  cy: number
}

export interface EvoLayout {
  width: number
  height: number
  nodes: PlacedNode[]
  arrows: PlacedArrow[]
}

interface Sub {
  width: number
  height: number
  /** Centre of this subtree's ROOT box, so a parent can aim at it. */
  rootCx: number
  rootCy: number
  nodes: PlacedNode[]
  arrows: PlacedArrow[]
}

function shift(sub: Sub, dx: number, dy: number): Sub {
  return {
    width: sub.width,
    height: sub.height,
    rootCx: sub.rootCx + dx,
    rootCy: sub.rootCy + dy,
    nodes: sub.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
    arrows: sub.arrows.map((a) => ({
      ...a,
      mx: a.mx + dx,
      my: a.my + dy,
      cx: a.cx + dx,
      cy: a.cy + dy,
    })),
  }
}

/**
 * The arrow between two box centres.
 *
 * `radial` moves the condition group onto the arrow itself rather than off to one
 * side: the Eevee frame puts each stone directly on its ray, whereas a linear or
 * fan step puts the rare candy below the arrow (or above it, on an upward
 * branch -- which is the rule the reference follows and why the sign of dy
 * decides).
 */
function connect(
  parent: EvolutionNode,
  child: EvolutionNode,
  px: number,
  py: number,
  cx2: number,
  cy2: number,
  mode: 'linear' | 'fan' | 'radial',
): PlacedArrow {
  const dx = cx2 - px
  const dy = cy2 - py
  const mx = px + dx / 2
  const my = py + dy / 2
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  const span = Math.hypot(dx, dy) || 1
  const len = Math.max(ARROW_MIN, span - ARROW_INSET)

  if (mode === 'radial') {
    return {
      parent,
      child,
      mx,
      my,
      angle,
      len,
      thick: len / ARROW_RATIO,
      cx: px + dx * RADIAL_COND_AT,
      cy: py + dy * RADIAL_COND_AT,
    }
  }

  /*
    OFF THE ARROW'S OWN PERPENDICULAR, not straight down.

    A linear step is horizontal, so the two are the same thing and this reduces to
    the frames' "rare candy 0.30 A below the centreline". On a fan they are not: a
    branch climbing at 50 degrees with its group pushed straight down puts that
    group across the arrow it belongs to and into the artwork below. Perpendicular
    keeps "beside this arrow" true whatever angle the arrow is at.

    The sign points AWAY from the fan's centre line -- up for a branch going up,
    down for one going down -- which is the side the frames use.
  */
  const away = dy < -10 ? -1 : 1
  const nx = (-dy / span) * away
  const ny = (dx / span) * away
  /*
    The MIDDLE branch of a fan is horizontal and its group would sit at the span
    midpoint, which on a tight fan is still over the parent artwork. Pushed to 0.68
    of the way out instead -- the diagonal branches do not need it, because the
    perpendicular offset has already taken them clear of the parent row.
  */
  const at = mode === 'fan' && Math.abs(dy) <= 10 ? 0.68 : 0.5
  return {
    parent,
    child,
    mx,
    my,
    angle,
    len,
    thick: len / ARROW_RATIO,
    cx: px + dx * at + nx * COND_OFFSET,
    cy: py + dy * at + ny * COND_OFFSET,
  }
}

function layoutSub(node: EvolutionNode): Sub {
  const children = node.evolves_to

  if (children.length === 0) {
    return {
      width: A,
      height: A,
      rootCx: A / 2,
      rootCy: A / 2,
      nodes: [{ node, x: 0, y: 0 }],
      arrows: [],
    }
  }

  if (children.length >= RADIAL_FROM) return layoutRadial(node)

  const subs = children.map(layoutSub)
  const hgap = children.length === 1 ? HGAP_LINEAR : HGAP_BRANCH
  const vgap = children.length >= VGAP_WIDE_FROM ? VGAP_WIDE : VGAP
  const childX = A + hgap

  // Stack the children, then centre the parent between the first and last child's
  // ROOT centres -- not on the whole stack, which would drift the parent downward
  // whenever one branch grew a deeper tail than its sibling.
  let y = 0
  const placed: { sub: Sub; top: number }[] = []
  for (const sub of subs) {
    placed.push({ sub: shift(sub, childX, y), top: y })
    y += sub.height + vgap
  }
  const first = placed[0].sub
  const last = placed[placed.length - 1].sub
  const parentY = (first.rootCy + last.rootCy) / 2 - A / 2

  // A parent aimed above the top of the stack has to push everything down rather
  // than be clipped at a negative y.
  const dy = parentY < 0 ? -parentY : 0
  const shifted = placed.map((p) => ({ sub: shift(p.sub, 0, dy), top: p.top + dy }))
  const py = parentY + dy

  const nodes: PlacedNode[] = [{ node, x: 0, y: py }]
  const arrows: PlacedArrow[] = []
  for (const p of shifted) {
    nodes.push(...p.sub.nodes)
    arrows.push(...p.sub.arrows)
  }
  for (let i = 0; i < shifted.length; i++) {
    arrows.push(
      connect(
        node,
        children[i],
        A / 2,
        py + A / 2,
        shifted[i].sub.rootCx,
        shifted[i].sub.rootCy,
        children.length === 1 ? 'linear' : 'fan',
      ),
    )
  }

  return {
    width: childX + Math.max(...shifted.map((p) => p.sub.width)),
    height: Math.max(py + A, ...shifted.map((p) => p.top + p.sub.height)),
    rootCx: A / 2,
    rootCy: py + A / 2,
    nodes,
    arrows,
  }
}

/**
 * Eevee: the parent in the middle, children on a circle at `-90 + k * 360 / n`.
 *
 * Children are laid out as subtrees rather than assumed to be leaves, even though
 * every radial chain in Gen 1-4 scope has leaf children -- the alternative is a
 * silent wrong answer if that ever stops being true.
 */
function layoutRadial(node: EvolutionNode): Sub {
  const children = node.evolves_to
  const subs = children.map(layoutSub)
  const step = 360 / children.length

  // Parent box centre at the origin; solve every position there, then translate.
  const placed = subs.map((sub, i) => {
    const rad = ((-90 + i * step) * Math.PI) / 180
    const tx = Math.cos(rad) * RADIAL_R - sub.rootCx
    const ty = Math.sin(rad) * RADIAL_R - sub.rootCy
    return shift(sub, tx, ty)
  })

  const parent: PlacedNode = { node, x: -A / 2, y: -A / 2 }
  const boxes = [
    { x0: parent.x, y0: parent.y, x1: parent.x + A, y1: parent.y + A },
    ...placed.map((p) => ({
      x0: p.rootCx - p.width / 2,
      y0: p.rootCy - p.height / 2,
      x1: p.rootCx - p.width / 2 + p.width,
      y1: p.rootCy - p.height / 2 + p.height,
    })),
  ]
  // The condition icons sit on the rays, well inside the artwork bounds, so the
  // artwork boxes alone define the extent.
  const minX = Math.min(...boxes.map((b) => b.x0))
  const minY = Math.min(...boxes.map((b) => b.y0))
  const maxX = Math.max(...boxes.map((b) => b.x1))
  const maxY = Math.max(...boxes.map((b) => b.y1))

  const dx = -minX
  const dy = -minY
  const shifted = placed.map((p) => shift(p, dx, dy))
  const nodes: PlacedNode[] = [{ node, x: parent.x + dx, y: parent.y + dy }]
  const arrows: PlacedArrow[] = []
  for (const p of shifted) {
    nodes.push(...p.nodes)
    arrows.push(...p.arrows)
  }
  for (let i = 0; i < shifted.length; i++) {
    arrows.push(connect(node, children[i], dx, dy, shifted[i].rootCx, shifted[i].rootCy, 'radial'))
  }

  return {
    width: maxX - minX,
    height: maxY - minY,
    rootCx: dx,
    rootCy: dy,
    nodes,
    arrows,
  }
}

export function layoutEvolution(chain: EvolutionNode): EvoLayout {
  const sub = layoutSub(chain)
  return { width: sub.width, height: sub.height, nodes: sub.nodes, arrows: sub.arrows }
}
