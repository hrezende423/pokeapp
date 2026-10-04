# EV / IV strip
**Purpose:** set EVs and IVs for the six stats in one compact block (build form, Pokémon collection). Composes slider, text field (number) and key-value styles.
**Columns:** STAT (label-caps, muted) · EV slider · EV field (mono, right-aligned, 56px) · IV field (44px) · TOTAL (resulting stat at the entered level, mono, right). Header row in label-caps with a hairline; footer row "Left" = 510 − ΣEV.
**Rules:** EV 0–252 step 4, IV 0–31, fields clamp and snap on blur; Σ EV > 510 → footer shows `⚠ over by N` in `action.danger` (text + icon, never color alone) and the offending fields get the error underline; the slider is dropped under `breakpoint.sm` (fields remain, ≥44px rows on touch).
**Density:** row height `--d-row` (32 compact). Closed `section` summary: "EVs: 252 Atk / 4 SpD / 252 Spe".
**A11y:** each control labeled "<Stat> EV", "<Stat> IV"; total announced with `aria-live="polite"` as "EVs left: N".
