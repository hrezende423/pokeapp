import { useState } from 'react'
import { ScrollArea } from '../../components/ScrollArea'
import { scrollKey } from '../../components/scrollMemory'
import { Tabs } from '../../components/ds/Navigation'
import { CatchRateCalculator } from './CatchRateCalculator'
import { DamageCalculator } from './DamageCalculator'
import { ExperienceCalculator } from './ExperienceCalculator'
import { SpeedCalculator } from './SpeedCalculator'
import { StatCalculator } from './StatCalculator'
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
 * Five tools, in the order agreed: Damage, Catch Rate, Stat, Experience, Speed.
 * A sixth would be a data edit to TABS plus one more `tab === '…' &&` line, not
 * a new file's worth of shell — the same reason Type Coverage's four readings
 * live in one component.
 */

const TABS = ['Damage', 'Catch Rate', 'Stat', 'Experience', 'Speed'] as const
type CalculatorTab = (typeof TABS)[number]

/** Test-id slug: lowercase, spaces to hyphens — "Catch Rate" -> "catch-rate". */
const slug = (tab: string) => tab.toLowerCase().replace(/\s+/g, '-')

export function Calculators() {
  const [tab, setTab] = useState<CalculatorTab>('Damage')

  return (
    <div className="calc">
      <div className="calc-head" data-layout="calculators-head">
        <h1 className="calc-title">Calculators</h1>
        <div className="calc-subnav">
          <Tabs tabs={[...TABS]} active={tab} onSelect={(t) => setTab(t as CalculatorTab)} />
        </div>
      </div>

      <ScrollArea testId="calc-scroll-area" memoryKey={scrollKey('calc', tab)}>
        <div
          className={tab === 'Damage' ? 'calc-content calc-content-wide' : 'calc-content'}
          role="tabpanel"
          data-testid={`calc-panel-${slug(tab)}`}
        >
          {tab === 'Damage' && <DamageCalculator />}
          {tab === 'Catch Rate' && <CatchRateCalculator />}
          {tab === 'Stat' && <StatCalculator />}
          {tab === 'Experience' && <ExperienceCalculator />}
          {tab === 'Speed' && <SpeedCalculator />}
        </div>
      </ScrollArea>
    </div>
  )
}
