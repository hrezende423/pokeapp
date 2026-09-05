/**
 * Screen 4: one build, everything about it.
 *
 * EVERY EDIT IS A DRAFT. Typing, dragging a slider and picking from a dropdown
 * all change local state and NOTHING ELSE -- the store is written only at the
 * save points listed below. This replaced a write-through-on-every-change model,
 * which meant a build half-way through being set up was continuously persisted:
 * every intermediate state of it was, briefly, the saved state, and abandoning an
 * edit half-done left that half in the library.
 *
 * THE SAVE POINTS, all of them:
 *   - leaving by the back control (Back to team / Build Library)
 *   - opening another member from the right rail
 *   - adding a member from the right rail, or starting a team from this build
 *   - duplicating: the ORIGINAL is saved, then the copy is made from it and the
 *     form switches to the copy, so the edit you were making lands in both
 *   - adding this build to another team
 *   - Reset, which is confirmed and destructive, so it sticks immediately
 *   - unmounting for ANY other reason, which is what covers leaving through the
 *     global app nav bar, and `pagehide`, which covers closing the tab
 * Delete is the one exit that deliberately does not save: the record is going.
 *
 * THE UNMOUNT FLUSH READS A REF, NOT STATE. Its cleanup runs after the last
 * render, so state read there could be a render behind; `pending` is written
 * synchronously by every edit and cleared by every save, which makes it the
 * honest answer to "is there anything to write". It is only ever touched in
 * handlers and effects, never during render.
 *
 * A SHARED BUILD (2+ teams) STILL PROMPTS, because saving it changes every team
 * that uses it. That prompt is the reason saves funnel through `saveThen` rather
 * than each call site writing for itself -- there is one place that can ask.
 * The unmount flush cannot ask, so for a shared build it declines to write: the
 * failure direction is "the shared build is untouched", never "six teams changed
 * without being asked".
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

import { useCallback, useEffect, useRef, useState } from 'react'
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
  itemArtFor,
  itemName,
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
  readData,
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

  /*
    The unsaved draft, or null when there is nothing outstanding. Deliberately a
    ref and not derived from `draft`/`dirty`: the unmount flush needs the value
    as of the last EDIT, not as of the last render.
  */
  const pending = useRef<Build | null>(null)

  const attachedTeams = stored ? teamsUsingBuild(data, stored.id) : []
  const isShared = attachedTeams.length >= 2
  const build = draft ?? stored

  /** Write the outstanding draft. The ONLY function in this file that saves. */
  const flush = useCallback(() => {
    const next = pending.current
    if (!next) return
    pending.current = null
    updateBuild(next.id, next)
  }, [])

  /*
    The safety net under every exit this component does not own: the global app
    nav bar, a module switch, a browser tab closing. `pagehide` rather than
    `beforeunload` because it fires on mobile backgrounding too, and localStorage
    is synchronous so there is nothing to await.

    It REFUSES to write a shared build, because at this point there is nobody
    left to ask which of the three answers the user wanted.
  */
  useEffect(() => {
    const flushUnattended = () => {
      const next = pending.current
      if (!next) return
      if (teamsUsingBuild(readData(), next.id).length >= 2) return
      flush()
    }
    window.addEventListener('pagehide', flushUnattended)
    return () => {
      window.removeEventListener('pagehide', flushUnattended)
      flushUnattended()
    }
  }, [flush])

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
   * Record a field change. Draft only -- this does NOT touch the store.
   *
   * `pending` is written here rather than in an effect so the unmount flush can
   * see an edit that never got a chance to re-render.
   */
  const commit = (patch: Partial<Build>) => {
    const next = { ...build, ...patch }
    pending.current = next
    setDraft(next)
    setDirty(true)
  }

  /**
   * SAVE, THEN DO THE THING. Every save point in this screen calls this, so the
   * shared-build question is asked in one place and cannot be bypassed by taking
   * a different route out.
   *
   * `after` runs in all three shared-build branches, discard included: the
   * question is what happens to the EDIT, not whether the user gets to leave.
   */
  const saveThen = (after: () => void) => {
    if (!pending.current) {
      after()
      return
    }
    if (!isShared) {
      flush()
      setDirty(false)
      after()
      return
    }
    const edited = pending.current
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
            flush()
            setDirty(false)
            after()
          },
        },
        {
          label: 'Save as a new build',
          testId: 'tb-shared-fork',
          onPick: () => {
            /* The copy takes the edit; the original keeps what it had. Clearing
               `pending` first is what stops the unmount flush writing the edit
               back onto the original a moment later. */
            pending.current = null
            setDirty(false)
            if (origin.kind === 'team') forkBuildInTeam(stored.id, edited, origin.teamId)
            else createBuild({ ...edited })
            after()
          },
        },
        {
          label: 'Discard changes',
          danger: true,
          testId: 'tb-shared-discard',
          onPick: () => {
            pending.current = null
            setDirty(false)
            setDraft(stored)
            after()
          },
        },
      ],
    })
  }

  const back = () =>
    saveThen(() =>
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

  /* Gen 1 has no held items, so no badge -- not an empty one. */
  const heldArt = generation >= 2 ? itemArtFor(build.itemId) : null

  /*
    THE DOCK IS BUILT HERE, RENDERED BESIDE THE RAIL. Three of its six actions
    are save points, so the list has to be in scope of `saveThen`; where it is
    drawn is a layout question and is answered further down.
  */
  const dockItems = [
    {
      icon: <IconCopy size={18} stroke={1.5} />,
      label: 'Duplicate build',
      testId: 'tb-form-duplicate',
      /* SAVE FIRST, then copy, then follow the copy. `duplicateBuild` reads the
         STORE, so without the save the copy would be of the build as it was
         before this editing session -- the edit would appear to vanish. */
      onClick: () =>
        saveThen(() => {
          const copy = duplicateBuild(build.id)
          if (copy) goTo({ kind: 'build-form', buildId: copy.id, origin })
        }),
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
      /* Save first: the team is about to point at this build, and it should
         point at what is on screen rather than at the last saved version. */
      onClick: () => saveThen(() => setAddTo(true)),
      testId: 'tb-form-add-to-team',
    },
    {
      icon: <IconRotate size={18} stroke={1.5} />,
      label: 'Reset build',
      testId: 'tb-form-reset',
      onClick: () =>
        prompt.confirm(
          'Reset this build?',
          () => {
            /* Clears item, moves, level, friendship, nickname, spread and shiny.
               KEEPS species, nature, ability and gender -- those are identity,
               not tuning. Confirmed and destructive, so unlike an ordinary field
               edit it is written straight through rather than left in the draft. */
            const reset = {
              ...build,
              itemId: null,
              moveIds: [null, null, null, null],
              level: 1,
              friendship: 0,
              nickname: '',
              effort: {},
              individual: {},
              shiny: false,
            }
            pending.current = reset
            setDraft(reset)
            flush()
            setDirty(false)
          },
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
            /* The one exit that must NOT save. Dropping `pending` first stops the
               unmount flush resurrecting the record we are deleting. */
            pending.current = null
            setDirty(false)
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
  ]

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
        <GhostButton onClick={back} testId="tb-build-back" bare>
          <IconChevronLeft size={18} stroke={1.5} />
          {origin.kind === 'team' ? 'Back to team' : 'Build Library'}
        </GhostButton>
        {/*
          There is no Save button by design, so the only honest way to say "this
          is not written down yet" is to say it. It is a status, not a control.
        */}
        {dirty && (
          <span className="tb-dirty-note" data-testid="tb-dirty-note">
            Unsaved changes
          </span>
        )}
      </header>

      <div className="tb-form-grid" data-layout="form-grid">
        {/* ------------------------------------------------- identity panel */}
        <aside className="tb-identity" data-layout="identity" data-testid="tb-identity">
          {/*
            Four layers, back to front: the dex numeral, the katakana name, the
            sprite, and the held item in the bottom-right corner. The two
            watermarks sit BEHIND the sprite by design -- they are texture, not
            labels -- which is why the numeral is anchored top and the katakana
            left, where a centred sprite leaves them room to read.
          */}
          <div className="tb-identity-art" data-layout="identity-art" data-testid="tb-identity-art">
            <span className="tb-card-ghost" aria-hidden>
              {String(build.speciesId).padStart(3, '0')}
            </span>
            {facts?.species.name_ja && (
              <span className="tb-card-ghost-ja" aria-hidden>
                {facts.species.name_ja}
              </span>
            )}
            {art && <img className="tb-identity-sprite" src={art} alt="" />}
            {heldArt && (
              <img
                className="tb-held-item"
                src={heldArt.artwork}
                alt=""
                title={itemName(build.itemId)}
                data-testid="tb-held-item"
                /* Roughly half the bag has no Dream World render. Falling back to
                   the 30x30 game icon on the 404 is what itemArtwork.ts asks for;
                   `data-fallback` is what tells the CSS to draw it pixelated. */
                onError={(e) => {
                  const img = e.currentTarget
                  if (img.dataset.fallback === 'true') return
                  img.dataset.fallback = 'true'
                  img.src = heldArt.icon
                }}
              />
            )}
            {generation >= 3 && (
              <span className="tb-shiny-dock">
                <span className="tb-field-label">Shiny</span>
                <span className="tb-switch">
                  <input
                    type="checkbox"
                    checked={build.shiny}
                    aria-label="Shiny"
                    data-testid="tb-shiny"
                    onChange={(e) => commit({ shiny: e.target.checked })}
                  />
                  <span className="tb-switch-track" aria-hidden />
                </span>
              </span>
            )}
            {generation === 2 && (
              /* READ-ONLY in Gen 2: shininess there is a fact about the DV spread. */
              <span className="tb-shiny-dock">
                <span className="tb-field-label">Shiny</span>
                <span className="tb-readout" data-testid="tb-shiny-computed">
                  {isShinyByDvs(build.individual) ? 'Yes' : 'No'}
                </span>
              </span>
            )}
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

          {facts && (
            <div className="tb-stats-block">
              <span className="tb-field-label">Stats</span>
              <StatTable build={build} facts={facts} />
            </div>
          )}

          {facts && (
            <>
              <p className="tb-genus">{facts.species.genus}</p>
              <p className="tb-ja">{facts.species.name_ja_romanized}</p>
            </>
          )}
        </aside>

        {/* ---------------------------------------------------- main column */}
        <div className="tb-form-main" data-layout="main">
          <div className="tb-field-row" data-layout="field-row">
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
          </div>

          <div className="tb-field-row" data-layout="field-row">
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
              /*
                DISABLED, NOT MERELY READ-ONLY. Hidden Power is derived from the
                DV/IV spread -- you change it by changing the spread below, never
                here -- so both fields carry the same dimmed, not-allowed
                treatment the form's other unavailable controls do. The type
                keeps its colour: it is still the era-correct answer, and
                greying it out would hide the one fact the field exists to show.
              */
              <>
                <Field label="HP Type">
                  <span
                    className="tb-readout"
                    data-disabled="true"
                    aria-disabled="true"
                    title="Derived from the IV spread"
                    data-testid="tb-hidden-power-type"
                  >
                    <TypeLabel type={hp.type} />
                  </span>
                </Field>
                <Field label="HP Power">
                  <span
                    className="tb-readout num"
                    data-disabled="true"
                    aria-disabled="true"
                    title="Derived from the IV spread"
                    data-testid="tb-hidden-power-value"
                  >
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

        {/*
          THE DOCK, immediately left of the rail rather than up in the page's
          top-right corner. Up there it read as belonging to the app bar above
          it; here it sits against the thing it acts on, and the form's own top
          row is left to the back control alone.
        */}
        <div className="tb-form-dock-col tb-dock-anchor" data-layout="dock-col">
          <Dock testId="tb-form-dock" items={dockItems} />
          {matchup && (
            <Popover
              onClose={() => setMatchup(false)}
              align="right"
              testId="tb-form-matchup-popover"
            >
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

        {/* ----------------------------------------------------- right rail */}
        <aside
          className="tb-rail"
          data-layout="rail"
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
                    /* Save point: opening a sibling replaces this form. */
                    onOpen={() =>
                      saveThen(() =>
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
                /* Save point, and it used to be a hole: this bypassed the leave
                   path entirely, so adding a member silently threw away whatever
                   you had just typed into the build you were on. */
                onClick={() =>
                  saveThen(() => {
                    const slot = railTeam.memberIds.findIndex((m) => m == null)
                    if (slot === -1) return
                    const fresh = createBuild(newBuildInit(railTeam.generation))
                    setTeamMember(railTeam.id, slot, fresh.id)
                    goTo({
                      kind: 'build-form',
                      buildId: fresh.id,
                      origin: { kind: 'team', teamId: railTeam.id },
                    })
                  })
                }
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
              /* Save point: the new team is about to reference this build. */
              onClick={() => saveThen(() => createTeam(generation, [build.id]))}
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
