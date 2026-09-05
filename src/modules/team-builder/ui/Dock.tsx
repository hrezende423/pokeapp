/**
 * The two "cluster of actions" surfaces, sharing one item shape.
 *
 * DOCK is icon-only and always laid out; it appears on hover of its parent
 * (screen or card) and each icon highlights individually on direct hover. It sits
 * upper-right, BELOW the navbar -- it belongs to the screen it acts on, not to
 * the app bar, and putting it in the bar would imply it acts on the whole app.
 *
 * KEBAB is a labelled menu behind a "⋮", for a row that has no room for six
 * icons. My Teams uses it; Team Viewer and Build Form use the dock.
 *
 * BOTH SEPARATE THE DESTRUCTIVE ITEM by a divider, driven off `danger` on the
 * item rather than off its index, so a caller cannot accidentally order Delete
 * into the middle of the safe group.
 */

import { useState, type ReactNode } from 'react'
import { IconDotsVertical } from '@tabler/icons-react'
import { IconButton } from './GhostButton'
import { Popover } from './Overlay'

export interface DockItem {
  icon: ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  testId?: string
}

function partition(items: DockItem[]) {
  return { safe: items.filter((i) => !i.danger), danger: items.filter((i) => i.danger) }
}

export function Dock({ items, testId }: { items: DockItem[]; testId?: string }) {
  const { safe, danger } = partition(items)
  return (
    <div className="tb-dock" data-testid={testId}>
      {safe.map((item) => (
        <IconButton
          key={item.label}
          icon={item.icon}
          label={item.label}
          onClick={item.onClick}
          testId={item.testId}
        />
      ))}
      {danger.length > 0 && <span className="tb-dock-sep" aria-hidden />}
      {danger.map((item) => (
        <IconButton
          key={item.label}
          icon={item.icon}
          label={item.label}
          onClick={item.onClick}
          testId={item.testId}
          danger
        />
      ))}
    </div>
  )
}

export function Kebab({ items, testId }: { items: DockItem[]; testId?: string }) {
  const [open, setOpen] = useState(false)
  const { safe, danger } = partition(items)

  const row = (item: DockItem) => (
    <button
      key={item.label}
      type="button"
      className="tb-menu-item"
      data-danger={item.danger ? 'true' : undefined}
      data-testid={item.testId}
      onClick={(e) => {
        e.stopPropagation()
        setOpen(false)
        item.onClick()
      }}
    >
      <span className="tb-menu-icon">{item.icon}</span>
      <span>{item.label}</span>
    </button>
  )

  return (
    <div className="tb-kebab">
      <IconButton
        icon={<IconDotsVertical size={18} stroke={1.5} />}
        label="Actions"
        testId={testId}
        active={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <Popover
          onClose={() => setOpen(false)}
          align="left"
          testId={testId ? `${testId}-menu` : undefined}
        >
          <div className="tb-menu">
            {safe.map(row)}
            {danger.length > 0 && <span className="tb-menu-sep" aria-hidden />}
            {danger.map(row)}
          </div>
        </Popover>
      )}
    </div>
  )
}
