/**
 * Calculators' nav registration.
 *
 * Same arrangement as typecoverage/pages.ts and team-builder/pages.ts, for the
 * same reason: this is a screen under a nav tab, not a dex (no entry list, no
 * per-entry selection), so it registers here rather than in DEX_MODULES.
 *
 * ONE PAGE ID, FIVE TOOLS INSIDE IT. The five calculators are tabs of one
 * screen (see Calculators.tsx), the same shape Type Coverage uses for its four
 * readings — not five nav entries, which would be five destinations for what is
 * really one "pick a tool" question answered inside the page.
 */

import type { ComponentType } from 'react'
import { Calculators } from './Calculators'

export const CALCULATORS_PAGES = [{ id: 'calculators', label: 'Calculators' }] as const

export type CalculatorsPageId = (typeof CALCULATORS_PAGES)[number]['id']

export interface CalculatorsPage {
  id: CalculatorsPageId
  label: string
  Component: ComponentType
}

export function findCalculatorsPage(id: string): CalculatorsPage | undefined {
  const page = CALCULATORS_PAGES.find((p) => p.id === id)
  return page ? { id: page.id, label: page.label, Component: Calculators } : undefined
}
