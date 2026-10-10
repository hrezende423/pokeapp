import type { ReactNode } from 'react'

/**
 * Key-value list, per design-system/components/key-value-list.md: a <dl> of
 * muted labels and values, with nothing in a box.
 *
 * TWO LAYOUTS, ONE COMPONENT.
 *
 *   rows   the spec's list: label left, value right, a hairline between rows.
 *          Secondary facts -- the things a reader looks up rather than reads.
 *   strip  the same pairs side by side, label above value, no hairlines. For the
 *          two to four headline numbers of an entry (a move's Power / Accuracy /
 *          PP, an item's Buy / Sell). Emphasis is SIZE, never weight: the values
 *          stay regular, as every mono value does (PRINCIPLES.md, weights).
 *
 * Each row is a <div> holding its <dt>/<dd> pair, which HTML allows inside a
 * <dl> and which gives a row something to lay out and to address in a test.
 * The optional test id goes on the <dd>, so a check reads the value alone and
 * never has to unpick the label from it.
 *
 * An empty list renders nothing rather than an empty <dl>: a section with no
 * facts to state should not leave a gap where they would have been.
 */
export interface KeyValueItem {
  label: string
  value: ReactNode
  /** Test id for the value cell. */
  testId?: string
}

export function KeyValueList({
  items,
  layout = 'rows',
  testId,
}: {
  items: KeyValueItem[]
  layout?: 'rows' | 'strip'
  testId?: string
}) {
  if (items.length === 0) return null
  return (
    <dl className={`ds-kv ds-kv-${layout}`} data-ds="key-value-list" data-testid={testId}>
      {items.map((item) => (
        <div className="ds-kv-row" key={item.label}>
          <dt className="ds-kv-label">{item.label}</dt>
          <dd className="ds-kv-value" data-testid={item.testId}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
