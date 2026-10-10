import { useMemo } from 'react'
import { ItemArtwork } from '../../components/ItemArtwork'
import { KeyValueList, type KeyValueItem } from '../../components/ds/KeyValueList'
import { StatBar, StatBarList } from '../../components/ds/StatBar'
import { TypeLabel } from '../../components/ds/TypeLabel'
import { getItem, getType } from '../../data'
import type { Berry } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { DexPageShell } from './DexPageShell'
import {
  EditorialBack,
  EditorialGroup,
  EditorialHead,
  EditorialLead,
  EditorialPage,
} from './EditorialDetail'
import { berryEntries } from './entrySources'

/**
 * The Berrydex: one card per berry, and a detail page behind it.
 *
 * THE CARD SHOWS SIX FACTS AND THE BERRY HAS TWELVE, which is what changed. This
 * dex shipped with no detail page, on the reasoning that everything worth
 * showing fitted on the card -- true of the six it shows, and not true of the
 * berry: soil dryness, max harvest, the full five-flavour profile and the linked
 * item's own effect text all had nowhere to go. See BerryDetail below.
 *
 * SIX FIELDS IN THREE SHORT LINES, and the card is TALLER, NOT WIDER. The natural
 * gift TYPE is a type, so it goes in the type row the species card already has,
 * which leaves five values for the secondary slot.
 *
 * Two lines were tried first and measured: the widest wanted 181px against the
 * card's 149px text box and 31 of 128 rendered lines truncated -- "Super Hard ·
 * 285mm · 30 smooth" is simply too long for a 212px card. The fix is three short
 * lines rather than smaller text, because shrinking the label font to force a fit
 * is the thing worth avoiding here.
 *
 * WIDTH is what was held constant, deliberately: 212px, the same three columns at
 * the same pitch as the Pokedex grid, so the two grids line up column for column.
 * HEIGHT is what gave: 199px becomes 229px. Of the two axes, width is the one
 * that governs the grid rhythm, so it is the one that had to match.
 *
 * WHY THIS IS NOT SpeciesCard WITH A PROP. The two share no data shape -- one
 * resolves varieties, generation-aware typing and abilities from a Species, the
 * other reads six scalars off a Berry -- so a single component would be a
 * discriminated union pretending to be one thing. What they do share is every
 * millimetre of the chrome, and that IS shared: the artwork box, the name line
 * and the type row are the same .species-card-* rules in one stylesheet block,
 * so the Figma-measured geometry cannot drift between them. The height
 * difference is a single modifier class.
 *
 * NO GHOST NUMBER (owner, 2026-10-10). A berry's id is not a catalog number
 * anyone navigates by, so the Pokédex card's ghost dex number was its template
 * carried over rather than a fact about the berry. The grid stays a grid -- it
 * is the right shape for 64 pictures -- but only the spacing and borderless
 * system carries across, not the species card's literal furniture.
 *
 * ARTWORK: the 90x84 Dream World image, present for all 64 berries -- verified,
 * not assumed. ItemArtwork is the same component the item page uses, and its
 * icon fallback never fires here because there are no gaps in the berry set.
 */

/**
 * Berries carry only a bare `name` ("cheri"); the display name lives on the
 * linked item ("Cheri Berry"). Fall back to a title-cased name rather than
 * showing a lowercase slug if a join ever breaks.
 */
function berryName(berry: Berry): string {
  const item = berry.item_id != null ? getItem(berry.item_id) : undefined
  if (item) return item.display_name
  return `${berry.name.charAt(0).toUpperCase()}${berry.name.slice(1)} Berry`
}

function titleCase(value: string | null): string {
  if (!value) return '—'
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function BerryCard({ berry, onSelect }: { berry: Berry; onSelect: (id: number) => void }) {
  const item = berry.item_id != null ? getItem(berry.item_id) : undefined
  const giftType = berry.natural_gift_type_id != null ? getType(berry.natural_gift_type_id) : null

  return (
    <div
      className="species-card berry-card"
      data-testid={`berrydex-row-${berry.id}`}
      data-entry-id={berry.id}
    >
      {/* The card opens the berry's page now, so it takes the same stretched
          overlay button the species card uses: the card itself cannot become a
          <button>, because its contents are spans and the geometry is shared. */}
      <button
        type="button"
        className="species-card-hit"
        data-testid={`berrydex-open-${berry.id}`}
        aria-label={berryName(berry)}
        onClick={() => onSelect(berry.id)}
      />
      <ItemArtwork item={item} size={96} testId={`berrydex-art-${berry.id}`} />
      <span className="species-card-text">
        <span className="species-card-line">
          <span className="species-name">{berryName(berry)}</span>
        </span>
        {/* The natural gift type, in the slot the species card gives typing. Same
            TypeLabel, so it is the same coloured text in the same place. */}
        <span className="species-card-types">
          {giftType ? (
            <TypeLabel type={giftType.name} small />
          ) : (
            <span className="berry-card-none">no natural gift</span>
          )}
        </span>
        <span className="berry-card-facts" data-testid={`berrydex-facts-${berry.id}`}>
          {/* Physical: what the berry is like in the hand. */}
          <span className="berry-card-fact-line" data-testid={`berrydex-physical-${berry.id}`}>
            <span data-testid={`berrydex-firmness-${berry.id}`}>{titleCase(berry.firmness)}</span>
            <span className="berry-card-sep">·</span>
            <span className="num" data-testid={`berrydex-size-${berry.id}`}>
              {berry.size ?? '—'}
              <span className="move-unit">mm</span>
            </span>
          </span>
          {/* What it is worth: smoothness feeds Pokéblocks, gift power feeds
              Natural Gift. */}
          <span className="berry-card-fact-line" data-testid={`berrydex-values-${berry.id}`}>
            <span data-testid={`berrydex-smoothness-${berry.id}`}>
              <span className="num">{berry.smoothness ?? '—'}</span> smooth
            </span>
            <span className="berry-card-sep">·</span>
            <span data-testid={`berrydex-ng-power-${berry.id}`}>
              gift <span className="num">{berry.natural_gift_power ?? '—'}</span>
            </span>
          </span>
          {/* How long it takes to grow. */}
          <span className="berry-card-fact-line" data-testid={`berrydex-growth-${berry.id}`}>
            <span className="num" data-testid={`berrydex-growth-time-${berry.id}`}>
              {berry.growth_time ?? '—'}
              <span className="move-unit">h/stage</span>
            </span>
          </span>
        </span>
      </span>
    </div>
  )
}

export function Berrydex() {
  const { generation, isAll } = useVersionGroup()

  // Availability is derived from the linked item's generation table -- berries
  // have no generation field of their own. See data/availability.ts.
  const entries = useMemo(() => berryEntries({ generation, isAll }), [generation, isAll])

  return (
    <DexPageShell
      dexId="berrydex"
      entries={entries}
      entryId={(berry) => berry.id}
      gatedMessage={`No berry in the bundle exists in Generation ${generation}. Berries arrived with Generation 2 and the modern berry system with Generation 3 — pick a later game to browse them.`}
      list={({ entries: visible, onSelect }) => (
        <div className="pokedex-grid-wrap">
          <ul className="pokedex-grid berry-grid" data-testid="berrydex-rows">
            {visible.map((berry) => (
              <li key={berry.id}>
                <BerryCard berry={berry} onSelect={onSelect} />
              </li>
            ))}
            {visible.length === 0 && (
              <li className="empty" data-testid="berrydex-rows-empty">
                No berry matches those filters.
              </li>
            )}
          </ul>
        </div>
      )}
      detail={({ entry, onBack }) => <BerryDetail key={entry.id} berry={entry} onBack={onBack} />}
    />
  )
}

/**
 * The highest flavour potency any berry in the bundle has (Enigma, Micle,
 * Custap, Jaboca, Rowap -- one per flavour). The flavour bars are drawn on this scale, measured from
 * berries.json rather than assumed: potency runs 0-40, not 0-255 like a stat.
 */
const MAX_FLAVOUR_POTENCY = 40

/**
 * One berry's page: the Itemdex's editorial layout, because a berry IS an item
 * in this bundle and two layouts for one kind of answer is the drift this app
 * keeps closing.
 *
 * SAME STRUCTURE, FIELD FOR FIELD: the compact literal sprite beside the name,
 * identity under it, the headline numbers as a strip, the linked item's effect as
 * the lead text, then grouped secondary facts. Nothing is in a rectangle.
 *
 * THE EFFECT TEXT IS THE LINKED ITEM'S, and that is the only place it can come
 * from: a berry record carries numbers and flavours, not prose.
 *
 * THE FLAVOUR PROFILE IS FIVE STAT BARS, the shared StatBar on a 0-40 scale --
 * not a new chart type. All five are drawn, zeroes included: the page is where
 * the Pokéblock arithmetic lives, and 10 spicy and nothing else is a different
 * ingredient from 10 spicy and 10 dry.
 */
function BerryDetail({ berry, onBack }: { berry: Berry; onBack: () => void }) {
  const item = berry.item_id != null ? getItem(berry.item_id) : undefined
  const giftType = berry.natural_gift_type_id != null ? getType(berry.natural_gift_type_id) : null
  const flavours = berry.flavors.filter((f) => f.flavor != null)
  const num = (value: number | null) => (value != null ? <span className="num">{value}</span> : '—')

  const strip: KeyValueItem[] = [
    {
      label: 'Gift power',
      testId: 'berrydex-detail-ng-power',
      value: num(berry.natural_gift_power),
    },
    {
      label: 'Size',
      testId: 'berrydex-detail-size',
      value: (
        <>
          {num(berry.size)}
          {berry.size != null && <span className="move-unit">mm</span>}
        </>
      ),
    },
    {
      label: 'Growth',
      testId: 'berrydex-detail-growth',
      value: (
        <>
          {num(berry.growth_time)}
          {berry.growth_time != null && <span className="move-unit">h/stage</span>}
        </>
      ),
    },
  ]

  const facts: KeyValueItem[] = [
    { label: 'Smoothness', testId: 'berrydex-detail-smoothness', value: num(berry.smoothness) },
    { label: 'Max harvest', testId: 'berrydex-detail-harvest', value: num(berry.max_harvest) },
    { label: 'Soil dryness', testId: 'berrydex-detail-dryness', value: num(berry.soil_dryness) },
    { label: 'Item', testId: 'berrydex-detail-item', value: item?.display_name ?? '—' },
  ]

  return (
    <EditorialPage testId="berrydex-detail" entryId={berry.id}>
      <EditorialBack label="All berries" onBack={onBack} />
      <EditorialHead
        title={berryName(berry)}
        titleTestId="berrydex-name"
        art={<ItemArtwork item={item} size={60} testId="berrydex-artwork" />}
        identity={
          <>
            <span className="dex-ed-caps" data-testid="berrydex-detail-firmness">
              {titleCase(berry.firmness)}
            </span>
            {giftType && (
              <>
                <span className="dex-ed-sep" aria-hidden>
                  ·
                </span>
                <span className="dex-ed-caps">Natural Gift</span>{' '}
                <span data-testid="berrydex-detail-ng-type">
                  <TypeLabel type={giftType.name} />
                </span>
              </>
            )}
          </>
        }
        strip={strip}
        stripTestId="berrydex-strip"
      />
      <EditorialLead testId="berrydex-effect">
        {item?.effect ?? item?.short_effect ?? 'No effect text in the bundle.'}
      </EditorialLead>
      <EditorialGroup label="Flavour">
        {flavours.length > 0 ? (
          <StatBarList testId="berrydex-detail-flavours">
            {flavours.map((f) => (
              <StatBar
                key={f.flavor}
                label={titleCase(f.flavor)}
                value={f.potency}
                max={MAX_FLAVOUR_POTENCY}
                display={<span className="num">{f.potency}</span>}
              />
            ))}
          </StatBarList>
        ) : (
          <p className="dex-ed-note" data-testid="berrydex-detail-flavours">
            No flavour data in the bundle.
          </p>
        )}
      </EditorialGroup>
      <EditorialGroup label="Details">
        <KeyValueList items={facts} testId="berrydex-facts" />
      </EditorialGroup>
    </EditorialPage>
  )
}
