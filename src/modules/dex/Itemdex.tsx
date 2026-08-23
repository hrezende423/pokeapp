import { useMemo } from 'react'
import { listItems } from '../../data'
import type { Item } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { DexCard, DexFacts, DexShell } from './DexShell'
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

export function Itemdex() {
  const { versionGroup, generation, isAll } = useVersionGroup()
  const vgName = versionGroup?.name ?? null

  // Under "All" nothing is filtered out: there is no single era to filter by.
  const entries = useMemo(() => itemEntries({ generation, isAll }), [generation, isAll])

  const total = listItems().length

  return (
    <DexShell
      dexId="itemdex"
      title="Itemdex"
      entries={entries}
      gatedMessage={`No item in the bundle is indexed in Generation ${generation}.`}
      note={
        isAll
          ? `All ${total} items — every one is indexed in at least one of Generations 1-4`
          : `${entries.length} of ${total} items exist in Generation ${generation}`
      }
      row={(item) => ({
        id: item.id,
        label: item.display_name,
        meta: titleCase(item.category).toLowerCase(),
      })}
      detail={(item) => {
        const priced = priceFor(item, vgName)
        return (
          <>
            <DexCard testId="itemdex-card-head" title="Item">
              <h2 data-testid="itemdex-name">{item.display_name}</h2>
              <p className="subtitle" data-testid="itemdex-category">
                {titleCase(item.category)}
              </p>
              {item.sprite && (
                <img
                  className="item-sprite"
                  src={item.sprite}
                  alt={item.display_name}
                  data-testid="itemdex-sprite"
                  width={48}
                  height={48}
                />
              )}
            </DexCard>

            <DexCard testId="itemdex-card-effect" title="Effect">
              {item.short_effect && (
                <p data-testid="itemdex-short-effect">
                  <strong>{item.short_effect}</strong>
                </p>
              )}
              <p data-testid="itemdex-effect">{item.effect ?? 'No effect text in the bundle.'}</p>
            </DexCard>

            <DexCard testId="itemdex-card-facts" title="Details">
              <DexFacts
                facts={[
                  [
                    'price',
                    priced == null ? (
                      <span data-testid="itemdex-price">Not sold</span>
                    ) : (
                      <span data-testid="itemdex-price">
                        {priced.price.purchase_price != null
                          ? `${priced.price.purchase_price.toLocaleString()} ${titleCase(
                              priced.price.currency,
                            )}`
                          : 'Not sold'}
                        {priced.from && <span className="subtitle"> (from {priced.from})</span>}
                      </span>
                    ),
                  ],
                  [
                    'sell price',
                    priced?.price.sell_price != null
                      ? priced.price.sell_price.toLocaleString()
                      : '—',
                  ],
                  ['fling power', item.fling_power ?? '—'],
                  ['fling effect', titleCase(item.fling_effect)],
                  [
                    'generations',
                    <span data-testid="itemdex-generations">
                      {item.generation_ids.filter((g) => g <= 4).join(', ') || '—'}
                    </span>,
                  ],
                  ['attributes', item.attributes.filter((a) => a).join(', ') || '—'],
                ]}
              />
            </DexCard>
          </>
        )
      }}
    />
  )
}
