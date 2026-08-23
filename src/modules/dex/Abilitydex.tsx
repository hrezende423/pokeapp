import { useMemo } from 'react'
import {
  ABILITIES_INTRODUCED_IN_GENERATION,
  LATEST_GENERATION,
  abilityExistsInGeneration,
  listAbilities,
  speciesWithAbility,
} from '../../data'
import type { Ability } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { DexCard, DexFacts, DexShell } from './DexShell'

/** The reverse lookup, rendered as a dex-ordered list of carriers. */
function Holders({ ability, generation }: { ability: Ability; generation: number }) {
  const holders = useMemo(
    () => speciesWithAbility(ability.id, generation),
    [ability.id, generation],
  )

  if (holders.length === 0) {
    return (
      <p className="subtitle" data-testid="abilitydex-holders-none">
        No species in Generation {generation} has this ability.
      </p>
    )
  }

  return (
    <>
      <p className="subtitle" data-testid="abilitydex-holder-count">
        {holders.length} species in Generation {generation}
      </p>
      <ul className="holder-list" data-testid="abilitydex-holders">
        {holders.map((h) => (
          <li key={h.species.id} data-species-id={h.species.id}>
            <span className="dex-no">#{String(h.species.id).padStart(3, '0')}</span>{' '}
            <span className="holder-name">{h.species.display_name}</span>
            {h.is_hidden && <span className="subtitle"> (hidden)</span>}
            {h.forms.length > 0 && <span className="subtitle"> · {h.forms.join(', ')}</span>}
          </li>
        ))}
      </ul>
    </>
  )
}

export function Abilitydex() {
  const { generation, isAll } = useVersionGroup()

  // Same "doesn't exist yet" rule as the species detail view: under a Gen 1-2
  // selection this resolves to an empty list, not a full one.
  const entries = useMemo(
    () =>
      isAll
        ? listAbilities()
        : listAbilities().filter((a) => abilityExistsInGeneration(a, generation)),
    [generation, isAll],
  )

  const total = listAbilities().length
  // Abilities are the one entity where "All" really does show out-of-era rows:
  // 38 of the 161 were introduced in Gen 5-9 and are kept only so species
  // ability references never dangle. Counted, not hardcoded.
  const outOfScope = useMemo(
    () => listAbilities().filter((ab) => !abilityExistsInGeneration(ab, LATEST_GENERATION)).length,
    [],
  )
  const preAbilityEra = !isAll && generation < ABILITIES_INTRODUCED_IN_GENERATION

  return (
    <DexShell
      dexId="abilitydex"
      title="Abilitydex"
      entries={entries}
      gatedMessage={
        preAbilityEra
          ? `Abilities did not exist in Generation ${generation}. They were introduced in Generation ${ABILITIES_INTRODUCED_IN_GENERATION} — pick a Generation ${ABILITIES_INTRODUCED_IN_GENERATION}+ game to browse them.`
          : undefined
      }
      note={
        isAll
          ? `All ${total} abilities, including ${outOfScope} introduced after Generation ${LATEST_GENERATION} and kept only so species references resolve`
          : preAbilityEra
            ? `Abilities did not exist in Generation ${generation}`
            : `${entries.length} of ${total} abilities exist in Generation ${generation}`
      }
      row={(ability) => ({ id: ability.id, label: ability.display_name })}
      detail={(ability) => (
        <>
          <DexCard testId="abilitydex-card-head" title="Ability">
            <h2 data-testid="abilitydex-name">{ability.display_name}</h2>
            <p className="subtitle" data-testid="abilitydex-intro">
              Introduced in Generation {ability.generation_id ?? '?'}
            </p>
          </DexCard>

          <DexCard testId="abilitydex-card-effect" title="Effect">
            {ability.short_effect && (
              <p data-testid="abilitydex-short-effect">
                <strong>{ability.short_effect}</strong>
              </p>
            )}
            <p data-testid="abilitydex-effect">
              {ability.effect ?? 'No effect text in the bundle.'}
            </p>
          </DexCard>

          <DexCard testId="abilitydex-card-facts" title="Details">
            <DexFacts
              facts={[
                ['generation', ability.generation_id ?? '—'],
                ['main series', ability.is_main_series ? 'yes' : 'no'],
              ]}
            />
          </DexCard>

          <DexCard testId="abilitydex-card-holders" title="Species with this ability">
            <Holders ability={ability} generation={generation} />
          </DexCard>
        </>
      )}
    />
  )
}
