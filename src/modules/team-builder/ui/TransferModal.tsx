/**
 * Showdown text in and out: the two dialogs. All the rules are in
 * ../showdownImport.ts; these only show its answer.
 *
 * IMPORT HAS TWO STEPS so nothing is written before the reader has seen what will
 * be dropped: Check reads the text and reports, Import creates the records.
 */

import { useState } from 'react'
import type { Build, Team } from '../model'
import {
  commitBuild,
  commitTeam,
  exportBuilds,
  exportIsLossy,
  resolveImport,
  type ImportPlan,
} from '../showdownImport'
import { GhostButton } from './GhostButton'
import { Modal } from './Overlay'

export function ExportModal({
  title,
  builds,
  onClose,
}: {
  title: string
  builds: Build[]
  onClose: () => void
}) {
  const text = exportBuilds(builds)
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }
  return (
    <Modal title={title} onClose={onClose} testId="tb-export-modal" wide>
      <textarea
        className="tb-notes tb-transfer-text num"
        readOnly
        value={text}
        aria-label="Showdown text"
        data-testid="tb-export-text"
        onFocus={(e) => e.target.select()}
      />
      {exportIsLossy(builds) && (
        <p className="tb-transfer-note" data-testid="tb-export-lossy">
          Stat Exp rounds to Showdown&apos;s steps here, so this text is not an exact copy.
        </p>
      )}
      <div className="tb-transfer-actions">
        <GhostButton onClick={copy} testId="tb-export-copy">
          {copied ? 'Copied' : 'Copy'}
        </GhostButton>
      </div>
    </Modal>
  )
}

export function ImportModal({
  mode,
  generation,
  onClose,
  onTeam,
}: {
  mode: 'team' | 'build'
  generation: number
  onClose: () => void
  onTeam?: (team: Team) => void
}) {
  const [text, setText] = useState('')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [checking, setChecking] = useState(false)
  const ready = plan?.items.filter((i) => i.build).length ?? 0

  const check = () => {
    setChecking(true)
    resolveImport(text, generation, mode).then(
      (next) => {
        setPlan(next)
        setChecking(false)
      },
      () => setChecking(false),
    )
  }
  const confirm = () => {
    if (!plan) return
    if (mode === 'team') onTeam?.(commitTeam(plan))
    else commitBuild(plan)
    onClose()
  }

  return (
    <Modal
      title={`Import a ${mode} into Gen ${generation}`}
      onClose={onClose}
      testId="tb-import-modal"
      wide
    >
      <textarea
        className="tb-notes tb-transfer-text num"
        value={text}
        placeholder="Paste Showdown text"
        aria-label="Showdown text to import"
        data-testid="tb-import-text"
        onChange={(e) => {
          setText(e.target.value)
          setPlan(null)
        }}
      />
      <p className="tb-transfer-note">
        Goes into the generation you have selected. Nothing existing is overwritten.
      </p>
      {plan && (
        <div data-testid="tb-import-report">
          {plan.items.length === 0 && (
            <p className="tb-transfer-note" data-testid="tb-import-empty">
              No Pokémon found in this text.
            </p>
          )}
          <table className="tb-transfer-report">
            <tbody>
              {plan.items.map((item, i) => (
                <tr key={i} data-testid={`tb-import-item-${i}`} data-ready={item.build != null}>
                  <th scope="row">{item.label}</th>
                  <td>
                    {item.notes.length === 0
                      ? 'Reads in full.'
                      : item.notes.map((note) => <div key={note}>{note}</div>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {plan.notes.map((note) => (
            <p key={note} className="tb-transfer-note">
              {note}
            </p>
          ))}
        </div>
      )}
      <div className="tb-transfer-actions">
        {plan ? (
          <GhostButton onClick={confirm} disabled={ready === 0} testId="tb-import-confirm">
            Import {ready} Pokémon
          </GhostButton>
        ) : (
          <GhostButton
            onClick={check}
            disabled={checking || text.trim() === ''}
            testId="tb-import-check"
          >
            Check text
          </GhostButton>
        )}
      </div>
    </Modal>
  )
}
