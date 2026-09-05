/**
 * Screen 3: every build that exists, attached to a team or not.
 *
 * TEAM VIEWER'S GRID, WITH THREE DIFFERENCES, since it has no reference image of
 * its own and is specified as an expanded version of that screen:
 *   - OFFICIAL ARTWORK instead of the in-game sprite (the `library` card variant);
 *   - tag chips, which are the only filterable field a build has -- there is no
 *     build name anywhere in this module, only nicknames and tags;
 *   - "Used in N teams", counted live from the store.
 *
 * NO SEARCH, FILTER OR SORT. Deliberately absent, not forgotten -- the spec
 * defers all three to a later pass, and a half-wired filter row would imply
 * otherwise. Tags are stored and rendered now so the eventual filter has data.
 *
 * SCROLLS AS A GRID rather than paginating: the count is bounded by how many
 * builds a person actually makes, and a pager over a handful of cards is worse
 * than a scroll.
 */

import { useState } from 'react'
import {
  IconCopy,
  IconInfoCircle,
  IconPlus,
  IconShieldHalf,
  IconTrash,
  IconUsersPlus,
} from '@tabler/icons-react'
import { GhostButton } from './ui/GhostButton'
import { Dock } from './ui/Dock'
import { Modal, Popover } from './ui/Overlay'
import { ConfirmPrompt } from './ui/ConfirmPrompt'
import { usePrompt } from './ui/usePrompt'
import { MemberCard } from './ui/MemberCard'
import { SpeciesMatchup } from './ui/TypeMatchup'
import { AddToTeamModal } from './ui/AddToTeamModal'
import { buildSpecies, newBuildInit, typeIdsFor } from './buildFacts'
import { teamsUsingBuild, type Build } from './model'
import { createBuild, deleteBuild, duplicateBuild, updateBuild, useTeamBuilderData } from './store'
import { goTo } from './tbNav'

export function BuildLibrary({ generation }: { generation: number }) {
  const data = useTeamBuilderData()
  const prompt = usePrompt()

  const newBuild = () => {
    const build = createBuild(newBuildInit(generation))
    goTo({ kind: 'build-form', buildId: build.id, origin: { kind: 'library' } })
  }

  return (
    <section className="tb-screen tb-build-library" data-testid="tb-build-library">
      <header className="tb-screen-head">
        <GhostButton onClick={newBuild} testId="tb-new-build">
          <IconPlus size={18} stroke={1.5} />
          New build
        </GhostButton>
      </header>

      {data.builds.length === 0 ? (
        <div className="tb-empty" data-testid="tb-build-library-empty">
          <p className="tb-empty-note">No builds yet.</p>
        </div>
      ) : (
        <div className="tb-slot-grid" data-testid="tb-build-grid">
          {data.builds.map((build) => (
            <LibraryCard
              key={build.id}
              build={build}
              usedIn={teamsUsingBuild(data, build.id).length}
              onDelete={() =>
                prompt.confirm('Delete this build?', () => deleteBuild(build.id), {
                  body: 'It is removed from every team that uses it.',
                  testId: 'tb-delete-build-prompt',
                })
              }
            />
          ))}
        </div>
      )}

      {prompt.config && <ConfirmPrompt config={prompt.config} onClose={prompt.close} />}
    </section>
  )
}

function LibraryCard({
  build,
  usedIn,
  onDelete,
}: {
  build: Build
  usedIn: number
  onDelete: () => void
}) {
  const [matchup, setMatchup] = useState(false)
  const [info, setInfo] = useState(false)
  const [addTo, setAddTo] = useState(false)
  const facts = buildSpecies(build)

  return (
    <div className="tb-library-cell" data-testid={`tb-build-${build.id}-cell`}>
      <div className="tb-library-dock">
        <Dock
          testId={`tb-build-${build.id}-dock`}
          items={[
            {
              icon: <IconCopy size={18} stroke={1.5} />,
              label: 'Duplicate build',
              onClick: () => duplicateBuild(build.id),
              testId: `tb-build-${build.id}-duplicate`,
            },
            {
              icon: <IconInfoCircle size={18} stroke={1.5} />,
              label: 'Build info',
              onClick: () => setInfo(true),
              testId: `tb-build-${build.id}-info`,
            },
            {
              icon: <IconShieldHalf size={18} stroke={1.5} />,
              label: 'Type matchups',
              onClick: () => setMatchup(true),
              testId: `tb-build-${build.id}-matchup`,
            },
            {
              icon: <IconUsersPlus size={18} stroke={1.5} />,
              label: 'Add to team',
              onClick: () => setAddTo(true),
              testId: `tb-build-${build.id}-add-to-team`,
            },
            {
              icon: <IconTrash size={18} stroke={1.5} />,
              label: 'Delete build',
              onClick: onDelete,
              danger: true,
              testId: `tb-build-${build.id}-delete`,
            },
          ]}
        />
        {matchup && (
          <Popover
            onClose={() => setMatchup(false)}
            testId={`tb-build-${build.id}-matchup-popover`}
          >
            {facts && (
              <SpeciesMatchup
                typeIds={typeIdsFor(facts.variety, build.generation)}
                generation={build.generation}
                title={facts.species.display_name}
              />
            )}
          </Popover>
        )}
      </div>

      <MemberCard
        build={build}
        variant="library"
        testId={`tb-build-${build.id}`}
        onOpen={() => goTo({ kind: 'build-form', buildId: build.id, origin: { kind: 'library' } })}
        footer={
          <div className="tb-library-foot">
            {build.tags.length > 0 && (
              <span className="tb-tags" data-testid={`tb-build-${build.id}-tags`}>
                {build.tags.map((tag) => (
                  <span key={tag} className="tb-tag">
                    {tag}
                  </span>
                ))}
              </span>
            )}
            <span className="tb-used-in" data-testid={`tb-build-${build.id}-used-in`}>
              Used in {usedIn} {usedIn === 1 ? 'team' : 'teams'}
            </span>
          </div>
        }
      />

      {info && (
        <Modal
          title="Build info"
          onClose={() => setInfo(false)}
          testId={`tb-build-${build.id}-info-modal`}
        >
          <label className="tb-field-label" htmlFor={`tags-${build.id}`}>
            Tags (comma separated)
          </label>
          <input
            id={`tags-${build.id}`}
            className="tb-input"
            defaultValue={build.tags.join(', ')}
            data-testid={`tb-build-${build.id}-tags-input`}
            onBlur={(e) =>
              updateBuild(build.id, {
                tags: e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          />
          <textarea
            className="tb-notes"
            defaultValue={build.notes}
            placeholder="Notes about this build"
            aria-label="Build notes"
            data-testid={`tb-build-${build.id}-notes`}
            onBlur={(e) => updateBuild(build.id, { notes: e.target.value })}
          />
        </Modal>
      )}

      {addTo && <AddToTeamModal buildId={build.id} onClose={() => setAddTo(false)} />}
    </div>
  )
}
