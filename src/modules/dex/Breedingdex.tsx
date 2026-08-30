import { useCallback, useMemo } from 'react'
import { getEggGroup, listSpecies } from '../../data'
import type { EggGroup, Species } from '../../data'
import type { SpeciesCardFooter } from '../../components/speciesCardFooters'
import { useDexSelection, useNav } from '../nav/navContext'
import { useVersionGroup } from '../version-group/context'
import { DexPageShell, LedgerList } from './DexPageShell'
import { EntityDetailPage } from './EntityDetailPage'
import { BREEDING_INTRODUCED_IN_GENERATION, eggGroupEntries, speciesEntries } from './entrySources'

/**
 * Egg groups, as a dex.
 *
 * Same two components as the Abilitydex: the ledger list, then the shared detail
 * page with a species grid. The only real work here is the membership join, which
 * is Species.egg_group_ids read the other way round.
 *
 * Generation-gated as one rule rather than per entry: breeding arrived whole in
 * Generation 2 and no egg group has been added or removed inside Gen 1-4, so
 * there is no per-entry signal to consult.
 *
 * THE CARDS SHOW EGG GROUPS, NOT ABILITIES. On every other page the shared card's
 * bottom line is the species' abilities; here it is the species' egg groups,
 * because on a page about one egg group the useful thing to know about Bulbasaur
 * is that it is also in Grass. Each is a control that opens that group, so the
 * page cross-navigates: Monster -> Bulbasaur's card -> Grass. That is the
 * `footer` prop on SpeciesCardGrid, not a second card component.
 */

/** Members of an egg group in this generation, in national dex order. */
function membersOf(groupId: number, generationFilter: (id: number) => boolean): Species[] {
  return listSpecies().filter(
    (s) => (s.egg_group_ids ?? []).includes(groupId) && generationFilter(s.id),
  )
}

/**
 * Egg groups for one species, middot-separated, each opening that group.
 *
 * Built per render from the currently-open group's selector rather than being a
 * module constant, because it has to close over "what happens when you click
 * Grass" -- which is this dex's own selection setter.
 */
function eggGroupsFooter(onSelectGroup: (id: number) => void): SpeciesCardFooter {
  return (species) => {
    const ids = species.egg_group_ids ?? []
    if (ids.length === 0) return null
    return (
      <span
        className="species-card-egg-groups"
        data-testid={`species-card-egg-groups-${species.id}`}
      >
        {ids.map((id, i) => {
          const group = getEggGroup(id)
          return (
            <span key={id}>
              {i > 0 && <span className="species-card-egg-sep">·</span>}
              <button
                type="button"
                className="species-card-egg-group"
                data-testid={`species-card-egg-group-${species.id}-${id}`}
                data-egg-group-id={id}
                onClick={() => onSelectGroup(id)}
              >
                {group?.display_name ?? String(id)}
              </button>
            </span>
          )
        })}
      </span>
    )
  }
}

export function Breedingdex() {
  const { generation, isAll } = useVersionGroup()
  const [, selectSpecies] = useDexSelection('pokedex')
  const [, selectGroup] = useDexSelection('breedingdex')
  const nav = useNav()

  const entries = useMemo(() => eggGroupEntries({ generation, isAll }), [generation, isAll])

  // Species scope follows the same rule the Pokedex list uses, so a Gen 2
  // selection cannot list a Gen 4 species among a group's members.
  const inGeneration = useMemo(() => {
    const scoped = new Set(
      // speciesEntries is the one source for "which species does this era have";
      // reading it here rather than re-deriving keeps the two in agreement.
      speciesEntries({ generation, isAll }).map((s) => s.id),
    )
    return (id: number) => scoped.has(id)
  }, [generation, isAll])

  const counts = useMemo(() => {
    const map = new Map<number, number>()
    for (const group of entries) map.set(group.id, membersOf(group.id, inGeneration).length)
    return map
  }, [entries, inGeneration])

  return (
    <DexPageShell
      dexId="breedingdex"
      entries={entries}
      entryId={(group) => group.id}
      searchText={(group) => group.display_name}
      searchLabel="Search/filter egg groups"
      gatedMessage={
        entries.length === 0
          ? `Breeding did not exist in Generation ${generation}. Egg groups arrived in Generation ${BREEDING_INTRODUCED_IN_GENERATION} — pick a Generation ${BREEDING_INTRODUCED_IN_GENERATION}+ game to browse them.`
          : undefined
      }
      list={({ entries: visible, onSelect }) => (
        <LedgerList
          testId="breedingdex-rows"
          rows={visible.map((group) => ({
            id: group.id,
            label: group.display_name,
            // Right-aligned count in --font-numeric, the same convention every
            // other count-metadata cell in the app uses.
            meta: (
              <span className="row-count" data-testid={`breedingdex-members-${group.id}`}>
                {counts.get(group.id) ?? 0}
              </span>
            ),
          }))}
          onSelect={onSelect}
          emptyNote="No egg group matches that search."
        />
      )}
      detail={({ entry, onBack }) => (
        <EggGroupDetail
          key={entry.id}
          group={entry}
          generation={generation}
          members={membersOf(entry.id, inGeneration)}
          onBack={onBack}
          onSelectGroup={selectGroup}
          onSelectSpecies={(id) => {
            selectSpecies(id)
            nav.setModule('pokedex')
          }}
        />
      )}
    />
  )
}

function EggGroupDetail({
  group,
  generation,
  members,
  onBack,
  onSelectGroup,
  onSelectSpecies,
}: {
  group: EggGroup
  generation: number
  members: Species[]
  onBack: () => void
  onSelectGroup: (id: number) => void
  onSelectSpecies: (id: number) => void
}) {
  // Memoised so the 63 cards in Monster are not each handed a new footer
  // function on every render of the page.
  const footer = useCallback(() => eggGroupsFooter(onSelectGroup), [onSelectGroup])()
  return (
    <EntityDetailPage
      testId="breedingdex-detail"
      entryId={group.id}
      onBack={onBack}
      backLabel="All egg groups"
      title={group.display_name}
      titleTestId="breedingdex-name"
      meta={
        <span data-testid="breedingdex-member-count">
          <span className="num">{members.length}</span> species in Generation{' '}
          <span className="num">{generation}</span>
        </span>
      }
      // No sub-grouping: egg groups have no sub-categories the way move learning
      // does, so this is the single-section case of the same template.
      sections={[{ entries: members.map((species) => ({ species })) }]}
      generation={generation}
      footer={footer}
      onSelectSpecies={onSelectSpecies}
    >
      {members.length === 0 && (
        <p className="subtitle" data-testid="breedingdex-members-none">
          No species in Generation {generation} belongs to this egg group.
        </p>
      )}
    </EntityDetailPage>
  )
}
