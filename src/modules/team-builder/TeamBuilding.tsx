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
import { useNav } from '../nav/navContext'
import { useVersionGroup } from '../version-group/context'
import { BuildForm } from './BuildForm'
import { BuildLibrary } from './BuildLibrary'
import { MyTeams } from './MyTeams'
import { TeamViewer } from './TeamViewer'
import { newBuildInit } from './buildFacts'
import { createBuild, createTeam } from './store'
import { goTo, useTbScreen, type TbScreen } from './tbNav'
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
      const build = createBuild(newBuildInit(generation))
      goTo({ kind: 'build-form', buildId: build.id, origin: { kind: 'library' } })
      return
    }
    const root = rootScreenFor(nav.moduleId)
    if (root) goTo(root)
  }, [nav.moduleId, nav.moduleNonce, generation])

  return (
    <div className="tb" data-tb-screen={screen.kind} data-generation={generation}>
      {screen.kind === 'my-teams' && <MyTeams generation={generation} />}
      {screen.kind === 'team-viewer' && <TeamViewer teamId={screen.teamId} />}
      {screen.kind === 'build-library' && <BuildLibrary generation={generation} />}
      {screen.kind === 'build-form' && (
        <BuildForm buildId={screen.buildId} origin={screen.origin} generation={generation} />
      )}
    </div>
  )
}
