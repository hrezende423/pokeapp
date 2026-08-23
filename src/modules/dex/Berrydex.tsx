import { useMemo } from 'react'
import { TypeBadge } from '../../components/TypeBadge'
import { berryExistsInGeneration, getItem, listBerries } from '../../data'
import type { Berry } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { DexCard, DexFacts, DexShell } from './DexShell'

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

export function Berrydex() {
  const { generation, isAll } = useVersionGroup()

  // Availability is derived from the linked item's generation table -- berries
  // have no generation field of their own. See data/availability.ts.
  const entries = useMemo(
    () =>
      isAll ? listBerries() : listBerries().filter((b) => berryExistsInGeneration(b, generation)),
    [generation, isAll],
  )

  const total = listBerries().length

  return (
    <DexShell
      dexId="berrydex"
      title="Berrydex"
      entries={entries}
      gatedMessage={`No berry in the bundle exists in Generation ${generation}. Berries arrived with Generation 2 and the modern berry system with Generation 3 — pick a later game to browse them.`}
      note={
        isAll
          ? `All ${total} berries — every one exists in at least one of Generations 1-4`
          : `${entries.length} of ${total} berries exist in Generation ${generation} (derived from each berry's item)`
      }
      row={(berry) => ({
        id: berry.id,
        label: berryName(berry),
        meta: titleCase(berry.firmness).toLowerCase(),
      })}
      detail={(berry) => {
        const item = berry.item_id != null ? getItem(berry.item_id) : undefined
        const flavors = berry.flavors.filter((f) => f.potency > 0)
        return (
          <>
            <DexCard testId="berrydex-card-head" title="Berry">
              <h2 data-testid="berrydex-name">{berryName(berry)}</h2>
              <p className="subtitle" data-testid="berrydex-firmness">
                {titleCase(berry.firmness)} firmness
              </p>
              {item?.short_effect && <p data-testid="berrydex-effect">{item.short_effect}</p>}
            </DexCard>

            <DexCard testId="berrydex-card-growth" title="Growth">
              <DexFacts
                facts={[
                  [
                    'growth time',
                    <span data-testid="berrydex-growth-time">
                      {berry.growth_time != null ? `${berry.growth_time} h / stage` : '—'}
                    </span>,
                  ],
                  ['max harvest', berry.max_harvest ?? '—'],
                  ['soil dryness', berry.soil_dryness ?? '—'],
                  ['size', berry.size != null ? `${berry.size} mm` : '—'],
                  ['smoothness', berry.smoothness ?? '—'],
                ]}
              />
            </DexCard>

            <DexCard testId="berrydex-card-natural-gift" title="Natural Gift">
              <ul className="stats">
                <li>
                  <span>power</span>
                  <strong data-testid="berrydex-ng-power">{berry.natural_gift_power ?? '—'}</strong>
                </li>
                <li>
                  <span>type</span>
                  <strong data-testid="berrydex-ng-type">
                    {berry.natural_gift_type_id != null ? (
                      <TypeBadge typeId={berry.natural_gift_type_id} small />
                    ) : (
                      '—'
                    )}
                  </strong>
                </li>
              </ul>
            </DexCard>

            <DexCard testId="berrydex-card-flavors" title="Flavours">
              {flavors.length === 0 ? (
                <p className="subtitle" data-testid="berrydex-flavors-none">
                  This berry has no flavour potency.
                </p>
              ) : (
                <ul className="stat-bars" data-testid="berrydex-flavors">
                  {flavors.map((f) => (
                    <li key={f.flavor ?? 'unknown'} data-flavor={f.flavor}>
                      <span className="stat-name">{titleCase(f.flavor)}</span>
                      <span className="stat-track">
                        <span
                          className="stat-fill"
                          style={{ width: `${Math.min(100, (f.potency / 40) * 100)}%` }}
                        />
                      </span>
                      <span className="stat-value">{f.potency}</span>
                    </li>
                  ))}
                </ul>
              )}
            </DexCard>
          </>
        )
      }}
    />
  )
}
