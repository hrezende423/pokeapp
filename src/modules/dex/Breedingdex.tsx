import { useMemo } from 'react'
import { listSpecies } from '../../data'
import type { EggGroup, Species } from '../../data'
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
 */

/** Members of an egg group in this generation, in national dex order. */
function membersOf(groupId: number, generationFilter: (id: number) => boolean): Species[] {
  return listSpecies().filter(
    (s) => (s.egg_group_ids ?? []).includes(groupId) && generationFilter(s.id),
  )
}

export function Breedingdex() {
  const { generation, isAll } = useVersionGroup()
  const [, selectSpecies] = useDexSelection('pokedex')
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
      note={
        isAll
          ? `${entries.length} egg groups across Generations 1-4`
          : `${entries.length} egg groups in Generation ${generation}`
      }
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
  onSelectSpecies,
}: {
  group: EggGroup
  generation: number
  members: Species[]
  onBack: () => void
  onSelectSpecies: (id: number) => void
}) {
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
          {members.length} species in Generation {generation}
        </span>
      }
      // No sub-grouping: egg groups have no sub-categories the way move learning
      // does, so this is the single-section case of the same template.
      sections={[{ entries: members.map((species) => ({ species })) }]}
      generation={generation}
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
