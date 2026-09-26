/**
 * Calculators' nav registration.
 *
 * Same arrangement as typecoverage/pages.ts and team-builder/pages.ts, for the
 * same reason: this is a screen under a nav tab, not a dex (no entry list, no
 * per-entry selection), so it registers here rather than in DEX_MODULES.
 *
 * TWO PAGE IDS. The four small calculators are tabs of one screen (see
 * Calculators.tsx), the same shape Type Coverage uses for its four readings.
 * The Damage Calculator is its own page, nested under Calculators in the nav by
 * the owner's request: it is a full workspace (two Pokemon, a field, eight
 * results) with its own generation beside its title, not a tab-sized tool.
 */

import type { ComponentType } from 'react'
import { Calculators } from './Calculators'
import { DamageCalculatorPage } from './DamageCalculator'

export const CALCULATORS_PAGES = [
  { id: 'calculators', label: 'Calculators' },
  { id: 'damage-calculator', label: 'Damage Calculator' },
] as const

export type CalculatorsPageId = (typeof CALCULATORS_PAGES)[number]['id']

export interface CalculatorsPage {
  id: CalculatorsPageId
  label: string
  Component: ComponentType
}

export function findCalculatorsPage(id: string): CalculatorsPage | undefined {
  const page = CALCULATORS_PAGES.find((p) => p.id === id)
  if (!page) return undefined
  const Component = page.id === 'damage-calculator' ? DamageCalculatorPage : Calculators
  return { id: page.id, label: page.label, Component }
}
