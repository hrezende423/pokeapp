/**
 * The module shell: which of the four screens is showing, and how you get there.
 *
 * ONE COMPONENT FOR ALL FOUR NAV IDS. `findTeamBuildingPage` returns this same
 * component for `my-teams`, `build-library`, `new-team` and `new-build`, so
 * switching between them does not unmount -- which matters because a half-edited
 * Build Form must survive the user opening the nav and picking something else in
 * the same tab.
 *
 * TWO OF THE FOUR IDS ARE VERBS. `new-team` and `new-build` create something and
 * then land you on the screen that shows it; they are not destinations you can
 * sit on. So each is CONSUMED once, and the ref recording that is what stops a
 * re-render from creating a second team. There is no router -- nav state is a
 * single module id -- so "already handled this id" has to be tracked here.
 *
 * The screen itself lives in tbNav.ts rather than in this component's state; see
 * that file for why the verb handling forces it.
 */

import { useEffect, useRef } from 'react'
import { ScrollArea } from '../../components/ScrollArea'
import { useNav } from '../nav/navContext'
import { useVersionGroup } from '../version-group/context'
import { BuildForm } from './BuildForm'
import { BuildLibrary } from './BuildLibrary'
import { MyTeams } from './MyTeams'
import { TeamViewer } from './TeamViewer'
import { createTeam, deleteBuild, deleteTeam, readData } from './store'
import { goTo, readTbScreen, useTbScreen, type TbScreen } from './tbNav'
import './teamBuilder.css'

/** The two ids that are real screens. The other two are verbs, handled below. */
function rootScreenFor(id: string): TbScreen | null {
  if (id === 'build-library') return { kind: 'build-library' }
  if (id === 'my-teams') return { kind: 'my-teams' }
  return null
}

/** Gen 1-4 is the app's whole scope; "All" resolves to the newest in range. */
function scopedGeneration(generation: number): number {
  return Math.min(4, Math.max(1, generation))
}

export function TeamBuilding() {
  const nav = useNav()
  const { generation: rawGeneration } = useVersionGroup()
  const generation = scopedGeneration(rawGeneration)
  const screen = useTbScreen()

  /*
    Which nav SELECTION this component has already acted on -- id plus nonce, not
    id alone. The nonce is what makes re-picking the entry you are already on
    count: from inside a team, clicking "My Teams" must come back to the list, and
    clicking "New team" twice must make two teams.
  */
  const consumed = useRef<string | null>(null)

  useEffect(() => {
    const token = `${nav.moduleId}|${nav.moduleNonce}`
    if (consumed.current === token) return
    consumed.current = token

    /*
      A VERB ID STAYS SELECTED after it fires. Redirecting the nav to a real
      destination here would bump the nonce again and the resulting pass would
      immediately override the screen we just opened.
    */
    if (nav.moduleId === 'new-team') {
      const team = createTeam(generation)
      goTo({ kind: 'team-viewer', teamId: team.id })
      return
    }
    if (nav.moduleId === 'new-build') {
      /*
        NOTHING IS CREATED HERE ANY MORE. "New build" opens the form on a member
        that does not exist; the form writes it when the reader does something
        that counts as saving. Creating it up front meant every look at this
        screen left a blank Bulbasaur in the library and consumed an id.
      */
      goTo({ kind: 'build-form', buildId: null, origin: { kind: 'library' }, slot: null })
      return
    }
    const root = rootScreenFor(nav.moduleId)
    if (root) goTo(root)
  }, [nav.moduleId, nav.moduleNonce, generation])

  /*
    PRUNE WHAT AN EARLIER SHAPE LEFT BEHIND, once, on the way in.

    A draft member (Build.draft) is resolved by whichever exit the reader takes --
    but leaving through the global app nav bar is not an exit this module owns,
    and the Build Form cannot do it from its unmount cleanup: that cleanup also
    runs on StrictMode's SIMULATED unmount, immediately after mount, so deleting
    from there destroyed the draft the moment it was created. Doing it here
    means an abandoned draft survives until the next visit and no longer.

    DECLARED AFTER THE NAV EFFECT, and it reads the screen through
    `readTbScreen()` rather than the `screen` this render closed over. Effects
    run in declaration order, so by this point the nav effect above has already
    redirected -- and the closed-over value still named the Build Form the reader
    had just left, which spared the very draft this is here to collect.

    The open build form is spared, because returning to a draft you are in the
    middle of is the one case where it is not abandoned. Deleting is idempotent,
    so the double-invoked effect is harmless.
  */
  const pruned = useRef(false)
  useEffect(() => {
    if (pruned.current) return
    pruned.current = true
    const live = readTbScreen()
    const open = live.kind === 'build-form' ? live.buildId : null
    /*
      `Build.draft` IS LEGACY. Nothing creates one now -- an unsaved member
      lives in the form's own state and reaches storage only when it is saved --
      so any that turn up were written by the earlier shape and are invisible
      everywhere (filtered out of the library, in no team). They are collected
      here rather than migrated, because a draft is by definition a build
      nobody finished.
    */
    for (const build of readData().builds) {
      if (build.draft && build.id !== open) deleteBuild(build.id)
    }
    /*
      AND EMPTY TEAMS, for the same reason and by the same rule. "New team"
      creates one before there is anything to put in it, so abandoning that
      screen used to leave a row of nothing at the top of the Team Library
      forever. The team being LOOKED AT is spared, because that is the one
      being filled right now.
    */
    const openTeam = live.kind === 'team-viewer' ? live.teamId : null
    for (const team of readData().teams) {
      if (team.id !== openTeam && team.memberIds.every((m) => m == null)) deleteTeam(team.id)
    }
    /* Mount only: a draft created LATER is the one being edited right now. */
  }, [])

  /*
    EVERY SCREEN SCROLLS INSIDE A ScrollArea, which is the app's scroll model:
    #root is locked to the viewport and `.panel` sets `overflow: hidden`, so a
    module without one does not scroll -- it is CLIPPED. Team Building shipped
    without one, and on a short window the Build Form simply ended mid-page with
    no way to reach the rest of it.
  */
  return (
    <div className="tb" data-tb-screen={screen.kind} data-generation={generation}>
      <ScrollArea testId="tb-scroll" hint={false}>
        {screen.kind === 'my-teams' && <MyTeams generation={generation} />}
        {screen.kind === 'team-viewer' && <TeamViewer teamId={screen.teamId} />}
        {screen.kind === 'build-library' && (
          <BuildLibrary generation={generation} pickFor={screen.pickFor} />
        )}
        {screen.kind === 'build-form' && (
          /* SLOT AND SEED TRAVEL TOO. Dropping them here is not a cosmetic
             omission: without the slot a new member is saved into the library
             and its team is left empty, which is the whole bug. */
          <BuildForm
            buildId={screen.buildId}
            origin={screen.origin}
            generation={generation}
            slot={screen.slot}
            seed={screen.seed}
          />
        )}
      </ScrollArea>
    </div>
  )
}
