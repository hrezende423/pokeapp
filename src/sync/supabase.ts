/**
 * The Supabase client for the optional cloud sync (teamSync.ts).
 *
 * THE KEY IS PUBLIC BY DESIGN. A publishable key is meant to ship in the page:
 * it identifies the project, and what it can reach is decided by the row-level
 * security on the table (one row per user, readable and writable only by that
 * user -- see the `team_builder_docs` migration). No secret lives in the app.
 *
 * Sign-in is GitHub OAuth with the PKCE flow: the provider redirects back to the
 * app with a `?code=`, which `detectSessionInUrl` exchanges for a session, and
 * the session then persists in localStorage like every other thing this app
 * remembers.
 */

import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://assooegomidatlnwbepb.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Kvka3Z7JtyVFE5FXDfKBtQ_d7g_8otx'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'pokeapp:auth',
  },
})

/** Where GitHub sends the reader back to: this app's own root, on whichever host it runs. */
export const authRedirectUrl = (): string =>
  new URL(import.meta.env.BASE_URL, window.location.origin).toString()
