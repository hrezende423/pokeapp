import type { ComponentType } from 'react'
import { Pokedex } from '../pokedex/Pokedex'
import { DesignSystemPage } from '../design-system/DesignSystemPage'
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
export const DEX_MODULES = [
  { id: 'pokedex', label: 'Pokédex', Component: Pokedex },
  { id: 'itemdex', label: 'Itemdex', Component: Itemdex },
  { id: 'movedex', label: 'Movedex', Component: Movedex },
  { id: 'abilitydex', label: 'Abilitydex', Component: Abilitydex },
  { id: 'naturedex', label: 'Naturedex', Component: Naturedex },
  { id: 'berrydex', label: 'Berrydex', Component: Berrydex },
  // A live reference for the design-system components, not a product screen. It
  // is registered rather than kept in a scratch file so the components are
  // rendered by the real app, with the real data layer and the real token
  // stylesheet, which is the only way the reference stays honest.
  { id: 'designsystem', label: 'Design system', Component: DesignSystemPage },
] as const satisfies readonly DexModule[]

/** Union of the registered ids, so a reference to an unregistered module fails to compile. */
export type DexModuleId = (typeof DEX_MODULES)[number]['id']

export const DEFAULT_MODULE_ID: DexModuleId = DEX_MODULES[0].id

/** One registered entry, with its id kept literal. */
export type RegisteredModule = (typeof DEX_MODULES)[number]

export function findModule(id: DexModuleId): RegisteredModule {
  return DEX_MODULES.find((m) => m.id === id) ?? DEX_MODULES[0]
}
