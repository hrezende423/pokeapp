/**
 * Tools' nav registration: the index, and one page per new tool.
 *
 * Same arrangement as calculators/pages.ts. The index is the Tools tab's
 * DESTINATION (clicking the word opens it); the tab's dropdown entries are
 * unchanged. Tool pages are reached from the index, not from 23 more dropdown
 * lines.
 *
 * Each tool page is LAZY -- its math and UI load on first open -- so the tools
 * cost nothing to a reader who never opens them.
 */

import { createElement, lazy, Suspense, type ComponentType } from 'react'
import { ToolsIndex } from './ToolsIndex'

export const TOOLS_PAGES = [
  { id: 'tools', label: 'Tools' },
  { id: 'tool-hidden-power', label: 'Hidden Power' },
  { id: 'tool-speed-tiers', label: 'Speed tiers' },
  { id: 'tool-speed-minimizer', label: 'Speed EV minimizer' },
  { id: 'tool-bulk', label: 'Defensive bulk' },
  { id: 'tool-ev-remaining', label: 'EV / Stat Exp remaining' },
  { id: 'tool-moveset', label: 'Moveset searcher' },
  { id: 'tool-status', label: 'Status move finder' },
  { id: 'tool-targeting', label: 'Doubles targeting guide' },
] as const

export type ToolsPageId = (typeof TOOLS_PAGES)[number]['id']

/** A tool page loaded on first open, behind a one-line fallback. */
function lazyTool(load: () => Promise<{ default: ComponentType }>): ComponentType {
  const Page = lazy(load)
  return function LazyTool() {
    return createElement(Suspense, { fallback: createElement('p', null, 'Loading…') }, createElement(Page))
  }
}

const COMPONENTS: Record<ToolsPageId, ComponentType> = {
  tools: ToolsIndex,
  'tool-hidden-power': lazyTool(() =>
    import('./hidden-power/HiddenPowerTool').then((m) => ({ default: m.HiddenPowerTool })),
  ),
  'tool-speed-tiers': lazyTool(() =>
    import('./speed-tiers/SpeedTiersTool').then((m) => ({ default: m.SpeedTiersTool })),
  ),
  'tool-speed-minimizer': lazyTool(() =>
    import('./speed-minimizer/SpeedMinimizerTool').then((m) => ({ default: m.SpeedMinimizerTool })),
  ),
  'tool-bulk': lazyTool(() => import('./bulk/BulkTool').then((m) => ({ default: m.BulkTool }))),
  'tool-ev-remaining': lazyTool(() =>
    import('./ev-remaining/EvRemainingTool').then((m) => ({ default: m.EvRemainingTool })),
  ),
  'tool-moveset': lazyTool(() =>
    import('./moveset/MovesetTool').then((m) => ({ default: m.MovesetTool })),
  ),
  'tool-status': lazyTool(() => import('./status/StatusTool').then((m) => ({ default: m.StatusTool }))),
  'tool-targeting': lazyTool(() =>
    import('./targeting/TargetingTool').then((m) => ({ default: m.TargetingTool })),
  ),
}

export function findToolsPage(
  id: string,
): { id: ToolsPageId; label: string; Component: ComponentType } | undefined {
  const page = TOOLS_PAGES.find((p) => p.id === id)
  return page ? { id: page.id, label: page.label, Component: COMPONENTS[page.id] } : undefined
}
