/**
 * The matchup's persistence: one localStorage document read through
 * `useSyncExternalStore` -- the Team Builder store's arrangement (see
 * team-builder/store.ts for why an external store), at its own key.
 *
 * A corrupt or absent document reads as empty rather than throwing. Writes are
 * best-effort: a full quota or a private window keeps the session working
 * without persisting it.
 */

import { useSyncExternalStore } from 'react'
import { emptyMatchField } from '../battle/damage'
import { DEFAULT_FORMAT } from '../battle/format'
import {
  EMPTY_DOC,
  EMPTY_LINKS,
  emptySetup,
  type MatchupDoc,
  type MatchupSetup,
  type Scenario,
} from './model'

const KEY = 'pokeapp:team-matchup:v1'

let cache: MatchupDoc | null = null
const listeners = new Set<() => void>()

function normaliseSetup(raw: Partial<MatchupSetup> | undefined): MatchupSetup {
  const base = emptySetup()
  if (!raw || typeof raw !== 'object') return base
  return {
    ...base,
    ...raw,
    mine: raw.mine ?? {},
    theirs: raw.theirs ?? {},
    custom: Array.isArray(raw.custom) ? raw.custom : [],
    format: { ...DEFAULT_FORMAT, ...(raw.format ?? {}) },
    field: raw.field?.sides ? raw.field : emptyMatchField(),
    badges: Array.isArray(raw.badges) ? raw.badges : [],
  }
}

export function normalise(raw: unknown): MatchupDoc {
  if (!raw || typeof raw !== 'object') return EMPTY_DOC
  const doc = raw as Partial<MatchupDoc>
  const setups: Record<string, MatchupSetup> = {}
  for (const [vg, s] of Object.entries(doc.setups ?? {})) setups[vg] = normaliseSetup(s)
  const scenarios = (Array.isArray(doc.scenarios) ? doc.scenarios : []).map((s) => ({
    ...s,
    setup: normaliseSetup(s.setup),
    links: { ...EMPTY_LINKS, ...(s.links ?? {}) },
    notes: s.notes ?? '',
  }))
  return { setups, scenarios, nextScenarioSeq: doc.nextScenarioSeq ?? scenarios.length + 1 }
}

export function readDoc(): MatchupDoc {
  if (cache) return cache
  try {
    cache = normalise(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    cache = EMPTY_DOC
  }
  return cache
}

function write(next: MatchupDoc) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* quota or a private window: the session still works, it just will not persist */
  }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useMatchupDoc(): MatchupDoc {
  return useSyncExternalStore(subscribe, readDoc, () => EMPTY_DOC)
}

export function setupFor(doc: MatchupDoc, vg: string): MatchupSetup {
  return doc.setups[vg] ?? emptySetup()
}

export function updateSetup(vg: string, fn: (s: MatchupSetup) => MatchupSetup) {
  const doc = readDoc()
  write({ ...doc, setups: { ...doc.setups, [vg]: fn(setupFor(doc, vg)) } })
}

/* --------------------------------------------------------------- scenarios */

export function saveScenario(
  vg: string,
  name: string,
  setup: MatchupSetup,
  existingId?: string | null,
): Scenario {
  const doc = readDoc()
  const now = new Date().toISOString()
  const prev = existingId ? doc.scenarios.find((s) => s.id === existingId) : undefined
  const id = prev?.id ?? `sc-${doc.nextScenarioSeq}-${Date.now().toString(36)}`
  const scenario: Scenario = {
    id,
    name: name.trim() || `Scenario ${doc.nextScenarioSeq}`,
    versionGroup: vg,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    setup: { ...setup, scenarioId: id },
    notes: prev?.notes ?? '',
    links: prev?.links ?? { ...EMPTY_LINKS },
  }
  const scenarios = prev
    ? doc.scenarios.map((s) => (s.id === id ? scenario : s))
    : [...doc.scenarios, scenario]
  write({
    ...doc,
    scenarios,
    nextScenarioSeq: prev ? doc.nextScenarioSeq : doc.nextScenarioSeq + 1,
    setups: { ...doc.setups, [vg]: { ...setup, scenarioId: id } },
  })
  return scenario
}

export function updateScenario(
  id: string,
  patch: Partial<Pick<Scenario, 'name' | 'notes' | 'links'>>,
) {
  const doc = readDoc()
  write({
    ...doc,
    scenarios: doc.scenarios.map((s) =>
      s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s,
    ),
  })
}

export function deleteScenario(id: string) {
  const doc = readDoc()
  const setups = Object.fromEntries(
    Object.entries(doc.setups).map(([vg, s]) => [
      vg,
      s.scenarioId === id ? { ...s, scenarioId: null } : s,
    ]),
  )
  write({ ...doc, scenarios: doc.scenarios.filter((s) => s.id !== id), setups })
}

export function loadScenario(s: Scenario) {
  updateSetup(s.versionGroup, () => ({ ...s.setup, scenarioId: s.id }))
}

/** Test seam. */
export function __resetMatchupStore() {
  cache = null
}
