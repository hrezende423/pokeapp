import { IconArrowLeft } from '@tabler/icons-react'
import { useMemo } from 'react'
import { ItemArtwork } from '../../components/ItemArtwork'
import { TypeLabel } from '../../components/ds/TypeLabel'
import { getItem, getType } from '../../data'
import type { Berry } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { DexPageShell } from './DexPageShell'
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
 * millimetre of the chrome, and that IS shared: the ghost watermark, the artwork
 * box, the number and name line and the type row are the same .species-card-*
 * rules in one stylesheet block, so the Figma-measured geometry cannot drift
 * between them. The height difference is a single modifier class.
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
      <span className="species-card-ghost" aria-hidden>
        {String(berry.id).padStart(3, '0')}
      </span>
      <ItemArtwork item={item} size={96} testId={`berrydex-art-${berry.id}`} />
      <span className="species-card-text">
        <span className="species-card-line">
          <span className="dex-no">#{String(berry.id).padStart(4, '0')}</span>
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
 * One berry's page, built as the Itemdex's item page rather than beside it.
 *
 * SAME STRUCTURE, FIELD FOR FIELD: a back row, artwork beside the name with a
 * meta line under it, the short effect, the full effect, then label/value rows
 * on hairlines. Nothing is in a rectangle, which is the house rule for a detail
 * page here, and it is the Itemdex's layout because a berry IS an item in this
 * bundle -- two layouts for one kind of answer is the drift this app keeps
 * closing.
 *
 * THE EFFECT TEXT IS THE LINKED ITEM'S, and that is the only place it can come
 * from: a berry record carries numbers and flavours, not prose. Showing it here
 * is joining the two halves of one thing rather than borrowing from another.
 *
 * ALL FIVE FLAVOURS ARE LISTED, not just the dominant one. The card shows what
 * distinguishes a berry at a glance; the page is where the Pokeblock arithmetic
 * lives, and the zeroes are part of that answer -- 10 spicy and nothing else is
 * a different ingredient from 10 spicy and 10 dry.
 */
function BerryDetail({ berry, onBack }: { berry: Berry; onBack: () => void }) {
  const item = berry.item_id != null ? getItem(berry.item_id) : undefined
  const giftType = berry.natural_gift_type_id != null ? getType(berry.natural_gift_type_id) : null
  const flavours = berry.flavors.filter((f) => f.flavor != null)
  const num = (value: number | null) => (value != null ? <span className="num">{value}</span> : '—')

  return (
    <div className="entity-detail" data-testid="berrydex-detail" data-entry-id={berry.id}>
      <div className="pokedex-back-row">
        <button type="button" className="pokedex-back" data-testid="entity-back" onClick={onBack}>
          <IconArrowLeft size={18} stroke={1.5} aria-hidden focusable="false" />
          All berries
        </button>
      </div>

      <div className="item-hero">
        <ItemArtwork item={item} size={96} testId="berrydex-artwork" />
        <div className="item-hero-text">
          <h2 className="entity-detail-name" data-testid="berrydex-name">
            {berryName(berry)}
          </h2>
          <p className="entity-detail-meta">
            <span data-testid="berrydex-detail-firmness">{titleCase(berry.firmness)}</span>
            {giftType && (
              <>
                {' · Natural Gift '}
                <span data-testid="berrydex-detail-ng-type">
                  <TypeLabel type={giftType.name} small />
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {item?.short_effect && (
        <p className="item-short-effect" data-testid="berrydex-short-effect">
          {item.short_effect}
        </p>
      )}
      <p className="entity-detail-desc" data-testid="berrydex-effect">
        {item?.effect ?? 'No effect text in the bundle.'}
      </p>

      <ul className="fact-rows" data-testid="berrydex-facts">
        <li>
          <span className="fact-label">Natural Gift power</span>
          <span className="fact-value" data-testid="berrydex-detail-ng-power">
            {num(berry.natural_gift_power)}
          </span>
        </li>
        <li>
          <span className="fact-label">Size</span>
          <span className="fact-value" data-testid="berrydex-detail-size">
            {num(berry.size)}
            {berry.size != null && <span className="move-unit">mm</span>}
          </span>
        </li>
        <li>
          <span className="fact-label">Smoothness</span>
          <span className="fact-value" data-testid="berrydex-detail-smoothness">
            {num(berry.smoothness)}
          </span>
        </li>
        <li>
          <span className="fact-label">Growth time</span>
          <span className="fact-value" data-testid="berrydex-detail-growth">
            {num(berry.growth_time)}
            {berry.growth_time != null && <span className="move-unit">h/stage</span>}
          </span>
        </li>
        <li>
          <span className="fact-label">Max harvest</span>
          <span className="fact-value" data-testid="berrydex-detail-harvest">
            {num(berry.max_harvest)}
          </span>
        </li>
        <li>
          <span className="fact-label">Soil dryness</span>
          <span className="fact-value" data-testid="berrydex-detail-dryness">
            {num(berry.soil_dryness)}
          </span>
        </li>
        <li>
          <span className="fact-label">Flavours</span>
          <span className="fact-value" data-testid="berrydex-detail-flavours">
            {flavours.length > 0
              ? flavours.map((f, i) => (
                  <span key={f.flavor}>
                    {i > 0 && ' · '}
                    {titleCase(f.flavor)} <span className="num">{f.potency}</span>
                  </span>
                ))
              : '—'}
          </span>
        </li>
        <li>
          <span className="fact-label">Item</span>
          <span className="fact-value" data-testid="berrydex-detail-item">
            {item?.display_name ?? '—'}
          </span>
        </li>
      </ul>
    </div>
  )
}
