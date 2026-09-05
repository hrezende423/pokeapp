/**
 * Put an existing build onto a team, in two steps.
 *
 * SHARED BY TWO CALLERS -- Build Library's per-card dock and Build Form's dock --
 * which is why it lives here and takes only a build id. Neither caller navigates
 * when it finishes: the modal closes and you stay on whatever was underneath,
 * per the spec.
 *
 * EVERY TEAM IS OFFERED, including full ones. A full team is not a dead end here:
 * picking one and clicking an occupied member REPLACES that member, which is the
 * documented way to swap someone in. That replacement is destructive to the old
 * slot's association, so it confirms first -- adding into an empty slot does not.
 */

import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { MemberCard } from './MemberCard'
import { Modal } from './Overlay'
import { ConfirmPrompt } from './ConfirmPrompt'
import { usePrompt } from './usePrompt'
import { TEAM_SIZE, teamLabel, type Build } from '../model'
import { setTeamMember, useTeamBuilderData } from '../store'

export function AddToTeamModal({ buildId, onClose }: { buildId: string; onClose: () => void }) {
  const data = useTeamBuilderData()
  const prompt = usePrompt()
  const [teamId, setTeamId] = useState<string | null>(null)

  const buildById = new Map(data.builds.map((b) => [b.id, b]))
  const teams = [...data.teams].sort((a, b) => a.seq - b.seq)
  const team = teamId == null ? null : (teams.find((t) => t.id === teamId) ?? null)

  const place = (slot: number) => {
    if (!team) return
    setTeamMember(team.id, slot, buildId)
    onClose()
  }

  return (
    <>
      <Modal
        title={team ? `Add to team ${teamLabel(team)}` : 'Add to team'}
        onClose={onClose}
        testId="tb-add-to-team"
        wide={team != null}
      >
        {!team ? (
          teams.length === 0 ? (
            <p className="tb-empty-note">No teams yet. Create one first.</p>
          ) : (
            /* Step 1: the My Teams list, scoped down to a picker. */
            <div className="tb-picker-list" data-testid="tb-add-to-team-teams">
              {teams.map((t) => {
                const members = t.memberIds
                  .map((id) => (id == null ? null : (buildById.get(id) ?? null)))
                  .filter((b): b is Build => b != null)
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="tb-picker-row"
                    data-testid={`tb-add-to-team-${t.id}`}
                    onClick={() => setTeamId(t.id)}
                  >
                    <span className="tb-team-id num">{teamLabel(t)}</span>
                    <span className="tb-picker-members">
                      {members.map((m) => (
                        <MemberCard key={m.id} build={m} variant="compact" />
                      ))}
                    </span>
                    <span className="tb-picker-count num">
                      {members.length} / {TEAM_SIZE}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        ) : (
          /* Step 2: that team's slots, in Team Viewer's layout. */
          <div className="tb-slot-grid" data-testid="tb-add-to-team-slots">
            {team.memberIds.map((memberId, slot) => {
              const member = memberId == null ? null : (buildById.get(memberId) ?? null)
              if (!member) {
                return (
                  <div className="tb-card tb-card-empty" key={`slot-${slot}`}>
                    <button
                      type="button"
                      className="tb-ghost tb-ghost-md"
                      data-testid={`tb-add-to-team-slot-${slot}`}
                      onClick={() => place(slot)}
                    >
                      <IconPlus size={18} stroke={1.5} />
                      Add here
                    </button>
                  </div>
                )
              }
              return (
                <MemberCard
                  key={member.id}
                  build={member}
                  variant="full"
                  testId={`tb-add-to-team-member-${slot}`}
                  onOpen={() =>
                    prompt.confirm('Replace this team member?', () => place(slot), {
                      body: `Slot ${slot + 1} currently holds another build. Replacing it removes that build from this team; the build itself stays in your library.`,
                      confirmLabel: 'Replace',
                      testId: 'tb-replace-member-prompt',
                    })
                  }
                />
              )
            })}
          </div>
        )}
      </Modal>
      {prompt.config && <ConfirmPrompt config={prompt.config} onClose={prompt.close} />}
    </>
  )
}
