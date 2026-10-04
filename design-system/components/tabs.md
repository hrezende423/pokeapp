# Tabs
**Purpose:** split content users rarely compare together (Info / Learnset / Description / Sprites). **Not for:** global navigation (nav.md), filters that change a list (dropdown or toggles).
**Style:** text only, no underline, no background. Idle `text.muted`; hover `text.default`; selected `color.accent.default` (regular weight, decided 2026-10-04). Optional muted count after the label (12px). Row sits on a 1px `border.hairline`.
| State | Look |
|---|---|
| idle | `text.muted` |
| hover | `text.default` |
| focus-visible | 2px `border.focus` inset ring |
| selected | `accent.default` |
| disabled | `text.disabled`, not focusable |
**Accent budget:** a screen already has the active nav item in accent; tabs make it 2, the maximum (PRINCIPLES #3). A second tab row on the same screen must use `text.default` instead of accent.
**Known risk:** the selected tab is distinguished by color alone visually (plus `aria-selected`, position). On dark the accent is 3.3:1 on canvas (accepted exception). If users miss the selection, add semibold back.
**Layout:** height `--d-field`; gap 20px; labels never wrap; overflow scrolls horizontally. Max ~6 tabs, beyond that use a dropdown.
**A11y:** `role=tablist/tab/tabpanel`, `aria-selected`, `aria-controls`; ←/→ move and select, Home/End.
