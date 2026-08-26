import { IconSearch } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNav } from '../nav/navContext'
import { useVersionGroup } from '../version-group/context'
import { MAX_HITS_PER_CATEGORY, searchAllDexes } from './searchCategories'

/**
 * One search box, four dexes.
 *
 * Lives in the app bar so it is reachable from every module, and searches whatever
 * the four dexes are currently listing -- it holds no index of its own. Results
 * are grouped, and a group with no match is absent rather than shown empty.
 *
 * Clicking a result switches to that entry's dex and opens its detail in one
 * update, via the nav context that owns both pieces of state.
 */
export function GlobalSearch() {
  const { generation, isAll } = useVersionGroup()
  const nav = useNav()
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const { groups, total } = useMemo(
    () => searchAllDexes({ generation, isAll }, term),
    [generation, isAll, term],
  )

  // Close on Escape or a click elsewhere: the panel overlays the dex below it, so
  // leaving it open while the user works underneath would obscure their own list.
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

  const hasTerm = term.trim().length > 0
  const showPanel = open && hasTerm

  return (
    <div className="global-search" ref={wrapRef} data-testid="global-search-wrap">
      {/* Tabler, on the locked 24px grid at 1.5 stroke. Decorative: the input
          already carries the accessible name, so this is aria-hidden. */}
      <IconSearch
        className="global-search-icon"
        size={24}
        stroke={1.5}
        data-testid="global-search-icon"
        aria-hidden
        focusable="false"
      />
      <input
        type="search"
        className="global-search-input"
        data-testid="global-search"
        placeholder="Search all dexes…"
        aria-label="Search species, moves, items and abilities"
        aria-expanded={showPanel}
        aria-controls={showPanel ? 'global-search-results' : undefined}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />

      {showPanel && (
        <div
          className="global-search-panel"
          id="global-search-results"
          data-testid="global-search-results"
          data-total={total}
          data-group-count={groups.length}
          role="region"
          aria-label="Search results"
        >
          {groups.length === 0 ? (
            <p className="subtitle" data-testid="global-search-empty" role="status">
              No species, move, item or ability matches “{term.trim()}”
              {isAll ? ' in Generations 1-4' : ` in Generation ${generation}`}.
            </p>
          ) : (
            groups.map(({ category, hits, total: groupTotal }) => (
              <div
                className="gs-group"
                key={category.key}
                data-testid={`gs-group-${category.key}`}
                data-count={hits.length}
                data-total={groupTotal}
              >
                <p className="gs-group-head" data-testid={`gs-group-label-${category.key}`}>
                  {category.label}
                  <span className="subtitle">
                    {groupTotal > MAX_HITS_PER_CATEGORY
                      ? ` ${hits.length} of ${groupTotal}`
                      : ` ${groupTotal}`}
                  </span>
                </p>
                <ul className="gs-hits">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        className="gs-hit"
                        data-testid={`gs-hit-${category.key}-${hit.id}`}
                        data-entry-id={hit.id}
                        data-module={category.moduleId}
                        onClick={() => {
                          nav.navigate(category.moduleId, hit.id)
                          setOpen(false)
                        }}
                      >
                        <span className="dex-no">#{String(hit.id).padStart(3, '0')}</span>
                        <span className="gs-hit-name">{hit.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
