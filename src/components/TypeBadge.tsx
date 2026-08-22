import { getType } from '../data'
import { typeColor } from './typeColors'

export function TypeBadge({ typeId, small = false }: { typeId: number; small?: boolean }) {
  const type = getType(typeId)
  if (!type) return null
  return (
    <span
      className={small ? 'type-badge type-badge-sm' : 'type-badge'}
      style={{ backgroundColor: typeColor(type.name) }}
      data-type={type.name}
    >
      {type.name}
    </span>
  )
}
