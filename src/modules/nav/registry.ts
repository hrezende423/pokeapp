import type { ComponentType } from 'react'
import { Pokedex } from '../pokedex/Pokedex'
import { Abilitydex } from '../dex/Abilitydex'
import { Berrydex } from '../dex/Berrydex'
import { Itemdex } from '../dex/Itemdex'
import { Movedex } from '../dex/Movedex'
import { Naturedex } from '../dex/Naturedex'

export interface DexModule {
  /** Stable slug: the switcher's test id and the active-module key. */
  id: string
  label: string
  Component: ComponentType
}

/**
 * Every registered dex, in the order the switcher shows them.
 *
 * This array is the whole registration mechanism. Adding a sixth dex means
 * appending one entry here -- the switcher renders from this list and the shell
 * looks the active module up in it, so neither has to be touched again. Nothing
 * else in the app hardcodes a module name.
 */
export const DEX_MODULES: readonly DexModule[] = [
  { id: 'pokedex', label: 'Pokédex', Component: Pokedex },
  { id: 'itemdex', label: 'Itemdex', Component: Itemdex },
  { id: 'movedex', label: 'Movedex', Component: Movedex },
  { id: 'abilitydex', label: 'Abilitydex', Component: Abilitydex },
  { id: 'naturedex', label: 'Naturedex', Component: Naturedex },
  { id: 'berrydex', label: 'Berrydex', Component: Berrydex },
] as const

export const DEFAULT_MODULE_ID = DEX_MODULES[0].id

export function findModule(id: string): DexModule {
  return DEX_MODULES.find((m) => m.id === id) ?? DEX_MODULES[0]
}
