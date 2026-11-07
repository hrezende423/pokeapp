# Feature brief

Copy this into the chat (or a file) when asking for a feature. Five lines is
enough; the two that matter most are **Not doing** and **Done when** — every
reverted redesign in this repo's history was missing a "done when".

```
Goal:       what you want to be able to do or see
Where:      screen + region (use the ?layout=1 region names)
Data:       what it shows, and from which scope (app generation / own selector)
States:     empty / loading / error / mobile — only the non-obvious ones
Not doing:  explicit out of scope
Done when:  2–4 checks you would look at to accept it
```

Optional: a sketch, a screenshot with `?layout=1` on, or a Figma frame. A
visual target before code is the single biggest saver of review rounds.

## What happens next

1. **Questions, once.** Claude replies with every open question in one batch,
   the files it will touch, and the acceptance checks — before any code.
2. **Mockup for new screens.** A new screen or a redesign gets a static mockup
   (tokens, real data) to mark up first. Small changes skip this.
3. **Build + gate.** One branch per feature. "Done" means `npm run check`
   passes (typecheck, lint, build, the suites for the touched areas) and the
   "Done when" lines are asserted in a verify suite where they can be.
4. **Preview link** with screenshots, then **one batched review**: a numbered
   list, regions named from `?layout=1`, all notes in one message.

Target: at most one revision round per feature.

## Review notes that work

- "In `[data-layout=build-form]`, area `stats`: 8px less above the first row."
- "1. … 2. … 3. …" — one message, every note.

Not: "move it up a bit", one note per message.
