import type { ReactNode } from 'react'
import { TypeRow } from './TypeLabel'

/**
 * Ledger list row: the dex number gets a full column with its own vertical rule,
 * which is the system's signature move -- the catalog number is treated as the
 * subject, not a caption (DESIGN-SYSTEM.md §2).
 *
 * DIM RULE: the number's opacity ties to caught / not-caught (100% / 40%), the
 * app's only tracked binary state. It is NOT a separate "seen" concept -- §8
 * settled that, superseding §5's earlier "~35% for unseen entries" wording, and
 * the values come from --ledger-num-opacity-*. The artwork itself never dims;
 * a silhouette-until-caught system would be a real feature decision.
 *
 * NOTE: nothing in the app tracks caught state yet, so `caught` is a prop with no
 * store behind it. That is deliberate -- wiring it to invented state would be
 * worse than leaving the seam visible.
 *
 * The sprite is a small outlined circle. §5 specifies "outlined (not filled) in
 * the placeholder state", so a real image renders inside that same outlined
 * circle and the empty circle remains the placeholder.
 *
 * THE `plain` VARIANT drops the number column and its vertical rule. It is the
 * row of a grouped species list on a dex detail page (an ability's holders, a
 * move's learners), where the species is related data rather than the subject
 * and the catalog-number treatment is exactly the chrome those pages shed
 * (owner, 2026-10-10). The name there is regular weight, as item names are
 * everywhere in the system. `aside` is a trailing muted value -- a learn level.
 */
export function LedgerRow({
  dexNumber,
  name,
  types,
  spriteUrl,
  caught = false,
  onClick,
  variant = 'ledger',
  aside,
}: {
  dexNumber: number
  name: string
  types: string[]
  spriteUrl?: string | null
  caught?: boolean
  onClick?: () => void
  variant?: 'ledger' | 'plain'
  aside?: ReactNode
}) {
  return (
    <button
      type="button"
      className="ds-ledger-row"
      data-ds="ledger-row"
      data-caught={caught}
      data-dex={dexNumber}
      data-variant={variant}
      onClick={onClick}
    >
      {variant === 'ledger' && (
        <>
          <span className="ds-ledger-num" data-ds="ledger-num">
            {String(dexNumber).padStart(3, '0')}
          </span>
          <span className="ds-ledger-rule" aria-hidden />
        </>
      )}
      <span className="ds-ledger-sprite" data-ds="ledger-sprite">
        {spriteUrl && <img src={spriteUrl} alt="" loading="lazy" />}
      </span>
      <span className="ds-ledger-name">{name}</span>
      <TypeRow types={types} small />
      {aside != null && (
        <span className="ds-ledger-aside" data-ds="ledger-aside">
          {aside}
        </span>
      )}
    </button>
  )
}
