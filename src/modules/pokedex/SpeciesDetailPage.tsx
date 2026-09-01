/**
 * The species detail page: pinned left column, scrolling right column.
 *
 * ALL FOUR TABS ARE BUILT. What is still behind ?detail is the CUTOVER, not the
 * content -- see the note on NEW_DETAIL_PAGE in Pokedex.tsx. The one thing the old
 * page has that this one does not is the four-axis artwork control
 * (source/colour/motion/gender), which no part of the Figma DetailPage spec asks
 * for; the Sprites tab shows every image instead of letting you toggle one. That
 * is a real decision, not an oversight, and it is what the flag is holding open.
 *
 * THE LAYOUT, per Part 1 of the handoff:
 *
 *   LEFT   fixed. Never scrolls, whatever the right column does. Back-link, the
 *          hero treatment (ghost watermark + artwork + rotated micro-label), and
 *          the katakana / romaji pair under the name.
 *   RIGHT  the only scrollable area on the page. Page-local sub-nav, then the
 *          active panel.
 *
 * NO PER-SPECIES TINT and NO FLOATING DRAWER, both settled: the page is flat
 * --surface like every other, and this is a plain two-column split rather than an
 * overlapping rounded panel. species-background-colors.json is untouched.
 *
 * WHAT IS REUSED RATHER THAN BUILT, across all five parts:
 *
 *   HeroDetailCard   the watermark + artwork + rotated micro-label treatment.
 *                    Extended with optional sections rather than copied -- see the
 *                    note in that file for why types and stats are omitted here.
 *   ScrollArea       the right column's scroll model: native scrollbar suppressed,
 *                    the Figma icon-scrolldown chevron when more content is below,
 *                    and the back-to-top control. Its .scroll-top is positioned
 *                    against .scroll-area-outer, so "bottom-right of this column,
 *                    not the page" is what it already does.
 *   Tabs            the ds Navigation tab row: 1px --hairline under the whole row,
 *                    2px --accent under the active tab, accent + bold label. That
 *                    IS the app nav's tab treatment, so "styled identically" is a
 *                    shared component rather than a copied rule.
 *   EvolutionTree    dropped into the Info tab whole. Already era-aware, already
 *                    carries the painted/line condition icons and the dice fork.
 *   DataTable        the sortable hairline table, for the learnset sections and the
 *                    encounter list. A config, not a new table.
 *   StatRow/StatList the ds label-left / value-right hairline row, which IS the
 *                    metadata treatment the two Info sub-columns need.
 *   spriteTiles      the bitmask decoder from e15b347, for the Sprites tab.
 *   usePartitionRows the four-state loader for the two on-demand datasets.
 *
 * NEW: TypeMatchupChart (the grid form the old grouped list cannot express),
 * useSpeciesGameScope (the page's own game selector), resolveStatsForGeneration
 * in data/era.ts, and the four tab components.
 *
 * OPEN ITEMS live in SPECIES-PAGE-PUNCH-LIST.md beside this file -- the layout
 * fix-ups, the cutover decision, and the hidden-ability finding. Read it before
 * "fixing" the watermark size or the genus line: both are known and held.
 */

import { IconArrowLeft } from '@tabler/icons-react'
import { useState } from 'react'
import { ScrollArea } from '../../components/ScrollArea'
import { HeroDetailCard } from '../../components/ds/HeroDetailCard'
import { Tabs } from '../../components/ds/Navigation'
import { getRegionForSpecies, getSpecies } from '../../data'
import type { Species } from '../../data'
import { SpeciesDescriptionTab } from './SpeciesDescriptionTab'
import { SpeciesInfoTab } from './SpeciesInfoTab'
import { SpeciesLearnsetTab } from './SpeciesLearnsetTab'
import { SpeciesSpritesTab } from './SpeciesSpritesTab'
import { useSpeciesGameScope } from './useSpeciesGameScope'
import { useVersionGroup } from '../version-group/context'

/**
 * Tab order is the handoff's, and it is meaningful: Info is what most visits
 * want, Sprites is the browse-for-fun one and goes last.
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
    THE PAGE OWNS THE GAME SCOPE, not the tabs that show it. Held here for two
    reasons: the Learnset and Description tabs are reading the same "which game"
    question and should not be able to disagree about the answer, and only one tab
    is mounted at a time -- state inside a tab would reset every time you left it,
    so picking Gen 1 in Learnset and glancing at Sprites would silently put you
    back on the app's era.
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
  const region = getRegionForSpecies(species.id)

  return (
    <div className="species-page" data-testid="species-page" data-species-id={species.id}>
      {/*
        PINNED. Not sticky and not a scroll area: it is a grid column with its own
        overflow hidden, so it cannot scroll no matter how long the right column
        gets. Sticky would still have moved if the page itself ever scrolled.
      */}
      <div className="species-page-pinned" data-testid="species-page-pinned">
        <div className="pokedex-back-row">
          <button
            type="button"
            className="pokedex-back"
            data-testid="species-page-back"
            onClick={onBack}
          >
            <IconArrowLeft size={18} stroke={1.5} aria-hidden focusable="false" />
            All species
          </button>
        </div>

        <HeroDetailCard
          dexNumber={species.id}
          name={species.display_name}
          genus={species.genus}
          era={region ? `Region: ${region}` : 'Region: —'}
          artworkUrl={variety?.sprites.official_artwork ?? null}
        >
          {/*
            The Japanese pair sits inside the hero card, under the name, because
            it is part of naming the species rather than a fact about it. Both come
            straight from the bundle -- see the note on nameInLanguage in
            build-data.ts for why there is no transliteration step.
          */}
          {(species.name_ja || species.name_ja_romanized) && (
            <p className="species-page-ja" data-testid="species-page-ja">
              {species.name_ja && (
                <span className="species-page-ja-kana" lang="ja" data-testid="species-page-kana">
                  {species.name_ja}
                </span>
              )}
              {species.name_ja_romanized && (
                <span className="species-page-ja-roma" data-testid="species-page-romaji">
                  {species.name_ja_romanized}
                </span>
              )}
            </p>
          )}
        </HeroDetailCard>
      </div>

      {/*
        THE ONLY SCROLLABLE AREA ON THE PAGE. The sub-nav is inside it rather than
        pinned above it, so the tab row scrolls away with its own content -- it
        belongs to the panel, not to the page, which is also what stops it reading
        as a second app-level nav.
      */}
      <ScrollArea className="species-page-scroll" testId="species-page-scroll">
        <div className="species-page-main">
          <div className="species-page-subnav" data-testid="species-page-subnav">
            <Tabs tabs={[...TABS]} active={tab} onSelect={(t) => setTab(t as SpeciesTab)} />
          </div>

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
                onSelectSpecies={onSelectSpecies}
                onSelectEggGroup={onSelectEggGroup}
              />
            )}
            {variety && tab === 'Learnset' && (
              <SpeciesLearnsetTab species={species} variety={variety} scope={gameScope} />
            )}
            {variety && tab === 'Description' && (
              <SpeciesDescriptionTab species={species} variety={variety} scope={gameScope} />
            )}
            {variety && tab === 'Sprites' && (
              <SpeciesSpritesTab species={species} variety={variety} />
            )}
            {!variety && (
              <p className="subtitle" data-testid="species-page-no-variety">
                No default form for this species.
              </p>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
