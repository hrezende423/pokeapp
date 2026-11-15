import { lazy, Suspense, type ReactNode } from 'react'

/* One chunk for the three screens: they share the loader, the parts and the CSS. */
const load = () => import('./FrontierScreens')
const Facilities = lazy(() => load().then((m) => ({ default: m.FacilitiesPage })))
const Brains = lazy(() => load().then((m) => ({ default: m.BrainsPage })))
const Sets = lazy(() => load().then((m) => ({ default: m.SetsTrainersPage })))
/* The Challenge Tracker: its own chunk (the loader and the parts are shared with the screens'). */
const Tracker = lazy(() => import('./tracker/TrackerPage').then((m) => ({ default: m.TrackerPage })))

const Wrap = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<p>Loading Battle Frontier…</p>}>{children}</Suspense>
)

/** The Battle Frontier screens, loaded on first open (see pages.ts). */
export const FrontierFacilitiesLazy = () => (
  <Wrap>
    <Facilities />
  </Wrap>
)
export const FrontierBrainsLazy = () => (
  <Wrap>
    <Brains />
  </Wrap>
)
export const FrontierSetsLazy = () => (
  <Wrap>
    <Sets />
  </Wrap>
)
export const FrontierTrackerLazy = () => (
  <Wrap>
    <Tracker />
  </Wrap>
)
