/**
 * Fetches the raw wikitext of every Gen 1-4 item page, IN A REAL BROWSER TAB.
 *
 * WHY A BROWSER SNIPPET AND NOT A NODE SCRIPT. Since 2026 Bulbapedia sits behind
 * a Cloudflare challenge that answers curl, Node's fetch and headless Chromium
 * with a 403 "Just a moment..." page -- checked all three on 2026-10-11. A tab in
 * an ordinary browser passes the challenge once, after which the wiki's own
 * api.php answers same-origin requests normally. So the fetch is split from the
 * parse: this file only downloads, scripts/build-item-supplement.mjs only reads
 * what it downloaded, and the parse can be re-run offline as often as needed.
 *
 * HOW TO RUN IT
 *   1. `node scripts/build-item-supplement.mjs --titles` prints the title list.
 *   2. Open any https://bulbapedia.bulbagarden.net/wiki/... page in a browser.
 *   3. In its devtools console, set `window.__titles = <that list>` and paste
 *      this file. It saves `bulbapedia-items.json`.
 *   4. Move that file to .cache/bulbapedia/items.json and run
 *      `npm run build:item-supplement`.
 *
 * ETIQUETTE, the same as build-supplement.mjs: 50 titles per request (the API's
 * own batch limit), one request at a time, 1.5 s apart -- about a dozen requests
 * for the whole item list.
 */
;(async () => {
  const names = window.__titles
  if (!Array.isArray(names)) throw new Error('set window.__titles first')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  async function fetchTitles(titles) {
    const out = {}
    for (let i = 0; i < titles.length; i += 50) {
      const chunk = titles.slice(i, i + 50)
      const body = new URLSearchParams({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main',
        redirects: '1',
        format: 'json',
        formatversion: '2',
        titles: chunk.join('|'),
      })
      const r = await fetch('/w/api.php', { method: 'POST', body })
      const j = await r.json()
      const back = {}
      for (const n of j.query.normalized ?? []) back[n.to] = n.from
      const redir = {}
      for (const n of j.query.redirects ?? []) redir[n.to] = (redir[n.to] ?? []).concat(n.from)
      for (const p of j.query.pages) {
        const sources = new Set([p.title])
        for (const f of redir[p.title] ?? []) sources.add(f)
        for (const s of [...sources]) if (back[s]) sources.add(back[s])
        for (const s of sources) {
          out[s] = {
            title: p.title,
            missing: !!p.missing,
            wikitext: p.revisions?.[0]?.slots?.main?.content ?? null,
          }
        }
      }
      await sleep(1500)
    }
    return out
  }

  // PokeAPI spells King's Rock with a typographic apostrophe; the wiki does not.
  const asTitle = (n) => n.replace(/’/g, "'")
  const isItemPage = (e) =>
    e && !e.missing && e.wikitext && /ItemInfobox|ItemAvailability|ItemPrice/i.test(e.wikitext)

  // A name that is also a move or a gem (Metronome, Ruby) lives at "<name> (item)".
  const first = await fetchTitles(names.map(asTitle))
  const misses = names.filter((n) => !isItemPage(first[asTitle(n)]))
  const second = await fetchTitles(misses.map((n) => `${asTitle(n)} (item)`))

  const pages = {}
  for (const n of names) {
    const a = first[asTitle(n)]
    const b = second[`${asTitle(n)} (item)`]
    pages[n] = isItemPage(a)
      ? { query: asTitle(n), ...a }
      : isItemPage(b)
        ? { query: `${asTitle(n)} (item)`, ...b }
        : { query: asTitle(n), ...(a ?? { missing: true, wikitext: null }) }
  }

  const blob = new Blob(
    [JSON.stringify({ fetched: new Date().toISOString(), source: location.host, pages })],
    { type: 'application/json' },
  )
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'bulbapedia-items.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
})()
