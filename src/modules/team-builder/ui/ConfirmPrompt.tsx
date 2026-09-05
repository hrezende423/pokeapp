/**
 * The renderer for `usePrompt`.
 *
 * THE DESTRUCTIVE ACTION IS SEPARATED, not merely coloured: safe actions sit in
 * one group, then a gap, then anything marked `danger`. That is the same rule the
 * kebab and the dock follow, so "the dangerous one is set apart" reads the same
 * way everywhere in the module rather than being re-invented per surface.
 */

import { Modal } from './Overlay'
import type { PromptConfig } from './usePrompt'

export function ConfirmPrompt({ config, onClose }: { config: PromptConfig; onClose: () => void }) {
  const safe = config.actions.filter((a) => !a.danger)
  const danger = config.actions.filter((a) => a.danger)

  return (
    <Modal title={config.title} onClose={onClose} testId={config.testId ?? 'tb-prompt'}>
      {config.body && <p className="tb-prompt-body">{config.body}</p>}
      <div className="tb-prompt-actions">
        <div className="tb-prompt-group">
          {safe.map((action) => (
            <button
              key={action.label}
              type="button"
              className="tb-ghost tb-ghost-md"
              data-testid={action.testId}
              onClick={() => {
                action.onPick?.()
                onClose()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
        {danger.length > 0 && <span className="tb-prompt-sep" aria-hidden />}
        <div className="tb-prompt-group">
          {danger.map((action) => (
            <button
              key={action.label}
              type="button"
              className="tb-ghost tb-ghost-md"
              data-danger="true"
              data-testid={action.testId}
              onClick={() => {
                action.onPick?.()
                onClose()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
