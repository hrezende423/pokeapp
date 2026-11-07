import { useMemo, useState, type ReactNode } from 'react'
import { FormSectionLabel } from '../../components/ds/FormParts'
import { SearchSelect, type SearchOption } from '../../components/ds/SearchSelect'
import { SelectField } from '../../components/ds/SelectField'
import { TextField } from '../../components/ds/TextField'
import { getMove, getSpecies, type Species } from '../../data'
import { useDexQueryBundle } from '../dex/query/dexQueryContext'
import { speciesEntries } from '../dex/entrySources'
import { useNav } from '../nav/navContext'
import {
  abilityOptionsFor,
  buildGender,
  genderOptionsFor,
  itemOptionsFor,
  natureOptionsFor,
  buildLabel as teamBuildLabel,
} from '../team-builder/buildFacts'
import {
  ACQUIRE_METHODS,
  MOVE_SLOTS,
  clearMoveSlot,
  orderedBuilds,
  otLanguagesFor,
  setMoveSlot,
  type AcquireMethod,
  type CollectionEntry,
  type Gender,
  type Pokerus,
} from '../team-builder/model'
import { isShinyByDvs, type StatKey } from '../team-builder/statMath'
import { createEntry, deleteEntry, updateEntry, useTeamBuilderData } from '../team-builder/store'
import { useLegalMoveset } from '../team-builder/useLegalMoveset'
import { ToolInputs, ToolResult, ToolShell } from '../tools/ToolShell'
import { gameLabel, gamesInGeneration } from '../version-group/games'
import { candidateText } from './candidates'
import { setRemainingEntry } from './collectionHandoff'
import {
  EFFORT_LABEL,
  checkEntry,
  effortCap,
  effortKeysFor,
  effortSummary,
  individualCap,
  individualKeysFor,
  type EntryDraft,
} from './collectionMath'
import { POKERUS_OPTIONS, collectionRows, type CollectionRow } from './collectionQuery'
import {
  collectionFields,
  entryToBuild,
  migrateEntry,
  type CollectionField,
} from './collectionSchema'
import './collection.css'

/**
 * The Collection: the Pokemon you own, as they stand now. v1 (owner, 2026-10-15)
 * was species, level, nature and current EVs, pointed at the Build being trained
 * toward, so #9 could say what is still to train. v2 (docs/SPEC.md slice C,
 * mockup public/mockups/collection-v2.html) records what the player knows about
 * it, so the Damage calculator and Team Matchup can use it as a Pokemon.
 *
 * THE FORM SHOWS EXACTLY THE GENERATION'S ROW of the field table
 * (`collectionFields`): a field the era lacks is absent, never disabled. Gen 2's
 * gender and shininess are DERIVED from the DVs, so they show read-only.
 *
 * Saved inside the Team Builder document, so it syncs with teams and builds when
 * signed in. Lists the app generation's entries; search, filters and sorts open
 * from the app bar (collectionQuery.ts).
 */
export function CollectionPage() {
  return (
    <ToolShell toolKey="collection" title="Collection" gate={{ gens: [1, 2, 3, 4] }}>
      {({ generation }) => <CollectionBody key={generation} generation={generation} />}
    </ToolShell>
  )
}

const defaultVarietyOf = (species: Species | undefined) =>
  species?.varieties.find((v) => v.is_default) ?? species?.varieties[0]

/** A new entry's species-dependent defaults: only what the species leaves no choice about. */
function speciesDefaults(speciesId: number | null, generation: number) {
  const species = speciesId != null ? getSpecies(speciesId) : undefined
  const variety = defaultVarietyOf(species)
  const genders = species ? genderOptionsFor(species) : null
  const abilities = variety && generation >= 3 ? abilityOptionsFor(variety, generation) : []
  return {
    gender: genders?.length === 1 ? genders[0] : null,
    abilityId: abilities.length === 1 ? abilities[0].value : null,
  }
}

const emptyDraft = (speciesId: number | null, generation: number): EntryDraft => ({
  speciesId,
  nickname: '',
  level: '50',
  natureId: null,
  effort: {},
  buildId: null,
  pokemonId: null,
  game: null,
  shiny: false,
  itemId: null,
  individual: {},
  moveIds: [null, null, null, null],
  metLocation: '',
  metLevel: '',
  metDate: '',
  otName: '',
  otId: '',
  otLanguage: null,
  acquiredDate: '',
  acquiredMethod: null,
  pokerus: 'none',
  ...speciesDefaults(speciesId, generation),
})

const asText = (numbers: Partial<Record<StatKey, number>>) =>
  Object.fromEntries(Object.entries(numbers).map(([k, v]) => [k, v == null ? '' : String(v)]))

function draftOf(c: CollectionEntry): EntryDraft {
  return {
    speciesId: c.speciesId,
    nickname: c.nickname,
    level: String(c.level),
    natureId: c.natureId,
    effort: asText(c.effort),
    buildId: c.buildId,
    pokemonId: c.pokemonId,
    game: c.game,
    gender: c.gender,
    shiny: c.shiny,
    abilityId: c.abilityId,
    itemId: c.itemId,
    individual: asText(c.individual),
    moveIds: [...c.moveIds],
    metLocation: c.met.location,
    metLevel: c.met.level == null ? '' : String(c.met.level),
    metDate: c.met.date ?? '',
    otName: c.ot.name,
    otId: c.ot.id,
    otLanguage: c.ot.language,
    acquiredDate: c.acquired.date ?? '',
    acquiredMethod: c.acquired.method,
    pokerus: c.pokerus,
  }
}

const GENDER_LABEL: Record<Gender, string> = { male: 'Male', female: 'Female' }

const numberOrNull = (v: string): number | null => (v === '' ? null : Number(v))

/** One field of the form, carrying the name the field table knows it by. */
function Field({ name, children }: { name: CollectionField; children: ReactNode }) {
  return (
    <div className="col-field" data-field={name}>
      {children}
    </div>
  )
}

function Region({
  area,
  title,
  children,
}: {
  area: 'identity' | 'spread' | 'moves' | 'origin' | 'record'
  title: string
  children: ReactNode
}) {
  return (
    <section className={`col-region col-region-${area}`} data-layout={`col-${area}`}>
      <FormSectionLabel>{title}</FormSectionLabel>
      {children}
    </section>
  )
}

function CollectionBody({ generation }: { generation: number }) {
  const { setModule } = useNav()
  const data = useTeamBuilderData()
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])
  const builds = orderedBuilds(data).filter((b) => b.generation === generation)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<EntryDraft>(() =>
    emptyDraft(species[0]?.id ?? null, generation),
  )
  const check = checkEntry(generation, draft)
  const cap = effortCap(generation)
  const fields = collectionFields(generation, draft.game ?? null)
  const has = (f: CollectionField) => fields[f] != null

  /*
    WHAT THE APP BAR'S SEARCH/FILTER AND SORT LEAVE ON SCREEN (collectionQuery.ts).
    Read softly, as the Build Library does: if the bar's query is momentarily for
    another list, every entry of the generation is shown rather than throwing.
  */
  const bundle = useDexQueryBundle()
  const allRows = useMemo(() => collectionRows(data, generation), [data, generation])
  const rows: CollectionRow[] =
    bundle.dexId === 'collection' ? (bundle.query.visible as CollectionRow[]) : allRows

  const draftSpecies = draft.speciesId != null ? getSpecies(draft.speciesId) : undefined
  const variety =
    draftSpecies?.varieties.find((v) => v.pokemon_id === draft.pokemonId) ??
    defaultVarietyOf(draftSpecies)
  const moveset = useLegalMoveset({
    speciesId: draft.speciesId ?? 1,
    pokemonId: variety?.pokemon_id ?? draft.speciesId ?? 1,
    level: check.ok ? check.level : 100,
    generation,
  })
  const moveIds = useMemo(() => draft.moveIds ?? [null, null, null, null], [draft.moveIds])
  const moveOptions = useMemo<SearchOption[]>(() => {
    const legal = moveset.moves.map((m) => ({ value: String(m.move_id), label: m.name }))
    // A stored move the legal list does not offer still reads as itself.
    const extra = moveIds
      .filter((id): id is number => id != null && !legal.some((o) => o.value === String(id)))
      .map((id) => ({ value: String(id), label: getMove(id)?.display_name ?? `#${id}` }))
    return [{ value: '', label: '—' }, ...legal, ...extra]
  }, [moveset.moves, moveIds])

  const set = (patch: Partial<EntryDraft>) => setDraft((d) => ({ ...d, ...patch }))

  const edit = (c: CollectionEntry) => {
    setEditing(c.id)
    setDraft(draftOf(c))
  }
  const reset = () => {
    setEditing(null)
    setDraft(emptyDraft(species[0]?.id ?? null, generation))
  }
  const save = () => {
    if (!check.ok || draft.speciesId == null) return
    const record = {
      generation,
      speciesId: draft.speciesId,
      nickname: draft.nickname.trim(),
      level: check.level,
      natureId: generation >= 3 ? draft.natureId : null,
      effort: check.effort,
      buildId: draft.buildId,
      pokemonId: draft.pokemonId ?? null,
      game: draft.game ?? null,
      gender: draft.gender ?? null,
      shiny: draft.shiny ?? false,
      abilityId: draft.abilityId ?? null,
      itemId: draft.itemId ?? null,
      individual: check.individual,
      moveIds,
      met: {
        location: (draft.metLocation ?? '').trim(),
        level: check.metLevel,
        date: draft.metDate || null,
      },
      ot: { name: (draft.otName ?? '').trim(), id: check.otId, language: draft.otLanguage ?? null },
      acquired: { date: draft.acquiredDate || null, method: draft.acquiredMethod ?? null },
      pokerus: draft.pokerus ?? 'none',
    }
    if (editing) updateEntry(editing, record)
    else createEntry(record)
    reset()
  }
  const buildLabel = (id: string | null) => {
    const b = id ? data.builds.find((x) => x.id === id) : undefined
    return b ? `${teamBuildLabel(b, getSpecies(b.speciesId))} (build)` : null
  }

  /* Gen 2's derived values, from the DVs as typed: the entry as a Build, read
     through the same functions a Build's card uses. */
  const derivedGender =
    draftSpecies && generation === 2
      ? buildGender(
          entryToBuild({
            ...emptyEntryFor(generation, draft.speciesId ?? 1),
            individual: check.ok ? check.individual : {},
          }),
          draftSpecies,
        )
      : null
  const genders = draftSpecies ? genderOptionsFor(draftSpecies) : null
  const genderOptions =
    genders == null
      ? [{ value: '', label: 'Genderless' }]
      : genders.length === 1
        ? genders.map((g) => ({ value: g, label: GENDER_LABEL[g] }))
        : [{ value: '', label: '—' }, ...genders.map((g) => ({ value: g, label: GENDER_LABEL[g] }))]
  const word = generation <= 2 ? 'DVs' : 'IVs'
  const games = gamesInGeneration(generation)

  return (
    <>
      <ToolInputs>
        <h2 className="calc-section-heading">{editing ? 'Edit entry' : 'Add a Pokémon'}</h2>
        <div className="col-form" data-layout="col-form" data-generation={generation}>
          <Region area="identity" title="Identity">
            <div className="ds-field-strip col-strip">
              <Field name="species">
                <SelectField
                  label="Pokémon"
                  options={species.map((s) => ({ value: String(s.id), label: s.display_name }))}
                  value={draft.speciesId != null ? String(draft.speciesId) : ''}
                  data-testid="col-species"
                  onChange={(e) => {
                    const id = Number(e.target.value)
                    set({
                      speciesId: id,
                      pokemonId: null,
                      moveIds: [null, null, null, null],
                      ...speciesDefaults(id, generation),
                    })
                  }}
                />
              </Field>
              <Field name="nickname">
                <TextField
                  label="Nickname"
                  value={draft.nickname}
                  maxLength={10}
                  data-testid="col-nickname"
                  onChange={(e) => set({ nickname: e.target.value })}
                />
              </Field>
              <Field name="level">
                <TextField
                  label="Level"
                  type="number"
                  value={draft.level}
                  data-testid="col-level"
                  onChange={(e) => set({ level: e.target.value })}
                />
              </Field>
              <Field name="game">
                <SelectField
                  label="Game"
                  options={[
                    { value: '', label: '—' },
                    ...games.map((g) => ({ value: g.name, label: gameLabel(g.name) })),
                  ]}
                  value={draft.game ?? ''}
                  data-testid="col-game"
                  onChange={(e) => set({ game: e.target.value || null })}
                />
              </Field>
              {has('gender') &&
                (fields.gender === 'derived' ? (
                  <Field name="gender">
                    <SelectField
                      label="Gender"
                      state="disabled"
                      options={[
                        {
                          value: 'derived',
                          label: derivedGender ? GENDER_LABEL[derivedGender] : 'Genderless',
                        },
                      ]}
                      value="derived"
                      data-testid="col-gender"
                      onChange={() => {}}
                    />
                  </Field>
                ) : (
                  <Field name="gender">
                    <SelectField
                      label="Gender"
                      options={genderOptions}
                      value={draft.gender ?? ''}
                      data-testid="col-gender"
                      onChange={(e) => set({ gender: (e.target.value || null) as Gender | null })}
                    />
                  </Field>
                ))}
              {has('shiny') && (
                <Field name="shiny">
                  {fields.shiny === 'derived' ? (
                    <SelectField
                      label="Shiny"
                      state="disabled"
                      options={[
                        {
                          value: 'derived',
                          label: check.ok && isShinyByDvs(check.individual) ? 'Yes' : 'No',
                        },
                      ]}
                      value="derived"
                      data-testid="col-shiny"
                      onChange={() => {}}
                    />
                  ) : (
                    <SelectField
                      label="Shiny"
                      options={[
                        { value: 'no', label: 'No' },
                        { value: 'yes', label: 'Yes' },
                      ]}
                      value={draft.shiny ? 'yes' : 'no'}
                      data-testid="col-shiny"
                      onChange={(e) => set({ shiny: e.target.value === 'yes' })}
                    />
                  )}
                </Field>
              )}
              {has('nature') && (
                <Field name="nature">
                  <SelectField
                    label="Nature"
                    options={[
                      { value: '', label: '—' },
                      ...natureOptionsFor(generation).map((o) => ({
                        value: String(o.value),
                        label: o.label,
                      })),
                    ]}
                    value={draft.natureId != null ? String(draft.natureId) : ''}
                    data-testid="col-nature"
                    onChange={(e) => set({ natureId: numberOrNull(e.target.value) })}
                  />
                </Field>
              )}
              {has('ability') && (
                <Field name="ability">
                  <SelectField
                    label="Ability"
                    options={[
                      { value: '', label: '—' },
                      ...(variety ? abilityOptionsFor(variety, generation) : []).map((o) => ({
                        value: String(o.value),
                        label: o.label,
                      })),
                    ]}
                    value={draft.abilityId != null ? String(draft.abilityId) : ''}
                    data-testid="col-ability"
                    onChange={(e) => set({ abilityId: numberOrNull(e.target.value) })}
                  />
                </Field>
              )}
              {has('item') && (
                <Field name="item">
                  <SelectField
                    label="Item"
                    options={[
                      { value: '', label: '—' },
                      ...itemOptionsFor(generation, draft.itemId ?? null).map((o) => ({
                        value: String(o.value),
                        label: o.label,
                      })),
                    ]}
                    value={draft.itemId != null ? String(draft.itemId) : ''}
                    data-testid="col-item"
                    onChange={(e) => set({ itemId: numberOrNull(e.target.value) })}
                  />
                </Field>
              )}
            </div>
          </Region>

          <Region area="spread" title="Spread">
            <Field name="individual">
              <span className="ds-field-label col-sub-label">
                {word} (0–{individualCap(generation)}, blank if unknown)
              </span>
              <div className="ds-field-strip col-strip">
                {individualKeysFor(generation).map((k) => (
                  <TextField
                    key={k}
                    label={EFFORT_LABEL[k]}
                    type="number"
                    fieldSize="narrow"
                    value={draft.individual?.[k] ?? ''}
                    data-testid={`col-iv-${k}`}
                    onChange={(e) =>
                      set({ individual: { ...draft.individual, [k]: e.target.value } })
                    }
                  />
                ))}
              </div>
            </Field>
            <Field name="effort">
              <span className="ds-field-label col-sub-label">
                Current {generation <= 2 ? 'Stat Exp' : 'EVs'} (0–{cap})
              </span>
              <div className="ds-field-strip col-strip">
                {effortKeysFor(generation).map((k) => (
                  <TextField
                    key={k}
                    label={EFFORT_LABEL[k]}
                    type="number"
                    value={draft.effort[k] ?? ''}
                    placeholder="0"
                    data-testid={`col-effort-${k}`}
                    onChange={(e) => set({ effort: { ...draft.effort, [k]: e.target.value } })}
                  />
                ))}
              </div>
            </Field>
          </Region>

          <Region area="moves" title="Moves">
            <Field name="moves">
              <div className="ds-field-strip col-strip">
                {Array.from({ length: MOVE_SLOTS }, (_, slot) => (
                  <SearchSelect
                    key={slot}
                    label={`Move ${slot + 1}`}
                    options={moveOptions}
                    value={moveIds[slot] != null ? String(moveIds[slot]) : ''}
                    testId={`col-move-${slot}`}
                    onChange={(v) =>
                      set({
                        moveIds: v
                          ? setMoveSlot(moveIds, slot, Number(v))
                          : clearMoveSlot(moveIds, slot),
                      })
                    }
                  />
                ))}
              </div>
            </Field>
            {moveset.failed.length > 0 && (
              <p className="tool-reason col-note" data-testid="col-moves-failed">
                Moves from {moveset.failed.map(gameLabel).join(', ')} could not be loaded, so they
                are missing from the lists.
              </p>
            )}
            {moveset.status === 'error' && (
              <p className="tool-reason col-note" data-testid="col-moves-failed">
                The moves could not be loaded: {moveset.message}
              </p>
            )}
          </Region>

          <Region area="origin" title="Origin">
            <div className="ds-field-strip col-strip">
              {has('metLocation') && (
                <Field name="metLocation">
                  <TextField
                    label="Met location"
                    value={draft.metLocation ?? ''}
                    data-testid="col-met-location"
                    onChange={(e) => set({ metLocation: e.target.value })}
                  />
                </Field>
              )}
              {has('metLevel') && (
                <Field name="metLevel">
                  <TextField
                    label="Met level"
                    type="number"
                    value={draft.metLevel ?? ''}
                    data-testid="col-met-level"
                    onChange={(e) => set({ metLevel: e.target.value })}
                  />
                </Field>
              )}
              {has('metDate') && (
                <Field name="metDate">
                  <TextField
                    label="Met date"
                    type="date"
                    value={draft.metDate ?? ''}
                    data-testid="col-met-date"
                    onChange={(e) => set({ metDate: e.target.value })}
                  />
                </Field>
              )}
              <Field name="otName">
                <TextField
                  label="OT name"
                  value={draft.otName ?? ''}
                  maxLength={7}
                  data-testid="col-ot-name"
                  onChange={(e) => set({ otName: e.target.value })}
                />
              </Field>
              <Field name="otId">
                <TextField
                  label="OT ID"
                  inputMode="numeric"
                  value={draft.otId ?? ''}
                  data-testid="col-ot-id"
                  onChange={(e) => set({ otId: e.target.value })}
                />
              </Field>
              {has('otLanguage') && (
                <Field name="otLanguage">
                  <SelectField
                    label="OT language"
                    options={[{ value: '', label: '—' }, ...otLanguagesFor(generation)]}
                    value={draft.otLanguage ?? ''}
                    data-testid="col-ot-language"
                    onChange={(e) => set({ otLanguage: e.target.value || null })}
                  />
                </Field>
              )}
            </div>
          </Region>

          <Region area="record" title="Record">
            <div className="ds-field-strip col-strip">
              <Field name="acquiredDate">
                <TextField
                  label="Acquired date"
                  type="date"
                  value={draft.acquiredDate ?? ''}
                  data-testid="col-acquired-date"
                  onChange={(e) => set({ acquiredDate: e.target.value })}
                />
              </Field>
              <Field name="acquiredMethod">
                <SelectField
                  label="Acquired method"
                  options={[
                    { value: '', label: '—' },
                    ...ACQUIRE_METHODS.map((m) => ({ value: m.value, label: m.label })),
                  ]}
                  value={draft.acquiredMethod ?? ''}
                  data-testid="col-acquired-method"
                  onChange={(e) =>
                    set({ acquiredMethod: (e.target.value || null) as AcquireMethod | null })
                  }
                />
              </Field>
              {has('pokerus') && (
                <Field name="pokerus">
                  <SelectField
                    label="Pokérus"
                    options={POKERUS_OPTIONS}
                    value={draft.pokerus ?? 'none'}
                    data-testid="col-pokerus"
                    onChange={(e) => set({ pokerus: e.target.value as Pokerus })}
                  />
                </Field>
              )}
              <Field name="build">
                <SelectField
                  label="Target build"
                  options={[
                    { value: '', label: 'No build' },
                    ...builds.map((b) => ({
                      value: b.id,
                      label: `${teamBuildLabel(b, getSpecies(b.speciesId))}${b.speciesId === draft.speciesId ? '' : ' (other species)'}`,
                    })),
                  ]}
                  value={draft.buildId ?? ''}
                  data-testid="col-build"
                  onChange={(e) => set({ buildId: e.target.value || null })}
                />
              </Field>
            </div>
          </Region>
        </div>
        <div className="calc-toggle-row">
          <button
            type="button"
            className="tools-link"
            data-testid="col-save"
            disabled={!check.ok}
            onClick={save}
          >
            {editing ? 'Save changes' : 'Add to Collection'}
          </button>
          {editing && (
            <>
              <button type="button" className="tools-link" data-testid="col-cancel" onClick={reset}>
                Cancel
              </button>
              <button
                type="button"
                className="tools-link"
                data-testid="col-delete"
                onClick={() => {
                  deleteEntry(editing)
                  reset()
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
        {!check.ok && (
          <p className="tool-reason" data-testid="col-reason">
            {check.reason}
          </p>
        )}
      </ToolInputs>

      <ToolResult
        reason={
          allRows.length === 0
            ? `No Gen ${generation} Pokémon in your Collection yet.`
            : rows.length === 0
              ? 'No entry matches the search and filters.'
              : null
        }
      >
        <div className="tools-compare-scroll">
          <table className="tools-compare col-table" data-testid="col-list" data-layout="col-list">
            <thead>
              <tr>
                <th scope="col">Pokémon</th>
                <th scope="col">Lv</th>
                <th scope="col">Effort</th>
                <th scope="col">OT</th>
                <th scope="col">Fits</th>
                <th scope="col">
                  <span className="visually-hidden">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = r.entry
                const toward = buildLabel(c.buildId)
                return (
                  <tr key={c.id} data-testid={`col-entry-${c.id}`}>
                    <td>
                      {c.nickname.trim() &&
                      c.nickname.trim().toLowerCase() !== r.speciesName.toLowerCase()
                        ? `${c.nickname.trim()} (${r.speciesName})`
                        : r.speciesName}
                    </td>
                    <td className="num">{c.level}</td>
                    <td>
                      <span className="col-mono">{effortSummary(generation, c.effort)}</span>
                      {toward && (
                        <span className="tools-blurb">
                          {` · toward ${toward} · `}
                          <button
                            type="button"
                            className="tools-link"
                            data-testid={`col-remaining-${c.id}`}
                            onClick={() => {
                              setRemainingEntry(c.id)
                              setModule('tool-ev-remaining')
                            }}
                          >
                            What’s left to train
                          </button>
                        </span>
                      )}
                    </td>
                    <td>{[r.otName, r.otId].filter(Boolean).join(' ') || '—'}</td>
                    <td
                      className={r.candidate ? undefined : 'tools-blurb'}
                      data-testid={`col-fits-${c.id}`}
                    >
                      {candidateText(r.candidate)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="tools-link"
                        data-testid={`col-edit-${c.id}`}
                        onClick={() => edit(c)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </ToolResult>
    </>
  )
}

/** A blank entry, only to ask `entryToBuild` for Gen 2's derived gender. */
const emptyEntryFor = (generation: number, speciesId: number): CollectionEntry =>
  migrateEntry({ id: 'draft', seq: 0, generation, speciesId, nickname: '', level: 50, natureId: null, effort: {}, buildId: null })
