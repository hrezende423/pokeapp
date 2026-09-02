import { IconArrowUp, IconChevronDown } from '@tabler/icons-react'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * A section that scrolls internally, with no native scrollbar.
 *
 * THE APP-WIDE SCROLL MODEL LIVES HERE. The page itself does not scroll: #root
 * is locked to the viewport and the app bar and footer are fixed rows of a flex
 * column, so the only thing that ever moves is the content of one of these. That
 * is why this is a component and not a utility class -- hiding the scrollbar is
 * the easy half, and replacing what the scrollbar was telling the reader is the
 * half that needs real state:
 *
 *   - more below       -> the icon-scrolldown indicator, at the bottom
 *   - scrolled away    -> a back-to-top control, bottom-right
 *   - nothing to scroll -> neither, so a short list stays clean
 *
 * Both affordances are driven from the SAME measurement of the same element, so
 * they cannot disagree about whether this section is scrollable.
 *
 * The scroll-down indicator is Figma's "icon-scrolldown", reused rather than
 * reinvented: it was built for the Pokedex grid, which was the only internally
 * scrolling thing in the app when it was written. Its old copy read
 * window.scrollY; a container that is not the window needs the container's own
 * numbers, so the measurement moved in here and the glyph came with it.
 */

interface ScrollState {
  atTop: boolean
  atEnd: boolean
  scrollable: boolean
}

/** Treated as "at the end" within 8px, so a fractional layout never sticks. */
const EDGE = 8

function useScrollState(el: HTMLElement | null): ScrollState {
  const [state, setState] = useState<ScrollState>({
    atTop: true,
    atEnd: true,
    scrollable: false,
  })

  useEffect(() => {
    if (!el) return
    const read = () => {
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
      setState({
        atTop: el.scrollTop <= EDGE,
        atEnd: remaining <= EDGE,
        scrollable: el.scrollHeight - el.clientHeight > EDGE,
      })
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

export function ScrollArea({
  children,
  className,
  testId,
  /** Set false for a region whose bottom edge is not a "keep reading" cue. */
  hint = true,
}: {
  children: ReactNode
  className?: string
  testId?: string
  hint?: boolean
}) {
  // A callback ref in state, not useRef: the effect above has to re-run when the
  // node actually mounts, and a ref object's mutation does not trigger that.
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const { atTop, atEnd, scrollable } = useScrollState(el)

  return (
    <div className="scroll-area-outer" data-scrollable={scrollable}>
      <div
        ref={setEl}
        className={className ? `scroll-area ${className}` : 'scroll-area'}
        data-testid={testId}
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
