import { IconChevronDown } from '@tabler/icons-react'
import { useEffect, useState } from 'react'

/**
 * Figma's "icon-scrolldown" instance, centred under the grid.
 *
 * The layer name is what settles it: a scroll affordance, not pagination and not
 * a load-more control -- the grid already renders every in-scope species -- so
 * this is decorative, non-interactive and aria-hidden, and it fades out once
 * there is nothing left to scroll to.
 *
 * The glyph itself is a custom Figma component that could not be exported (the
 * Figma MCP monthly call cap), so Tabler's chevron stands in at the Figma box
 * width. The reference glyph is wider and shallower than this one.
 */
export function ScrollDownHint() {
  const [atEnd, setAtEnd] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      const remaining = doc.scrollHeight - window.scrollY - window.innerHeight
      setAtEnd(remaining <= 8)
    }
    // Deferred rather than called straight from the effect body: a synchronous
    // setState here is what react-hooks/set-state-in-effect flags.
    const first = requestAnimationFrame(onScroll)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(first)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div
      className="pokedex-grid-scroll"
      data-testid="grid-scroll-hint"
      data-at-end={atEnd}
      aria-hidden
    >
      <IconChevronDown size={49} stroke={1.5} focusable="false" />
    </div>
  )
}
