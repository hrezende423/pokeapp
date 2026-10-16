/**
 * The Collection's nav registration: one page, listed in the Team Building tab
 * (owner, 2026-10-15) beside the Team and Build Libraries, since its entries
 * point at builds. Lazy, like the tool pages.
 */

import { createElement, lazy, Suspense, type ComponentType } from 'react'

export const COLLECTION_PAGES = [{ id: 'collection', label: 'Collection' }] as const

export type CollectionPageId = (typeof COLLECTION_PAGES)[number]['id']

const Page = lazy(() => import('./CollectionPage').then((m) => ({ default: m.CollectionPage })))

function CollectionLazy() {
  return createElement(
    Suspense,
    { fallback: createElement('p', null, 'Loading…') },
    createElement(Page),
  )
}

export function findCollectionPage(
  id: string,
): { id: CollectionPageId; label: string; Component: ComponentType } | undefined {
  const page = COLLECTION_PAGES.find((p) => p.id === id)
  return page ? { id: page.id, label: page.label, Component: CollectionLazy } : undefined
}
