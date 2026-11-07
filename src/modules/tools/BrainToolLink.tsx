import { useNav } from '../nav/navContext'
import { BRAIN_TOOLS } from './brainTools'
import './tools.css'

/** The Trainer Dex's link from a Frontier Brain to the tool for their facility. */
export function BrainToolLink({ classId }: { classId: string }) {
  const { setModule } = useNav()
  const tool = BRAIN_TOOLS[classId]
  if (!tool) return null
  return (
    <button
      type="button"
      className="tools-link"
      data-testid="trainerdex-tool-link"
      onClick={() => setModule(tool.page)}
    >
      {tool.label}
    </button>
  )
}
