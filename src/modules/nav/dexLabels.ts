/**
 * Each dex's display name, on its own so the dex pages can title themselves
 * without importing the registry -- which imports every dex page, and would
 * make each of them import itself back.
 */
export const DEX_LABELS = {
  pokedex: 'Pokédex',
  itemdex: 'Itemdex',
  abilitydex: 'Abilitydex',
  naturedex: 'Naturedex',
  berrydex: 'Berrydex',
  movedex: 'Movedex',
  breedingdex: 'Breeding dex',
  trainerdex: 'Trainer Dex',
} as const
