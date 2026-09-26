import { useState, type ChangeEvent } from 'react'

/**
 * A number field that can be EMPTY while you type.
 *
 * Clamping on every keystroke broke ordinary typing: clearing a Level field
 * snapped it to 1, so typing "50" next produced "150" -> 100, and clearing an EV
 * field left a "0" in front of whatever came next ("0252"). This keeps the text
 * as typed, commits each keystroke that parses (clamped), and puts the committed
 * value back on blur -- so an abandoned empty field reads its real value again.
 *
 * Spread the result onto an <input type="number"> (or a TextField).
 */
export function useDraftNumber(
  value: number,
  commit: (next: number) => void,
  { min = 0, max }: { min?: number; max: number },
) {
  const [draft, setDraft] = useState(String(value))
  const [seen, setSeen] = useState(value)

  // The committed value moved from outside (a clamp, a reset, another control):
  // show it. Adjusting state from a prop during render, React's own pattern.
  if (value !== seen) {
    setSeen(value)
    setDraft(String(value))
  }

  return {
    value: draft,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value
      setDraft(text)
      if (text.trim() === '') return
      const n = Number(text)
      if (!Number.isFinite(n)) return
      const clamped = Math.max(min, Math.min(max, Math.round(n)))
      if (clamped !== n) setDraft(String(clamped))
      setSeen(clamped)
      commit(clamped)
    },
    onBlur: () => setDraft(String(value)),
  }
}
