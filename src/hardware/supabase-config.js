/**
 * Supabase REST client for the hardware-events table
 * ==================================================
 *
 * Talks to the same Supabase project the ESP32 Home Base posts to.
 * The anon key is safe to ship in the browser — RLS limits it to
 * INSERT/SELECT on `public.hardware_events` only.
 *
 * To repoint at a different project, edit the two constants below.
 */

export const SUPABASE_URL = 'https://mkxxnpahwnvapooecfqz.supabase.co'
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1reHhucGFod252YXBvb2VjZnF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjcxMDYsImV4cCI6MjA5NjUwMzEwNn0.' +
  'IowuWIimf3mu-gbrxwSR1xJfC8tpAhv7mCsPxSrEE-U'

/**
 * Fetch the most recent N hardware events ordered by timestamp DESC.
 * Returns an array of { id, timestamp, source, event }.
 * Throws on network / HTTP errors so callers can surface them.
 */
export async function fetchHardwareEvents({ limit = 100 } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/hardware_events` +
    `?select=id,timestamp,source,event` +
    `&order=timestamp.desc` +
    `&limit=${limit}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Supabase ${res.status}: ${text || res.statusText}`)
  }
  return res.json()
}
