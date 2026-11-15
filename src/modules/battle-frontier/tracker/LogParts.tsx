import { getItem } from '../../../data'
import type { BrainAppearance, FacilityId, FrontierData } from '../data'
import { speciesName } from '../names'
import { Joined, MonCell, Muted } from '../parts'

/** Cells shared by the battle log (TrackerPage.tsx) and the Pyramid's floor log (PyramidPanel.tsx). */

/** Three opponents (Unknown included), each with its Emerald sprite, as Trainer Dex parties. */
export function Opponents({ ids }: { ids: (number | null)[] }) {
  return (
    <span className="bf-opps">
      <Joined sep={<Muted> · </Muted>} items={ids.map((id, i) => <MonCell key={i} speciesId={id ?? undefined} />)} />
    </span>
  )
}

export function BrainCell({
  data,
  facility,
  b,
  opponents,
}: {
  data: FrontierData
  facility: FacilityId
  b: BrainAppearance | undefined
  opponents: (number | null)[]
}) {
  if (!b) return null
  const who = data.brains().find((x) => x.facility === facility)
  if (!who) return null
  const label = `${who.name} · ${b.symbol === 'silver' ? 'Silver' : 'Gold'}`
  if (!who.teams) {
    return (
      <>
        {label}
        <br />
        <span className="bf-cap">Generated team: nothing to compare</span>
      </>
    )
  }
  const known = who.teams[b.symbol].map((m) => m.species_id)
  const match = known.join() === opponents.join()
  return (
    <>
      {label}
      <br />
      <span className="bf-cap">
        Known team: {known.map((id) => (id == null ? '—' : speciesName(id))).join(', ')} ·{' '}
        {match ? 'matches' : 'differs'}
      </span>
    </>
  )
}

/** An item's 32 px sprite, when the item data has one (nothing otherwise). */
export function ItemSprite({ id }: { id: number }) {
  const src = getItem(id)?.sprite
  return src ? <img className="bf-sprite" src={src} alt="" width={32} height={32} loading="lazy" /> : null
}
