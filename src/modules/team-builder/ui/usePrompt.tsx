/**
 * One place to ask a question before doing something irreversible.
 *
 * Split into its own file because it exports a hook and a type rather than a
 * component -- mixing those with the component that renders them trips
 * `react-refresh/only-export-components`, which is enforced here.
 *
 * `confirm` is the common case (destructive yes/no) and `ask` is the general one,
 * used by the shared-build prompt where there are THREE outcomes and no obvious
 * default. Nothing in this module deletes, resets or replaces without going
 * through one of them.
 */

import { useCallback, useState } from 'react'

export interface PromptAction {
  label: string
  /** Renders in the accent and sits after the separator. */
  danger?: boolean
  /** Omit for a pure dismiss (Cancel). */
  onPick?: () => void
  testId?: string
}

export interface PromptConfig {
  title: string
  body?: string
  actions: PromptAction[]
  testId?: string
}

export function usePrompt() {
  const [config, setConfig] = useState<PromptConfig | null>(null)

  const close = useCallback(() => setConfig(null), [])
  const ask = useCallback((next: PromptConfig) => setConfig(next), [])

  const confirm = useCallback(
    (
      title: string,
      onConfirm: () => void,
      opts: { body?: string; confirmLabel?: string; testId?: string } = {},
    ) =>
      setConfig({
        title,
        body: opts.body,
        testId: opts.testId,
        actions: [
          { label: 'Cancel', testId: 'tb-prompt-cancel' },
          {
            label: opts.confirmLabel ?? 'Delete',
            danger: true,
            onPick: onConfirm,
            testId: 'tb-prompt-confirm',
          },
        ],
      }),
    [],
  )

  return { config, ask, confirm, close }
}
