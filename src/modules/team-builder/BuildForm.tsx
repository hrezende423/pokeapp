/**
 * Screen 4: one build, everything about it.
 *
 * AUTOSAVE, NO SAVE BUTTON, with exactly one exception. Every field writes through
 * on change or blur. The exception is a build attached to 2+ TEAMS: editing one of
 * those silently changes every team that uses it, so leaving after an edit asks
 * whether to save back, discard, or fork into a new build. A build on one team, or
 * on none, just saves.
 *
 * THE DRAFT ONLY EXISTS FOR SHARED BUILDS. An unshared build writes straight to
 * the store, so there is nothing to lose and nothing to reconcile. A shared one
 * edits a local copy until you leave. That is why `commit` branches on `isShared`
 * rather than always buffering.
 *
 * KEY-REMOUNTED ON `buildId`. Re-seeding the draft in an effect when the id
 * changes would be a synchronous setState in an effect body; remounting is both
 * legal and simpler, and it guarantees no field keeps a previous build's value.
 *
 * GENERATION GATES MOST OF THIS SCREEN and each gate is a real mechanic, not a
 * tidy-up: no items or friendship before Gen 2, no abilities or natures before
 * Gen 3, no shiny at all in Gen 1 and no shiny FLAG in Gen 2 (it is a DV spread
 * there), and no Hidden Power in Gen 1.
 */

import { useState } from 'react'
import {
  IconChevronLeft,
  IconCopy,
  IconInfoCircle,
  IconPlus,
  IconRotate,
  IconShieldHalf,
  IconTrash,
  IconUsersPlus,
} from '@tabler/icons-react'
import { TypeLabel } from '../../components/ds/TypeLabel'
import { listSpecies, resolveArtworkUrl } from '../../data'
import { GhostButton, IconButton } from './ui/GhostButton'
import { Dock } from './ui/Dock'
import { Modal, Popover } from './ui/Overlay'
import { ConfirmPrompt } from './ui/ConfirmPrompt'
import { usePrompt } from './ui/usePrompt'
import { MemberCard } from './ui/MemberCard'
import { SpeciesMatchup } from './ui/TypeMatchup'
import { AddToTeamModal } from './ui/AddToTeamModal'
import { StatTable } from './ui/StatTable'
import { MoveSlots } from './ui/MoveSlots'
import { SpreadControls } from './ui/SpreadControls'
import {
  abilityOptionsFor,
  buildSpecies,
  genderOptionsFor,
  itemOptionsFor,
  natureOptionsFor,
  newBuildInit,
  typeIdsFor,
} from './buildFacts'
import { clearMoveSlot, setMoveSlot, teamLabel, teamsUsingBuild, type Build } from './model'
import { hiddenPower, isShinyByDvs, type StatNumbers } from './statMath'
import {
  createBuild,
  createTeam,
  deleteBuild,
  duplicateBuild,
  forkBuildInTeam,
  setTeamMember,
  updateBuild,
  useTeamBuilderData,
} from './store'
import { goTo, type BuildOrigin } from './tbNav'
import { useLegalMoveset } from './useLegalMoveset'

export function BuildForm(props: { buildId: string; origin: BuildOrigin; generation: number }) {
  /* Remount on id change rather than re-seeding the draft in an effect. */
  return <BuildFormFields key={props.buildId} {...props} />
}

function BuildFormFields({
  buildId,
  origin,
}: {
  buildId: string
  origin: BuildOrigin
  generation: number
}) {
  const data = useTeamBuilderData()
  const prompt = usePrompt()
  const stored = data.builds.find((b) => b.id === buildId) ?? null

  const [draft, setDraft] = useState<Build | null>(stored)
  const [dirty, setDirty] = useState(false)
  const [matchup, setMatchup] = useState(false)
  const [info, setInfo] = useState(false)
  const [addTo, setAddTo] = useState(false)
  const [railOpen, setRailOpen] = useState(false)
  const [shinyLock, setShinyLock] = useState(() =>
    stored ? isShinyByDvs(stored.individual) : false,
  )

  const attachedTeams = stored ? teamsUsingBuild(data, stored.id) : []
  const isShared = attachedTeams.length >= 2
  const build = (isShared ? draft : stored) ?? stored

  const moveset = useLegalMoveset({
    speciesId: build?.speciesId ?? 1,
    pokemonId: build?.pokemonId ?? 1,
    level: build?.level ?? 1,
    generation: build?.generation ?? 1,
  })

  if (!build || !stored) {
    return (
      <section className="tb-screen" data-testid="tb-build-form">
        <p className="tb-empty-note">This build no longer exists.</p>
        <GhostButton onClick={() => goTo({ kind: 'build-library' })}>Build Library</GhostButton>
      </section>
    )
  }

  const facts = buildSpecies(build)
  const generation = build.generation

  /**
   * Write a change through -- or hold it in the draft when the build is shared.
   */
  const commit = (patch: Partial<Build>) => {
    if (isShared) {
      setDraft({ ...build, ...patch })
      setDirty(true)
      return
    }
    updateBuild(build.id, patch)
  }

  /**
   * EVERY exit from this screen funnels through here, so the shared-build prompt
   * cannot be bypassed by taking a different route out.
   */
  const attemptLeave = (go: () => void) => {
    if (!isShared || !dirty) {
      go()
      return
    }
    prompt.ask({
      title: 'This build is used by more than one team',
      body: `Saving changes it for all ${attachedTeams.length} teams that use it (${attachedTeams
        .map((t) => teamLabel(t))
        .join(', ')}).`,
      testId: 'tb-shared-prompt',
      actions: [
        {
          label: 'Save to all teams',
          testId: 'tb-shared-save',
          onPick: () => {
            updateBuild(build.id, build)
            go()
          },
        },
        {
          label: 'Save as a new build',
          testId: 'tb-shared-fork',
          onPick: () => {
            if (origin.kind === 'team') forkBuildInTeam(stored.id, build, origin.teamId)
            else createBuild({ ...build })
            go()
          },
        },
        { label: 'Discard changes', danger: true, testId: 'tb-shared-discard', onPick: go },
      ],
    })
  }

  const back = () =>
    attemptLeave(() =>
      origin.kind === 'team'
        ? goTo({ kind: 'team-viewer', teamId: origin.teamId })
        : goTo({ kind: 'build-library' }),
    )

  const genderOptions = facts ? genderOptionsFor(facts.species) : null
  const abilityOptions = facts ? abilityOptionsFor(facts.variety, generation) : []
  const itemOptions = itemOptionsFor(generation)
  const natureOptions = natureOptionsFor(generation)
  const hp = generation >= 2 ? hiddenPower(generation, build.individual) : null

  const railTeam =
    origin.kind === 'team'
      ? (data.teams.find((t) => t.id === origin.teamId) ?? null)
      : (attachedTeams[0] ?? null)

  const art = facts
    ? resolveArtworkUrl(facts.species, facts.variety, {
        source: 'artwork',
        motion: 'static',
        shiny: generation === 2 ? isShinyByDvs(build.individual) : build.shiny,
        gender: build.gender === 'female' ? 'female' : 'male',
      })
    : null

  return (
    <section
      className="tb-screen tb-build-form"
      data-testid="tb-build-form"
      data-build-id={build.id}
    >
      <header className="tb-screen-head">
        <GhostButton onClick={back} testId="tb-build-back">
          <IconChevronLeft size={18} stroke={1.5} />
          {origin.kind === 'team' ? 'Back to team' : 'Build Library'}
        </GhostButton>
        <div className="tb-dock-anchor">
          <Dock
            testId="tb-form-dock"
            items={[
              {
                icon: <IconCopy size={18} stroke={1.5} />,
                label: 'Duplicate build',
                onClick: () => duplicateBuild(build.id),
                testId: 'tb-form-duplicate',
              },
              {
                icon: <IconInfoCircle size={18} stroke={1.5} />,
                label: 'Build info',
                onClick: () => setInfo(true),
                testId: 'tb-form-info',
              },
              {
                icon: <IconShieldHalf size={18} stroke={1.5} />,
                label: 'Type matchups',
                onClick: () => setMatchup(true),
                testId: 'tb-form-matchup',
              },
              {
                icon: <IconUsersPlus size={18} stroke={1.5} />,
                label: 'Add to other team',
                onClick: () => setAddTo(true),
                testId: 'tb-form-add-to-team',
              },
              {
                icon: <IconRotate size={18} stroke={1.5} />,
                label: 'Reset build',
                testId: 'tb-form-reset',
                onClick: () =>
                  prompt.confirm(
                    'Reset this build?',
                    () =>
                      /* Clears item, moves, level, friendship, nickname, spread and
                         shiny. KEEPS species, nature, ability and gender -- those are
                         identity, not tuning. */
                      commit({
                        itemId: null,
                        moveIds: [null, null, null, null],
                        level: 1,
                        friendship: 0,
                        nickname: '',
                        effort: {},
                        individual: {},
                        shiny: false,
                      }),
                    { confirmLabel: 'Reset', testId: 'tb-reset-prompt' },
                  ),
              },
              {
                icon: <IconTrash size={18} stroke={1.5} />,
                label: 'Delete build',
                danger: true,
                testId: 'tb-form-delete',
                onClick: () =>
                  prompt.confirm(
                    'Delete this build?',
                    () => {
                      deleteBuild(build.id)
                      goTo(
                        origin.kind === 'team'
                          ? { kind: 'team-viewer', teamId: origin.teamId }
                          : { kind: 'build-library' },
                      )
                    },
                    { testId: 'tb-delete-build-prompt' },
                  ),
              },
            ]}
          />
          {matchup && (
            <Popover onClose={() => setMatchup(false)} testId="tb-form-matchup-popover">
              {facts && (
                <SpeciesMatchup
                  typeIds={typeIdsFor(facts.variety, generation)}
                  generation={generation}
                  title={facts.species.display_name}
                />
              )}
            </Popover>
          )}
        </div>
      </header>

      <div className="tb-form-grid">
        {/* ------------------------------------------------- identity panel */}
        <aside className="tb-identity" data-testid="tb-identity">
          <div className="tb-identity-art">
            <span className="tb-card-ghost" aria-hidden>
              {String(build.speciesId).padStart(3, '0')}
            </span>
            {facts?.species.name_ja && (
              <span className="tb-card-ghost-ja" aria-hidden>
                {facts.species.name_ja}
              </span>
            )}
            {art && <img src={art} alt="" />}
          </div>

          <div className="tb-types-row" data-testid="tb-type-row">
            {facts?.types.map((type, i) => (
              <span key={type}>
                {i > 0 && <span className="tb-type-sep">·</span>}
                <TypeLabel type={type} />
              </span>
            ))}
          </div>

          <Field label="Pokémon">
            <select
              className="tb-select"
              value={build.speciesId}
              data-testid="tb-species"
              onChange={(e) => {
                const speciesId = Number(e.target.value)
                /* A species change re-derives gender and ability: the old values
                   may be impossible for the new species. */
                const fresh = newBuildInit(generation, speciesId)
                commit({
                  speciesId,
                  pokemonId: fresh.pokemonId,
                  gender: fresh.gender,
                  abilityId: fresh.abilityId,
                  moveIds: [null, null, null, null],
                })
              }}
            >
              {listSpecies().map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Nickname">
            <input
              className="tb-input"
              defaultValue={build.nickname}
              data-testid="tb-nickname"
              onBlur={(e) => commit({ nickname: e.target.value })}
            />
          </Field>

          {/* Genderless: the field is ABSENT, not disabled and not dashed. */}
          {genderOptions && (
            <Field label="Gender">
              <select
                className="tb-select"
                value={build.gender ?? ''}
                disabled={genderOptions.length === 1}
                data-testid="tb-gender"
                onChange={(e) => commit({ gender: e.target.value as 'male' | 'female' })}
              >
                {genderOptions.map((g) => (
                  <option key={g} value={g}>
                    {g === 'male' ? '♂ Male' : '♀ Female'}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {generation >= 3 && (
            <Field label="Shiny">
              <input
                type="checkbox"
                className="tb-toggle"
                checked={build.shiny}
                data-testid="tb-shiny"
                onChange={(e) => commit({ shiny: e.target.checked })}
              />
            </Field>
          )}
          {generation === 2 && (
            /* READ-ONLY in Gen 2: shininess there is a fact about the DV spread. */
            <Field label="Shiny">
              <span className="tb-readout" data-testid="tb-shiny-computed">
                {isShinyByDvs(build.individual) ? 'Yes' : 'No'}
              </span>
            </Field>
          )}

          {facts && (
            <>
              <p className="tb-genus">{facts.species.genus}</p>
              <p className="tb-ja">{facts.species.name_ja_romanized}</p>
            </>
          )}

          {facts && <StatTable build={build} facts={facts} />}
        </aside>

        {/* ---------------------------------------------------- main column */}
        <div className="tb-form-main">
          <div className="tb-field-row">
            {generation >= 2 && (
              <Field label="Item">
                <select
                  className="tb-select"
                  value={build.itemId ?? ''}
                  data-testid="tb-item"
                  onChange={(e) =>
                    commit({ itemId: e.target.value === '' ? null : Number(e.target.value) })
                  }
                >
                  <option value="">—</option>
                  {itemOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {generation >= 3 && (
              <Field label="Ability">
                <select
                  className="tb-select"
                  value={build.abilityId ?? ''}
                  disabled={abilityOptions.length <= 1}
                  data-testid="tb-ability"
                  onChange={(e) => commit({ abilityId: Number(e.target.value) })}
                >
                  {abilityOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {generation >= 3 && (
              <Field label="Nature">
                <select
                  className="tb-select"
                  value={build.natureId ?? ''}
                  data-testid="tb-nature"
                  onChange={(e) =>
                    commit({ natureId: e.target.value === '' ? null : Number(e.target.value) })
                  }
                >
                  <option value="">—</option>
                  {natureOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <div className="tb-field-row">
            <Field label="Level">
              <input
                type="number"
                className="tb-number"
                min={1}
                max={100}
                value={build.level}
                data-testid="tb-level"
                onChange={(e) =>
                  commit({ level: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })
                }
              />
            </Field>
            {generation >= 2 && (
              <Field label="Friendship">
                <input
                  type="number"
                  className="tb-number"
                  min={0}
                  max={255}
                  value={build.friendship}
                  data-testid="tb-friendship"
                  onChange={(e) =>
                    commit({
                      friendship: Math.min(255, Math.max(0, Number(e.target.value) || 0)),
                    })
                  }
                />
              </Field>
            )}
            {hp && (
              <>
                <Field label="HP Type">
                  <span className="tb-readout" data-testid="tb-hidden-power-type">
                    <TypeLabel type={hp.type} />
                  </span>
                </Field>
                <Field label="HP Power">
                  <span className="tb-readout num" data-testid="tb-hidden-power-value">
                    {hp.power}
                  </span>
                </Field>
              </>
            )}
          </div>

          <MoveSlots
            moveIds={build.moveIds}
            generation={generation}
            options={moveset.moves}
            loading={moveset.status === 'loading'}
            failed={moveset.failed}
            onChange={(slot, moveId) =>
              commit({
                moveIds:
                  moveId == null
                    ? clearMoveSlot(build.moveIds, slot)
                    : setMoveSlot(build.moveIds, slot, moveId),
              })
            }
          />

          <SpreadControls
            build={build}
            shinyLock={shinyLock}
            onShinyLock={setShinyLock}
            onEffort={(effort: StatNumbers) => commit({ effort })}
            onIndividual={(individual: StatNumbers) => commit({ individual })}
          />
        </div>

        {/* ----------------------------------------------------- right rail */}
        <aside
          className="tb-rail"
          data-testid="tb-rail"
          data-state={railTeam ? 'attached' : 'loose'}
        >
          {railTeam ? (
            <>
              {railTeam.memberIds
                .filter((id): id is string => id != null && id !== build.id)
                .map((id) => data.builds.find((b) => b.id === id))
                .filter((b): b is Build => b != null)
                .map((member) => (
                  <MemberCard
                    key={member.id}
                    build={member}
                    variant="rail"
                    testId={`tb-rail-${member.id}`}
                    onOpen={() =>
                      attemptLeave(() =>
                        goTo({
                          kind: 'build-form',
                          buildId: member.id,
                          origin: { kind: 'team', teamId: railTeam.id },
                        }),
                      )
                    }
                  />
                ))}
              <IconButton
                icon={<IconPlus size={20} stroke={1.5} />}
                label="Add member"
                testId="tb-rail-add"
                onClick={() => {
                  const slot = railTeam.memberIds.findIndex((m) => m == null)
                  if (slot === -1) return
                  const fresh = createBuild(newBuildInit(railTeam.generation))
                  setTeamMember(railTeam.id, slot, fresh.id)
                  goTo({
                    kind: 'build-form',
                    buildId: fresh.id,
                    origin: { kind: 'team', teamId: railTeam.id },
                  })
                }}
              />
            </>
          ) : railOpen ? (
            /*
              An UNATTACHED build's rail expands to a single "+", which creates a
              team around this build. The rail then flips to the attached state on
              its own, because `railTeam` is derived from the store rather than
              from local state.
            */
            <IconButton
              icon={<IconPlus size={20} stroke={1.5} />}
              label="Start a team with this build"
              testId="tb-rail-create-team"
              onClick={() => createTeam(generation, [build.id])}
            />
          ) : (
            <IconButton
              icon={<IconChevronLeft size={20} stroke={1.5} />}
              label="Show team"
              testId="tb-rail-expand"
              onClick={() => setRailOpen(true)}
            />
          )}
          {railTeam && (
            <span className="tb-rail-team num" data-testid="tb-rail-team">
              {teamLabel(railTeam)}
            </span>
          )}
        </aside>
      </div>

      {info && (
        <Modal title="Build info" onClose={() => setInfo(false)} testId="tb-form-info-modal">
          <label className="tb-field-label" htmlFor="tb-form-tags">
            Tags (comma separated)
          </label>
          <input
            id="tb-form-tags"
            className="tb-input"
            defaultValue={build.tags.join(', ')}
            data-testid="tb-form-tags"
            onBlur={(e) =>
              commit({
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
            data-testid="tb-form-notes"
            onBlur={(e) => commit({ notes: e.target.value })}
          />
        </Modal>
      )}

      {addTo && <AddToTeamModal buildId={build.id} onClose={() => setAddTo(false)} />}
      {prompt.config && <ConfirmPrompt config={prompt.config} onClose={prompt.close} />}

      {isShared && (
        <span className="tb-shared-note" data-testid="tb-shared-note">
          Used by {attachedTeams.length} teams
        </span>
      )}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="tb-field">
      <span className="tb-field-label">{label}</span>
      {children}
    </label>
  )
}
