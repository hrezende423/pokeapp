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
}

export function findToolsPage(
  id: string,
): { id: ToolsPageId; label: string; Component: ComponentType } | undefined {
  const page = TOOLS_PAGES.find((p) => p.id === id)
  return page ? { id: page.id, label: page.label, Component: COMPONENTS[page.id] } : undefined
}
