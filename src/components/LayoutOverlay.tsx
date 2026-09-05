/**
 * A layout inspector, so a layout change can be NAMED instead of nudged.
 *
 * WHY THIS EXISTS. Reviewing a screen by eye produces notes like "move the
 * types up a bit" and "that gap is too big" -- which are unambiguous to the
 * person looking at the page and nearly useless to the person editing the CSS,
 * because neither the element nor the amount is identified. Every one of those
 * notes then costs a round trip. This draws the structure the CSS actually
 * declares, over the real page, so a note can say "put `kana` in the `shiny`
 * row" -- which is precise, and is literally the code.
 *
 * IT SHIPS IN THE PRODUCTION BUNDLE, deliberately. The whole point is to be
 * usable against the deployed preview from a phone, which is where this app
 * gets reviewed; a `import.meta.env.DEV` gate would put it exactly where it is
 * no use. It costs ~2KB and does nothing at all until switched on.
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

/** What the overlay draws for one element. */
interface Box {
  key: string
  /** Viewport rect, in CSS px. */
  x: number
  y: number
  w: number
  h: number
  label: string
  kind: 'container' | 'area'
  /** How many named containers this sits inside. Drives the label's offset. */
  depth: number
}

const PARAM = 'layout'

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

function measure(): Box[] {
  const boxes: Box[] = []
  /*
    Named containers only. Outlining every grid and flex box in the document
    produces a screenshot nobody can read -- the value here is a small, curated
    vocabulary, so a container opts in by carrying `data-layout`.
  */
  const containers = document.querySelectorAll<HTMLElement>('[data-layout]')

  containers.forEach((el, i) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const style = getComputedStyle(el)
    const cols = style.gridTemplateColumns
    const tracks = cols && cols !== 'none' ? ` · ${cols.replace(/px/g, '')}` : ''
    boxes.push({
      key: `c${i}`,
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
      label: `${el.dataset.layout} ${Math.round(rect.width)}×${Math.round(rect.height)}${tracks}`,
      kind: 'container',
      depth: depthOf(el),
    })

    Array.from(el.children).forEach((child, j) => {
      const name = areaName(getComputedStyle(child))
      if (!name) return
      const r = child.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      boxes.push({
        key: `c${i}a${j}`,
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        label: name,
        kind: 'area',
        depth: depthOf(el) + 1,
      })
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
      Re-measured from a ResizeObserver on <body> plus scroll, rather than on a
      timer: the thing being inspected is a layout, so it must be re-read
      whenever one could have changed, and never in between.

      EVERY READ IS ON A FRAME, the first one included. Measuring synchronously
      in the effect body would be a setState inside an effect -- which this
      project's lint rules reject and React documents as a cascading render --
      and it would also be reading geometry before the browser has finished
      laying it out. A frame callback is both legal and more correct.
    */
    /*
      COALESCED ONTO ONE FRAME. A MutationObserver over the whole document fires
      in bursts -- React commits several nodes per render -- and measuring on
      each one would both thrash and force a layout mid-commit.
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
      simply kept drawing the previous screen's regions -- which is to say, it
      was blank on arrival, since the form's regions had never been measured.
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
            The label is stepped down by nesting depth. Without it a container
            and the first area inside it share a top-left corner, and the two
            captions print on top of each other -- which is precisely the
            information the overlay exists to give.
          */
          style={
            { left: b.x, top: b.y, width: b.w, height: b.h, '--depth': b.depth } as CSSProperties
          }
        >
          <span className="layout-overlay-label">{b.label}</span>
        </div>
      ))}
      <p className="layout-overlay-legend">
        layout names · ctrl+shift+L or ?layout=1 · {boxes.length} regions
      </p>
    </div>
  )
}
