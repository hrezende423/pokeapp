/**
 * The evolution chart's tapered chevron wedge, as pure geometry.
 *
 * Moved out of EvolutionTree.tsx unchanged so a second drawing (the standalone
 * breeding chain planner) can use the same connector without copying it. The
 * chart's behaviour is untouched: EvolutionTree imports these values back.
 */

/*
  THE ARROW'S OWN GEOMETRY, derived rather than three magic point lists.

  THE WEDGE is an isosceles trapezoid stood on its side: the two parallel sides
  are vertical (17.5 units tall at the tail, the full 61.5 at the head) and the
  two equal legs are the slanted top and bottom edges. ARROW_RATIO keeps the
  viewBox at 280 : 61.5 whatever the span, so the legs never change angle and the
  box is isotropic -- a 45 degree line in these units is 45 degrees on screen.

  THE CHEVRONS ARE RECTANGULAR, AND THEIR ENDS LIE ON THE LEGS. That is the
  correction: they were stroked polylines with round caps and a round elbow, which
  is a generic arrow glyph sitting on top of the wedge rather than part of it.
  Each one is now a six-point polygon --

    tip on the centreline at `tipX`
    two arms leaving it at 45 degrees back toward the tail
    a constant horizontal thickness, so the inner outline is the outer outline
      shifted toward the tail
    each arm ending ON the leg it meets, INSET units inside it

  -- and the last property is what makes them read as part of the shape: the cut
  across each arm end is parallel to the leg, so a chevron is exactly as tall as
  the band is wherever it sits, and the three of them grow toward the head with
  it.
*/
export const AW = 280
export const AH = 61.5
/** The centreline: both parallel sides are centred on it, so it is AH / 2. */
const CY = AH / 2
/** The legs' gradient -- 22 units of rise over the wedge's 280 of run. */
const LEG = 22 / AW
/** How far inside the leg an arm end stops, so a sliver of wedge stays visible. */
const CHEVRON_INSET = 2.5
/** Horizontal thickness of a chevron arm. */
const CHEVRON_THICK = 13
/** Tip x of the three chevrons, centred on the wedge the way the frames draw them. */
export const CHEVRON_TIPS = [148, 190, 232]

/**
 * Where an arm leaving (tipX, CY) at 45 degrees meets the inset upper leg.
 *
 * upper leg, inset:  y = (22 + INSET) - LEG * x
 * arm from the tip:  y = CY - (tipX - x)
 *
 * The wedge is symmetric about CY and AH = 2 * CY, so the lower arm's end is the
 * mirror of this one and needs no second solve.
 */
function armEnd(tipX: number): { x: number; y: number } {
  const x = (22 + CHEVRON_INSET - CY + tipX) / (1 + LEG)
  return { x, y: 22 + CHEVRON_INSET - LEG * x }
}

const r2 = (v: number) => Math.round(v * 100) / 100

/** The six points of one chevron, outer arm end -> tip -> round to the inner tip. */
export function chevronPoints(tipX: number): string {
  const outer = armEnd(tipX)
  const inner = armEnd(tipX - CHEVRON_THICK)
  return [
    `${r2(outer.x)},${r2(outer.y)}`,
    `${tipX},${CY}`,
    `${r2(outer.x)},${r2(AH - outer.y)}`,
    `${r2(inner.x)},${r2(AH - inner.y)}`,
    `${tipX - CHEVRON_THICK},${CY}`,
    `${r2(inner.x)},${r2(inner.y)}`,
  ].join(' ')
}

/** The trapezoid itself: tail 17.5 tall, head the full 61.5, legs equal. */
export const WEDGE_POINTS = `0,22 ${AW},0 ${AW},${AH} 0,${AH - 22}`
