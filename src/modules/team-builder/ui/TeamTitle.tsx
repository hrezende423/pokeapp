import { gameLabel } from '../../version-group/games'
import { TEAM_PURPOSES, purposeLabel, type Team } from '../model'
import { updateTeam } from '../store'

/**
 * A team's name over "Game · Purpose", beside its "#001". Renders nothing for a
 * team with none of the three -- one made before they were asked for.
 */
export function TeamTitle({ team, testId }: { team: Team; testId?: string }) {
  const sub = [team.versionGroup ? gameLabel(team.versionGroup) : null, purposeLabel(team.purpose)]
    .filter(Boolean)
    .join(' · ')
  if (!team.name && !sub) return null
  return (
    <span className="tb-team-title" data-testid={testId}>
      {team.name && <span className="tb-team-name">{team.name}</span>}
      {sub && <span className="tb-team-sub">{sub}</span>}
    </span>
  )
}

/**
 * The name and purpose, editable in the team's info popup. They save as they
 * change -- this module has no Save button anywhere. The game is not here: it
 * decided the generation every member was built in.
 */
export function TeamMetaFields({ team, testId }: { team: Team; testId: string }) {
  return (
    <div className="tb-team-meta-fields">
      <label className="tb-field">
        <span className="tb-field-label">Team name</span>
        <input
          className="tb-input"
          defaultValue={team.name ?? ''}
          maxLength={40}
          data-testid={`${testId}-name`}
          onChange={(e) => updateTeam(team.id, { name: e.target.value.trim() || undefined })}
        />
      </label>
      <label className="tb-field">
        <span className="tb-field-label">Purpose</span>
        <select
          className="tb-select"
          value={team.purpose ?? ''}
          data-testid={`${testId}-purpose`}
          onChange={(e) => updateTeam(team.id, { purpose: e.target.value || undefined })}
        >
          <option value="">—</option>
          {TEAM_PURPOSES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
