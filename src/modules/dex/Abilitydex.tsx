import { useMemo } from 'react'
import { ABILITIES_INTRODUCED_IN_GENERATION, speciesWithAbility } from '../../data'
import type { Ability } from '../../data'
import { useDexSelection, useNav } from '../nav/navContext'
import { useVersionGroup } from '../version-group/context'
import { DexPageShell, LedgerList } from './DexPageShell'
import { EntityDetailPage } from './EntityDetailPage'
import { abilitiesHiddenFromList, abilityEntries } from './entrySources'

/**
 * REGULAR / HIDDEN GROUPING: measured, and deliberately not applied.
 *
 * The question was whether the species grid should split into "Regular" and
 * "Hidden" sections the way the Movedex splits by learn method. Running the
 * app's own era resolver across the whole bundle:
 *
 *   gen 1: 0 regular, 0 hidden      (abilities did not exist)
 *   gen 2: 0 regular, 0 hidden
 *   gen 3: 621 regular, 12 hidden   (12 species)
 *   gen 4: 768 regular, 17 hidden   (17 species)
 *
 * Hidden abilities were introduced in Generation 5, so the true answer inside
 * this app's Gen 1-4 scope is zero. Those 12-17 are PokeAPI artifacts: slot-3
 * entries whose `past_abilities` never recorded the slot as empty for the earlier
 * generation (Koffing/Weezing "Stench", Zapdos "Lightning Rod", the Cyndaquil
 * line's "Flash Fire"). 427 other species DO record slot 3 as empty, which is why
 * the residue is small rather than ~446.
 *
 * A two-section grid would therefore present a data gap as a game mechanic, and
 * the Hidden section would be a list of 17 bugs. One flat grid, as the handoff's
 * own fallback instructs. The residue is worth a separate look -- it also reaches
 * the species detail page -- and is flagged rather than patched here.
 */
export function Abilitydex() {
  const { generation, isAll } = useVersionGroup()
  const [, selectSpecies] = useDexSelection('pokedex')
  const nav = useNav()

  // The dex lists only abilities with a Generation 1-4 presence: 123 of the 161
  // in the bundle. The other 38 (Gens 5/6/8/9) are retained in the data purely so
  // species ability references never dangle -- Gengar's modern Cursed Body, for
  // instance. The clamp lives in entrySources.ts, where the global search reads it
  // too: the list and a search over it were once scoped differently, which is the
  // leak that has to stay impossible.
  //
  // THE CLAMP IS DISCLOSED AGAIN, as a caption at the end of the list rather than
  // the header paragraph that used to carry it. Same fact, a tenth the furniture:
  // a reader who scrolls to the bottom of 123 abilities and wonders where the rest
  // went gets an answer exactly where the question occurs to them.
  //
  // The count is READ, not written: abilitiesHiddenFromList() is the same function
  // the clamp itself uses, so the caption cannot drift from the list it describes.
  // A literal "38" would have been silently wrong the first time the bundle gained
  // a generation.
  const entries = useMemo(() => abilityEntries({ generation, isAll }), [generation, isAll])
  const hiddenCount = useMemo(() => abilitiesHiddenFromList().length, [])
  const preAbilityEra = !isAll && generation < ABILITIES_INTRODUCED_IN_GENERATION

  return (
    <DexPageShell
      dexId="abilitydex"
      entries={entries}
      entryId={(ability) => ability.id}
      searchText={(ability) => ability.display_name}
      searchLabel="Search/filter abilities"
      gatedMessage={
        preAbilityEra
          ? `Abilities did not exist in Generation ${generation}. They were introduced in Generation ${ABILITIES_INTRODUCED_IN_GENERATION} — pick a Generation ${ABILITIES_INTRODUCED_IN_GENERATION}+ game to browse them.`
          : undefined
      }
      list={({ entries: visible, onSelect }) => (
        <>
          <LedgerList
            testId="abilitydex-rows"
            rows={visible.map((a) => ({
              id: a.id,
              label: a.display_name,
              meta: a.short_effect ?? undefined,
            }))}
            onSelect={onSelect}
            emptyNote="No ability matches that search."
          />
          {hiddenCount > 0 && (
            <p className="list-caption" data-testid="abilitydex-clamp-caption">
              <span className="num">{hiddenCount}</span> later-generation abilities are kept for
              species references but not listed here.
            </p>
          )}
        </>
      )}
      detail={({ entry, onBack }) => (
        <AbilityDetail
          key={entry.id}
          ability={entry}
          generation={generation}
          onBack={onBack}
          onSelectSpecies={(id) => {
            selectSpecies(id)
            nav.setModule('pokedex')
          }}
        />
      )}
    />
  )
}

function AbilityDetail({
  ability,
  generation,
  onBack,
  onSelectSpecies,
}: {
  ability: Ability
  generation: number
  onBack: () => void
  onSelectSpecies: (id: number) => void
}) {
  // The same reverse lookup as before, and still generation-aware: a Gen 3
  // selection cannot list Leafeon among Chlorophyll's carriers.
  const holders = useMemo(
    () => speciesWithAbility(ability.id, generation),
    [ability.id, generation],
  )

  return (
    <EntityDetailPage
      testId="abilitydex-detail"
      entryId={ability.id}
      onBack={onBack}
      backLabel="All abilities"
      title={ability.display_name}
      titleTestId="abilitydex-name"
      meta={
        <>
          <span data-testid="abilitydex-intro">
            Introduced in Generation {ability.generation_id ?? '?'}
          </span>
          <span data-testid="abilitydex-holder-count">
            {' '}
            · {holders.length} species in Generation {generation}
          </span>
        </>
      }
      description={
        <span data-testid="abilitydex-effect">
          {ability.effect ?? ability.short_effect ?? 'No effect text in the bundle.'}
        </span>
      }
      // One flat, unlabelled grid -- see the note at the top of this file.
      sections={[{ entries: holders.map((h) => ({ species: h.species })) }]}
      generation={generation}
      onSelectSpecies={onSelectSpecies}
    >
      {holders.length === 0 && (
        <p className="subtitle" data-testid="abilitydex-holders-none">
          No species in Generation {generation} has this ability.
        </p>
      )}
    </EntityDetailPage>
  )
}
