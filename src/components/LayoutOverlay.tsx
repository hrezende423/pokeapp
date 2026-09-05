/**
 * A layout inspector, so a layout change can be NAMED instead of nudged.
 *
 * WHY THIS EXISTS. Reviewing a screen by eye produces notes like "move the
 * types up a bit" and "that gap is too big" -- which are unambiguous to the
 * person looking at the page and nearly useless to the person editing the CSS,
 * because neither the element nor the amount is identified. Every one of those
 * notes then costs a round trip. This draws the structure the CSS actually
 * declares, over the real page, so a note can say "put `kana` in the `shiny`
 * row" or "spreads gap 32 -> 20" -- which is precise, and is literally the code.
 *
 * IT DRAWS THE SPACE, NOT JUST THE BOXES. Outlines alone answer "where does
 * this region sit" and say nothing about the two things every layout note is
 * actually about: the GAP between siblings and the PADDING inside a parent.
 * Both are invisible by construction -- they are the absence of content -- so
 * an inspector that only outlines elements leaves the reviewer describing them
 * in prose again. Each band is filled and carries its own measurement, so the
 * number sits where the space is rather than in a caption somewhere else.
 *
 * IT SHIPS IN THE PRODUCTION BUNDLE, deliberately. The whole point is to be
 * usable against the deployed preview from a phone, which is where this app
 * gets reviewed; a `import.meta.env.DEV` gate would put it exactly where it is
 * no use. It costs a couple of KB and does nothing at all until switched on.
 *
 * TWO WAYS IN, because one of them has to work without a keyboard:
 *   ?layout=1  on any URL   -- the phone route, and shareable in a screenshot
 *   Ctrl+Shift+L            -- the desktop route
 *
 * IT READS THE COMPUTED STYLE rather than a second list of names kept in the
 * markup. An area's name lives in `grid-template-areas` in the stylesheet and
 * nowhere else, so the overlay cannot drift out of step with the CSS it is
 * describing -- if it says `shiny`, that string is in the stylesheet.
 */

import { useEffect, useState, type CSSProperties } from 'react'

/** What the overlay draws for one rectangle. */
interface Box {
  key: string
  /** Viewport rect, in CSS px. */
  x: number
  y: number
  w: number
  h: number
  label: string
  kind: 'container' | 'area' | 'gap' | 'pad'
  /** How many named containers this sits inside. Staggers the caption. */
  depth: number
}

const PARAM = 'layout'

/** Sub-pixel track sizes are noise in a caption; 20.0004 is a 20. */
const round = (n: number) => Math.round(n * 10) / 10

const num = (v: string) => (v === '' || v === 'normal' ? 0 : parseFloat(v) || 0)

function initiallyOn(): boolean {
  try {
    return new URLSearchParams(window.location.search).get(PARAM) === '1'
  } catch {
    return false
  }
}

/**
 * A grid child's area name, or null when it is auto-placed.
 *
 * `gridArea` computes to a name when one was given and to a line-number
 * quadruple ("1 / 1 / -1 / -1", or "auto / auto / auto / auto") when it was
 * not, so anything containing a digit or `auto` is not a name.
 */
function areaName(style: CSSStyleDeclaration): string | null {
  const raw = style.gridArea?.trim()
  if (!raw || raw === 'auto' || raw.includes('/') || /\d/.test(raw)) return null
  return raw
}

/** How many `[data-layout]` ancestors an element has. */
function depthOf(el: HTMLElement): number {
  let n = 0
  let cur = el.parentElement
  while (cur) {
    if (cur.hasAttribute('data-layout')) n += 1
    cur = cur.parentElement
  }
  return n
}

/**
 * The four padding bands of one element.
 *
 * Four separate strips rather than one inset rectangle, so each side carries
 * its own number: `padding: 0 14 0 0` is a different fact from `padding: 14`,
 * and an inset rectangle cannot tell you which of the two you are looking at.
 * Sides with no padding draw nothing.
 */
function padBands(el: Element, style: CSSStyleDeclaration, key: string, depth: number): Box[] {
  const r = el.getBoundingClientRect()
  const t = num(style.paddingTop)
  const rt = num(style.paddingRight)
  const b = num(style.paddingBottom)
  const l = num(style.paddingLeft)
  const out: Box[] = []
  const push = (k: string, x: number, y: number, w: number, h: number, v: number) => {
    if (v <= 0 || w <= 0 || h <= 0) return
    out.push({ key: `${key}${k}`, x, y, w, h, label: String(round(v)), kind: 'pad', depth })
  }
  push('pt', r.x, r.y, r.width, t, t)
  push('pb', r.x, r.bottom - b, r.width, b, b)
  push('pl', r.x, r.y + t, l, r.height - t - b, l)
  push('pr', r.right - rt, r.y + t, rt, r.height - t - b, rt)
  return out
}

/**
 * The gutters of one container.
 *
 * TWO STRATEGIES, because the two layout modes expose their gutters
 * differently. A grid publishes its resolved track sizes, so the gutters can be
 * walked exactly -- including the ones beside an EMPTY track, which has no
 * child to measure from. A flex container publishes no such thing, so its
 * gutters are read as the space between consecutive children instead.
 */
function gapBands(el: HTMLElement, style: CSSStyleDeclaration, key: string, depth: number): Box[] {
  const out: Box[] = []
  const colGap = num(style.columnGap)
  const rowGap = num(style.rowGap)
  if (colGap <= 0 && rowGap <= 0) return out

  const r = el.getBoundingClientRect()
  const push = (k: string, x: number, y: number, w: number, h: number, v: number) => {
    if (w <= 0 || h <= 0) return
    out.push({ key: `${key}${k}`, x, y, w, h, label: String(round(v)), kind: 'gap', depth })
  }

  if (style.display.includes('grid')) {
    const padT = num(style.paddingTop)
    const padL = num(style.paddingLeft)
    const cols = style.gridTemplateColumns.split(' ').map(parseFloat).filter(Number.isFinite)
    const rows = style.gridTemplateRows.split(' ').map(parseFloat).filter(Number.isFinite)
    const innerH = r.height - padT - num(style.paddingBottom)
    const innerW = r.width - padL - num(style.paddingRight)

    let x = r.x + padL
    cols.forEach((w, i) => {
      x += w
      if (i < cols.length - 1) {
        push(`gc${i}`, x, r.y + padT, colGap, innerH, colGap)
        x += colGap
      }
    })
    let y = r.y + padT
    rows.forEach((h, i) => {
      y += h
      if (i < rows.length - 1) {
        push(`gr${i}`, r.x + padL, y, innerW, rowGap, rowGap)
        y += rowGap
      }
    })
    return out
  }

  const kids = Array.from(el.children)
    .map((c) => c.getBoundingClientRect())
    .filter((b) => b.width > 0 && b.height > 0)
  for (let i = 0; i < kids.length - 1; i += 1) {
    const a = kids[i]
    const b = kids[i + 1]
    const stacked = b.y >= a.bottom - 1
    if (stacked && rowGap > 0) push(`gf${i}`, a.x, a.bottom, a.width, b.y - a.bottom, rowGap)
    else if (!stacked && colGap > 0) push(`gf${i}`, a.right, a.y, b.x - a.right, a.height, colGap)
  }
  return out
}

function measure(): Box[] {
  const boxes: Box[] = []
  /*
    Named containers only. Outlining every grid and flex box in the document
    produces a screenshot nobody can read -- the value here is a small, curated
    vocabulary, so a container opts in by carrying `data-layout`.
  */
  document.querySelectorAll<HTMLElement>('[data-layout]').forEach((el, i) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const style = getComputedStyle(el)
    const depth = depthOf(el)
    const key = `c${i}`
    const cols = style.gridTemplateColumns
    const tracks = cols && cols !== 'none' ? ` · ${cols.replace(/px/g, '')}` : ''

    boxes.push({
      key,
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
      label: `${el.dataset.layout} ${Math.round(rect.width)}×${Math.round(rect.height)}${tracks}`,
      kind: 'container',
      depth,
    })
    boxes.push(...padBands(el, style, key, depth))
    boxes.push(...gapBands(el, style, key, depth))

    Array.from(el.children).forEach((child, j) => {
      const childStyle = getComputedStyle(child)
      const name = areaName(childStyle)
      if (!name) return
      const cr = child.getBoundingClientRect()
      if (cr.width === 0 || cr.height === 0) return
      const childKey = `${key}a${j}`
      boxes.push({
        key: childKey,
        x: cr.x,
        y: cr.y,
        w: cr.width,
        h: cr.height,
        label: name,
        kind: 'area',
        depth: depth + 1,
      })
      boxes.push(...padBands(child, childStyle, childKey, depth + 1))
    })
  })
  return boxes
}

export function LayoutOverlay() {
  const [on, setOn] = useState(initiallyOn)
  const [boxes, setBoxes] = useState<Box[]>([])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        setOn((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!on) return
    /*
      COALESCED ONTO ONE FRAME. A MutationObserver over the whole document fires
      in bursts -- React commits several nodes per render -- and measuring on
      each one would both thrash and force a layout mid-commit.

      EVERY READ IS ON A FRAME, the first one included. Measuring synchronously
      in the effect body would be a setState inside an effect -- which this
      project's lint rules reject and React documents as a cascading render --
      and it would also be reading geometry before the browser has finished
      laying it out. A frame callback is both legal and more correct.
    */
    let frame = 0
    const read = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setBoxes(measure()))
    }
    read()

    /*
      A MutationObserver IS REQUIRED, and a ResizeObserver alone is not enough:
      this app pins #root to the viewport and scrolls inside .scroll-area, so
      <body> never changes size. Navigating from the Build Library to the Build
      Form replaces the entire screen without resizing anything, and the overlay
      simply kept drawing the previous screen's regions.
    */
    const mo = new MutationObserver(read)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true })
    const ro = new ResizeObserver(read)
    ro.observe(document.body)
    window.addEventListener('scroll', read, true)
    window.addEventListener('resize', read)
    return () => {
      cancelAnimationFrame(frame)
      mo.disconnect()
      ro.disconnect()
      window.removeEventListener('scroll', read, true)
      window.removeEventListener('resize', read)
      /* Cleared on the way out so re-enabling cannot flash the previous
         layout's rectangles for a frame before the new ones land. */
      setBoxes([])
    }
  }, [on])

  if (!on) return null

  return (
    <div className="layout-overlay" data-testid="layout-overlay" aria-hidden>
      {boxes.map((b) => (
        <div
          key={b.key}
          className="layout-overlay-box"
          data-kind={b.kind}
          /*
            The caption is stepped down by nesting depth. Without it a container
            and the first area inside it share a top-left corner, and the two
            print on top of each other -- which is precisely the information the
            overlay exists to give.
          */
          style={
            { left: b.x, top: b.y, width: b.w, height: b.h, '--depth': b.depth } as CSSProperties
          }
        >
          <span className="layout-overlay-label">{b.label}</span>
        </div>
      ))}
      <p className="layout-overlay-legend">
        <span data-swatch="container">region</span>
        <span data-swatch="area">area</span>
        <span data-swatch="gap">gap</span>
        <span data-swatch="pad">padding</span>
        <span>ctrl+shift+L · ?layout=1</span>
      </p>
    </div>
  )
}
