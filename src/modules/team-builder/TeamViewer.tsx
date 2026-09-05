/**
 * Screen 2: one team, its six slots.
 *
 * NO TEAM NAME. The header carries the id and nothing else -- there is no name
 * field anywhere in this module, and the reference image's "Ultimate Team" title
 * is mock dressing, not a control to build.
 *
 * THREE CORNERS ON A CARD, EACH DOING ONE THING, because the upper-right is
 * already spoken for by the spec (this species' matchups) and remove/drag cannot
 * share it:
 *   upper-right  type matchups (popover)
 *   upper-left   remove from team (confirm first)
 *   lower-left   drag handle
 * The whole card is ALSO draggable. The handle exists as the guaranteed path --
 * see the note on the drag/click question in the completion report.
 *
 * SIX SLOTS, HARD. `TEAM_SIZE` bounds the grid, so there is no seventh slot to
 * add into once the team is full; the add affordance simply stops rendering.
 */

import { useState } from 'react'
import {
  IconChevronLeft,
  IconCopy,
  IconGripVertical,
  IconInfoCircle,
  IconPlus,
  IconShieldHalf,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import { goTo } from './tbNav'
import { GhostButton, IconButton } from './ui/GhostButton'
import { Dock } from './ui/Dock'
import { Modal, Popover } from './ui/Overlay'
import { ConfirmPrompt } from './ui/ConfirmPrompt'
import { usePrompt } from './ui/usePrompt'
import { EmptySlot, MemberCard } from './ui/MemberCard'
import { SpeciesMatchup, TeamMatchup } from './ui/TypeMatchup'
import { buildSpecies, newBuildInit, typeIdsFor } from './buildFacts'
import { TEAM_SIZE, teamLabel, type Build, type Team } from './model'
import {
  createBuild,
  deleteTeam,
  duplicateTeam,
  reorderTeam,
  setTeamMember,
  updateTeam,
  useTeamBuilderData,
} from './store'

/*
  NO `generation` PROP, deliberately. A team carries its own generation, fixed when
  it was created, and that is what every card and every coverage chart here must
  use -- moving the app's global game selector must not silently re-interpret a
  saved Gen 3 team as Gen 1.
*/
export function TeamViewer({ teamId }: { teamId: string }) {
  const data = useTeamBuilderData()
  const prompt = usePrompt()
  const [coverage, setCoverage] = useState(false)
  const [info, setInfo] = useState(false)
  const [picking, setPicking] = useState<number | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)

  const team = data.teams.find((t) => t.id === teamId)
  if (!team) {
    return (
      <section className="tb-screen" data-testid="tb-team-viewer">
        <p className="tb-empty-note">This team no longer exists.</p>
        <GhostButton onClick={() => goTo({ kind: 'my-teams' })}>Back to My Teams</GhostButton>
      </section>
    )
  }

  const buildById = new Map(data.builds.map((b) => [b.id, b]))
  const members = team.memberIds.map((id) => (id == null ? null : (buildById.get(id) ?? null)))
  const firstOpen = members.findIndex((m) => m == null)

  const matchupMembers = members
    .filter((b): b is Build => b != null)
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

  const buildNewInSlot = (slot: number) => {
    const build = createBuild(newBuildInit(team.generation))
    setTeamMember(team.id, slot, build.id)
    goTo({ kind: 'build-form', buildId: build.id, origin: { kind: 'team', teamId: team.id } })
  }

  const onDrop = (to: number) => {
    if (dragFrom == null || dragFrom === to) return
    reorderTeam(team.id, dragFrom, to)
    setDragFrom(null)
  }

  return (
    <section
      className="tb-screen tb-team-viewer"
      data-testid="tb-team-viewer"
      data-team-id={team.id}
    >
      <header className="tb-screen-head">
        <GhostButton onClick={() => goTo({ kind: 'my-teams' })} testId="tb-back-to-teams">
          <IconChevronLeft size={18} stroke={1.5} />
          My Teams
        </GhostButton>
        <span className="tb-team-id num" data-testid="tb-viewer-team-id">
          {teamLabel(team)}
        </span>
        <div className="tb-dock-anchor">
          <Dock
            testId="tb-viewer-dock"
            items={[
              {
                icon: <IconCopy size={18} stroke={1.5} />,
                label: 'Duplicate team',
                onClick: () => {
                  const copy = duplicateTeam(team.id)
                  if (copy) goTo({ kind: 'team-viewer', teamId: copy.id })
                },
                testId: 'tb-viewer-duplicate',
              },
              {
                icon: <IconInfoCircle size={18} stroke={1.5} />,
                label: 'Team info',
                onClick: () => setInfo(true),
                testId: 'tb-viewer-info',
              },
              {
                icon: <IconShieldHalf size={18} stroke={1.5} />,
                label: 'Team type coverage',
                onClick: () => setCoverage(true),
                testId: 'tb-viewer-coverage',
              },
              {
                icon: <IconTrash size={18} stroke={1.5} />,
                label: 'Delete team',
                danger: true,
                testId: 'tb-viewer-delete',
                onClick: () =>
                  prompt.confirm(
                    `Delete team ${teamLabel(team)}?`,
                    () => {
                      deleteTeam(team.id)
                      goTo({ kind: 'my-teams' })
                    },
                    { testId: 'tb-delete-team-prompt' },
                  ),
              },
            ]}
          />
          {coverage && (
            <Popover onClose={() => setCoverage(false)} testId="tb-viewer-coverage-popover">
              <TeamMatchup members={matchupMembers} generation={team.generation} />
            </Popover>
          )}
        </div>
      </header>

      <div className="tb-slot-grid" data-testid="tb-slot-grid">
        {members.map((build, slot) =>
          build ? (
            <MemberSlot
              key={build.id}
              build={build}
              slot={slot}
              team={team}
              onOpen={() =>
                goTo({
                  kind: 'build-form',
                  buildId: build.id,
                  origin: { kind: 'team', teamId: team.id },
                })
              }
              onRemove={() =>
                prompt.confirm(
                  'Remove this member from the team?',
                  () => setTeamMember(team.id, slot, null),
                  {
                    body: 'The build itself stays in your Build Library.',
                    confirmLabel: 'Remove',
                    testId: 'tb-remove-member-prompt',
                  },
                )
              }
              onDragStart={() => setDragFrom(slot)}
              onDragEnd={() => setDragFrom(null)}
              onDropHere={() => onDrop(slot)}
            />
          ) : slot === firstOpen ? (
            <EmptySlot
              key={`open-${slot}`}
              testId={`tb-slot-${slot}-empty`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(slot)}
            >
              <GhostButton onClick={() => setPicking(slot)} testId={`tb-slot-${slot}-add`}>
                <IconPlus size={18} stroke={1.5} />
                Add member
              </GhostButton>
            </EmptySlot>
          ) : (
            /* Later empty slots are blank: only the NEXT one gets an affordance,
               so the grid does not read as five competing invitations. */
            <EmptySlot key={`blank-${slot}`} testId={`tb-slot-${slot}-blank`} />
          ),
        )}
      </div>

      {picking != null && (
        <Modal title="Add member" onClose={() => setPicking(null)} testId="tb-add-member-modal">
          <div className="tb-choice">
            <GhostButton
              onClick={() => {
                const slot = picking
                setPicking(null)
                buildNewInSlot(slot)
              }}
              testId="tb-add-member-new"
            >
              Build a new member
            </GhostButton>
            <GhostButton
              onClick={() => {
                setPicking(null)
                goTo({ kind: 'build-library' })
              }}
              testId="tb-add-member-existing"
            >
              Pick an existing build
            </GhostButton>
          </div>
        </Modal>
      )}

      {info && (
        <Modal
          title={`Team ${teamLabel(team)} info`}
          onClose={() => setInfo(false)}
          testId="tb-viewer-info-modal"
        >
          <textarea
            className="tb-notes"
            defaultValue={team.notes}
            placeholder="Notes about this team"
            aria-label="Team notes"
            data-testid="tb-viewer-notes"
            onBlur={(e) => updateTeam(team.id, { notes: e.target.value })}
          />
        </Modal>
      )}

      {prompt.config && <ConfirmPrompt config={prompt.config} onClose={prompt.close} />}
      <span className="tb-slot-count num" data-testid="tb-slot-count">
        {members.filter(Boolean).length} / {TEAM_SIZE}
      </span>
    </section>
  )
}

function MemberSlot({
  build,
  slot,
  team,
  onOpen,
  onRemove,
  onDragStart,
  onDragEnd,
  onDropHere,
}: {
  build: Build
  slot: number
  team: Team
  onOpen: () => void
  onRemove: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDropHere: () => void
}) {
  const [matchup, setMatchup] = useState(false)
  const facts = buildSpecies(build)

  return (
    <MemberCard
      build={build}
      variant="full"
      testId={`tb-slot-${slot}`}
      onOpen={onOpen}
      draggable
      onDragStart={(e) => {
        /* Guarded: a synthetic dragstart (and some automation) carries no
           dataTransfer at all, and throwing here would abort the whole gesture. */
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          // Firefox will not start a drag unless data is set on the transfer.
          e.dataTransfer.setData('text/plain', build.id)
        }
        onDragStart()
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDropHere()
      }}
      onDragEnd={onDragEnd}
      corners={
        <>
          <span className="tb-corner tb-corner-tr">
            <IconButton
              icon={<IconShieldHalf size={16} stroke={1.5} />}
              label="Type matchups"
              onClick={() => setMatchup(true)}
              testId={`tb-slot-${slot}-matchup`}
            />
            {matchup && (
              <Popover onClose={() => setMatchup(false)} testId={`tb-slot-${slot}-matchup-popover`}>
                {facts && (
                  <SpeciesMatchup
                    typeIds={typeIdsFor(facts.variety, build.generation)}
                    generation={build.generation}
                    title={facts.species.display_name}
                  />
                )}
              </Popover>
            )}
          </span>
          <span className="tb-corner tb-corner-tl">
            <IconButton
              icon={<IconX size={16} stroke={1.5} />}
              label="Remove from team"
              onClick={onRemove}
              danger
              testId={`tb-slot-${slot}-remove`}
            />
          </span>
          {/* The guaranteed drag path, in case whole-card dragging and the card's
              own click gesture turn out to fight each other. */}
          <span
            className="tb-corner tb-corner-bl tb-drag-handle"
            data-testid={`tb-slot-${slot}-handle`}
            aria-label={`Reorder slot ${slot + 1} of team ${team.id}`}
          >
            <IconGripVertical size={16} stroke={1.5} />
          </span>
        </>
      }
    />
  )
}
