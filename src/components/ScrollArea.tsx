import { IconArrowUp, IconChevronDown } from '@tabler/icons-react'
import { useEffect, useState, type ReactNode } from 'react'
import { readScrollOffset, writeScrollOffset } from './scrollMemory'

/**
 * A section that scrolls internally, with a scrollbar of our own.
 *
 * THE APP-WIDE SCROLL MODEL LIVES HERE. The page itself does not scroll: #root
 * is locked to the viewport and the app bar and footer are fixed rows of a flex
 * column, so the only thing that ever moves is the content of one of these.
 *
 * Four things replace what a native scrollbar would have told the reader, all
 * driven from the SAME measurement of the same element so they cannot disagree
 * about whether this section is scrollable:
 *
 *   - where you are        -> the thumb, right-hand edge, faded out when idle
 *   - more below           -> the icon-scrolldown indicator, at the bottom
 *   - scrolled away        -> a back-to-top control, bottom-right
 *   - nothing to scroll    -> none of them, so a short list stays clean
 *
 * THE THUMB IS DRAWN, NOT NATIVE, and the reason is the fade. A native bar's
 * gutter is layout rather than paint, so hiding its thumb when idle leaves the
 * gutter behind -- the full width paid permanently for a mark visible a second
 * at a time, and every row in the app narrower for good. CSS has no way to fade
 * one either, only to switch it on and off, and the three engines disagree both
 * on how a native bar is styled and on how wide `thin` is. Drawing it also lets
 * it stop short of the corner, where the back-to-top control sits; a native bar
 * runs behind that button.
 *
 * It reproduces what an 8px native track with a 2px inset actually paints -- 4px
 * of rounded bar, 2px off the edge -- so this is the native rendering's look
 * with behaviour the native one cannot have. See `.scroll-thumb` in App.css.
 *
 * The geometry is written STRAIGHT TO THE NODE rather than through state. React
 * state here would re-render the whole section on every scroll frame to move one
 * element 3px, and the booleans below are the only things a render needs.
 *
 * The scroll-down indicator is Figma's "icon-scrolldown", reused rather than
 * reinvented: it was built for the Pokedex grid, which was the only internally
 * scrolling thing in the app when it was written.
 */

interface ScrollState {
  atTop: boolean
  atEnd: boolean
  scrollable: boolean
}

/** Treated as "at the end" within 8px, so a fractional layout never sticks. */
const EDGE = 8

/** The thumb never shrinks below this, or a 493-row list gives you 3px to grab. */
const MIN_THUMB = 26

/** How long after the last scroll the thumb fades out. */
const IDLE_MS = 1000

/**
 * How long after mount a remembered offset may still be applied.
 *
 * Restoring needs the content to exist, and some of it arrives late -- the
 * species page's encounter partitions are fetched, and the dex lists resolve
 * from the data layer. So the attempt repeats until the scroller is actually
 * tall enough, and then stops: content that lands ten seconds later must not
 * yank a reader who has settled somewhere by then.
 */
const RESTORE_WINDOW_MS = 1500

function useScrollState(el: HTMLElement | null): ScrollState {
  const [state, setState] = useState<ScrollState>({
    atTop: true,
    atEnd: true,
    scrollable: false,
  })

  useEffect(() => {
    if (!el) return
    // Compared before setting, unlike the first version of this hook: `read`
    // runs on every scroll event and a fresh object is never Object.is-equal, so
    // it re-rendered the section continuously while these three booleans sat
    // unchanged. The thumb made that visible -- it is why the geometry below is
    // imperative -- and the guard is worth having either way.
    let last: ScrollState | null = null
    const read = () => {
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
      const next: ScrollState = {
        atTop: el.scrollTop <= EDGE,
        atEnd: remaining <= EDGE,
        scrollable: el.scrollHeight - el.clientHeight > EDGE,
      }
      if (
        last &&
        last.atTop === next.atTop &&
        last.atEnd === next.atEnd &&
        last.scrollable === next.scrollable
      ) {
        return
      }
      last = next
      setState(next)
    }
    // Deferred rather than called in the effect body: a synchronous setState
    // there is what react-hooks/set-state-in-effect flags.
    const first = requestAnimationFrame(read)
    el.addEventListener('scroll', read, { passive: true })
    // Scrollability changes without a scroll event: filtering a list, opening a
    // section, or resizing the window all change scrollHeight. Observing the
    // element covers the viewport side and observing its content covers the
    // other -- a filtered list that suddenly fits must drop both affordances.
    const observer = new ResizeObserver(read)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => {
      cancelAnimationFrame(first)
      el.removeEventListener('scroll', read)
      observer.disconnect()
    }
  }, [el])

  return state
}

/**
 * Put the reader back where they were, and record where that is.
 *
 * Ordering is the whole job. Nothing is SAVED until the restore has happened or
 * been abandoned, because a fresh scroller reads `scrollTop === 0` and saving
 * that would erase the offset a moment before it was going to be used.
 *
 * And a reader who scrolls first WINS: their gesture abandons the restore. The
 * alternative -- the offset landing a beat later and moving the page under them
 * -- is the failure this whole feature exists to prevent, so it must not be
 * reintroduced by the feature itself.
 */
function useScrollRestore(el: HTMLElement | null, memoryKey: string | undefined) {
  useEffect(() => {
    if (!el || !memoryKey) return

    const target = readScrollOffset(memoryKey)
    let settled = target <= 0
    let programmatic = false
    const deadline = Date.now() + RESTORE_WINDOW_MS

    const attempt = () => {
      if (settled) return
      if (Date.now() > deadline) {
        settled = true
        return
      }
      // Only once the content is genuinely tall enough. Clamping to a short
      // scroller instead would save that clamped value on the way out and
      // quietly lose the reader's place.
      if (el.scrollHeight - el.clientHeight < target) return
      programmatic = true
      el.scrollTop = target
      settled = true
    }

    const onScroll = () => {
      if (programmatic) {
        // The assignment above fires this; it is not the reader moving.
        programmatic = false
        return
      }
      settled = true
      writeScrollOffset(memoryKey, el.scrollTop)
    }

    const raf = requestAnimationFrame(attempt)
    const observer = new ResizeObserver(attempt)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)
    el.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      el.removeEventListener('scroll', onScroll)
      /*
        NOTHING IS WRITTEN HERE, and that is the entire point of this comment.

        A cleanup "last word" -- `writeScrollOffset(memoryKey, el.scrollTop)` --
        is the obvious belt to the scroll handler's braces, and it silently
        destroyed the feature. By the time React runs an effect cleanup the
        element is already detached, and a detached element reports
        `scrollTop === 0`, so the last thing to reach the store for every
        scroller was a zero written over the real offset a moment earlier. The
        log read WRITE 900 then WRITE 0, in that order, on every single exit.

        The scroll handler is sufficient on its own: the only way to change
        `scrollTop` without a scroll event is not to change it.
      */
    }
  }, [el, memoryKey])
}

/**
 * The thumb: geometry, the drag, the track press, and the idle fade.
 *
 * `is-awake` is a class rather than state for the reason given in the component
 * note -- this runs on every scroll frame. The wake is also what a hover over
 * the strip does, which is what makes the thumb reachable from a standstill with
 * a pointer; on a touch screen the first flick is what brings it up, the same as
 * every native overlay scrollbar.
 */
function useScrollThumb(
  el: HTMLElement | null,
  track: HTMLElement | null,
  thumb: HTMLElement | null,
) {
  useEffect(() => {
    if (!el || !track || !thumb) return

    let idle = 0
    let dragging = false

    const wake = () => {
      track.classList.add('is-awake')
      window.clearTimeout(idle)
      idle = window.setTimeout(() => {
        // A pointer resting on the strip, or a drag still in progress, is not
        // idle -- fading out from under a held thumb would be absurd.
        if (dragging || track.matches(':hover')) return
        track.classList.remove('is-awake')
      }, IDLE_MS)
    }

    const layout = () => {
      const max = el.scrollHeight - el.clientHeight
      if (max <= EDGE) {
        track.hidden = true
        return
      }
      track.hidden = false
      const room = track.clientHeight
      const height = Math.max(MIN_THUMB, Math.round((room * el.clientHeight) / el.scrollHeight))
      const travel = room - height
      thumb.style.height = `${height}px`
      thumb.style.transform = `translateY(${Math.round((el.scrollTop / max) * travel)}px)`
    }

    const onScroll = () => {
      layout()
      wake()
    }

    /*
      The drag maps pointer travel across the TRACK to scroll travel across the
      CONTENT, from the positions both had when the press landed. Reading them
      per-move instead would compound the rounding in the thumb's own transform
      into a slow drift away from the finger on a long list.
    */
    const onThumbDown = (ev: PointerEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      thumb.setPointerCapture(ev.pointerId)
      dragging = true
      track.classList.add('is-dragging')
      wake()

      const startY = ev.clientY
      const startTop = el.scrollTop
      const travel = track.clientHeight - thumb.offsetHeight
      const max = el.scrollHeight - el.clientHeight

      const move = (e: PointerEvent) => {
        if (travel <= 0) return
        el.scrollTop = startTop + ((e.clientY - startY) / travel) * max
      }
      const up = () => {
        dragging = false
        track.classList.remove('is-dragging')
        thumb.removeEventListener('pointermove', move)
        thumb.removeEventListener('pointerup', up)
        thumb.removeEventListener('pointercancel', up)
        wake()
      }
      thumb.addEventListener('pointermove', move)
      thumb.addEventListener('pointerup', up)
      thumb.addEventListener('pointercancel', up)
    }

    /* Pressing the empty part of the track jumps there, centred on the thumb --
       the one native behaviour a reader would notice the absence of. */
    const onTrackDown = (ev: PointerEvent) => {
      if (ev.target !== track) return
      const rect = track.getBoundingClientRect()
      const span = rect.height - thumb.offsetHeight
      if (span <= 0) return
      const p = (ev.clientY - rect.top - thumb.offsetHeight / 2) / span
      el.scrollTop = Math.min(Math.max(p, 0), 1) * (el.scrollHeight - el.clientHeight)
      wake()
    }

    const raf = requestAnimationFrame(layout)
    el.addEventListener('scroll', onScroll, { passive: true })
    track.addEventListener('pointerenter', wake)
    track.addEventListener('pointerdown', onTrackDown)
    thumb.addEventListener('pointerdown', onThumbDown)
    const observer = new ResizeObserver(layout)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(idle)
      el.removeEventListener('scroll', onScroll)
      track.removeEventListener('pointerenter', wake)
      track.removeEventListener('pointerdown', onTrackDown)
      thumb.removeEventListener('pointerdown', onThumbDown)
      observer.disconnect()
    }
  }, [el, track, thumb])
}

export function ScrollArea({
  children,
  className,
  testId,
  /** Set false for a region whose bottom edge is not a "keep reading" cue. */
  hint = true,
  /**
   * Identity for the remembered offset. Omit and this scroller has no memory.
   *
   * NOT defaulted to `testId`, though every call site has one: three of the six
   * mounts show several different screens through one scroller, so a test id
   * alone would restore Team Building's My Teams offset onto the Build Library.
   * A key that has to be composed at the call site is a key whose parts are
   * visible there. See scrollMemory.ts.
   */
  memoryKey,
}: {
  children: ReactNode
  className?: string
  testId?: string
  hint?: boolean
  memoryKey?: string
}) {
  /*
    ALL THREE NODES ARE CALLBACK REFS IN STATE, not useRef. The effects above
    have to re-run once the node actually mounts, and a ref object's mutation
    does not trigger that -- a `useRef` here would hand the thumb hook `null`
    on the only render it ever saw, and the thumb would never move.
  */
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [track, setTrack] = useState<HTMLDivElement | null>(null)
  const [thumb, setThumb] = useState<HTMLDivElement | null>(null)
  const { atTop, atEnd, scrollable } = useScrollState(el)

  useScrollRestore(el, memoryKey)
  useScrollThumb(el, track, thumb)

  return (
    <div className="scroll-area-outer" data-scrollable={scrollable}>
      <div
        ref={setEl}
        className={className ? `scroll-area ${className}` : 'scroll-area'}
        data-testid={testId}
        /* Readable by the suites, so "a different filter is a different key" is
           assertable rather than inferred from where a scroller ended up. */
        data-memory-key={memoryKey}
      >
        {children}
        {hint && scrollable && (
          <div
            className="pokedex-grid-scroll"
            data-testid="grid-scroll-hint"
            data-at-end={atEnd}
            aria-hidden
          >
            <IconChevronDown size={49} stroke={1.5} focusable="false" />
          </div>
        )}
      </div>

      {/*
        A POINTER AFFORDANCE ONLY, hence aria-hidden and no role: the scroller
        itself is what a screen reader and the keyboard drive, and announcing a
        second, redundant control for the same axis makes that harder rather
        than easier. `hidden` is toggled imperatively by the hook, from the same
        measurement that drives the two controls below.
      */}
      <div className="scroll-track" data-testid="scroll-track" ref={setTrack} aria-hidden hidden>
        <div className="scroll-thumb" data-testid="scroll-thumb" ref={setThumb} />
      </div>

      {/* Only once there is somewhere to go back to: on an unscrolled section
          this control would do nothing, and a dead button is worse than none. */}
      {scrollable && !atTop && (
        <button
          type="button"
          className="scroll-top"
          data-testid="scroll-top"
          aria-label="Back to top"
          title="Back to top"
          onClick={() => el?.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          {/* A plain arrow, not IconArrowBarToUp: the bar under that one reads as
              "jump to the very start of a document", and this scrolls a panel. */}
          <IconArrowUp size={24} stroke={1.5} aria-hidden focusable="false" />
        </button>
      )}
    </div>
  )
}
