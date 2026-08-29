/**
 * Destinations that exist as nav entries but have no feature behind them yet.
 *
 * Kept in its own module, importing nothing, so both the nav config and the
 * placeholder component can read it without a cycle between them.
 *
 * Removing an entry here is how a stub graduates: point the nav config at the
 * real component instead and delete the line.
 */
export const STUB_PAGES = [
  { id: 'new-team', label: 'New Team' },
  { id: 'new-build', label: 'New Build' },
  { id: 'team-library', label: 'Team Library' },
  { id: 'build-library', label: 'Build Library' },
  { id: 'pokemon-collection', label: 'Pokemon Collection' },
  { id: 'compare-pokemon', label: 'Compare Pokemon' },
  { id: 'battle-simulator', label: 'Battle Simulator' },
  { id: 'training-optimization', label: 'Training and Optimization' },
  { id: 'breeding-planner', label: 'Breeding Planner' },
  { id: 'calculators', label: 'Calculators' },
] as const

export type StubPageId = (typeof STUB_PAGES)[number]['id']

export function findStub(id: string): { id: StubPageId; label: string } | undefined {
  return STUB_PAGES.find((p) => p.id === id)
}
