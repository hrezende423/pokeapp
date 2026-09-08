import { useState } from 'react'
import { ScrollArea } from '../../components/ScrollArea'
import { Tabs } from '../../components/ds/Navigation'
import { Segmented } from './Segmented'
import { TypeAgainstView } from './TypeAgainstView'
import { TypeCardView } from './TypeCardView'
import { TypeFlowView } from './TypeFlowView'
import { TypeMatrixView } from './TypeMatrixView'
import { useTypeCoverageScope } from './useTypeCoverageScope'
import '../../components/ds/ds.css'
import './typecoverage.css'

/**
 * Type Coverage: four readings of one table, under Pokepedia.
 *
 * FOUR TABS, MATRIX LEADING. Matrix is first and is the default because it is
 * the reading that answers a lookup ("what does Ice do to Ground/Flying") in one
 * glance; the other three re-frame the same chart for a different question.
 *
 * A FIFTH READING, "BY TYPE", WAS DELIBERATELY NOT BUILT. It listed each type's
 * dealing and taking as two tier stacks, which is a subset of what Flow shows
 * with the direction spelled out and of what Card shows at phone density, so it
 * was dropped on request rather than ported. `design-system/typechart-mockup.html`
 * still carries it as the design record; nothing in `src/` renders it, and no
 * component here exists only for it.
 *
 * A SIXTH, "DEFENDING", IS NOT MISSING EITHER -- it is the Matrix tab's Custom
 * orientation. The two were separate tabs in the mockup and merging them was the
 * point of this pass: they were one table read two ways, and asking the reader to
 * change tabs to transpose a matrix made the transpose look like a different
 * feature.
 *
 * THE GENERATION SELECTOR IS THIS PAGE'S OWN, not the app's -- see
 * useTypeCoverageScope for why that is a sanctioned exception rather than a
 * module ignoring the global selector.
 */

const TABS = ['Matrix', 'Flow', 'Against', 'Card'] as const
type TypeCoverageTab = (typeof TABS)[number]

/** What each generation's chart does that the others do not. */
const GENERATION_NOTES: Record<number, string> = {
  1: 'Gen 1 — 15 types, and its own chart: Ghost does nothing to Psychic (the famous bug, faithfully), Bug hits Poison for 2x, Poison hits Bug for 2x, and Ice is not resisted by Fire.',
  2: 'Gen 2 — Dark and Steel arrive, and the Gen 1 oddities are gone.',
  3: 'Gen 3 — the same 17 types as Gen 2.',
  4: 'Gen 4 — 17 types. No Fairy: that is Gen 6, outside this app.',
}

export function TypeCoverage() {
  const [tab, setTab] = useState<TypeCoverageTab>('Matrix')
  const scope = useTypeCoverageScope()

  return (
    <div className="tc" data-generation={scope.generation}>
      <div className="tc-head" data-layout="type-coverage-head">
        <div className="tc-title-block">
          <h1 className="tc-title">Type coverage</h1>
          <p className="tc-note">{GENERATION_NOTES[scope.generation]}</p>
        </div>
        {/* The species page's right-aligned sub-nav, and the same ds component
            the app nav uses -- so the accent's active-tab use is one rule. */}
        <div className="tc-subnav">
          <Tabs tabs={[...TABS]} active={tab} onSelect={(t) => setTab(t as TypeCoverageTab)} />
        </div>
      </div>

      <div className="tc-scope" data-layout="type-coverage-scope">
        <Segmented
          label="Generation"
          testId="tc-generation"
          options={scope.generations.map((g) => ({ value: String(g), label: `Gen ${g}` }))}
          value={String(scope.generation)}
          onChange={(next) => scope.setGeneration(Number(next))}
        />
        <span className="tc-scope-note">
          this page only — the app&rsquo;s game selector is left alone
        </span>
      </div>

      {/*
        ONE SCROLLER PER SCREEN, and it is this one: #root is pinned to the
        viewport and .panel clips, so a module without a ScrollArea simply ends
        mid-page with the bottom unreachable.

        The Matrix tab's TABLE scrolls itself as well, and that is not a second
        answer to the same problem -- it is what gives the frozen headers
        something to stick to. See the note in TypeMatrixView.
      */}
      <ScrollArea testId="tc-scroll-area">
        <div className="tc-body" role="tabpanel" data-tab={tab}>
          {/* NOT keyed by generation: switching era must not throw away the
              orientation and toggles the reader just set. TypeMatrixView clamps
              its own type filter to the types the generation has instead. */}
          {tab === 'Matrix' && <TypeMatrixView generation={scope.generation} />}
          {tab === 'Flow' && <TypeFlowView generation={scope.generation} />}
          {tab === 'Against' && <TypeAgainstView generation={scope.generation} />}
          {tab === 'Card' && <TypeCardView generation={scope.generation} />}
        </div>
      </ScrollArea>
    </div>
  )
}
