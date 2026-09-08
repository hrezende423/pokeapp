/**
 * Type Coverage's nav registration.
 *
 * A FOURTH PAGE SOURCE, and deliberately not an entry in DEX_MODULES. It sits
 * under Poképedia beside the dexes, but it is not one: there is no entry list and
 * no per-entry selection, so `useDexSelection` would never be called for it.
 *
 * That distinction is load-bearing rather than pedantic. registry.ts is the
 * single source of truth for WHAT A DEX IS, and the suites read it that way --
 * verify-dexes walks every registered module and requires each to render a
 * `dex-<id>` rows table. Registering here rather than there is what keeps that
 * contract honest; the alternative was giving this screen a `dex-` test id it
 * cannot satisfy, which would have made a real assertion meaningless.
 *
 * The arrangement mirrors team-builder/pages.ts exactly, for the reason its own
 * header gives: Team Building's screens joined as a third source because they
 * are not dexes and are no longer stubs. This is the same case.
 *
 * Kept in its own module, importing only the component, so navConfig can read
 * the id and label without a cycle.
 */

import type { ComponentType } from 'react'
import { TypeCoverage } from './TypeCoverage'

export const TYPE_COVERAGE_PAGES = [{ id: 'type-coverage', label: 'Type Coverage' }] as const

export type TypeCoveragePageId = (typeof TYPE_COVERAGE_PAGES)[number]['id']

export interface TypeCoveragePage {
  id: TypeCoveragePageId
  label: string
  Component: ComponentType
}

export function findTypeCoveragePage(id: string): TypeCoveragePage | undefined {
  const page = TYPE_COVERAGE_PAGES.find((p) => p.id === id)
  return page ? { id: page.id, label: page.label, Component: TypeCoverage } : undefined
}
