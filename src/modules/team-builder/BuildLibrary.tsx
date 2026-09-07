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
  IconListCheck,
  IconPlus,
  IconShieldHalf,
  IconSwords,
  IconTrash,
  IconUsersPlus,
  IconX,
} from '@tabler/icons-react'
import { GhostButton } from './ui/GhostButton'
import { Dock } from './ui/Dock'
import { Modal, Popover } from './ui/Overlay'
import { ConfirmPrompt } from './ui/ConfirmPrompt'
import { usePrompt } from './ui/usePrompt'
import { MemberCard } from './ui/MemberCard'
import { MovesetCoverage, SpeciesMatchup } from './ui/TypeMatchup'
import { BulkBar, SelectCircle } from './ui/BulkSelect'
import { useBulkSelect } from './ui/useBulkSelect'
import { AddToTeamModal } from './ui/AddToTeamModal'
import { buildSpecies, typeIdsFor } from './buildFacts'
import { orderedBuilds, teamsUsingBuild, uiId, type Build } from './model'
import {
  deleteBuild,
  duplicateBuild,
  setTeamMember,
  updateBuild,
  useTeamBuilderData,
} from './store'
import { goTo, type TbScreen } from './tbNav'

export function BuildLibrary({
  pickFor,
}: {
  /* `generation` is no longer read: the form seeds a new member itself, from
     the team's generation when there is one. Kept in the props so the shell
     passes the same shape to all four screens. */
  generation?: number
  /** Set when the library was opened to fill one team slot. See tbNav. */
  pickFor?: { teamId: string; slot: number; then?: 'team' | 'form' }
}) {
  const data = useTeamBuilderData()
  const prompt = usePrompt()
  const bulk = useBulkSelect()
  const libraryBuilds = orderedBuilds(data)

  /* Nothing is created to open the form -- see BuildForm and the shell's
     `new-build` verb, which this has to match or the same button would behave
     differently depending on whether it was pressed here or in the nav. */
  const newBuild = () => {
    goTo({ kind: 'build-form', buildId: null, origin: { kind: 'library' }, slot: null })
  }

  /*
    IN PICK MODE A CARD CLICK PLACES THE BUILD AND GOES BACK, rather than opening
    the form. This is the whole of the "adding an existing build opened the build
    form and lost my team" complaint: the library had no idea it had been opened
    for a reason.
  */
  const picking = pickFor != null

  /*
    A BUILD CANNOT BE ON THE SAME TEAM TWICE, and nothing used to stop it: the
    picker offered every build in the library, including the ones already on the
    team it was filling, so choosing one put the SAME id in two slots. That is
    not a cosmetic duplicate --

      React reported it as two children with the same key, which it documents as
      unsupported and free to duplicate or omit children;
      the coverage panels counted that Pokemon twice, so a team's weaknesses
      were computed against a team it did not have;
      "remove from this team" clears the first matching slot only, leaving the
      other one behind with no way to reach it;
      and it does NOT register as a shared build -- sharing counts teams, not
      slots -- so editing it changed both slots with no prompt.

    Hidden rather than shown-and-disabled: a disabled card in a grid of
    identical cards is a puzzle, and the note above the grid says what happened.
  */
  const onTeamAlready = new Set(
    pickFor
      ? (data.teams
          .find((t) => t.id === pickFor.teamId)
          ?.memberIds.filter((m): m is string => m != null) ?? [])
      : [],
  )
  const pickable = picking
    ? libraryBuilds.filter((build) => !onTeamAlready.has(build.id))
    : libraryBuilds
  const hiddenFromPicker = libraryBuilds.length - pickable.length

  /** Where cancelling or picking hands the reader back to. See tbNav. */
  const backFromPick = (buildId: string | null): TbScreen =>
    pickFor?.then === 'form' && buildId != null
      ? {
          kind: 'build-form',
          buildId,
          origin: { kind: 'team', teamId: pickFor.teamId },
          slot: pickFor.slot,
        }
      : { kind: 'team-viewer', teamId: pickFor?.teamId ?? '' }

  const openOrPick = (buildId: string) => {
    if (pickFor) {
      setTeamMember(pickFor.teamId, pickFor.slot, buildId)
      goTo(backFromPick(buildId))
      return
    }
    goTo({ kind: 'build-form', buildId, origin: { kind: 'library' } })
  }

  const deleteSelected = () => {
    const ids = [...bulk.selected]
    if (ids.length === 0) return
    prompt.confirm(
      `Delete ${ids.length} build${ids.length === 1 ? '' : 's'}?`,
      () => {
        ids.forEach((id) => deleteBuild(id))
        bulk.exit()
      },
      {
        body: 'They are removed from every team that uses them.',
        testId: 'tb-bulk-delete-builds-prompt',
        confirmLabel: 'Delete',
      },
    )
  }

  return (
    <section className="tb-screen tb-build-library" data-testid="tb-build-library">
      <header className="tb-screen-head">
        {picking ? (
          <>
            <GhostButton
              bare
              /* CANCEL GOES BACK TO WHERE THE PICK STARTED, which for the
                 Build Form's rail is the team, not the form -- there is no
                 build to load, and the form is still where it was. */
              onClick={() => goTo({ kind: 'team-viewer', teamId: pickFor.teamId })}
              testId="tb-pick-cancel"
            >
              <IconX size={18} stroke={1.5} />
              Cancel
            </GhostButton>
            <span className="tb-pick-note" data-testid="tb-pick-note">
              Pick a build to add to the team
              {hiddenFromPicker > 0 &&
                ` — ${hiddenFromPicker} already on it ${hiddenFromPicker === 1 ? 'is' : 'are'} hidden`}
            </span>
          </>
        ) : (
          <>
            <GhostButton onClick={newBuild} testId="tb-new-build">
              <IconPlus size={18} stroke={1.5} />
              New build
            </GhostButton>
            <div className="tb-dock-anchor tb-library-dock-anchor">
              <Dock
                testId="tb-builds-dock"
                items={[
                  {
                    icon: <IconListCheck size={18} stroke={1.5} />,
                    label: 'Select builds',
                    onClick: bulk.enter,
                    testId: 'tb-builds-select',
                  },
                ]}
              />
            </div>
          </>
        )}
      </header>

      {bulk.active && (
        <BulkBar
          count={bulk.selected.size}
          noun="build"
          onCancel={bulk.exit}
          onDelete={deleteSelected}
          testId="tb-builds-bulk"
        />
      )}

      {/* A MEMBER BEING BUILT RIGHT NOW IS NOT HERE. It has no record until it is
          saved, so there is nothing to list -- and legacy `draft` rows are
          filtered by `orderedBuilds`. */}
      {pickable.length === 0 ? (
        <div className="tb-empty" data-testid="tb-build-library-empty">
          <p className="tb-empty-note">
            {picking && libraryBuilds.length > 0
              ? 'Every build in your library is already on this team.'
              : 'No builds yet.'}
          </p>
        </div>
      ) : (
        <div className="tb-build-grid" data-testid="tb-build-grid">
          {pickable.map((build) => (
            <LibraryCard
              key={build.id}
              build={build}
              /* NUMBERED AGAINST THE WHOLE LIBRARY, not against what is on
                 screen. In pick mode some cards are hidden, and renumbering the
                 survivors 1..n would give a build a different number depending
                 on which team you happened to be filling. */
              label={uiId(libraryBuilds.indexOf(build))}
              usedIn={teamsUsingBuild(data, build.id).length}
              selecting={bulk.active}
              selectProps={bulk.itemProps(build.id)}
              onOpen={() => openOrPick(build.id)}
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
  label,
  usedIn,
  selecting,
  selectProps,
  onOpen,
  onDelete,
}: {
  build: Build
  /** The "#001", derived from position by the caller. */
  label: string
  usedIn: number
  selecting: boolean
  selectProps: {
    selected: boolean
    onPointerDown: (e: React.PointerEvent) => void
    onPointerEnter: () => void
  }
  onOpen: () => void
  onDelete: () => void
}) {
  const [matchup, setMatchup] = useState(false)
  const [offence, setOffence] = useState(false)
  const [info, setInfo] = useState(false)
  const [addTo, setAddTo] = useState(false)
  const facts = buildSpecies(build)

  return (
    <div
      className="tb-library-cell"
      data-testid={`tb-build-${build.id}-cell`}
      data-selected={selecting && selectProps.selected ? 'true' : undefined}
      onPointerEnter={selecting ? selectProps.onPointerEnter : undefined}
    >
      {selecting && (
        <span className="tb-library-check">
          <SelectCircle
            {...selectProps}
            label={`Select build ${label}`}
            testId={`tb-build-${build.id}-check`}
          />
        </span>
      )}
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
              label: 'Defensive type coverage',
              onClick: () => setMatchup(true),
              testId: `tb-build-${build.id}-matchup`,
            },
            {
              icon: <IconSwords size={18} stroke={1.5} />,
              label: 'Attacking type coverage',
              onClick: () => setOffence(true),
              testId: `tb-build-${build.id}-offence`,
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
                abilityId={build.abilityId}
                generation={build.generation}
                title={facts.species.display_name}
              />
            )}
          </Popover>
        )}
        {offence && (
          <Popover
            onClose={() => setOffence(false)}
            testId={`tb-build-${build.id}-offence-popover`}
          >
            <MovesetCoverage
              moveIds={build.moveIds}
              generation={build.generation}
              title={facts?.species.display_name ?? 'This build'}
            />
          </Popover>
        )}
      </div>

      <MemberCard
        build={build}
        variant="library"
        testId={`tb-build-${build.id}`}
        /* In selection mode the card is inert: the circle and the sweep own the
           pointer, and a card that also opened would fight them. */
        onOpen={selecting ? undefined : onOpen}
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
            <span className="tb-build-id num" data-testid={`tb-build-${build.id}-label`}>
              {label}
            </span>
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
