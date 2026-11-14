import { lazy, Suspense, type ReactNode } from 'react'

/* One chunk for the three screens: they share the loader, the parts and the CSS. */
const load = () => import('./FrontierScreens')
const Facilities = lazy(() => load().then((m) => ({ default: m.FacilitiesPage })))
const Brains = lazy(() => load().then((m) => ({ default: m.BrainsPage })))
const Sets = lazy(() => load().then((m) => ({ default: m.SetsTrainersPage })))

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
