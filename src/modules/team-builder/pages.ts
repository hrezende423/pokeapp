/**
 * Team Building's nav registration.
 *
 * Kept in its own module, importing only the shell component, so `navConfig` can
 * read the ids and labels without a cycle -- the same arrangement `stubPages.ts`
 * uses, and for the same reason.
 *
 * FOUR IDS, ONE COMPONENT. `new-team` and `new-build` are VERBS, not screens:
 * choosing either creates the thing and lands you on the screen that shows it.
 * They are nav entries because the spec asks for both to be reachable straight
 * from the dropdown rather than only after landing on a list first. The shell
 * tells them apart and consumes them once -- see TeamBuilding.tsx.
 */

import type { ComponentType } from 'react'
import { TeamBuilding } from './TeamBuilding'

export const TEAM_BUILDING_PAGES = [
  { id: 'new-team', label: 'New Team' },
  { id: 'new-build', label: 'New Build' },
  { id: 'my-teams', label: 'My Teams' },
  { id: 'build-library', label: 'Build Library' },
] as const

export type TbPageId = (typeof TEAM_BUILDING_PAGES)[number]['id']

export interface TeamBuildingPage {
  id: TbPageId
  label: string
  Component: ComponentType
}

export function findTeamBuildingPage(id: string): TeamBuildingPage | undefined {
  const page = TEAM_BUILDING_PAGES.find((p) => p.id === id)
  return page ? { id: page.id, label: page.label, Component: TeamBuilding } : undefined
}
