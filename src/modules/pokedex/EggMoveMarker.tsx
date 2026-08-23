import { useEffect, useRef, useState } from 'react'
import { IconEgg } from '@tabler/icons-react'

/**
 * The marker on an egg-move row.
 *
 * Deliberately does NOT navigate anywhere: the Breeding Planner destination is
 * undecided, and a link to nowhere is worse than no link. What it does do is
 * acknowledge interaction -- hover gives the native tooltip, click opens a small
 * popover saying as much -- rather than being a decorative glyph that swallows
 * clicks silently.
 *
 * Kept a real <button> so it is keyboard reachable and announces itself; the svg
 * stays aria-hidden so the accessible name comes from the button's label only.
 */
const MESSAGE = 'Egg move — breeding details coming soon'

export function EggMoveMarker({ moveId, moveName }: { moveId: number; moveName: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  // Close on Escape or on a click elsewhere, so an open popover can never be
  // stranded while the user reads a different row.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const popoverId = `egg-move-note-${moveId}`

  return (
    <span className="egg-marker" ref={wrapRef}>
      <button
        type="button"
        className="egg-marker-btn"
        data-testid={`egg-move-marker-${moveId}`}
        aria-label={`${moveName}: ${MESSAGE}`}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        title={MESSAGE}
        onClick={() => setOpen((v) => !v)}
      >
        <IconEgg
          size={13}
          stroke={1.8}
          className="egg-move-icon"
          data-testid={`egg-move-icon-${moveId}`}
          data-icon="IconEgg"
          aria-hidden
          focusable="false"
        />
      </button>
      {open && (
        <span
          className="egg-marker-note"
          id={popoverId}
          role="note"
          data-testid={`egg-move-note-${moveId}`}
        >
          {MESSAGE}
        </span>
      )}
    </span>
  )
}
