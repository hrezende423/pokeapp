import { useMemo } from 'react'
import { ItemArtwork } from '../../components/ItemArtwork'
import { TypeLabel } from '../../components/ds/TypeLabel'
import { getItem, getType, typesInGeneration } from '../../data'
import type { Berry } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { DexPageShell } from './DexPageShell'
import { berryEntries } from './entrySources'
import type { FilterSection, SortField } from './query/dexQuery'

/**
 * The Berrydex: one card per berry, and no detail page at all.
 *
 * A berry has six facts worth showing -- firmness, size, smoothness, natural gift
 * type, natural gift power, growth time -- and all six fit on the card, so there
 * is nothing left for a second screen to hold. DexPageShell's `detail` prop is
 * therefore omitted and the cards are not clickable: a card that opened a page
 * repeating itself would be worse than no page.
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

function BerryCard({ berry }: { berry: Berry }) {
  const item = berry.item_id != null ? getItem(berry.item_id) : undefined
  const giftType = berry.natural_gift_type_id != null ? getType(berry.natural_gift_type_id) : null

  return (
    <div
      className="species-card berry-card"
      data-testid={`berrydex-row-${berry.id}`}
      data-entry-id={berry.id}
    >
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

/**
 * The berry's dominant flavour: the highest-potency entry of the five.
 *
 * `flavors` always carries all five with a potency each, and 0 is by far the
 * commonest value -- so "the flavour it tastes of" is the maximum, and a berry
 * whose maximum is 0 has no flavour at all rather than an arbitrary first one.
 * TIES ARE REAL and are not resolved here: a berry can be equally spicy and dry,
 * and this returns every flavour at the maximum so the filter matches on any of
 * them. Picking one would be inventing a precedence the games do not have.
 */
function dominantFlavors(berry: Berry): string[] {
  const potency = Math.max(0, ...berry.flavors.map((f) => f.potency))
  if (potency === 0) return []
  return berry.flavors.filter((f) => f.potency === potency && f.flavor).map((f) => f.flavor!)
}

/* Soft to hard, not alphabetical: firmness is an ordered scale and the reader is
   picking a point on it, so the buttons read in the order the scale runs. */
const FIRMNESS_OPTIONS = [
  { value: 'very-soft', label: 'Very Soft' },
  { value: 'soft', label: 'Soft' },
  { value: 'hard', label: 'Hard' },
  { value: 'very-hard', label: 'Very Hard' },
  { value: 'super-hard', label: 'Super Hard' },
]

/* The games' own flavour order (spicy, dry, sweet, bitter, sour), which is the
   order the five appear in on every berry record. */
const FLAVOR_OPTIONS = [
  { value: 'spicy', label: 'Spicy' },
  { value: 'dry', label: 'Dry' },
  { value: 'sweet', label: 'Sweet' },
  { value: 'bitter', label: 'Bitter' },
  { value: 'sour', label: 'Sour' },
]

export function Berrydex() {
  const { generation, isAll } = useVersionGroup()

  // Availability is derived from the linked item's generation table -- berries
  // have no generation field of their own. See data/availability.ts.
  const entries = useMemo(() => berryEntries({ generation, isAll }), [generation, isAll])

  // Same clamp every type control in the app uses: a type that does not exist in
  // this generation must not be offerable, even as a Natural Gift.
  const availableTypes = useMemo(() => typesInGeneration(generation), [generation])

  const sections: FilterSection<Berry>[] = useMemo(
    () => [
      {
        id: 'name',
        label: 'Name',
        filters: [
          {
            kind: 'text',
            key: 'name',
            label: 'Search berries by name',
            testId: 'berrydex-search',
            match: (berry, term) => berryName(berry).toLowerCase().includes(term),
          },
        ],
      },
      {
        /* The type filter stays a primary control here for the same reason it is
           one on the Pokedex and the Movedex: it is the axis people come to a
           list of 64 berries with. */
        id: 'gift-type',
        label: 'Natural Gift type',
        filters: [
          {
            kind: 'types',
            key: 'giftType',
            label: 'Natural Gift type',
            available: availableTypes,
            testIdPrefix: 'berrydex-ng-type',
            match: (berry, selected) =>
              berry.natural_gift_type_id != null && selected.includes(berry.natural_gift_type_id),
          },
        ],
      },
      {
        id: 'taste',
        label: 'Taste',
        more: true,
        filters: [
          {
            kind: 'multi',
            key: 'firmness',
            label: 'Firmness',
            options: FIRMNESS_OPTIONS,
            match: (berry, selected) => berry.firmness != null && selected.includes(berry.firmness),
          },
          {
            kind: 'multi',
            key: 'flavor',
            label: 'Dominant flavour',
            options: FLAVOR_OPTIONS,
            match: (berry, selected) =>
              dominantFlavors(berry).some((flavor) => selected.includes(flavor)),
          },
        ],
      },
      {
        id: 'values',
        label: 'Values',
        more: true,
        filters: [
          {
            kind: 'range',
            key: 'ngPower',
            label: 'Natural Gift power',
            value: (berry) => berry.natural_gift_power,
            bounds: { min: 60, max: 80 },
          },
          {
            kind: 'range',
            key: 'size',
            label: 'Size',
            value: (berry) => berry.size,
            bounds: { min: 20, max: 300 },
            unit: 'mm',
          },
          {
            kind: 'range',
            key: 'smoothness',
            label: 'Smoothness',
            value: (berry) => berry.smoothness,
            bounds: { min: 20, max: 60 },
          },
        ],
      },
      {
        id: 'growing',
        label: 'Growing',
        more: true,
        filters: [
          {
            kind: 'range',
            key: 'growthTime',
            label: 'Growth time',
            value: (berry) => berry.growth_time,
            bounds: { min: 2, max: 24 },
            unit: 'h/stage',
          },
          {
            kind: 'range',
            key: 'maxHarvest',
            label: 'Max harvest',
            value: (berry) => berry.max_harvest,
            bounds: { min: 5, max: 15 },
          },
        ],
      },
    ],
    [availableTypes],
  )

  const sorts: SortField<Berry>[] = useMemo(
    () => [
      { key: 'id', label: 'Berry #', value: (b) => b.id },
      { key: 'name', label: 'Name', value: (b) => berryName(b) },
      { key: 'ngPower', label: 'Gift power', value: (b) => b.natural_gift_power },
      { key: 'size', label: 'Size', value: (b) => b.size },
      { key: 'growthTime', label: 'Growth time', value: (b) => b.growth_time },
      { key: 'maxHarvest', label: 'Max harvest', value: (b) => b.max_harvest },
    ],
    [],
  )

  return (
    <DexPageShell
      dexId="berrydex"
      entries={entries}
      entryId={(berry) => berry.id}
      sections={sections}
      sorts={sorts}
      defaultSort="id"
      searchLabel="Search/filter berries"
      gatedMessage={`No berry in the bundle exists in Generation ${generation}. Berries arrived with Generation 2 and the modern berry system with Generation 3 — pick a later game to browse them.`}
      list={({ entries: visible }) => (
        <div className="pokedex-grid-wrap">
          <ul className="pokedex-grid berry-grid" data-testid="berrydex-rows">
            {visible.map((berry) => (
              <li key={berry.id}>
                <BerryCard berry={berry} />
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
    />
  )
}
