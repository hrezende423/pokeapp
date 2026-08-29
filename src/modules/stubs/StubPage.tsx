import { useNav } from '../nav/navContext'
import { findStub } from './stubPages'

/**
 * The placeholder every unbuilt destination renders.
 *
 * One component rather than ten: it reads which page is open from the nav and
 * looks its own label up, so adding a stub destination is a line in
 * stubPages.ts and nothing else. Nothing here is styled beyond the tokens
 * already in play -- it is scaffolding, and looking finished would be a lie
 * about what exists.
 */
export function StubPage() {
  const { moduleId } = useNav()
  const stub = findStub(moduleId)
  const label = stub?.label ?? moduleId

  return (
    <section className="stub-page" data-testid={`stub-${moduleId}`} data-stub-id={moduleId}>
      <h2 className="stub-page-title">{label}</h2>
      <p className="stub-page-note">
        Nothing is built here yet. The nav entry exists so the structure is navigable; this screen
        is a placeholder, not a feature in progress.
      </p>
    </section>
  )
}
