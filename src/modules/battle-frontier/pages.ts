/**
 * The Battle Frontier tab's nav registration: the arrangement team-matchup/pages.ts
 * uses, three read-only reference screens and the Challenge Tracker under their
 * own tab.
 *
 * LAZY: nothing here imports the frontier loader. The screens and the loader load
 * on first open (FrontierLazy), so the entry chunk never carries
 * `frontier/emerald.json` (asserted by verify:infra). The tracker's saved
 * document IS imported here, eagerly: the account menu's import and the sync find
 * documents in the registry (tracker/trackerStore.ts imports only the pure model).
 */

import type { ComponentType } from 'react'
import { FrontierBrainsLazy, FrontierFacilitiesLazy, FrontierSetsLazy, FrontierTrackerLazy } from './FrontierLazy'
import './tracker/trackerStore'
import './nav.css'

export const FRONTIER_PAGES = [
  { id: 'frontier-facilities', label: 'Facilities', Component: FrontierFacilitiesLazy },
  { id: 'frontier-brains', label: 'Brains', Component: FrontierBrainsLazy },
  { id: 'frontier-tracker', label: 'Challenge Tracker', Component: FrontierTrackerLazy },
  { id: 'frontier-sets', label: 'Sets & Trainers', Component: FrontierSetsLazy },
] as const

export type FrontierPageId = (typeof FRONTIER_PAGES)[number]['id']

export function findFrontierPage(
  id: string,
): { id: FrontierPageId; label: string; Component: ComponentType } | undefined {
  const page = FRONTIER_PAGES.find((p) => p.id === id)
  return page ? { id: page.id, label: page.label, Component: page.Component } : undefined
}
