import { IconMenu2, IconX } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { NAV_TABS, type NavEntry, type PageId } from './navConfig'

/**
 * The nav on a phone: one button in the app bar, opening every destination at
 * once.
 *
 * WHY NOT THE DESKTOP NAV, SHRUNK. Its three groups open on hover, focus and
 * click together, and a tap in Chrome is all three in a row: mouseover and focus
 * open the dropdown, then the click toggles it shut again. Measured in Chrome's
 * touch emulation, which uses Android's event order -- the group reads
 * `data-open="true"` at mouseup and `false` once the click lands, so Team Building
 * and Tools could not be opened by a tap. Three triggers also do not fit beside
 * the brand at 360px. A sheet that lists everything needs one tap to open and
 * one to go.
 *
 * SAME DATA, SAME DOOR. The entries come from NAV_TABS, so a page added there
 * shows up here with no edit, and a choice goes through the same `onSelect`
 * (NavProvider's `setModule`) as the desktop menu -- which is what keeps the
 * Build Form's unsaved-edits guard and the back stack covering this path too.
 *
 * Its own test ids (`mobile-nav-*`): the desktop menu stays in the DOM, hidden
 * by mobile.css, and a second `nav-pokedex` would make every suite's selector
 * ambiguous.
 */
export function MobileNav({
  activeId,
  onSelect,
}: {
  activeId: PageId
  onSelect: (id: PageId) => void
}) {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  /* A page change from anywhere else -- the back gesture, the global search --
     closes the sheet, so it can never sit over a page it no longer describes. */
  const [shownFor, setShownFor] = useState(activeId)
  if (shownFor !== activeId) {
    setShownFor(activeId)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const choose = (id: PageId) => {
    setOpen(false)
    onSelect(id)
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="mobile-nav-toggle"
        data-testid="mobile-nav-toggle"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen(true)}
      >
        <IconMenu2 size={22} stroke={1.5} aria-hidden focusable="false" />
      </button>

      {open && (
        <div
          className="mobile-nav"
          id="mobile-nav"
          data-testid="mobile-nav"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="mobile-nav-head">
            <span className="app-brand">Pokeapp</span>
            <button
              ref={closeRef}
              type="button"
              className="mobile-nav-toggle"
              data-testid="mobile-nav-close"
              aria-label="Close menu"
              onClick={() => {
                setOpen(false)
                toggleRef.current?.focus()
              }}
            >
              <IconX size={22} stroke={1.5} aria-hidden focusable="false" />
            </button>
          </div>

          <nav className="mobile-nav-body" aria-label="Pages">
            {NAV_TABS.map((tab) => (
              /* A div, not a <section>: `.panel section` (App.css) would hand
                 every group a 2rem margin and a top rule -- the gotcha CLAUDE.md
                 lists first. */
              <div
                key={tab.id}
                className="mobile-nav-group"
                data-testid={`mobile-nav-group-${tab.id}`}
              >
                <h2 className="mobile-nav-heading">{tab.label}</h2>
                <div className="mobile-nav-items">
                  {flatten(tab.entries).map(({ entry, depth }) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="mobile-nav-item"
                      data-testid={`mobile-nav-${entry.id}`}
                      data-depth={depth || undefined}
                      aria-current={entry.id === activeId ? 'page' : undefined}
                      onClick={() => choose(entry.id)}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      )}
    </>
  )
}

/**
 * Nested entries (Calculators > Damage Calculator) flattened in order, each one
 * its own target. A parent is a page in its own right, so it stays a button
 * rather than turning into a heading -- the same as on the desktop menu.
 */
function flatten(entries: readonly NavEntry[], depth = 0): { entry: NavEntry; depth: number }[] {
  return entries.flatMap((entry) => [{ entry, depth }, ...flatten(entry.children ?? [], depth + 1)])
}
