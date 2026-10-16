import type { ToolsPageId } from './pages'

/**
 * The Frontier Brain whose facility a tool explains, by trainer class: the
 * Trainer Dex shows a link to the tool on that Brain's entry (docs/tools/PLAN.md:
 * #20 from Spenser, #21 from Greta, #22 from Noland and Thorton).
 */
export const BRAIN_TOOLS: Readonly<Record<string, { page: ToolsPageId; label: string }>> = {
  TRAINER_CLASS_PALACE_MAVEN: { page: 'tool-palace', label: 'Battle Palace odds' },
}

export const hasBrainTool = (classId: string | null | undefined): boolean =>
  classId != null && classId in BRAIN_TOOLS
