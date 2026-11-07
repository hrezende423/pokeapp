import { ScrollArea } from '../../components/ScrollArea'
import { scrollKey } from '../../components/scrollMemory'
import { setCalculatorsTab } from '../calculators/calculatorsHandoff'
import { useNav } from '../nav/navContext'
import { useVersionGroup } from '../version-group/context'
import { toolAvailability, type Availability } from './gates'
import { TOOL_GROUPS, TOOLS, type ToolEntry } from './registry'
import '../../components/ds/ds.css'
import '../calculators/calculators.css'
import './tools.css'

/**
 * The Tools index: every tool, grouped, one line each. Clicking the Tools tab
 * opens it; the tab's dropdown is unchanged.
 *
 * Rendered from ./registry.ts and nothing else, so a new tool appears here by
 * adding its entry. A tool that cannot answer in the app's generation stays
 * listed, DISABLED, with the reason beside it -- hidden would read as "this app
 * has no such tool".
 *
 * NAMED REGIONS: `tools-index`, areas `title` and `groups`.
 */
export function ToolsIndex() {
  const { setModule } = useNav()
  const app = useVersionGroup()
  const generation = app.isAll ? null : app.generation

  const open = (tool: ToolEntry) => {
    if (tool.target.kind === 'calculator') {
      setCalculatorsTab(tool.target.tab)
      setModule('calculators')
    } else {
      setModule(tool.target.id)
    }
  }

  return (
    <div className="calc tools-index" data-layout="tools-index" data-testid="tools-index">
      <h1 className="calc-title tools-index-title">Tools</h1>
      <ScrollArea
        className="tools-index-groups"
        testId="tools-scroll-area"
        memoryKey={scrollKey('tools-index')}
      >
        <div className="calc-content">
          {TOOL_GROUPS.map((group) => {
            const tools = TOOLS.filter((t) => t.group === group.id)
            if (tools.length === 0) return null
            return (
              <div key={group.id} className="calc-section" data-testid={`tools-group-${group.id}`}>
                <h2 className="calc-section-heading">{group.label}</h2>
                <ul className="tools-list">
                  {tools.map((tool) => {
                    const availability: Availability = tool.gate
                      ? toolAvailability(tool.gate, generation)
                      : { ok: true }
                    return (
                      <li key={tool.key} className="tools-item" data-testid={`tools-item-${tool.key}`}>
                        <button
                          type="button"
                          className="tools-link"
                          data-testid={`tool-link-${tool.key}`}
                          disabled={!availability.ok}
                          onClick={() => open(tool)}
                        >
                          {tool.label}
                        </button>
                        <span className="tools-blurb">{tool.blurb}</span>
                        {!availability.ok && (
                          <span className="tools-reason" data-testid={`tool-reason-${tool.key}`}>
                            {availability.reason}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
