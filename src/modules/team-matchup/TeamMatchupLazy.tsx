import { lazy, Suspense } from 'react'

const Page = lazy(() => import('./TeamMatchup').then((m) => ({ default: m.TeamMatchupPage })))

/** The Team Matchup page, loaded on first open (see pages.ts). */
export function TeamMatchupLazy() {
  return (
    <Suspense fallback={<p>Loading Team Matchup…</p>}>
      <Page />
    </Suspense>
  )
}
