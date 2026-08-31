/**
 * The species detail page: pinned left column, scrolling right column.
 *
 * STEP 1 OF THE REDO -- the shell only. The four tab panels are placeholders on
 * purpose; their content is the next step and is deliberately not started here.
 *
 * WHY IT IS BEHIND ?detail=new. Swapping this in now would replace a page that
 * currently carries stats, learnset, encounters and the evolution chart with four
 * empty panels, regressing the live app and roughly a hundred suite assertions
 * for the duration of the review. The flag makes the new shell real and
 * inspectable in the actual app without taking the old one away. It is scaffolding
 * and comes out in step 2, when the tabs have content and this replaces
 * SpeciesDetail for good. Same mechanism the design-system page already uses.
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
 * WHAT IS REUSED RATHER THAN BUILT. Four of the five pieces Part 1 asks for
 * already existed and are imported, not reimplemented:
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
 *   getRegionForSpecies  new, but one line in generations.ts beside the ranges it
 *                    derives from.
 */

import { IconArrowLeft } from '@tabler/icons-react'
import { useState } from 'react'
import { ScrollArea } from '../../components/ScrollArea'
import { HeroDetailCard } from '../../components/ds/HeroDetailCard'
import { Tabs } from '../../components/ds/Navigation'
import { getRegionForSpecies, getSpecies } from '../../data'
import type { Species } from '../../data'

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
}: {
  speciesId: number
  onBack: () => void
}) {
  const [tab, setTab] = useState<SpeciesTab>('Info')
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
              PLACEHOLDERS. Step 1 is the shell; each panel names what lands in it
              so the layout can be judged at something like its real height without
              pretending the content exists.
            */}
            <p className="subtitle" data-testid="species-page-placeholder">
              {PLACEHOLDER[tab]}
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

const PLACEHOLDER: Record<SpeciesTab, string> = {
  Info: 'Step 2: abilities, height, weight, XP yield, growth rate, gender-ratio bar and held items on the left; egg groups, hatch time, friendship, catch rate, EV yield, shape and body colour on the right; then base-stat bars, the evolution chart and the type-effectiveness table full width.',
  Learnset:
    'Step 3: a species-local generation selector, then the learnset grouped by level-up / TM / egg move / move tutor.',
  Description: 'Step 4: per-game flavour text and location data. Biology write-up deferred.',
  Sprites: 'Step 5: every game sprite this species has, labelled, plus the animated ones.',
}
