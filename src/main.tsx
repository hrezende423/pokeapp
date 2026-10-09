import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// New design system (design-system/dist/tokens.css). BEFORE design-tokens.css on
// purpose: the two share --font-weight-{regular,medium,bold} (medium is 500 here,
// 600 in the app), and the later file wins, so nothing existing moves.
import '../design-system/dist/tokens.css'
// After index.css on purpose: the design system's tokens are the app-wide values,
// and the two files share the name --accent. See src/design-tokens.css.
import './design-tokens.css'
import './theme.ts'
import './pwa.ts'
import App from './App.tsx'
// LAST, after App and therefore after every module's stylesheet: the phone layer
// overrides them at equal specificity. Every rule in it is inside the phone
// media query, so nothing above 640px changes. See src/mobile.css.
import './mobile.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
