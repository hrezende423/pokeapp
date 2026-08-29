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
 * This array is the whole registration mechanism. Adding another dex means
 * appending one entry here -- the switcher renders from this list and the shell
 * looks the active module up in it, so neither has to be touched again. Nothing
 * else in the app hardcodes a module name.
 *
 * Order is now load-bearing twice over: the FIRST entry is the nav's visible
 * trigger and destination, and the rest are the items in its dropdown, in this
 * order.
 *
 * The design-system reference page is deliberately NOT registered. It was an
 * implementation aid, not a destination, so it no longer has a nav tab; it is
 * still rendered by the real app -- real data layer, real token stylesheet, which
 * is the only way the reference stays honest -- but only when the URL asks for it
 * with ?ds=1. See App.tsx.
 */
export const DEX_MODULES = [
  { id: 'pokedex', label: 'Pokédex', Component: Pokedex },
  { id: 'itemdex', label: 'Itemdex', Component: Itemdex },
  { id: 'abilitydex', label: 'Abilitydex', Component: Abilitydex },
  { id: 'naturedex', label: 'Naturedex', Component: Naturedex },
  { id: 'berrydex', label: 'Berrydex', Component: Berrydex },
  { id: 'movedex', label: 'Movedex', Component: Movedex },
] as const satisfies readonly DexModule[]

/** Union of the registered ids, so a reference to an unregistered module fails to compile. */
export type DexModuleId = (typeof DEX_MODULES)[number]['id']

export const DEFAULT_MODULE_ID: DexModuleId = DEX_MODULES[0].id

/** One registered entry, with its id kept literal. */
export type RegisteredModule = (typeof DEX_MODULES)[number]

export function findModule(id: DexModuleId): RegisteredModule {
  return DEX_MODULES.find((m) => m.id === id) ?? DEX_MODULES[0]
}
