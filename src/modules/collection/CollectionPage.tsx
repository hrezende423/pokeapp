import { useMemo, useState } from 'react'
import { SelectField } from '../../components/ds/SelectField'
import { TextField } from '../../components/ds/TextField'
import { getSpecies, listNatures } from '../../data'
import { speciesEntries } from '../dex/entrySources'
import { useNav } from '../nav/navContext'
import { orderedBuilds, type CollectionEntry } from '../team-builder/model'
import { createEntry, deleteEntry, updateEntry, useTeamBuilderData } from '../team-builder/store'
import { ToolInputs, ToolResult, ToolShell } from '../tools/ToolShell'
import { setRemainingEntry } from './collectionHandoff'
import {
  EFFORT_LABEL,
  checkEntry,
  effortCap,
  effortKeysFor,
  effortSummary,
  type EntryDraft,
} from './collectionMath'

/**
 * The Collection (owner, 2026-10-15): the Pokemon you have caught, as they stand
 * now -- species, level, nature and their current EVs (Stat Exp in Gen 1-2) --
 * each optionally pointed at the Build it is being trained toward. Minimal on
 * purpose: it exists so #9 can say what is still to train.
 *
 * Saved inside the Team Builder document, so it syncs with teams and builds when
 * signed in. Lists the app generation's entries.
 */
export function CollectionPage() {
  return (
    <ToolShell toolKey="collection" title="Collection" gate={{ gens: [1, 2, 3, 4] }}>
      {({ generation }) => <CollectionBody key={generation} generation={generation} />}
    </ToolShell>
  )
}

const emptyDraft = (speciesId: number | null): EntryDraft => ({
  speciesId,
  nickname: '',
  level: '50',
  natureId: null,
  effort: {},
  buildId: null,
})

function CollectionBody({ generation }: { generation: number }) {
  const { setModule } = useNav()
  const data = useTeamBuilderData()
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])
  const entries = (data.collection ?? []).filter((c) => c.generation === generation)
  const builds = orderedBuilds(data).filter((b) => b.generation === generation)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<EntryDraft>(() => emptyDraft(species[0]?.id ?? null))
  const check = checkEntry(generation, draft)
  const cap = effortCap(generation)

  const edit = (c: CollectionEntry) => {
    setEditing(c.id)
    setDraft({
      speciesId: c.speciesId,
      nickname: c.nickname,
      level: String(c.level),
      natureId: c.natureId,
      effort: Object.fromEntries(Object.entries(c.effort).map(([k, v]) => [k, String(v ?? 0)])),
      buildId: c.buildId,
    })
  }
  const reset = () => {
    setEditing(null)
    setDraft(emptyDraft(species[0]?.id ?? null))
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
    }
    if (editing) updateEntry(editing, record)
    else createEntry(record)
    reset()
  }
  const nameOf = (c: { nickname: string; speciesId: number }) =>
    c.nickname || getSpecies(c.speciesId)?.display_name || `#${c.speciesId}`
  const buildLabel = (id: string | null) => {
    const b = id ? data.builds.find((x) => x.id === id) : undefined
    return b ? `${b.nickname || getSpecies(b.speciesId)?.display_name} (build)` : null
  }

  return (
    <>
      <ToolInputs>
        <h2 className="calc-section-heading">{editing ? 'Edit entry' : 'Add a Pokémon'}</h2>
        <div className="calc-row">
          <SelectField
            label="Pokémon"
            options={species.map((s) => ({ value: String(s.id), label: s.display_name }))}
            value={draft.speciesId != null ? String(draft.speciesId) : ''}
            data-testid="col-species"
            onChange={(e) => setDraft({ ...draft, speciesId: Number(e.target.value) })}
          />
          <TextField
            label="Nickname"
            value={draft.nickname}
            maxLength={10}
            data-testid="col-nickname"
            onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
          />
          <TextField
            label="Level"
            type="number"
            value={draft.level}
            data-testid="col-level"
            onChange={(e) => setDraft({ ...draft, level: e.target.value })}
          />
          {generation >= 3 && (
            <SelectField
              label="Nature"
              options={[
                { value: '', label: '—' },
                ...listNatures().map((n) => ({
                  value: String(n.id),
                  label: n.display_name ?? n.name,
                })),
              ]}
              value={draft.natureId != null ? String(draft.natureId) : ''}
              onChange={(e) =>
                setDraft({ ...draft, natureId: e.target.value ? Number(e.target.value) : null })
              }
            />
          )}
          <SelectField
            label="Training toward"
            options={[
              { value: '', label: 'No build' },
              ...builds.map((b) => ({
                value: b.id,
                label: `${b.nickname || getSpecies(b.speciesId)?.display_name}${b.speciesId === draft.speciesId ? '' : ' (other species)'}`,
              })),
            ]}
            value={draft.buildId ?? ''}
            data-testid="col-build"
            onChange={(e) => setDraft({ ...draft, buildId: e.target.value || null })}
          />
        </div>
        <h3 className="calc-section-heading">
          Current {generation <= 2 ? 'Stat Exp' : 'EVs'} (0–{cap})
        </h3>
        <div className="calc-row">
          {effortKeysFor(generation).map((k) => (
            <TextField
              key={k}
              label={EFFORT_LABEL[k]}
              type="number"
              value={draft.effort[k] ?? ''}
              placeholder="0"
              data-testid={`col-effort-${k}`}
              onChange={(e) =>
                setDraft({ ...draft, effort: { ...draft.effort, [k]: e.target.value } })
              }
            />
          ))}
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
          entries.length === 0 ? `No Gen ${generation} Pokémon in your Collection yet.` : null
        }
      >
        <ul className="tools-list" data-testid="col-list">
          {entries.map((c) => (
            <li key={c.id} className="tools-item" data-testid={`col-entry-${c.id}`}>
              <button type="button" className="tools-link" onClick={() => edit(c)}>
                {nameOf(c)} <span className="tools-blurb">Lv {c.level}</span>
              </button>
              <span className="tools-blurb">
                {effortSummary(generation, c.effort)}
                {buildLabel(c.buildId) ? ` · toward ${buildLabel(c.buildId)} · ` : ''}
                {c.buildId && (
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
                )}
              </span>
            </li>
          ))}
        </ul>
      </ToolResult>
    </>
  )
}
