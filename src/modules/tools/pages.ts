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

import type { ComponentType } from 'react'
import { ToolsIndex } from './ToolsIndex'

export const TOOLS_PAGES = [{ id: 'tools', label: 'Tools' }] as const

export type ToolsPageId = (typeof TOOLS_PAGES)[number]['id']

const COMPONENTS: Record<ToolsPageId, ComponentType> = {
  tools: ToolsIndex,
}

export function findToolsPage(
  id: string,
): { id: ToolsPageId; label: string; Component: ComponentType } | undefined {
  const page = TOOLS_PAGES.find((p) => p.id === id)
  return page ? { id: page.id, label: page.label, Component: COMPONENTS[page.id] } : undefined
}
