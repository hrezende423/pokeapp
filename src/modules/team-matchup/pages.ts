/**
 * Team Matchup's nav registration -- the arrangement calculators/pages.ts uses: a
 * screen under a nav tab, not a dex. It GRADUATES the "Battle Simulator" stub
 * (Tools): the stub's line left stubs/stubPages.ts and the nav points here.
 *
 * LAZY: the page carries the whole battle engine (four generations of AI), which
 * nobody browsing the Pokedex needs. The registry hands the shell a small wrapper
 * (TeamMatchupLazy) that loads the page on first open.
 */

import type { ComponentType } from 'react'
import { TeamMatchupLazy } from './TeamMatchupLazy'

export const TEAM_MATCHUP_PAGES = [{ id: 'team-matchup', label: 'Team Matchup' }] as const

export type TeamMatchupPageId = (typeof TEAM_MATCHUP_PAGES)[number]['id']

export function findTeamMatchupPage(
  id: string,
): { id: TeamMatchupPageId; label: string; Component: ComponentType } | undefined {
  const page = TEAM_MATCHUP_PAGES.find((p) => p.id === id)
  return page ? { id: page.id, label: page.label, Component: TeamMatchupLazy } : undefined
}
