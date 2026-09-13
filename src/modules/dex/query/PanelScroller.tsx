import { IconArrowUp } from '@tabler/icons-react'
import { useCallback, useRef, useState, type ReactNode } from 'react'

/**
 * A panel that scrolls itself, with a back-to-top control once it has.
 *
 * The Pokedex's filter menu is eight sections deep with "More filters" open,
 * which is taller than a laptop window -- and a floating panel is bound by the
 * same rule as a module root: nothing may be clipped, so it scrolls rather than
 * running off the bottom of the page. Once it scrolls it needs the way back,
 * for the same reason every long list in this app has one.
 *
 * THE CONTROL IS INSIDE THE PANEL, not the page's ScrollArea one. That component
 * is built for a module-sized scroller and anchors to its own section; a 320px
 * dropdown wants a smaller, quieter affordance in its own corner. The threshold
 * and the glyph match it deliberately -- IconArrowUp, the plainer glyph, because
 * IconArrowBarToUp reads as "jump to the start of a document".
 *
 * State, not a ref-written style: this flips at most twice per scroll gesture,
 * so the render it costs is nothing, and it is compared before setting so a
 * scroll that does not cross the threshold re-renders nothing at all.
 */
const SHOW_AFTER = 80

export function PanelScroller({
  className,
  testId,
  children,
  ...rest
}: {
  className: string
  testId: string
  children: ReactNode
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  const onScroll = useCallback(() => {
    const past = (ref.current?.scrollTop ?? 0) > SHOW_AFTER
    setScrolled((was) => (was === past ? was : past))
  }, [])

  const toTop = useCallback(() => {
    ref.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return (
    <div className={className} data-testid={testId} ref={ref} onScroll={onScroll} {...rest}>
      {children}
      {scrolled && (
        <button
          type="button"
          className="panel-to-top"
          data-testid={`${testId}-to-top`}
          aria-label="Back to top"
          title="Back to top"
          onClick={toTop}
        >
          <IconArrowUp size={14} stroke={1.5} aria-hidden focusable="false" />
        </button>
      )}
    </div>
  )
}
