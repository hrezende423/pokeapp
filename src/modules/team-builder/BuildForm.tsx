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
  IconDeviceFloppy,
  IconInfoCircle,
  IconPlus,
  IconRotate,
  IconShieldHalf,
  IconSwords,
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
import { MovesetCoverage, SpeciesMatchup } from './ui/TypeMatchup'
import { InfoTip } from './ui/InfoTip'
import { AddToTeamModal } from './ui/AddToTeamModal'
import { StatTable } from './ui/StatTable'
import { MoveSlots } from './ui/MoveSlots'
import { SpreadControls } from './ui/SpreadControls'
import {
  abilityEffectFor,
  abilityName,
  abilityOptionsFor,
  buildSpecies,
  displayName,
  isPristineBuild,
  itemEffectFor,
  genderOptionsFor,
  itemArtFor,
  itemName,
  itemOptionsFor,
  natureOptionsFor,
  newBuildInit,
  typeIdsFor,
} from './buildFacts'
import {
  NICKNAME_MAX,
  clearMoveSlot,
  setMoveSlot,
  teamUiId,
  teamsUsingBuild,
  type Build,
} from './model'
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
  const [offence, setOffence] = useState(false)
  const [info, setInfo] = useState(false)
  const [addTo, setAddTo] = useState(false)
  /*
    The info modal's two fields, read from the DOM when it closes.

    ITS FIELDS SAVE THEMSELVES, which is UC12 and needed two fixes. They used to
    call `commit`, which only STAGES into the form's pending draft -- so a note
    was never really saved, it was merely queued behind whatever the main form
    was doing. And they saved on blur, which never fires when the modal is
    dismissed with Escape or an outside click: React unmounts the field and the
    typing is simply gone.
  */
  const tagsRef = useRef<HTMLInputElement | null>(null)
  const notesRef = useRef<HTMLTextAreaElement | null>(null)

  /** Which empty slot the "add member" choice is being made for, if any. */
  const [addingAt, setAddingAt] = useState<number | null>(null)
  /** Set by Delete so the screen can say so rather than looking merely broken. */
  const [deleted, setDeleted] = useState(false)
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

  /*
    A NEW MEMBER THAT HAS NOT EARNED A SLOT YET. See Build.draft in model.ts.

    Mind the name: `draft` in this file is already the unsaved EDIT of whichever
    build is open, which is a different idea entirely. This one is about the
    build's standing in its team, not about unsaved text.
  */
  const isDraftMember = stored?.draft === true
  const untouched = build != null && isPristineBuild(build) && !dirty

  /*
    What the unmount path needs to know, kept in a ref because that listener is
    registered ONCE and must not be torn down and re-added as the form changes
    -- its cleanup IS the save, so a re-run would fire it mid-edit.
  */
  const onLeave = useRef({ isDraftMember: false, untouched: true, id: '' })
  useEffect(() => {
    onLeave.current = { isDraftMember, untouched, id: stored?.id ?? '' }
  })

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
      const { isDraftMember: wasDraft } = onLeave.current
      /*
        NOTHING DESTRUCTIVE HAPPENS HERE, and that is deliberate. This cleanup
        runs on a SIMULATED unmount under StrictMode, immediately after mount --
        so an untouched draft deleted from here was deleted the instant it was
        created. Every exit this component owns resolves its own draft through
        `leaveDraft`; an untouched draft abandoned through a door it does not own
        is left alone and pruned when the module next mounts. See TeamBuilding.
      */
      const next = pending.current
      if (!next) return
      if (teamsUsingBuild(readData(), next.id).length >= 2) return
      /*
        A TOUCHED DRAFT LEAVING THROUGH A DOOR THIS COMPONENT DOES NOT OWN keeps
        its work and becomes an ordinary library build. There is nobody left to
        ask which team slot was meant, and of the two ways to be wrong, silently
        deleting what someone typed is the worse one.
      */
      pending.current = null
      updateBuild(next.id, wasDraft ? { ...next, draft: false } : next)
    }
    window.addEventListener('pagehide', flushUnattended)
    return () => {
      window.removeEventListener('pagehide', flushUnattended)
      flushUnattended()
    }
  }, [flush])

  /**
   * Write the info modal's fields straight through to the store.
   *
   * ONLY WHAT CHANGED. Closing the modal without typing must not write at all --
   * "opening and closing commits nothing" is the rule -- so each field is
   * compared against the stored value first.
   *
   * The pending draft is patched too. `flush` writes the whole snapshot it took
   * when the last field was edited, notes included, so a note saved here and a
   * main-form edit flushed a moment later would otherwise see the stale note
   * put back.
   */
  const saveInfoFields = () => {
    if (!stored) return
    const patch: Partial<Build> = {}
    const tagsEl = tagsRef.current
    if (tagsEl) {
      const tags = tagsEl.value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      if (JSON.stringify(tags) !== JSON.stringify(stored.tags)) patch.tags = tags
    }
    const notesEl = notesRef.current
    if (notesEl && notesEl.value !== stored.notes) patch.notes = notesEl.value
    if (Object.keys(patch).length === 0) return
    updateBuild(stored.id, patch)
    if (pending.current) pending.current = { ...pending.current, ...patch }
    setDraft((d) => (d ? { ...d, ...patch } : d))
  }

  const moveset = useLegalMoveset({
    speciesId: build?.speciesId ?? 1,
    pokemonId: build?.pokemonId ?? 1,
    level: build?.level ?? 1,
    generation: build?.generation ?? 1,
  })

  if (!build || !stored) {
    /* `deleted` distinguishes "you just deleted this" from "the id in the URL
       does not resolve", which are the same absence but not the same message. */
    return (
      <section
        className="tb-screen tb-build-form-empty"
        data-testid="tb-build-form"
        data-state={deleted ? 'deleted' : 'missing'}
      >
        <p className="tb-empty-note" data-testid="tb-build-form-empty-note">
          {deleted ? 'Build deleted.' : 'This build no longer exists.'}
        </p>
        <div className="tb-choice">
          {origin.kind === 'team' && (
            <GhostButton
              onClick={() => goTo({ kind: 'team-viewer', teamId: origin.teamId })}
              testId="tb-build-form-empty-team"
            >
              Back to the team
            </GhostButton>
          )}
          <GhostButton
            onClick={() => goTo({ kind: 'build-library' })}
            testId="tb-build-form-empty-library"
          >
            Build Library
          </GhostButton>
        </div>
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

  /*
    The team this form's rail shows. Declared up here rather than beside the rail
    markup because the draft rules below need it: which question a draft gets
    asked depends on whether that team has a slot going spare.
  */
  const railTeam =
    origin.kind === 'team'
      ? (data.teams.find((t) => t.id === origin.teamId) ?? null)
      : (attachedTeams[0] ?? null)
  /** The slot the "+" belongs to, or -1 when the team is full. */
  const railFirstOpen = railTeam ? railTeam.memberIds.findIndex((m) => m == null) : -1

  /**
   * How a save point should treat a draft member -- a build that was started
   * from Team Viewer and has not been given a slot yet.
   *
   * `leave` -- the reader is going somewhere else. An untouched draft is
   * nothing and is dropped; a touched one keeps its work.
   * `attaches` -- whatever runs next puts this build in a team, so it must
   * survive whatever else happens.
   */
  type LeaveMode = { kind: 'leave' } | { kind: 'attaches' }

  /**
   * SAVE, THEN DO THE THING. Every save point in this screen calls this, so the
   * shared-build question is asked in one place and cannot be bypassed by taking
   * a different route out.
   *
   * `after` runs in all three shared-build branches, discard included: the
   * question is what happens to the EDIT, not whether the user gets to leave.
   */
  const saveThen = (after: () => void, mode: LeaveMode = { kind: 'leave' }) => {
    /*
      NO PROMPT EXCEPT THE SHARED ONE. Every transition below commits SILENTLY --
      switching rail member, adding a member, duplicating, adding to a team,
      going back, leaving by the app bar. The one exception is a build two or
      more teams reference, further down, where saving is not a private act.

      An untouched draft is the one thing that gets dropped rather than saved:
      it is a build nobody has typed into, so there is nothing to keep and
      leaving it behind is how blank Bulbasaurs used to accumulate. Silent, with
      no question asked, because there is nothing to decide.
    */
    if (isDraftMember && untouched && mode.kind === 'leave') {
      pending.current = null
      setDirty(false)
      deleteBuild(stored.id)
      after()
      return
    }
    /* A draft that survives a transition has earned its place as a real build. */
    const promote = () => {
      if (isDraftMember) updateBuild(stored.id, { draft: false })
    }
    if (!pending.current) {
      /* UC6: nothing outstanding, so there is no save to perform and the
         transition happens on this tick. */
      promote()
      after()
      return
    }
    if (!isShared) {
      flush()
      promote()
      setDirty(false)
      after()
      return
    }
    const edited = pending.current
    prompt.ask({
      title: 'This build is used by more than one team',
      body: `Saving changes it for all ${attachedTeams.length} teams that use it (${attachedTeams
        .map((t) => teamUiId(data, t.id))
        .join(', ')}).`,
      testId: 'tb-shared-prompt',
      actions: [
        {
          label: 'Save to all teams',
          testId: 'tb-shared-save',
          onPick: () => {
            flush()
            promote()
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

  /**
   * Removing a member is TWO different actions wearing one icon, and the prompt
   * exists because the destructive one is not recoverable.
   *
   * Taking a Pokemon off a team usually means "not on this team", and the build
   * is still worth keeping -- it stays in the Build Library and every other team
   * using it is untouched. Sometimes it means "this build was a mistake", and
   * then it should go entirely. Guessing either way is wrong, so the prompt
   * offers both, with Cancel first and neither destructive answer as a default.
   */
  const removeMember = (teamId: string, memberId: string) => {
    const member = data.builds.find((b) => b.id === memberId)
    const species = member ? buildSpecies(member)?.species : null
    const label = member && species ? displayName(member, species).primary : 'this member'
    const alsoOn = teamsUsingBuild(data, memberId).length - 1
    prompt.ask({
      title: `Remove ${label} from this team?`,
      body:
        alsoOn > 0
          ? `This build is also on ${alsoOn} other team${alsoOn === 1 ? '' : 's'}, and deleting it would empty its slot there too.`
          : 'Keeping the build leaves it in the Build Library to reuse.',
      testId: 'tb-rail-remove-prompt',
      actions: [
        { label: 'Cancel', testId: 'tb-rail-remove-cancel' },
        {
          label: 'Remove, keep the build',
          testId: 'tb-rail-remove-keep',
          onPick: () => {
            const slot = data.teams
              .find((t) => t.id === teamId)
              ?.memberIds.findIndex((m) => m === memberId)
            if (slot != null && slot >= 0) setTeamMember(teamId, slot, null)
          },
        },
        {
          label: 'Delete the build too',
          danger: true,
          testId: 'tb-rail-remove-delete',
          /* deleteBuild detaches from every team as well, so this is the
             "gone everywhere" answer rather than "gone from here". */
          onPick: () => deleteBuild(memberId),
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
      label: 'Defensive type coverage',
      onClick: () => setMatchup(true),
      testId: 'tb-form-matchup',
    },
    {
      icon: <IconSwords size={18} stroke={1.5} />,
      label: 'Attacking type coverage',
      onClick: () => setOffence(true),
      testId: 'tb-form-offence',
    },
    {
      icon: <IconUsersPlus size={18} stroke={1.5} />,
      label: 'Add to other team',
      /* Save first: the team is about to point at this build, and it should
         point at what is on screen rather than at the last saved version. */
      /* `attaches`: the modal this opens puts the build in a team, which is
         exactly what a draft needs, so it is promoted rather than questioned. */
      onClick: () => saveThen(() => setAddTo(true), { kind: 'attaches' }),
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
            /*
              RESET IS THE ONE ACTION THAT DOES NOT SAVE FIRST, and `...stored`
              rather than `...build` is what makes that true. `build` is the
              DRAFT -- it carries whatever is sitting uncommitted in the form --
              so spreading it would have quietly committed those edits on the
              fields reset does not touch. Species, nature, ability and gender
              are identity, not tuning, and they keep their STORED values;
              anything typed into them since the last save is discarded, which
              is what "reset" means.

              Clearing `pending` before the write is the other half: without it
              the unmount flush would put the discarded edit back afterwards.
            */
            const reset = {
              ...stored,
              itemId: null,
              moveIds: [null, null, null, null],
              level: 1,
              friendship: 0,
              nickname: '',
              effort: {},
              individual: {},
              shiny: false,
            }
            pending.current = null
            setDraft(reset)
            setShinyLock(false)
            updateBuild(stored.id, reset)
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
            /*
              NO SAVE, AND NO NAVIGATION EITHER. Dropping `pending` first stops
              the unmount flush resurrecting the record being deleted; clearing
              `draft` is what actually empties the screen, because `build` is
              `draft ?? stored` and a stale draft would keep the deleted build
              on display as though nothing had happened.

              Staying put is deliberate. Being returned to a list leaves it
              ambiguous whether the delete happened or the screen simply
              navigated; an empty form that says so cannot be misread.
            */
            pending.current = null
            setDirty(false)
            setDraft(null)
            setDeleted(true)
            deleteBuild(build.id)
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
      <div className="tb-form-grid" data-layout="form-grid">
        {/*
          INSIDE THE GRID, in the `head` area above the identity panel. As a
          sibling above it, this was a full-width 48px band holding one back
          control -- and `main`, `dock` and `rail` all began below it for no
          reason of their own. Sitting in column one it costs only the column
          that had the room, and the other three start at the navbar.
        */}
        <header className="tb-screen-head">
          <GhostButton onClick={back} testId="tb-build-back" bare>
            <IconChevronLeft size={18} stroke={1.5} />
            {origin.kind === 'team' ? 'Back to team' : 'Build Library'}
          </GhostButton>
          {/*
            A STATUS, NOT A CONTROL, which is why it is a <span> and not a
            button however much a floppy disc looks like one. This form has no
            Save button by design -- it writes at the save points listed at the
            top of this file -- so the icon reports a state rather than offering
            an action. The accessible name carries what the words used to.
          */}
          {dirty && (
            <span
              className="tb-dirty-note"
              role="status"
              aria-label="Unsaved changes"
              title="Unsaved changes — saved when you leave, add a member, or duplicate"
              data-testid="tb-dirty-note"
            >
              <IconDeviceFloppy size={17} stroke={1.6} />
            </span>
          )}
        </header>

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
            {/*
              A SQUARE FRAME AROUND THE ARTWORK, which exists so the held item
              can be positioned against the PICTURE rather than against the
              stage. Official artwork is square and letterboxed by `contain`, so
              the rendered image's corner is nowhere near the element's corner --
              an item pinned to the grid area floated off in the margin. The
              frame is exactly the letterbox, so its bottom-right corner is the
              artwork's bottom-right corner, and the item sits in front.
            */}
            <span className="tb-sprite-frame">
              {art && <img className="tb-identity-sprite" src={art} alt="" />}
              {heldArt && (
                <img
                  className="tb-held-item"
                  src={heldArt.artwork}
                  alt=""
                  title={itemName(build.itemId)}
                  data-testid="tb-held-item"
                  /* PokeAPI has no Sugimori-style item artwork; the Dream World
                     render is the closest thing and covers about 60% of the bag
                     -- every real held item, but no TMs, mail or key items.
                     Those fall back to the 30x30 game icon, and `data-fallback`
                     is what tells the CSS to draw that one pixelated. */
                  onError={(e) => {
                    const img = e.currentTarget
                    if (img.dataset.fallback === 'true') return
                    img.dataset.fallback = 'true'
                    img.src = heldArt.icon
                  }}
                />
              )}
            </span>
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

          {/*
            NO "Stats" HEADING. The table's own first column heading is the word
            Stat, so the block announced itself twice -- a title over a header
            row that already says the same thing. The three column headings are
            the label this block needs, and the line the title occupied is what
            lets the right rail's six cards end level with the Total row.
          */}
          {facts && (
            <div className="tb-stats-block">
              <StatTable build={build} facts={facts} />
            </div>
          )}
        </aside>

        {/* ---------------------------------------------------- main column */}
        <div className="tb-form-main" data-layout="main">
          {/*
            IDENTITY FIELDS, MOVED OUT OF THE IDENTITY PANEL. Species and
            nickname are inputs like every other input on this form, and sitting
            in the left column they were the only two -- which made that column
            half portrait and half form, and pushed the stat table below the
            fold. Here they are the form's first row, and the left column is
            purely the picture of the build plus its numbers.

            SAME FOUR-COLUMN TRACK as every row below, with two cells left empty
            rather than stretched: a field on this form is one column wide
            everywhere, and a double-width nickname would be the only exception.
          */}
          <div className="tb-field-row" data-layout="field-row">
            <Field label="Pokémon">
              <select
                className="tb-select"
                value={build.speciesId}
                data-testid="tb-species"
                onChange={(e) => {
                  const speciesId = Number(e.target.value)
                  /* A species change re-derives gender and ability: the old
                     values may be impossible for the new species. */
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
                {listSpecies().map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.display_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nickname">
              <input
                className="tb-input"
                defaultValue={build.nickname}
                maxLength={NICKNAME_MAX}
                data-testid="tb-nickname"
                /* BOTH the attribute and the slice. `maxLength` is what makes
                   the cap visible while typing -- the field simply stops
                   accepting -- but it only governs user input, so a value that
                   arrives any other way would sail past it. */
                onBlur={(e) => commit({ nickname: e.target.value.slice(0, NICKNAME_MAX) })}
              />
            </Field>
          </div>

          <div className="tb-field-row" data-layout="field-row">
            {generation >= 2 && (
              <Field
                label="Item"
                info={
                  <InfoTip
                    summary={itemEffectFor(build.itemId)}
                    label={`${itemName(build.itemId)} info`}
                    testId="tb-item-info"
                  >
                    <span className="tb-infotip-name">{itemName(build.itemId)}</span>
                  </InfoTip>
                }
              >
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
              <Field
                label="Ability"
                info={
                  <InfoTip
                    summary={abilityEffectFor(build.abilityId)}
                    label={`${abilityName(build.abilityId)} info`}
                    testId="tb-ability-info"
                  >
                    <span className="tb-infotip-name">{abilityName(build.abilityId)}</span>
                  </InfoTip>
                }
              >
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
                  abilityId={build.abilityId}
                  generation={generation}
                  title={facts.species.display_name}
                />
              )}
            </Popover>
          )}
          {offence && (
            <Popover
              onClose={() => setOffence(false)}
              align="right"
              testId="tb-form-offence-popover"
            >
              <MovesetCoverage
                moveIds={build.moveIds}
                generation={generation}
                title={facts?.species.display_name ?? 'This build'}
              />
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
          {/*
            THE TEAM'S ID HEADS THE RAIL, it does not trail it. Under the last
            card it was the one thing hanging below the left column, so the two
            columns ended 34px apart however tightly the cards were set. At the
            top it is what Team Viewer already shows an ID as -- a heading -- and
            the band of cards now ends level with the stat table's Total row.
          */}
          {railTeam && (
            <span className="tb-rail-team num" data-testid="tb-rail-team">
              {teamUiId(data, railTeam.id)}
            </span>
          )}
          {/*
            THE WHOLE TEAM, INCLUDING THE ONE OPEN IN THE FORM. The rail used to
            filter the current build out, which meant the reader could not see
            where in the team they were -- six slots became five plus a gap. It
            is rendered from `railTeam.memberIds` in slot order and read live
            from the store, so an edit made anywhere shows here immediately and
            nothing on this rail is ever a stale copy.
          */}
          {railTeam ? (
            railTeam.memberIds.map((memberId, slot) => {
              if (memberId == null) {
                /* ONE "+", for the next free slot only. Six identical buttons
                   would ask the reader to choose a slot number, which is not a
                   decision they have -- teams fill in order everywhere else. */
                return slot === railFirstOpen ? (
                  <IconButton
                    key={`add-${slot}`}
                    icon={<IconPlus size={20} stroke={1.5} />}
                    label="Add member"
                    testId="tb-rail-add"
                    /* Commits first, THEN asks which kind of member. */
                    onClick={() => saveThen(() => setAddingAt(slot))}
                  />
                ) : null
              }
              const member = data.builds.find((b) => b.id === memberId)
              if (!member) return null
              const isCurrent = member.id === build.id
              return (
                <MemberCard
                  key={member.id}
                  build={member}
                  variant="rail"
                  current={isCurrent}
                  testId={`tb-rail-${member.id}`}
                  corners={
                    <span className="tb-corner tb-corner-tr">
                      <IconButton
                        icon={<IconTrash size={15} stroke={1.5} />}
                        label="Remove from this team"
                        danger
                        testId={`tb-rail-${member.id}-delete`}
                        onClick={() => removeMember(railTeam.id, member.id)}
                      />
                    </span>
                  }
                  /*
                    THE OPEN MEMBER GETS NO HANDLER AT ALL, which is what makes
                    clicking it a true no-op: not a save, not a navigation to
                    where you already are, not a re-render. MemberCard renders a
                    plain <span> rather than a disabled button when `onOpen` is
                    absent, so it is not in the accessibility tree as a control
                    either.
                  */
                  onOpen={
                    isCurrent
                      ? undefined
                      : () =>
                          saveThen(() =>
                            goTo({
                              kind: 'build-form',
                              buildId: member.id,
                              origin: { kind: 'team', teamId: railTeam.id },
                            }),
                          )
                  }
                />
              )
            })
          ) : (
            /*
              AN UNATTACHED BUILD GETS THE "+" DIRECTLY. There is no collapsed
              state and no chevron to open one: the rail has exactly two shapes,
              a team or an invitation to start one. Clicking creates the team
              with this build already in it and writes it immediately, and the
              rail flips to the attached shape on its own because `railTeam` is
              derived from the store rather than from local state.
            */
            <IconButton
              icon={<IconPlus size={20} stroke={1.5} />}
              label="Start a team with this build"
              testId="tb-rail-create-team"
              onClick={() =>
                saveThen(() => createTeam(generation, [build.id]), { kind: 'attaches' })
              }
            />
          )}
        </aside>
      </div>

      {/*
        UC5. The commit already happened on the way in, so this is purely the
        question of WHICH member. "Pick an existing build" hands the slot to the
        library, which places the build and comes straight back here.
      */}
      {addingAt != null && railTeam && (
        <Modal title="Add member" onClose={() => setAddingAt(null)} testId="tb-rail-add-modal">
          <div className="tb-choice">
            <GhostButton
              testId="tb-rail-add-new"
              onClick={() => {
                const slot = addingAt
                setAddingAt(null)
                /*
                  ASSIGNED TO THE SLOT AND WRITTEN NOW, not held back as a draft
                  the way Team Viewer's own add does. Build Form is deliberately
                  different here: the reader is looking at the team while they
                  do it, so a member that did not appear in the rail until some
                  later confirmation would read as the click having failed.
                */
                const fresh = createBuild(newBuildInit(railTeam.generation))
                setTeamMember(railTeam.id, slot, fresh.id)
                goTo({
                  kind: 'build-form',
                  buildId: fresh.id,
                  origin: { kind: 'team', teamId: railTeam.id },
                })
              }}
            >
              Build a new member
            </GhostButton>
            <GhostButton
              testId="tb-rail-add-existing"
              onClick={() => {
                const slot = addingAt
                setAddingAt(null)
                goTo({ kind: 'build-library', pickFor: { teamId: railTeam.id, slot } })
              }}
            >
              Pick an existing build
            </GhostButton>
          </div>
        </Modal>
      )}

      {info && (
        <Modal
          title="Build info"
          /* Saves on the way out however it is dismissed -- Escape and an
             outside click never blur the field they leave behind. */
          onClose={() => {
            saveInfoFields()
            setInfo(false)
          }}
          testId="tb-form-info-modal"
        >
          <label className="tb-field-label" htmlFor="tb-form-tags">
            Tags (comma separated)
          </label>
          <input
            id="tb-form-tags"
            ref={tagsRef}
            className="tb-input"
            defaultValue={build.tags.join(', ')}
            data-testid="tb-form-tags"
            onBlur={saveInfoFields}
          />
          <textarea
            ref={notesRef}
            className="tb-notes"
            defaultValue={build.notes}
            placeholder="Notes about this build"
            aria-label="Build notes"
            data-testid="tb-form-notes"
            onBlur={saveInfoFields}
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

function Field({
  label,
  children,
  info,
}: {
  label: string
  children: React.ReactNode
  /** An InfoTip, rendered after the label text. */
  info?: React.ReactNode
}) {
  return (
    <label className="tb-field">
      <span className="tb-field-label">
        {label}
        {info}
      </span>
      {children}
    </label>
  )
}
