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
 * THE MEMBER NEED NOT EXIST YET. `buildId` is nullable: a new member is a value
 * in this component's state and a SLOT it is destined for, and neither the build
 * nor the slot assignment reaches storage until one of the save points above.
 * `persist` is the only function that creates it, and it fills the slot in the
 * same breath -- those two have to happen together or the member is "saved" into
 * a library while the team it was being built for stays empty, which is exactly
 * what went wrong when the old "keep this draft?" question was removed and
 * nothing was left to place it.
 *
 * The earlier shape created the record up front and flagged it `Build.draft`.
 * That flag is legacy; see model.ts and the shell's prune.
 *
 * THE RAIL SHOWS THE EDIT, NOT THE RECORD. The slot being edited renders from
 * this component's state, so choosing a species shows up in the rail on the same
 * tick -- while every other slot renders from the store. An empty slot that is
 * the one being edited is NOT an "add member" button: offering it re-asked a
 * question the reader had just answered, and answering it a second time
 * abandoned the member they were already building.
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
import { usePrompt, type PromptAction } from './ui/usePrompt'
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
import { goTo, type BuildOrigin, type TbScreen } from './tbNav'
import { useLegalMoveset } from './useLegalMoveset'

/** A build that is not in the store has no key yet. Never written anywhere. */
const UNSAVED_ID = '(unsaved)'

/**
 * Is this team slot available?
 *
 * EMPTY, OR HOLDING AN ID NOTHING RESOLVES TO. Team Viewer has always treated
 * the second case as empty -- it maps unknown ids to null before it renders --
 * and the rail read `memberIds` raw, so a dangling id (a build removed by an
 * older shape, or a hand-edited document) made the rail skip that slot and
 * target the next one, leaving a hole nothing could ever fill.
 *
 * At module scope because both the rail and `persist` need it, and `persist` is
 * declared above the rail.
 */
function slotIsFree(builds: Build[], memberId: string | null): boolean {
  return memberId == null || !builds.some((b) => b.id === memberId)
}

/**
 * The stored shape, minus the key the store assigns on creation.
 *
 * `createBuild` takes `Omit<Build, 'id'>` and mints the key itself, so handing
 * it a value that still carries `UNSAVED_ID` would put that sentinel in
 * storage. Spread-and-delete rather than a cast, so a new field on `Build`
 * cannot be silently dropped here.
 */
function withoutId(build: Build): Omit<Build, 'id'> {
  const { id, ...rest } = build
  void id
  return rest
}

export function BuildForm(props: {
  buildId: string | null
  origin: BuildOrigin
  generation: number
  slot?: number | null
  seed?: Omit<Build, 'id'> | null
}) {
  /*
    REMOUNT ON THE TARGET, not on the id alone -- the id is null for every new
    member, so keying on it would have kept one form mounted across "add another
    member" and left the previous member's values in the fields.
  */
  return <BuildFormFields key={`${props.buildId ?? 'new'}#${props.slot ?? '-'}`} {...props} />
}

function BuildFormFields({
  buildId,
  origin,
  generation: navGeneration,
  slot: slotProp = null,
  seed = null,
}: {
  buildId: string | null
  origin: BuildOrigin
  generation: number
  slot?: number | null
  seed?: Omit<Build, 'id'> | null
}) {
  const data = useTeamBuilderData()
  const prompt = usePrompt()
  const stored = buildId != null ? (data.builds.find((b) => b.id === buildId) ?? null) : null

  /*
    The team whose rail this form shows. Resolved BEFORE the draft is seeded,
    because a new member of a team takes that team's generation -- the nav's
    generation is what the app is browsing, which is not necessarily what the
    team was built in.
  */
  const originTeam =
    origin.kind === 'team' ? (data.teams.find((t) => t.id === origin.teamId) ?? null) : null

  /*
    THE TEMPORARY BUILD STATE, and it is never null while the form is up.

    It used to be `Build | null` with the stored record standing in behind it,
    which meant two sources for every field and a `null` that also had to mean
    "this was just deleted". The deleted case is `deleted` below; this is only
    ever the values on screen.
  */
  const [draft, setDraft] = useState<Build>(
    () =>
      stored ?? {
        ...(seed ?? newBuildInit(originTeam?.generation ?? navGeneration)),
        id: UNSAVED_ID,
      },
  )
  /*
    WHAT THE FORM OPENED WITH. Reverting a member that has never been saved has
    no stored record to go back to, so it goes back to this. Captured once, on
    purpose: it must not follow the edits it is the escape from.
  */
  const [baseline] = useState<Build>(draft)
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
  const [shinyLock, setShinyLock] = useState(() => isShinyByDvs(draft.individual))

  /*
    The unsaved draft, or null when there is nothing outstanding. Deliberately a
    ref and not derived from `draft`/`dirty`: the unmount flush needs the value
    as of the last EDIT, not as of the last render.
  */
  const pending = useRef<Build | null>(null)

  const attachedTeams = stored ? teamsUsingBuild(data, stored.id) : []
  const isShared = attachedTeams.length >= 2
  const build = draft

  /*
    The team the rail draws. From the ORIGIN when there is one, so a member
    opened from a team shows that team even if it is on several; otherwise the
    first team a stored build belongs to. A new member with no origin team has
    no rail team at all, and the rail offers to start one.
  */
  const railTeam = originTeam ?? (stored ? (teamsUsingBuild(data, stored.id)[0] ?? null) : null)

  /*
    THE SLOT THIS FORM OCCUPIES, which is a different question from "where is
    this build in that team". A new member is in no slot yet, so its slot has to
    be CARRIED (see tbNav); a stored one is found where it sits. Either way the
    rail needs it, because the slot it names is the one that renders the live
    edit instead of the store.
  */
  const storedSlot = railTeam && stored ? railTeam.memberIds.indexOf(stored.id) : -1
  const slot = slotProp != null ? slotProp : storedSlot >= 0 ? storedSlot : null

  /*
    What the unmount path needs to know, kept in a ref because that listener is
    registered ONCE and must not be torn down and re-added as the form changes
    -- its cleanup IS the save, so a re-run would fire it mid-edit.
  */
  const onLeave = useRef<{ id: string | null; teamId: string | null; slot: number | null }>({
    id: null,
    teamId: null,
    slot: null,
  })
  useEffect(() => {
    onLeave.current = { id: stored?.id ?? null, teamId: railTeam?.id ?? null, slot }
  })

  /**
   * WRITE THE DRAFT. The only function in this file that saves.
   *
   * Three outcomes, and the middle one is the whole point of the nullable id:
   *
   *   an existing build with an edit  -> updated in place
   *   a member that has never been saved -> CREATED, and put in its slot in the
   *     same breath, because a build in the library that is not in the team it
   *     was built for is the bug this replaced
   *   an existing build with no edit, or a new member nobody typed into -> NO
   *     WRITE AT ALL, which is what keeps "open it and leave" from touching
   *     storage and what stops blank Bulbasaurs accumulating
   *
   * Returns the id it settled on, or null when there was nothing to save.
   */
  const persist = useCallback((): string | null => {
    const builds = readData().builds
    const edited = pending.current
    pending.current = null
    if (stored) {
      if (edited) {
        updateBuild(stored.id, edited)
        setDirty(false)
      }
      return stored.id
    }
    const value = edited ?? draft
    if (isPristineBuild(value)) return null
    setDirty(false)
    const created = createBuild(withoutId(value))
    /*
      THE SLOT AND THE RECORD, TOGETHER. Not two save points.

      And the slot is re-checked rather than trusted: this form has been open
      for as long as the reader took, and if something else filled the slot
      meanwhile, writing into it would silently evict that member. The next
      free slot is the honest answer; no free slot at all means the build is
      still created and simply lands in the library.
    */
    if (railTeam && slot != null) {
      const target = slotIsFree(builds, railTeam.memberIds[slot])
        ? slot
        : railTeam.memberIds.findIndex((m) => slotIsFree(builds, m))
      if (target >= 0) setTeamMember(railTeam.id, target, created.id)
    }
    return created.id
  }, [draft, railTeam, slot, stored])

  /**
   * Throw the edit away and put the form back to where it started.
   *
   * A stored build goes back to its record; one that was never saved goes back
   * to the values the form opened with, which is the only "previous" it has.
   */
  const revert = useCallback(() => {
    pending.current = null
    setDirty(false)
    const back = stored ?? baseline
    setDraft(back)
    setShinyLock(isShinyByDvs(back.individual))
  }, [baseline, stored])

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
      /*
        NOTHING DESTRUCTIVE HAPPENS HERE, and nothing happens at all unless
        something was actually typed. This cleanup runs on a SIMULATED unmount
        under StrictMode, immediately after mount, so anything it does to a
        brand-new member it does the instant that member is created. `pending`
        is null until the first edit, which is what makes that safe.
      */
      const next = pending.current
      if (!next) return
      const { id, teamId, slot: leaveSlot } = onLeave.current
      if (id != null) {
        /* It REFUSES to write a shared build: there is nobody left to ask which
           of the three answers was meant, and writing would change every team. */
        if (teamsUsingBuild(readData(), id).length >= 2) return
        pending.current = null
        updateBuild(id, next)
        return
      }
      /*
        A NEW MEMBER LEAVING THROUGH A DOOR THIS COMPONENT DOES NOT OWN keeps
        its work: it is created, and it takes its slot. Of the two ways to be
        wrong, silently discarding what someone typed is the worse one -- and
        landing it in the library while leaving its team empty is what the old
        shape did, which is worse still.
      */
      if (isPristineBuild(next)) return
      pending.current = null
      const created = createBuild(withoutId(next))
      if (teamId != null && leaveSlot != null) setTeamMember(teamId, leaveSlot, created.id)
    }
    window.addEventListener('pagehide', flushUnattended)
    return () => {
      window.removeEventListener('pagehide', flushUnattended)
      flushUnattended()
    }
  }, [])

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

  /*
    THE FORM IS ONLY EMPTY FOR TWO REASONS, and neither of them is "this member
    has not been saved yet" -- which is what made this branch fire mid-build and
    tell the reader their build no longer existed. It fires when the reader has
    just deleted the build, and when an id was handed in that does not resolve.
  */
  if (deleted || (buildId != null && !stored)) {
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

  /**
   * The next slot the "+" may offer, or -1 when there is none.
   *
   * THE SLOT BEING EDITED IS NOT ONE OF THEM, and that exclusion is a bug fix
   * rather than a refinement. A new member of an empty team is in slot 0 and is
   * not in the store, so the rail saw slot 0 as free and drew an "add member"
   * button on it -- the reader had just answered "build a new member" and was
   * being offered the same question again, on the slot they were already
   * filling. Answering it created a SECOND member, orphaned the first, and when
   * the first was still untouched it was deleted underneath the open form,
   * which is what produced "this build no longer exists" mid-build.
   */
  const railAddSlot = railTeam
    ? railTeam.memberIds.findIndex((m, i) => i !== slot && slotIsFree(data.builds, m))
    : -1

  /**
   * SAVE, THEN DO THE THING. Every save point in this screen calls this, so the
   * shared-build question is asked in one place and cannot be bypassed by taking
   * a different route out.
   *
   * `after` receives the id the build settled on -- which for a member being
   * saved for the first time is an id that did not exist a moment ago, and is
   * the only way the caller can then act on it.
   *
   * NO PROMPT EXCEPT THE SHARED ONE. Every transition here commits SILENTLY --
   * going back, duplicating, adding to a team, leaving by the app bar. The rail
   * has its own questions and they are further down; the one here is for a build
   * two or more teams reference, where saving is not a private act.
   */
  const saveThen = (after: (savedId: string | null) => void) => {
    if (!pending.current || !stored || !isShared) {
      after(persist())
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
          onPick: () => after(persist()),
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
            const copy =
              origin.kind === 'team'
                ? forkBuildInTeam(stored.id, edited, origin.teamId)
                : createBuild(withoutId(edited))
            after(copy.id)
          },
        },
        {
          label: 'Discard changes',
          danger: true,
          testId: 'tb-shared-discard',
          onPick: () => {
            revert()
            after(stored.id)
          },
        },
      ],
    })
  }

  /*
    ------------------------------------------------- THE RAIL'S OWN QUESTIONS

    Moving the rail is not the same act as leaving the screen, and it needed its
    own questions rather than the silent commit every other transition gets.
    Three cases, and which one you get is decided by where the edit could
    possibly go:

      the CURRENT slot, clicked again -> there is nowhere else for the edit to
        go, so the only thing to offer is throwing it away. Nothing pending
        makes this a true no-op, and the card is not even a control then.
      ANOTHER MEMBER -> save this one first, or put it back. Two answers,
        because the edit belongs to the member being left.
      AN EMPTY SLOT -> those two, plus MOVE the edit to the new member and put
        this one back. Three answers, because an empty slot is somewhere the
        edit could legitimately land.

    A SHARED BUILD KEEPS ITS OWN PROMPT instead of any of these. It is already
    the three-way save / fork / discard, it is a superset of what the two-way
    asks, and it carries the warning about how far a save reaches. Asking both
    would be two modals for one click.
  */

  /** Clicking the slot the form is already on: the only way back to the record. */
  const revertCurrent = () => {
    if (!dirty) return
    prompt.confirm('Discard the changes to this member?', revert, {
      body: 'The form goes back to the values it had when you opened it.',
      confirmLabel: 'Discard',
      testId: 'tb-rail-revert-prompt',
    })
  }

  /**
   * Clicking another member, or an empty slot.
   *
   * `to` is a factory rather than a screen because one of the three answers
   * hands the edit forward as a seed, and only that answer knows to.
   */
  const railSwitch = (
    to: (seed?: Omit<Build, 'id'> | null) => TbScreen,
    opts: { emptySlot?: boolean } = {},
  ) => {
    /* Nothing typed: just load the other member. No question, no write. */
    if (!pending.current) {
      persist()
      goTo(to())
      return
    }
    if (stored && isShared) {
      saveThen(() => goTo(to()))
      return
    }
    const edited = pending.current
    const actions: PromptAction[] = [
      {
        label: 'Save this member first',
        testId: 'tb-rail-switch-save',
        onPick: () => {
          persist()
          goTo(to())
        },
      },
      {
        label: 'Discard the changes',
        danger: true,
        testId: 'tb-rail-switch-discard',
        onPick: () => {
          revert()
          goTo(to())
        },
      },
    ]
    if (opts.emptySlot) {
      /* THE EDIT MOVES AND THE MEMBER IT CAME FROM GOES BACK. Inserted second
         so the destructive answer stays last. */
      actions.splice(1, 0, {
        label: 'Move the changes to the new member',
        testId: 'tb-rail-switch-move',
        onPick: () => {
          revert()
          goTo(to(withoutId(edited)))
        },
      })
    }
    prompt.ask({
      title: 'This member has unsaved changes',
      body: 'Choose what happens to them before the form moves.',
      testId: 'tb-rail-switch-prompt',
      actions,
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
          onPick: () => {
            /*
              DELETING THE MEMBER THE FORM IS ON is the same event as pressing
              Delete in the dock, and has to leave the same state behind. Without
              this it fell through to "This build no longer exists" -- which is
              the message for an id that does not resolve, not for a record the
              reader just chose to destroy -- and the pending edit would have
              been flushed back onto the deleted id by the unmount cleanup.
            */
            if (memberId === stored?.id) {
              pending.current = null
              setDirty(false)
              setDeleted(true)
            }
            deleteBuild(memberId)
          },
        },
      ],
    })
  }

  /*
    BACK IS A SAVE POINT, and for a new member it is the one that matters most:
    filling the form and pressing "Back to team" is the ordinary way to add a
    member, so `persist` has to both create the build and put it in its slot.
    It used to promote the build and leave the slot empty, which read as the
    member having been thrown away.
  */
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
        saveThen((savedId) => {
          /* `savedId` rather than `build.id`: for a member being saved for the
             first time there was no id until a moment ago. */
          if (savedId == null) return
          const copy = duplicateBuild(savedId)
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
      /* Saved first, unconditionally: the modal needs a real id to attach to,
         so a member that has never been saved is created here. */
      onClick: () => saveThen((savedId) => savedId != null && setAddTo(true)),
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
              ...(stored ?? baseline),
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
            /* A member that has never been saved is not created BY a reset --
               resetting is not a decision to keep it. */
            if (stored) updateBuild(stored.id, reset)
            setDirty(false)
          },
          { confirmLabel: 'Reset', testId: 'tb-reset-prompt' },
        ),
    },
    {
      icon: <IconTrash size={18} stroke={1.5} />,
      label: stored ? 'Delete build' : 'Discard this member',
      danger: true,
      testId: 'tb-form-delete',
      onClick: () =>
        prompt.confirm(
          stored ? 'Delete this build?' : 'Discard this new member?',
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
            /*
              A MEMBER THAT WAS NEVER SAVED HAS NOTHING TO DELETE, so there is
              no "deleted" state to show either -- an empty form announcing that
              a build is gone, for a build that never existed, is a worse answer
              than going back to where the member was going to live.
            */
            if (!stored) {
              goTo(
                origin.kind === 'team'
                  ? { kind: 'team-viewer', teamId: origin.teamId }
                  : { kind: 'build-library' },
              )
              return
            }
            setDeleted(true)
            deleteBuild(stored.id)
          },
          {
            confirmLabel: stored ? 'Delete' : 'Discard',
            testId: 'tb-delete-build-prompt',
          },
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
      /* ABSENT UNTIL THE BUILD EXISTS, which is also how a reader of the DOM --
         or a test -- can tell an unsaved member from a saved one. */
      data-build-id={stored?.id}
      data-saved={stored ? 'true' : 'false'}
      data-slot={slot ?? undefined}
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
                /*
                  CONTROLLED, AND ON CHANGE RATHER THAN ON BLUR. As
                  `defaultValue` + `onBlur` this field was the one thing on the
                  form the draft did not own: reverting a member put the state
                  back and left the typed nickname sitting in the box, because
                  `defaultValue` is only read at mount. It also meant the rail's
                  live preview could not show a nickname until the field lost
                  focus.

                  Committing per keystroke costs nothing here -- `commit` is
                  local state plus the pending ref, never a write.

                  BOTH the attribute and the slice. `maxLength` is what makes
                  the cap visible while typing -- the field simply stops
                  accepting -- but it only governs user input, so a value that
                  arrives any other way would sail past it.
                */
                value={build.nickname}
                maxLength={NICKNAME_MAX}
                data-testid="tb-nickname"
                onChange={(e) => commit({ nickname: e.target.value.slice(0, NICKNAME_MAX) })}
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
            railTeam.memberIds.map((memberId, index) => {
              /*
                THE SLOT BEING EDITED RENDERS FROM THE FORM, not from the store.
                That is what makes the rail a live preview: pick a species and
                it appears here on the same tick, with nothing written yet. An
                empty slot that is this one shows as a selected placeholder
                rather than as an "add member" button -- see `railAddSlot`.
              */
              if (index === slot) {
                const started = stored != null || !isPristineBuild(build)
                return started ? (
                  <MemberCard
                    key="current"
                    build={build}
                    variant="rail"
                    current
                    testId={stored ? `tb-rail-${stored.id}` : 'tb-rail-current'}
                    corners={
                      stored ? (
                        <span className="tb-corner tb-corner-tr">
                          <IconButton
                            icon={<IconTrash size={15} stroke={1.5} />}
                            label="Remove from this team"
                            danger
                            testId={`tb-rail-${stored.id}-delete`}
                            onClick={() => removeMember(railTeam.id, stored.id)}
                          />
                        </span>
                      ) : null
                    }
                    /*
                      A HANDLER ONLY WHEN THERE IS SOMETHING TO UNDO. With
                      nothing pending, MemberCard renders a plain <span> rather
                      than a button, so the card the reader is already on is not
                      a control at all and clicking it cannot do anything. With
                      an edit outstanding it becomes the way back to the saved
                      values, which is the only thing this click could mean.
                    */
                    onOpen={dirty ? revertCurrent : undefined}
                  />
                ) : (
                  /*
                    THE SELECTED EMPTY SLOT. Marked and inert: it is where the
                    member being built will land, so it is neither an
                    invitation to add another one nor a card yet.
                  */
                  <div
                    key="current"
                    className="tb-card tb-card-rail tb-card-rail-blank"
                    data-tb="current-slot"
                    data-current="true"
                    data-testid="tb-rail-current-empty"
                  >
                    <span className="tb-card-rail-open" data-inert="true">
                      <span className="tb-card-art">
                        <span className="tb-card-frame">
                          <IconPlus className="tb-rail-blank-icon" size={18} stroke={1.5} />
                        </span>
                      </span>
                      <span className="tb-rail-lines">
                        <span className="tb-rail-line">New member</span>
                        <span className="tb-rail-line num">Slot {index + 1}</span>
                      </span>
                    </span>
                  </div>
                )
              }
              /*
                `slotIsFree`, NOT `memberId == null`, and the difference is a
                slot that could never be filled. A dangling id is not null, so
                it fell past this branch, found no build to render, and drew
                nothing at all -- while `railAddSlot` had correctly picked that
                slot, so the rail offered no "+" anywhere.
              */
              if (slotIsFree(data.builds, memberId)) {
                /* ONE "+", for the next free slot that is not this one. Six
                   identical buttons would ask the reader to choose a slot
                   number, which is not a decision they have. */
                return index === railAddSlot ? (
                  <IconButton
                    key={`add-${index}`}
                    icon={<IconPlus size={20} stroke={1.5} />}
                    label="Add member"
                    testId="tb-rail-add"
                    /* THE QUESTION COMES FIRST, the edit is resolved second --
                       and which answers exist depends on which kind of member
                       was chosen, so it cannot be the other way round. */
                    onClick={() => setAddingAt(index)}
                  />
                ) : null
              }
              /* Non-null by `slotIsFree` above, but the store is the source of
                 truth and this keeps the narrowing honest. */
              const member = data.builds.find((b) => b.id === memberId)
              if (!member) return null
              return (
                <MemberCard
                  key={member.id}
                  build={member}
                  variant="rail"
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
                  onOpen={() =>
                    railSwitch(() => ({
                      kind: 'build-form',
                      buildId: member.id,
                      origin: { kind: 'team', teamId: railTeam.id },
                    }))
                  }
                />
              )
            })
          ) : (
            /*
              NO TEAM YET: an invitation to start one. There is no collapsed
              state and no chevron -- the rail has exactly two shapes, a team or
              this. It creates the team and hands this form slot 0 of it, so an
              unsaved member starts previewing in the rail immediately WITHOUT
              being written anywhere (UC2).
            */
            <IconButton
              icon={<IconPlus size={20} stroke={1.5} />}
              label="Start a team with this build"
              testId="tb-rail-create-team"
              onClick={() => {
                if (stored) {
                  saveThen((savedId) => {
                    if (savedId == null) return
                    const team = createTeam(generation, [savedId])
                    goTo({
                      kind: 'build-form',
                      buildId: savedId,
                      origin: { kind: 'team', teamId: team.id },
                      slot: 0,
                    })
                  })
                  return
                }
                /* Unsaved: the edit travels as a seed and is still not written. */
                const carried = pending.current ?? build
                pending.current = null
                const team = createTeam(generation)
                goTo({
                  kind: 'build-form',
                  buildId: null,
                  origin: { kind: 'team', teamId: team.id },
                  slot: 0,
                  seed: withoutId(carried),
                })
              }}
            />
          )}
        </aside>
      </div>

      {/*
        WHICH MEMBER FIRST, THEN WHAT HAPPENS TO THE EDIT. The order matters:
        "move the changes to the new member" is only an answer when the reader
        has said they want a NEW member, so the kind has to be settled before
        `railSwitch` can know how many answers to offer.

        NOTHING IS CREATED HERE. "Build a new member" opens the form on a member
        that does not exist, holding the slot; the build and the slot assignment
        are written together when it is saved.
      */}
      {addingAt != null && railTeam && (
        <Modal title="Add member" onClose={() => setAddingAt(null)} testId="tb-rail-add-modal">
          <div className="tb-choice">
            <GhostButton
              testId="tb-rail-add-new"
              onClick={() => {
                const toSlot = addingAt
                setAddingAt(null)
                railSwitch(
                  (seed) => ({
                    kind: 'build-form',
                    buildId: null,
                    origin: { kind: 'team', teamId: railTeam.id },
                    slot: toSlot,
                    seed,
                  }),
                  { emptySlot: true },
                )
              }}
            >
              Build a new member
            </GhostButton>
            <GhostButton
              testId="tb-rail-add-existing"
              onClick={() => {
                const toSlot = addingAt
                setAddingAt(null)
                /* No "move the changes" here: the destination is an existing
                   build, so there is no new member for them to move to.

                   `then: 'form'` -- picking a build fills the slot and comes
                   back HERE with that build loaded. It used to land on the Team
                   Viewer, which threw the reader out of the form they were
                   working in. */
                railSwitch(() => ({
                  kind: 'build-library',
                  pickFor: { teamId: railTeam.id, slot: toSlot, then: 'form' },
                }))
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

      {addTo && stored && <AddToTeamModal buildId={stored.id} onClose={() => setAddTo(false)} />}
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
