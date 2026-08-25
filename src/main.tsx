import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// After index.css on purpose: the design system's tokens are the app-wide values,
// and the two files share the name --accent. See src/design-tokens.css.
import './design-tokens.css'
import './theme.ts'
import './pwa.ts'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
