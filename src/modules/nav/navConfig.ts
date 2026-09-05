import { StubPage } from '../stubs/StubPage'
import { STUB_PAGES, findStub, type StubPageId } from '../stubs/stubPages'
import { findTeamBuildingPage, type TbPageId } from '../team-builder/pages'
import { DEX_MODULES, findModule, type DexModuleId } from './registry'
import type { ComponentType } from 'react'

/**
 * The whole nav, as data.
 *
 * Every tab and every dropdown entry is declared in NAV_TABS below, and NavMenu
 * renders all of them through one path. Adding, removing, reordering or nesting
 * an item is an edit to this file only -- no JSX, no new component, no change to
 * any render logic. That is the point: this list is expected to keep changing.
 *
 * The Pokepedia tab's entries are not listed here at all; they are derived from
 * DEX_MODULES, so a newly registered dex still appears on its own. registry.ts
 * stays the single source of truth for what a dex is.
 */

/**
 * Anything the shell can render: a dex module, a Team Building screen, or one of
 * the remaining stub destinations.
 *
 * Team Building's ids join as a THIRD source rather than folding into either of
 * the others: they are not dexes (no per-entry selection), and they are no longer
 * stubs (they have a real component). Keeping them separate is what lets findPage
 * resolve them without a stub fallback swallowing a real screen.
 */
export type PageId = DexModuleId | TbPageId | StubPageId

export interface NavEntry {
  /** The page this entry opens. */
  id: PageId
  label: string
  /**
   * Nested entries, for an item that expands into its own list rather than
   * being a leaf. Declared here and rendered generically, so giving Calculators
   * its sub-items later is a data edit like any other -- no render change.
   */
  children?: readonly NavEntry[]
}

export interface NavTab {
  /** Stable slug. Drives the trigger and dropdown test ids. */
  id: string
  label: string
  /** Set when the trigger is itself a destination rather than only a menu. */
  destination?: PageId
  /**
   * Test id for a wrapper element around this tab's entries. The Pokepedia tab
   * uses it so `dex-switcher` still resolves to exactly the registered dex
   * buttons, in registry order.
   */
  itemsTestId?: string
  entries: readonly NavEntry[]
}

/** Entries from STUB_PAGES, in the order named here rather than declaration order. */
const stubs = (...ids: readonly StubPageId[]): readonly NavEntry[] =>
  ids.map((id) => ({ id, label: findStub(id)?.label ?? id }))

/** Entries from the Team Building registry, same pattern as `stubs`. */
const teamBuilding = (...ids: readonly TbPageId[]): readonly NavEntry[] =>
  ids.map((id) => ({ id, label: findTeamBuildingPage(id)?.label ?? id }))

export const NAV_TABS: readonly NavTab[] = [
  {
    id: 'pokepedia',
    label: 'Poképedia',
    itemsTestId: 'dex-switcher',
    entries: DEX_MODULES.map((m) => ({ id: m.id, label: m.label })),
  },
  {
    id: 'team-building',
    label: 'Team Building',
    /*
      NEW TEAM AND NEW BUILD LEAD, which is the "entry point directly in the
      dropdown" the spec asks for: creating either must not require landing on a
      list screen first. The two list screens follow, then the one entry here
      that is still a stub.
    */
    entries: [
      ...teamBuilding('new-team', 'new-build', 'my-teams', 'build-library'),
      ...stubs('pokemon-collection'),
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    entries: stubs(
      'compare-pokemon',
      'battle-simulator',
      'training-optimization',
      'breeding-planner',
      // A leaf today. Give it `children` here when the calculators are scoped.
      'calculators',
    ),
  },
]

const DEX_IDS: ReadonlySet<string> = new Set(DEX_MODULES.map((m) => m.id))

/** Narrows a PageId to a dex id, so the dex-only APIs stay compile-checked. */
export function isDexId(id: PageId): id is DexModuleId {
  return DEX_IDS.has(id)
}

export interface ResolvedPage {
  id: PageId
  label: string
  Component: ComponentType
}

export function findPage(id: PageId): ResolvedPage {
  if (isDexId(id)) {
    const m = findModule(id)
    return { id: m.id, label: m.label, Component: m.Component }
  }
  // Checked BEFORE the stub lookup: the graduated ids are gone from STUB_PAGES,
  // but ordering it this way means re-adding one by mistake cannot silently
  // shadow a real screen with a placeholder.
  const tb = findTeamBuildingPage(id)
  if (tb) return { id: tb.id, label: tb.label, Component: tb.Component }
  const stub = findStub(id)
  if (stub) return { id: stub.id, label: stub.label, Component: StubPage }
  // Not reachable through PageId; findPage is also the shell's fallback.
  const first = DEX_MODULES[0]
  return { id: first.id, label: first.label, Component: first.Component }
}

/** True when this entry, or anything nested under it, is the open page. */
export function entryContains(entry: NavEntry, activeId: PageId): boolean {
  if (entry.id === activeId) return true
  return (entry.children ?? []).some((child) => entryContains(child, activeId))
}

export function tabIsActive(tab: NavTab, activeId: PageId): boolean {
  if (tab.destination === activeId) return true
  return tab.entries.some((entry) => entryContains(entry, activeId))
}

/** Every page a nav entry can reach, nesting included. Used by the shell's guards. */
export function allEntryIds(): readonly PageId[] {
  const out: PageId[] = []
  const walk = (entries: readonly NavEntry[]) => {
    for (const e of entries) {
      out.push(e.id)
      if (e.children) walk(e.children)
    }
  }
  for (const tab of NAV_TABS) {
    if (tab.destination) out.push(tab.destination)
    walk(tab.entries)
  }
  return out
}

export { STUB_PAGES }
