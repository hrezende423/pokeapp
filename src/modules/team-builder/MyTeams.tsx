/**
 * The Team Library: every team, as a flat list of rows.
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
  IconListCheck,
  IconPlus,
  IconShieldHalf,
  IconTrash,
} from '@tabler/icons-react'
import { goTo } from './tbNav'
import { GhostButton } from './ui/GhostButton'
import { Dock, Kebab } from './ui/Dock'
import { BulkBar, SelectCircle } from './ui/BulkSelect'
import { useBulkSelect } from './ui/useBulkSelect'
import { Modal, Popover } from './ui/Overlay'
import { ConfirmPrompt } from './ui/ConfirmPrompt'
import { usePrompt } from './ui/usePrompt'
import { MemberCard } from './ui/MemberCard'
import { TeamMatchup } from './ui/TypeMatchup'
import { buildSpecies, typeIdsFor } from './buildFacts'
import { listedTeams, uiId, type Build, type Team } from './model'
import { createTeam, deleteTeam, duplicateTeam, updateTeam, useTeamBuilderData } from './store'

export function MyTeams({ generation }: { generation: number }) {
  const data = useTeamBuilderData()
  const prompt = usePrompt()
  const bulk = useBulkSelect()

  const buildById = new Map(data.builds.map((b) => [b.id, b]))
  /*
    EMPTY TEAMS ARE NOT LISTED. A team with no members is not a team yet -- it is
    the moment between "New team" and choosing the first one -- and listing it
    puts a row of nothing at the top of the library. The shell deletes any it
    finds that nobody is looking at; see TeamBuilding's prune.

    Creation order is the numbering order, and since there is no team name it is
    also the only sort there is data for.
  */
  const teams = listedTeams(data)

  const deleteSelected = () => {
    const ids = [...bulk.selected]
    if (ids.length === 0) return
    prompt.confirm(
      `Delete ${ids.length} team${ids.length === 1 ? '' : 's'}?`,
      () => {
        ids.forEach((id) => deleteTeam(id))
        bulk.exit()
      },
      {
        body: 'Builds used only by these teams are deleted with them. Builds that other teams also use are kept.',
        testId: 'tb-bulk-delete-teams-prompt',
        confirmLabel: 'Delete',
      },
    )
  }

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
        <div className="tb-dock-anchor tb-library-dock-anchor">
          <Dock
            testId="tb-teams-dock"
            items={[
              {
                icon: <IconListCheck size={18} stroke={1.5} />,
                label: 'Select teams',
                onClick: bulk.enter,
                testId: 'tb-teams-select',
              },
            ]}
          />
        </div>
      </header>

      {bulk.active && (
        <BulkBar
          count={bulk.selected.size}
          noun="team"
          onCancel={bulk.exit}
          onDelete={deleteSelected}
          testId="tb-teams-bulk"
        />
      )}

      <div className="tb-team-rows" data-testid="tb-team-rows">
        {teams.map((team, index) => (
          <TeamRow
            key={team.id}
            team={team}
            label={uiId(index)}
            buildById={buildById}
            selecting={bulk.active}
            selectProps={bulk.itemProps(team.id)}
            onDelete={() =>
              prompt.confirm(`Delete team ${uiId(index)}?`, () => deleteTeam(team.id), {
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
  label,
  buildById,
  selecting,
  selectProps,
  onDelete,
}: {
  team: Team
  /** The "#001". Derived from position by the caller -- see model.ts. */
  label: string
  buildById: Map<string, Build>
  selecting: boolean
  selectProps: {
    selected: boolean
    onPointerDown: (e: React.PointerEvent) => void
    onPointerEnter: () => void
  }
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
            /* The member's OWN ability, so Levitate and friends count. */
            abilityId: build.abilityId,
          }
        : null
    })
    .filter((m): m is { label: string; typeIds: number[]; abilityId: number | null } => m != null)

  const open = () => goTo({ kind: 'team-viewer', teamId: team.id })

  return (
    /*
      THE WHOLE LANE OPENS THE TEAM. It is a <div> with a click handler rather
      than a <button> because it CONTAINS buttons -- the kebab, the check circle
      -- and a button inside a button is markup React rejects. The keyboard gets
      the chevron, which is a real button and stays the visible affordance.

      In selection mode the lane selects instead of opening: a grid where a click
      sometimes opens and sometimes selects is a grid you cannot trust.
    */
    <div
      className="tb-team-row"
      data-testid={`tb-team-${team.id}`}
      data-team-id={team.id}
      data-clickable={selecting ? undefined : 'true'}
      data-selected={selecting && selectProps.selected ? 'true' : undefined}
      onClick={selecting ? undefined : open}
    >
      <div className="tb-team-row-lead">
        {selecting ? (
          <SelectCircle
            {...selectProps}
            label={`Select team ${label}`}
            testId={`tb-team-${team.id}-check`}
          />
        ) : (
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
        )}
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
          {label}
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

      {/* Still the visible affordance, and the keyboard's way in, now that the
          lane itself is clickable. */}
      <button
        type="button"
        className="tb-team-open"
        aria-label={`Open team ${label}`}
        data-testid={`tb-team-${team.id}-open`}
        disabled={selecting}
        onClick={(e) => {
          e.stopPropagation()
          open()
        }}
      >
        <IconChevronRight size={28} stroke={1.5} />
      </button>

      {info && (
        <Modal
          title={`Team ${label} info`}
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
