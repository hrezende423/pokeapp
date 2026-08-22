import { getType } from '../data'

/** Canonical type colours, keyed by PokeAPI type id. */
const TYPE_COLORS: Record<number, string> = {
  1: '#9099a1', // normal
  2: '#ce4069', // fighting
  3: '#8fa8dd', // flying
  4: '#ab6ac8', // poison
  5: '#d97746', // ground
  6: '#c7b78b', // rock
  7: '#90c12c', // bug
  8: '#5269ad', // ghost
  9: '#5a8ea1', // steel
  10: '#ff9c54', // fire
  11: '#4d90d5', // water
  12: '#63bb5b', // grass
  13: '#f3d23b', // electric
  14: '#f97176', // psychic
  15: '#74cec0', // ice
  16: '#0a6dc4', // dragon
  17: '#5a5366', // dark
  18: '#ec8fe6', // fairy
}

export function TypeBadge({ typeId, small = false }: { typeId: number; small?: boolean }) {
  const type = getType(typeId)
  if (!type) return null
  return (
    <span
      className={small ? 'type-badge type-badge-sm' : 'type-badge'}
      style={{ backgroundColor: TYPE_COLORS[typeId] ?? '#777' }}
      data-type={type.name}
    >
      {type.name}
    </span>
  )
}
