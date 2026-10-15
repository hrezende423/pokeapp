import { useEffect, useState } from 'react'
import { ScrollArea } from '../../components/ScrollArea'
import { scrollKey } from '../../components/scrollMemory'
import { Tabs } from '../../components/ds/Navigation'
import { CatchRateCalculator } from './CatchRateCalculator'
import { clearCalculatorsTab, peekCalculatorsTab } from './calculatorsHandoff'
import { ExperienceCalculator } from './ExperienceCalculator'
import { SpeedCalculator } from './SpeedCalculator'
import { StatCalculator } from './StatCalculator'
import { toolAvailability } from '../tools/gates'
import { ToolResult } from '../tools/ToolShell'
import { useVersionGroup } from '../version-group/context'
import '../../components/ds/ds.css'
import './calculators.css'

/**
 * Calculators: standalone tools under Poképedia, one per tab.
 *
 * SAME SHAPE AS TYPE COVERAGE, on purpose — a handful of independent readings
 * under one nav destination, each a tab rather than its own page. Unlike Type
 * Coverage there is no shared rail: every tool here has its own inputs and
 * nothing to keep in the same place across tabs, so the shell is just the tab
 * strip and a scroller.
 *
 * Four tools, in the order agreed: Catch Rate, Stat, Experience, Speed. A fifth
 * would be a data edit to TABS plus one more `tab === '…' &&` line, not a new
 * file's worth of shell — the same reason Type Coverage's four readings live in
 * one component. The Damage Calculator was a tab here and is now its own page
 * (DamageCalculator.tsx), nested under Calculators in the nav.
 */

const TABS = ['Catch Rate', 'Stat', 'Experience', 'Speed'] as const
export type CalculatorTab = (typeof TABS)[number]

/** Test-id slug: lowercase, spaces to hyphens — "Catch Rate" -> "catch-rate". */
const slug = (tab: string) => tab.toLowerCase().replace(/\s+/g, '-')

/**
 * Tabs whose mechanics are Gen 1-4 only. With the app on Gen 5-9 (or "All") they
 * say so instead of answering (owner, 2026-10-15) -- the same gate as the Tools
 * pages. Experience is not here: growth rates did not change after Gen 4.
 */
const GATED: ReadonlySet<CalculatorTab> = new Set(['Catch Rate', 'Stat', 'Speed'])
const GEN_1_4 = { gens: [1, 2, 3, 4] }

export function Calculators() {
  // Another screen (the Tools index) may ask for a tab: read it here, clear it
  // after mount, so the next visit opens on the default again.
  const [handoff] = useState(peekCalculatorsTab)
  const [tab, setTab] = useState<CalculatorTab>(handoff?.tab ?? 'Catch Rate')
  useEffect(() => {
    if (handoff) clearCalculatorsTab(handoff.id)
  }, [handoff])
  const app = useVersionGroup()
  const availability = GATED.has(tab)
    ? toolAvailability(GEN_1_4, app.isAll ? null : app.generation)
    : ({ ok: true } as const)

  return (
    <div className="calc">
      <div className="calc-head" data-layout="calculators-head">
        <h1 className="calc-title">Calculators</h1>
        <div className="calc-subnav">
          <Tabs tabs={[...TABS]} active={tab} onSelect={(t) => setTab(t as CalculatorTab)} />
        </div>
      </div>

      <ScrollArea testId="calc-scroll-area" memoryKey={scrollKey('calc', tab)}>
        <div className="calc-content" role="tabpanel" data-testid={`calc-panel-${slug(tab)}`}>
          {!availability.ok && <ToolResult reason={availability.reason} />}
          {availability.ok && tab === 'Catch Rate' && <CatchRateCalculator />}
          {availability.ok && tab === 'Stat' && <StatCalculator />}
          {tab === 'Experience' && <ExperienceCalculator />}
          {availability.ok && tab === 'Speed' && <SpeedCalculator />}
        </div>
      </ScrollArea>
    </div>
  )
}
