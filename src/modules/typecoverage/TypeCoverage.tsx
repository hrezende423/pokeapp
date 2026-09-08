import { useState } from 'react'
import { ScrollArea } from '../../components/ScrollArea'
import { Tabs } from '../../components/ds/Navigation'
import { ControlRail } from './ControlRail'
import { TypeAgainstView } from './TypeAgainstView'
import { TypeCardView } from './TypeCardView'
import { TypeFlowView } from './TypeFlowView'
import { TypeMatrixView } from './TypeMatrixView'
import { useMatrixControls } from './useMatrixControls'
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
 * TWO REGIONS, NAMED, AND THE RAIL IS THE SHELL'S. `data-layout="type-coverage-main"`
 * is a grid of `content rail`: the view on the left, the controls on the right,
 * directly under the tab strip. The rail belongs to the shell rather than to each
 * view because the generation dropdown has to land in the SAME place on all four
 * tabs -- four views each placing it would be four coordinates that do not refer
 * to one another, which is the failure the layout rules were adopted to stop.
 * Moving a control is editing this grid, not editing a view.
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
 * point of that pass: they were one table read two ways, and asking the reader to
 * change tabs to transpose a matrix made the transpose look like a different
 * feature.
 *
 * NO PAGE SUBTITLE AND NO SCOPE CAPTION. Both were removed on request. The
 * per-generation chart notes ("Gen 1 -- 15 types, Ghost does nothing to
 * Psychic") went with the subtitle; that Gen 1 really is its own chart is still
 * true and still rendered, it is just no longer narrated.
 */

const TABS = ['Matrix', 'Flow', 'Against', 'Card'] as const
type TypeCoverageTab = (typeof TABS)[number]

export function TypeCoverage() {
  const [tab, setTab] = useState<TypeCoverageTab>('Matrix')
  const scope = useTypeCoverageScope()
  /*
    THE SHELL HOLDS MATRIX'S CONTROLS because the rail renders them -- see
    useMatrixControls. It also means leaving Matrix and coming back does not
    throw the orientation away.
  */
  const controls = useMatrixControls()

  return (
    <div className="tc" data-generation={scope.generation}>
      <div className="tc-head" data-layout="type-coverage-head">
        <h1 className="tc-title">Type coverage</h1>
        {/* The species page's right-aligned sub-nav, and the same ds component
            the app nav uses -- so the accent's active-tab use is one rule. */}
        <div className="tc-subnav">
          <Tabs tabs={[...TABS]} active={tab} onSelect={(t) => setTab(t as TypeCoverageTab)} />
        </div>
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
        <div className="tc-main" data-layout="type-coverage-main" data-tab={tab}>
          <div className="tc-content" role="tabpanel" data-testid={`tc-panel-${tab.toLowerCase()}`}>
            {/* NOT keyed by generation: switching era must not throw away the
                orientation and toggles the reader just set. TypeMatrixView
                clamps its own type filter to the types the generation has. */}
            {tab === 'Matrix' && (
              <TypeMatrixView generation={scope.generation} controls={controls} />
            )}
            {tab === 'Flow' && <TypeFlowView generation={scope.generation} />}
            {tab === 'Against' && <TypeAgainstView generation={scope.generation} />}
            {tab === 'Card' && <TypeCardView generation={scope.generation} />}
          </div>

          <ControlRail
            scope={scope}
            controls={controls}
            showMatrixControls={tab === 'Matrix'}
          />
        </div>
      </ScrollArea>
    </div>
  )
}
