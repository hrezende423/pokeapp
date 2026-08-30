import { useState } from 'react'
import { itemArtworkUrl, itemIconUrl } from '../data/itemArtwork'
import type { Item } from '../data'

/**
 * An item's largest available image, degrading honestly when there isn't one.
 *
 * Two sources, in order (see data/itemArtwork.ts for what was measured):
 *
 *   90x90 Dream World png   284 of 561 items -- and all 64 berries
 *   30x30 in-game icon      561 of 563 items, the bundle's own `sprite`
 *
 * There is no official-artwork equivalent for items the way species have one, so
 * the Dream World set is genuinely the largest thing that exists, and it covers
 * only half. Rather than probe 561 URLs at build time and put a network fetch
 * inside an otherwise hermetic build, the larger image is requested first and
 * `onError` swaps in the icon. The browser caches the 404, so a given item pays
 * for the miss once.
 *
 * THE FALLBACK IS RENDERED PIXELATED. A 30x30 sprite scaled to 90px is 3x, an
 * exact integer, so nearest-neighbour gives crisp pixel art instead of the
 * mush that smooth interpolation produces at that ratio. `data-source` records
 * which of the two the reader is looking at, so a verification pass can tell the
 * cases apart rather than guessing from pixels.
 */
export function ItemArtwork({
  item,
  size = 96,
  testId,
}: {
  item: Item | undefined
  size?: number
  testId?: string
}) {
  const artwork = itemArtworkUrl(item)
  const icon = itemIconUrl(item)

  /*
    Which item failed, not whether one did. Storing the id makes "has THIS item's
    artwork failed" a derived value, so a new item is automatically un-failed --
    where a boolean would need resetting, and resetting it in an effect is both a
    cascading render and what react-hooks/set-state-in-effect exists to stop.
    Without the reset in any form, one item missing its Dream World image would
    leave every item viewed afterwards on the small icon.
  */
  const [failedId, setFailedId] = useState<number | null>(null)
  const failed = item != null && failedId === item.id

  const src = !failed && artwork ? artwork : icon
  if (!src) return null

  return (
    <img
      className={src === icon ? 'item-artwork item-artwork-icon' : 'item-artwork'}
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      data-testid={testId}
      data-source={src === icon ? 'icon' : 'dream-world'}
      onError={() => setFailedId(item?.id ?? null)}
    />
  )
}
