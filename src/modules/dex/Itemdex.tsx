import { IconArrowLeft } from '@tabler/icons-react'
import { useMemo } from 'react'
import { ItemArtwork } from '../../components/ItemArtwork'
import { itemIconUrl } from '../../data/itemArtwork'
import { LATEST_GENERATION } from '../../data'
import type { Item } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { DexPageShell, LedgerList } from './DexPageShell'
import { itemEntries } from './entrySources'
import { asStrings, type FilterSection, type SortField } from './query/dexQuery'

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
    POCKET FIRST, CATEGORY SECOND, AND THE SECOND IS SCOPED BY THE FIRST.

    They are separate fields rather than a coarse and a fine version of one
    thing -- 40 categories map onto 8 pockets, and the mapping lives on
    item-category upstream -- but they are not independent either. Forty category
    buttons is an unreadable row, and offering "Revival" while the reader has
    narrowed to Poke Balls offers a choice that can only return nothing. So the
    category options are DERIVED from the pocket selection (see `FilterOptions`),
    which also means a category silently drops out of the filter when the pocket
    that contained it is deselected, rather than quietly continuing to narrow a
    list the control no longer mentions.

    Both are read off the entries in scope, not hardcoded: the list is already
    clamped by the selected game, and the pockets a Generation 1 bag has are not
    the pockets a Generation 4 bag has.
  */
  const sections: FilterSection<Item>[] = useMemo(() => {
    const label = (value: string) => titleCase(value)
    const pockets = [...new Set(entries.map((i) => i.pocket))]
      .filter((p): p is string => p != null)
      .sort()
    const categoriesByPocket = new Map<string, Set<string>>()
    for (const item of entries) {
      if (item.pocket == null || item.category == null) continue
      const set = categoriesByPocket.get(item.pocket) ?? new Set<string>()
      set.add(item.category)
      categoriesByPocket.set(item.pocket, set)
    }
    const generations = [...new Set(entries.flatMap((i) => i.generation_ids))]
      .filter((g) => g <= LATEST_GENERATION)
      .sort((a, b) => a - b)

    return [
      {
        id: 'name',
        label: 'Name',
        filters: [
          {
            kind: 'text',
            key: 'name',
            label: 'Search items by name',
            testId: 'itemdex-search',
            match: (item, term) => item.display_name.toLowerCase().includes(term),
          },
        ],
      },
      {
        id: 'pocket',
        label: 'Pocket',
        filters: [
          {
            kind: 'multi',
            key: 'pocket',
            label: 'Pocket',
            options: pockets.map((p) => ({ value: p, label: label(p) })),
            match: (item, selected) => item.pocket != null && selected.includes(item.pocket),
          },
        ],
      },
      {
        id: 'category',
        label: 'Category',
        more: true,
        filters: [
          {
            kind: 'multi',
            key: 'category',
            label: 'Category',
            options: (values) => {
              const chosen = asStrings(values.pocket)
              const inScope = new Set<string>()
              for (const [pocket, categories] of categoriesByPocket) {
                if (chosen.length > 0 && !chosen.includes(pocket)) continue
                for (const category of categories) inScope.add(category)
              }
              return [...inScope]
                .sort()
                .map((category) => ({ value: category, label: label(category) }))
            },
            match: (item, selected) => item.category != null && selected.includes(item.category),
          },
        ],
      },
      {
        id: 'generation',
        label: 'Generation',
        more: true,
        filters: [
          {
            kind: 'select',
            key: 'generation',
            label: 'Available in generation',
            options: generations.map((g) => ({ value: String(g), label: `Generation ${g}` })),
            // `generation_ids` is every generation the item is INDEXED in, not
            // one introduction figure, so this is a membership test rather than
            // a comparison -- an item can leave and return.
            match: (item, value) => item.generation_ids.includes(Number(value)),
          },
        ],
      },
    ]
  }, [entries])

  const sorts: SortField<Item>[] = useMemo(
    () => [
      { key: 'id', label: 'Item #', value: (i) => i.id },
      { key: 'name', label: 'Name', value: (i) => i.display_name },
      { key: 'fling', label: 'Fling power', value: (i) => i.fling_power },
      { key: 'pocket', label: 'Pocket', value: (i) => i.pocket },
      { key: 'category', label: 'Category', value: (i) => i.category },
    ],
    [],
  )

  return (
    <DexPageShell
      dexId="itemdex"
      entries={entries}
      entryId={(item) => item.id}
      sections={sections}
      sorts={sorts}
      defaultSort="id"
      searchLabel="Search/filter items"
      gatedMessage={`No item in the bundle is indexed in Generation ${generation}.`}
      list={({ entries: visible, onSelect }) => (
        <LedgerList
          testId="itemdex-rows"
          rows={visible.map((item) => ({
            id: item.id,
            label: item.display_name,
            icon: itemIconUrl(item) && (
              <img
                src={itemIconUrl(item) ?? ''}
                alt=""
                width={24}
                height={24}
                loading="lazy"
                data-testid={`itemdex-row-icon-${item.id}`}
              />
            ),
            // Two distinct fields, middot-separated, in the order the bag itself
            // implies: the pocket is where you would look, the category is what
            // it is once you are there.
            sub: (
              <>
                <span data-testid={`itemdex-row-category-${item.id}`}>
                  {titleCase(item.category)}
                </span>
                {item.pocket && (
                  <>
                    <span className="row-sub-sep">·</span>
                    <span data-testid={`itemdex-row-pocket-${item.id}`}>
                      {titleCase(item.pocket)}
                    </span>
                  </>
                )}
              </>
            ),
          }))}
          onSelect={onSelect}
          emptyNote="No item matches those filters."
        />
      )}
      detail={({ entry, onBack }) => (
        <ItemDetail key={entry.id} item={entry} versionGroup={vgName} onBack={onBack} />
      )}
    />
  )
}

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

  return (
    <div className="entity-detail" data-testid="itemdex-detail" data-entry-id={item.id}>
      <div className="pokedex-back-row">
        <button type="button" className="pokedex-back" data-testid="entity-back" onClick={onBack}>
          <IconArrowLeft size={18} stroke={1.5} aria-hidden focusable="false" />
          All items
        </button>
      </div>

      {/* Artwork beside the name rather than in a panel above it: there is no
          container here for it to sit inside. */}
      <div className="item-hero">
        <ItemArtwork item={item} size={96} testId="itemdex-artwork" />
        <div className="item-hero-text">
          <h2 className="entity-detail-name" data-testid="itemdex-name">
            {item.display_name}
          </h2>
          <p className="entity-detail-meta">
            <span data-testid="itemdex-category">{titleCase(item.category)}</span>
            {item.pocket && (
              <>
                {' · '}
                <span data-testid="itemdex-pocket">{titleCase(item.pocket)} pocket</span>
              </>
            )}
          </p>
        </div>
      </div>

      {item.short_effect && (
        <p className="item-short-effect" data-testid="itemdex-short-effect">
          {item.short_effect}
        </p>
      )}
      <p className="entity-detail-desc" data-testid="itemdex-effect">
        {item.effect ?? 'No effect text in the bundle.'}
      </p>

      {/* Label/value rows on hairlines, not a bordered facts card. */}
      <ul className="fact-rows" data-testid="itemdex-facts">
        <li>
          <span className="fact-label">Price</span>
          <span className="fact-value" data-testid="itemdex-price">
            {purchase != null ? (
              <>
                <span className="num">{purchase.toLocaleString()}</span>{' '}
                {titleCase(priced?.price.currency ?? null)}
                {priced?.from && <span className="fact-note"> (from {priced.from})</span>}
              </>
            ) : (
              'Not sold'
            )}
          </span>
        </li>
        <li>
          <span className="fact-label">Sell price</span>
          <span className="fact-value" data-testid="itemdex-sell-price">
            {sell != null ? <span className="num">{sell.toLocaleString()}</span> : '—'}
          </span>
        </li>
        <li>
          <span className="fact-label">Fling power</span>
          <span className="fact-value">
            {item.fling_power != null ? <span className="num">{item.fling_power}</span> : '—'}
          </span>
        </li>
        <li>
          <span className="fact-label">Fling effect</span>
          <span className="fact-value">{titleCase(item.fling_effect)}</span>
        </li>
        <li>
          <span className="fact-label">Generations</span>
          <span className="fact-value" data-testid="itemdex-generations">
            {generations.length > 0 ? <span className="num">{generations.join(', ')}</span> : '—'}
          </span>
        </li>
        <li>
          <span className="fact-label">Attributes</span>
          <span className="fact-value">
            {item.attributes
              .filter((a) => a)
              .map(titleCase)
              .join(', ') || '—'}
          </span>
        </li>
      </ul>
    </div>
  )
}
