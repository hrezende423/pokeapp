/**
 * The species detail page: pinned left column, persistent banner, scrolling panel.
 *
 * THE PAGE IS A PROPORTIONAL REPRODUCTION OF THE FIGMA FRAME, not a token-sized
 * layout that happens to have the same parts. DetailPage-Light (57:730) is
 * 1860 x 1172 raw units, and calibrate-scale.mjs established that those units are
 * CSS px x 2.23 -- so the frame is an 834px-wide page. Rendering it at token sizes
 * across a 1500px+ window is what made it read "too wide and too small": the same
 * type over nearly twice the linear space. .species-page is therefore a container,
 * every length on it is a multiple of --dp-u (one raw unit = 100cqw / 1860), and
 * the type tokens are redefined in those units for the whole subtree. One
 * consequence worth knowing: DataTable, StatRow and Tabs scale with it for free,
 * because they read the same custom properties.
 *
 * THE LAYOUT, from the frame rather than from prose:
 *
 *   container-sprite  57:837   x=8    w=737    the pinned column. Never scrolls.
 *   container-info    57:732   x=745  w=1115   banner, sub-nav, scrolling panel.
 *   container-poke-name 57:733 y=4    h=159    the banner.
 *   Tabs              139:644  x=575  y=182    the sub-nav: BELOW the banner,
 *                                              right-aligned in the column.
 *
 * THE BANNER IS PAGE CHROME. It is rendered here, once, outside the tab switch and
 * outside the scroll region, so switching tabs cannot unmount it, re-mount it or
 * scroll it away -- which is the actual requirement, and the reason punch-list
 * item 5 had no fix before: the name lived in the LEFT column and the types lived
 * inside the Info tab, so there was no single stacking order to reorder. The
 * sub-nav is chrome for the same reason and sits directly under it.
 *
 * THE BACK LINK IS ABSOLUTE, matching the frame (icon-page-back 59:900 sits at the
 * top-left of container-detail, overlapping the sprite column). In flow above the
 * hero it stole ~40px from a column whose artwork is meant to sit high in it.
 *
 * NO PER-SPECIES TINT and NO FLOATING DRAWER, both settled: the page is flat
 * --surface like every other, and this is a plain two-column split rather than an
 * overlapping rounded panel. species-background-colors.json is untouched.
 *
 * WHAT IS REUSED RATHER THAN BUILT:
 *
 *   ScrollArea       the panel's scroll model: native scrollbar suppressed, the
 *                    Figma icon-scrolldown chevron when more is below, and the
 *                    back-to-top control.
 *   Tabs             the ds Navigation tab row -- the same component the app nav
 *                    uses, so "styled identically" is shared code, not a copy.
 *   EvolutionTree    the Info tab's chart. Rebuilt to the layout-evo-* frames.
 *   DataTable        the learnset sections and the Info tab's encounter list.
 *   StatRow/StatList the ds label-left / value-right hairline metadata row.
 *   spriteTiles      the bitmask decoder, for the Sprites tab.
 *   usePartitionRows the four-state loader for the two on-demand datasets.
 *
 * LOCAL: SpeciesHero (the left column, replacing HeroDetailCard here -- see that
 * file for why the shared card stays as it is), SpeciesBanner, TypeMatchupChart,
 * useSpeciesGameScope, and the four tab components.
 *
 * OPEN ITEMS live in SPECIES-PAGE-PUNCH-LIST.md beside this file.
 */

import { IconArrowLeft } from '@tabler/icons-react'
import { useState } from 'react'
import { ScrollArea } from '../../components/ScrollArea'
import { Tabs } from '../../components/ds/Navigation'
import { getSpecies } from '../../data'
import type { Species } from '../../data'
import { SpeciesBanner } from './SpeciesBanner'
import { SpeciesDescriptionTab } from './SpeciesDescriptionTab'
import { SpeciesHero } from './SpeciesHero'
import { SpeciesInfoTab } from './SpeciesInfoTab'
import { SpeciesLearnsetTab } from './SpeciesLearnsetTab'
import { SpeciesSpritesTab } from './SpeciesSpritesTab'
import { useSpeciesGameScope } from './useSpeciesGameScope'
import { useVersionGroup } from '../version-group/context'

/**
 * Tab order is the frame's (139:646-649), and it is meaningful: Info is what most
 * visits want, Sprites is the browse-for-fun one and goes last.
 */
const TABS = ['Info', 'Learnset', 'Description', 'Sprites'] as const
export type SpeciesTab = (typeof TABS)[number]

const defaultVariety = (species: Species) =>
  species.varieties.find((v) => v.is_default) ?? species.varieties[0]

export function SpeciesDetailPage({
  speciesId,
  onBack,
  onSelectSpecies,
  onSelectEggGroup,
}: {
  speciesId: number
  onBack: () => void
  /** Opening another species from the evolution chart. */
  onSelectSpecies?: (id: number) => void
  /** Cross-navigation into the Breedingdex, from the Info tab's egg groups. */
  onSelectEggGroup?: (id: number) => void
}) {
  const [tab, setTab] = useState<SpeciesTab>('Info')
  const { generation, versionGroup } = useVersionGroup()
  /*
    THE PAGE OWNS THE GAME SCOPE, not the tabs that show it. The Learnset tab's own
    generation control drives it, and the Info tab reads it as the fallback for its
    locations section when the app selector is on "All". Held here because only one
    tab is mounted at a time -- state inside a tab would reset every time you left
    it.
  */
  const gameScope = useSpeciesGameScope(speciesId)
  const species = getSpecies(speciesId)

  if (!species) {
    return (
      <p className="subtitle" data-testid="species-page-missing">
        No species {speciesId} in the bundle.
      </p>
    )
  }

  const variety = defaultVariety(species)

  return (
    <div className="species-page" data-testid="species-page" data-species-id={species.id}>
      {/*
        THE UNIT AND THE TYPE SCALE LIVE HERE, not on .species-page. An element
        cannot query its own container: 100cqw inside .species-page's declarations
        would resolve against an ancestor container, not against .species-page. This
        wrapper is inside it, so cqw is the page width -- and --dp-u inherits from
        here to everything on the page. See pokedex.css.
      */}
      <div className="species-page-inner">
        <button
          type="button"
          className="pokedex-back species-page-back"
          data-testid="species-page-back"
          onClick={onBack}
        >
          <IconArrowLeft size={18} stroke={1.5} aria-hidden focusable="false" />
          All species
        </button>

        <div className="species-page-cols">
          {/*
          PINNED. Not sticky and not a scroll area: it is a grid column with its own
          overflow hidden, so it cannot scroll no matter how long the panel gets.
        */}
          <div className="species-page-pinned" data-testid="species-page-pinned">
            <SpeciesHero species={species} variety={variety} />
          </div>

          <div className="species-page-right">
            {/* CHROME. Outside the tab switch on purpose -- see the note above. */}
            <SpeciesBanner species={species} variety={variety} generation={generation} />

            <div className="species-page-subnav" data-testid="species-page-subnav">
              <Tabs tabs={[...TABS]} active={tab} onSelect={(t) => setTab(t as SpeciesTab)} />
            </div>

            {/* THE ONLY SCROLLABLE AREA ON THE PAGE. */}
            <ScrollArea className="species-page-scroll" testId="species-page-scroll">
              <div
                className="species-page-panel"
                data-testid={`species-page-panel-${tab.toLowerCase()}`}
                data-tab={tab}
                role="tabpanel"
              >
                {/*
                ONE TAB MOUNTED AT A TIME, not all four hidden with CSS. Learnset and
                Description each own an on-demand partition fetch, and mounting them
                on open would fire both requests for a visit that only wanted Info.
                The trade-off is that switching away and back re-runs the load -- the
                loader caches per partition, so that is a cache read, not a refetch.
              */}
                {variety && tab === 'Info' && (
                  <SpeciesInfoTab
                    species={species}
                    variety={variety}
                    generation={generation}
                    versionGroup={versionGroup}
                    scope={gameScope}
                    onSelectSpecies={onSelectSpecies}
                    onSelectEggGroup={onSelectEggGroup}
                  />
                )}
                {variety && tab === 'Learnset' && (
                  <SpeciesLearnsetTab species={species} variety={variety} scope={gameScope} />
                )}
                {variety && tab === 'Description' && <SpeciesDescriptionTab species={species} />}
                {variety && tab === 'Sprites' && (
                  <SpeciesSpritesTab species={species} variety={variety} />
                )}
                {!variety && (
                  <p className="subtitle" data-testid="species-page-no-variety">
                    No default form for this species.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  )
}
