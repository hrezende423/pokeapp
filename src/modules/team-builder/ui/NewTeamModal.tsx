import { useState } from 'react'
import { useVersionGroup } from '../../version-group/context'
import { gameGroups, gameLabel, generationOfGame } from '../../version-group/games'
import { TEAM_PURPOSES } from '../model'
import { createTeam } from '../store'
import { goTo } from '../tbNav'
import { Modal } from './Overlay'

/**
 * "New team": which game the team is for and, optionally, its name and what it
 * is for. The team is created on "Create team" and not before, so closing the
 * popup leaves nothing behind.
 *
 * THE GAME DECIDES THE GENERATION every member is built in. It opens on the game
 * the app is browsing, or the newest in scope under "All".
 */
export function NewTeamModal({ onClose }: { onClose: () => void }) {
  const app = useVersionGroup()
  const [groups] = useState(() => gameGroups())
  const [game, setGame] = useState(() => {
    const vg = app.versionGroup?.name
    return vg && groups.some((g) => g.options.some((o) => o.value === vg))
      ? vg
      : 'heartgold-soulsilver'
  })
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')

  const create = () => {
    const team = createTeam(generationOfGame(game) ?? 4, [], {
      versionGroup: game,
      name,
      purpose: purpose || undefined,
    })
    goTo({ kind: 'team-viewer', teamId: team.id })
  }

  return (
    <Modal title="New team" onClose={onClose} testId="tb-new-team-modal">
      <form
        className="tb-new-team-form"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <label className="tb-field">
          <span className="tb-field-label">Game</span>
          <select
            className="tb-select"
            value={game}
            data-testid="tb-new-team-game"
            onChange={(e) => setGame(e.target.value)}
          >
            {groups.map((g) => (
              <optgroup key={g.generation} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="tb-field">
          <span className="tb-field-label">Team name (optional)</span>
          <input
            className="tb-input"
            value={name}
            maxLength={40}
            placeholder={`My ${gameLabel(game)} team`}
            data-testid="tb-new-team-name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="tb-field">
          <span className="tb-field-label">Purpose (optional)</span>
          <select
            className="tb-select"
            value={purpose}
            data-testid="tb-new-team-purpose"
            onChange={(e) => setPurpose(e.target.value)}
          >
            <option value="">—</option>
            {TEAM_PURPOSES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <div className="tb-prompt-actions">
          <span className="tb-prompt-sep" aria-hidden />
          <button
            type="button"
            className="tb-ghost tb-ghost-md"
            data-testid="tb-new-team-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className="tb-ghost tb-ghost-md" data-testid="tb-new-team-create">
            Create team
          </button>
        </div>
      </form>
    </Modal>
  )
}
