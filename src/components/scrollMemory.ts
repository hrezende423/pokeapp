/**
 * Where each scroller was left, so returning to a screen returns to the place.
 *
 * Held OUTSIDE React, for the same reason `tbNav` is: the value has to survive
 * the component that owns it being unmounted. Going Pokedex grid -> species
 * detail does not hide the grid, it UNMOUNTS it -- `browsing` flips and the
 * whole `.scroll-area` goes -- so state anywhere inside that tree is gone by the
 * time the reader comes back. Lifting it into the nav context would work too and
 * was rejected: a scroll offset is not navigation, every write happens on a
 * scroll event, and putting one of those through a context would re-render every
 * consumer of that context at 60Hz.
 *
 * DELIBERATELY NOT PERSISTED. This is where you were looking, not what you have.
 * A reload starts at the top of everything. sessionStorage was considered and
 * left out on purpose: a restored offset can point past the end of a list whose
 * data or filters have changed since it was written, so it would need a clamp
 * and a staleness rule to buy back something no one asked for. Adding it later
 * is two functions in this file and nothing else.
 *
 * A key identifies one scroller SHOWING ONE THING, which is not the same as one
 * scroller. Three of the six mounts host several screens each -- `tb-scroll` is
 * every Team Building screen, `tc-scroll-area` is all four Type Coverage tabs,
 * and the species page's scroller is a different species every time -- so the
 * call site composes the key from its own identity plus whatever it is showing.
 * `scrollKey` is that composition, and the reason it takes parts rather than a
 * string is that a forgotten part is then a visible omission at the call site.
 */

/** Offsets by key. A number per screen visited; nothing here is ever large. */
const offsets = new Map<string, number>()

/**
 * Compose a key. Nullish parts are dropped, so an optional dimension can be
 * passed straight through without the caller branching on it.
 *
 * The FILTER STATE IS PART OF THE POKEDEX GRID'S KEY, which is how "changing a
 * filter starts at the top" is implemented -- there is no invalidation step and
 * nothing to remember to call. A different filter is a different key and so a
 * fresh scroller; going back to a filter you had before restores the place you
 * were at in it, which falls out of the same fact for free.
 */
export function scrollKey(...parts: readonly (string | number | boolean | null | undefined)[]) {
  return parts.filter((p) => p != null && p !== '').join('|')
}

export function readScrollOffset(key: string): number {
  return offsets.get(key) ?? 0
}

export function writeScrollOffset(key: string, top: number) {
  // A zero is stored rather than deleted: "I scrolled back to the top" and "I
  // have never been here" are different answers, and only the first one should
  // survive a filter change and back again.
  offsets.set(key, top)
}

/** Drop remembered offsets. Exported for tests; nothing in the app calls it. */
export function forgetScrollOffsets() {
  offsets.clear()
}
