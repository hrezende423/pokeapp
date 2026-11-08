import { defineDocument } from '../../../store/documentStore'
import { DEFAULT_DOC, normalise, type CountersDoc } from './countersMath'

/**
 * The counters, on this device only (owner, 2026-11-08): `sync: false`, no account
 * mirror, no import of the old "contadores-v1" data.
 */
export const countersDocument = defineDocument<CountersDoc>({
  name: 'counters',
  key: 'pokeapp:counters:v1',
  version: 1,
  migrations: {},
  empty: DEFAULT_DOC,
  normalise,
  sync: false,
})
