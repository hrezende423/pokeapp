/**
 * Screen 1: every team, as a flat list of rows.
 *
 * A LIST, NOT A CARD GRID. Each row is one team: its kebab, its id, its members
 * inline, and a chevron. Row-border only, no box -- the same hairline treatment
 * the Pokedex and Movedex tables use, which is what keeps six member cards on a
 * line reading as one row rather than as six panels.
 *
 * THE MEMBER CARDS HERE ARE THE `compact` DENSITY. Team Viewer shows the same
 * builds with level, spread and all four moves; at six-across that would make
 * every row roughly three times as tall and turn the list into a stack of cards.
 * The reference images settle it: name, gender, types, ability and nature only.
 *
 * NO TEAM NAME AND NO TIMESTAMP, anywhere on this screen. Teams are identified by
 * id; there is no name field in this module at all.
 *
 * THE SEARCH BAR IS DELIBERATELY INERT. It renders because the layout is built
 * around it -- "+ New team" sits immediately to its left -- but no filtering is
 * wired up, per the spec. It is disabled rather than merely non-functional, so it
 * cannot silently swallow typing.
 */

import { useState } from 'react'
import {
  IconChevronRight,
  IconCopy,
  IconInfoCircle,
  IconPlus,
  IconShieldHalf,
  IconTrash,
} from '@tabler/icons-react'
import { goTo } from './tbNav'
import { GhostButton } from './ui/GhostButton'
import { Kebab } from './ui/Dock'
import { Modal, Popover } from './ui/Overlay'
import { ConfirmPrompt } from './ui/ConfirmPrompt'
import { usePrompt } from './ui/usePrompt'
import { MemberCard } from './ui/MemberCard'
import { TeamMatchup } from './ui/TypeMatchup'
import { buildSpecies, typeIdsFor } from './buildFacts'
import { teamLabel, type Build, type Team } from './model'
import { createTeam, deleteTeam, duplicateTeam, updateTeam, useTeamBuilderData } from './store'

export function MyTeams({ generation }: { generation: number }) {
  const data = useTeamBuilderData()
  const prompt = usePrompt()

  const buildById = new Map(data.builds.map((b) => [b.id, b]))
  /* Sorted by id, which is the only sort the spec allows -- and since there is no
     team name, it is also the only one there is data for. */
  const teams = [...data.teams].sort((a, b) => a.seq - b.seq)

  const newTeam = () => {
    const team = createTeam(generation)
    goTo({ kind: 'team-viewer', teamId: team.id })
  }

  if (teams.length === 0) {
    return (
      <section className="tb-screen tb-my-teams" data-testid="tb-my-teams">
        {/* No search bar in the empty state: there is nothing to search. */}
        <div className="tb-empty" data-testid="tb-my-teams-empty">
          <GhostButton onClick={newTeam} testId="tb-new-team">
            <IconPlus size={18} stroke={1.5} />
            New team
          </GhostButton>
          <p className="tb-empty-note">No teams yet.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="tb-screen tb-my-teams" data-testid="tb-my-teams">
      <header className="tb-screen-head">
        <GhostButton onClick={newTeam} testId="tb-new-team">
          <IconPlus size={18} stroke={1.5} />
          New team
        </GhostButton>
        <input
          className="tb-search"
          type="search"
          placeholder="Search teams"
          aria-label="Search teams"
          data-testid="tb-team-search"
          disabled
        />
      </header>

      <div className="tb-team-rows" data-testid="tb-team-rows">
        {teams.map((team) => (
          <TeamRow
            key={team.id}
            team={team}
            buildById={buildById}
            onDelete={() =>
              prompt.confirm(`Delete team ${teamLabel(team)}?`, () => deleteTeam(team.id), {
                body: 'Builds used only by this team are deleted with it. Builds that other teams also use are kept.',
                testId: 'tb-delete-team-prompt',
              })
            }
          />
        ))}
      </div>

      {prompt.config && <ConfirmPrompt config={prompt.config} onClose={prompt.close} />}
    </section>
  )
}

function TeamRow({
  team,
  buildById,
  onDelete,
}: {
  team: Team
  buildById: Map<string, Build>
  onDelete: () => void
}) {
  const [coverage, setCoverage] = useState(false)
  const [info, setInfo] = useState(false)

  const members = team.memberIds
    .map((id) => (id == null ? null : (buildById.get(id) ?? null)))
    .filter((b): b is Build => b != null)

  const matchupMembers = members
    .map((build) => {
      const facts = buildSpecies(build)
      return facts
        ? {
            label: facts.species.display_name,
            typeIds: typeIdsFor(facts.variety, build.generation),
          }
        : null
    })
    .filter((m): m is { label: string; typeIds: number[] } => m != null)

  return (
    <div className="tb-team-row" data-testid={`tb-team-${team.id}`} data-team-id={team.id}>
      <div className="tb-team-row-lead">
        <Kebab
          testId={`tb-team-${team.id}-kebab`}
          items={[
            {
              icon: <IconShieldHalf size={16} stroke={1.5} />,
              label: 'Team type coverage',
              onClick: () => setCoverage(true),
              testId: `tb-team-${team.id}-coverage`,
            },
            {
              icon: <IconInfoCircle size={16} stroke={1.5} />,
              label: 'Team info',
              onClick: () => setInfo(true),
              testId: `tb-team-${team.id}-info`,
            },
            {
              icon: <IconCopy size={16} stroke={1.5} />,
              label: 'Duplicate team',
              onClick: () => duplicateTeam(team.id),
              testId: `tb-team-${team.id}-duplicate`,
            },
            {
              icon: <IconTrash size={16} stroke={1.5} />,
              label: 'Delete team',
              onClick: onDelete,
              danger: true,
              testId: `tb-team-${team.id}-delete`,
            },
          ]}
        />
        {coverage && (
          <Popover
            onClose={() => setCoverage(false)}
            align="left"
            testId={`tb-team-${team.id}-coverage-popover`}
          >
            <TeamMatchup members={matchupMembers} generation={team.generation} />
          </Popover>
        )}
        <span className="tb-team-id num" data-testid={`tb-team-${team.id}-label`}>
          {teamLabel(team)}
        </span>
      </div>

      <div className="tb-team-members">
        {members.map((build) => (
          <MemberCard
            key={build.id}
            build={build}
            variant="compact"
            testId={`tb-team-${team.id}-member-${build.id}`}
          />
        ))}
      </div>

      {/* The chevron is the whole open affordance for the row. */}
      <button
        type="button"
        className="tb-team-open"
        aria-label={`Open team ${teamLabel(team)}`}
        data-testid={`tb-team-${team.id}-open`}
        onClick={() => goTo({ kind: 'team-viewer', teamId: team.id })}
      >
        <IconChevronRight size={28} stroke={1.5} />
      </button>

      {info && (
        <Modal
          title={`Team ${teamLabel(team)} info`}
          onClose={() => setInfo(false)}
          testId={`tb-team-${team.id}-info-modal`}
        >
          <textarea
            className="tb-notes"
            defaultValue={team.notes}
            placeholder="Notes about this team"
            aria-label="Team notes"
            data-testid={`tb-team-${team.id}-notes`}
            /* Autosave on blur -- there is no Save button anywhere in this module. */
            onBlur={(e) => updateTeam(team.id, { notes: e.target.value })}
          />
        </Modal>
      )}
    </div>
  )
}
