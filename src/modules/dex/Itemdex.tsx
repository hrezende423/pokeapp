import { useMemo } from 'react'
import { ItemArtwork } from '../../components/ItemArtwork'
import { KeyValueList, type KeyValueItem } from '../../components/ds/KeyValueList'
import { itemIconUrl } from '../../data/itemArtwork'
import type { Item } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { DataTable, type Column } from '../../components/DataTable'
import { DexPageShell } from './DexPageShell'
import {
  EditorialBack,
  EditorialGroup,
  EditorialHead,
  EditorialLead,
  EditorialPage,
} from './EditorialDetail'
import { itemEntries } from './entrySources'

function titleCase(value: string | null): string {
  if (!value) return '—'
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Price for the selected game, falling back to any in-scope price.
 *
 * `prices` is per version group, and plenty of items are sold in some games and
 * not others. Showing the selected game's figure when there is one, and saying
 * which other game a fallback came from, beats printing one arbitrary number.
 *
 * Worth knowing: only 23 of the 563 items carry any price row at all, so "Not
 * sold" is the common answer here rather than the exception.
 */
function priceFor(item: Item, versionGroup: string | null) {
  const exact = versionGroup ? item.prices.find((p) => p.version_group === versionGroup) : undefined
  if (exact) return { price: exact, from: null as string | null }
  // Only attribute a fallback to another game when there is an actual figure to
  // attribute -- "Not sold (from red-blue)" reads as if red-blue were relevant.
  const sold = item.prices.find((p) => p.purchase_price != null)
  if (sold) return { price: sold, from: sold.version_group }
  return item.prices[0] ? { price: item.prices[0], from: null as string | null } : null
}

/**
 * The Itemdex: a full-width ledger list, and a boxless item page.
 *
 * WHAT CHANGED AND WHY. This was the last dex on DexShell -- a 240px rail beside
 * a column of bordered cards. It is now on DexPageShell like the rest, which
 * makes the trailing chevron on each row mean something (the row opens a page)
 * and puts the item page at full width where its artwork and effect text have
 * room. DexShell has no callers left after this.
 *
 * THE ROW PUTS THE SPRITE AFTER THE NAME. Every other ledger row in the app
 * carries no image at all, so there was no established side to be on; the sprite
 * trailing the name keeps the names themselves left-aligned in a single column,
 * which is what makes 563 rows scannable. It is two props on the shared row
 * component rather than an Itemdex-only row.
 *
 * CATEGORY AND POCKET ARE BOTH REAL AND BOTH SHOWN. They are separate fields, not
 * a coarse and a fine version of one thing: 40 categories map onto 8 bag pockets,
 * and the mapping lives on item-category in PokeAPI rather than on the item. See
 * the derivation in scripts/build-data.ts -- `pocket` was added to the bundle for
 * this, sourced from the snapshot, not hand-written.
 *
 * NO BOXES ON THE DETAIL PAGE. The four bordered DexCards are gone: name,
 * artwork, effect and a few label/value rows, separated by hairlines and by
 * spacing, in the same restraint the shared entity detail page uses. Nothing is
 * in a rectangle.
 */
export function Itemdex() {
  const { versionGroup, generation, isAll } = useVersionGroup()
  const vgName = versionGroup?.name ?? null

  // Under "All" nothing is filtered out: there is no single era to filter by.
  const entries = useMemo(() => itemEntries({ generation, isAll }), [generation, isAll])

  /*
    A TABLE WITH SORTABLE HEADERS (owner, 2026-10-10), like the Movedex: it was a
    ledger list sorted from the bar's Sort menu. The two fields that were a
    middot-separated sub-line are columns now, and Fling power, which was only
    a sort key, is on screen. Initial order is the bundle's own (item id), which
    is what the list showed.
  */
  const columns: Column<Item>[] = useMemo(
    () => [
      {
        key: 'name',
        label: 'Name',
        width: '15rem',
        sortValue: (item) => item.display_name,
        render: (item) => {
          const icon = itemIconUrl(item)
          return (
            <span className="dex-table-name">
              {item.display_name}
              {icon && (
                <img
                  src={icon}
                  alt=""
                  width={24}
                  height={24}
                  loading="lazy"
                  data-testid={`itemdex-row-icon-${item.id}`}
                />
              )}
            </span>
          )
        },
      },
      {
        key: 'category',
        label: 'Category',
        width: '12rem',
        sortValue: (item) => item.category,
        render: (item) => (
          <span data-testid={`itemdex-row-category-${item.id}`}>{titleCase(item.category)}</span>
        ),
      },
      {
        key: 'pocket',
        label: 'Pocket',
        width: '8rem',
        sortValue: (item) => item.pocket,
        render: (item) =>
          item.pocket ? (
            <span data-testid={`itemdex-row-pocket-${item.id}`}>{titleCase(item.pocket)}</span>
          ) : (
            '—'
          ),
      },
      {
        key: 'fling',
        label: 'Fling',
        width: '4.5rem',
        numeric: true,
        sortValue: (item) => item.fling_power,
        render: (item) => <span className="num">{item.fling_power ?? '—'}</span>,
      },
    ],
    [],
  )

  return (
    <DexPageShell
      dexId="itemdex"
      entries={entries}
      entryId={(item) => item.id}
      gatedMessage={`No item in the bundle is indexed in Generation ${generation}.`}
      list={({ entries: visible, onSelect }) => (
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={(item) => item.id}
          onRowClick={(item) => onSelect(item.id)}
          testId="itemdex-rows"
          emptyNote="No item matches those filters."
        />
      )}
      detail={({ entry, onBack }) => (
        <ItemDetail key={entry.id} item={entry} versionGroup={vgName} onBack={onBack} />
      )}
    />
  )
}

/**
 * One item's page, on the editorial structure (EditorialDetail.tsx).
 *
 * THE SPRITE IS LITERAL AND COMPACT, beside the name -- the item's own picture,
 * not a ghost treatment. 60px: twice the 30px in-game icon, so the fallback
 * stays crisp under nearest-neighbour scaling, and small enough that the name
 * and not the picture is the first thing read.
 *
 * Buy / Sell are the headline numbers, so they are the strip. The effect text is
 * the lead. The short effect is not printed above it any more: it summarised
 * the same text one size up, and on a page that leads with the effect itself it
 * was the same fact twice.
 *
 * NO LOCATIONS. The bundle has no item-location data; sourcing it is separate
 * data work, not part of this layout (owner, 2026-10-10).
 */
function ItemDetail({
  item,
  versionGroup,
  onBack,
}: {
  item: Item
  versionGroup: string | null
  onBack: () => void
}) {
  const priced = priceFor(item, versionGroup)
  const purchase = priced?.price.purchase_price ?? null
  const sell = priced?.price.sell_price ?? null
  const generations = item.generation_ids.filter((g) => g <= 4)

  const strip: KeyValueItem[] = [
    {
      label: 'Buy',
      testId: 'itemdex-price',
      value:
        purchase != null ? (
          <>
            <span className="num">{purchase.toLocaleString()}</span>
            <span className="move-unit">{titleCase(priced?.price.currency ?? null)}</span>
            {priced?.from && <span className="fact-note"> (from {priced.from})</span>}
          </>
        ) : (
          'Not sold'
        ),
    },
    {
      label: 'Sell',
      testId: 'itemdex-sell-price',
      value: sell != null ? <span className="num">{sell.toLocaleString()}</span> : '—',
    },
  ]

  const facts: KeyValueItem[] = [
    {
      label: 'Fling power',
      value: item.fling_power != null ? <span className="num">{item.fling_power}</span> : '—',
    },
    { label: 'Fling effect', value: titleCase(item.fling_effect) },
    {
      label: 'Generations',
      testId: 'itemdex-generations',
      value: generations.length > 0 ? <span className="num">{generations.join(', ')}</span> : '—',
    },
    {
      label: 'Attributes',
      value:
        item.attributes
          .filter((a) => a)
          .map(titleCase)
          .join(', ') || '—',
    },
  ]

  return (
    <EditorialPage testId="itemdex-detail" entryId={item.id}>
      <EditorialBack label="All items" onBack={onBack} />
      <EditorialHead
        title={item.display_name}
        titleTestId="itemdex-name"
        art={<ItemArtwork item={item} size={60} testId="itemdex-artwork" />}
        identity={
          <>
            <span className="dex-ed-caps" data-testid="itemdex-category">
              {titleCase(item.category)}
            </span>
            {item.pocket && (
              <>
                <span className="dex-ed-sep" aria-hidden>
                  ·
                </span>
                <span className="dex-ed-caps" data-testid="itemdex-pocket">
                  {titleCase(item.pocket)} pocket
                </span>
              </>
            )}
          </>
        }
        strip={strip}
        stripTestId="itemdex-strip"
      />
      <EditorialLead testId="itemdex-effect">
        {item.effect ?? item.short_effect ?? 'No effect text in the bundle.'}
      </EditorialLead>
      <EditorialGroup label="Details">
        <KeyValueList items={facts} testId="itemdex-facts" />
      </EditorialGroup>
    </EditorialPage>
  )
}
