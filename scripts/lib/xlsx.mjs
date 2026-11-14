/**
 * Read an .xlsx's first worksheet with no dependency: the zip's central directory,
 * inflateRaw, and the sheet XML. Shared by verify:frontier-data and the Frontier
 * mockup generator (scripts/mockups/frontier.mjs); both read docs/fixtures/bf-tracker.xlsx.
 */
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

/** The first worksheet of an .xlsx as [{ r, cells: { A: 'text', ... } }]: zip + XML, no dependency. */
export function readSheet(file) {
  const buf = readFileSync(file)
  let eocd = buf.length - 22
  while (buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1
  const entries = {}
  let p = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < buf.readUInt16LE(eocd + 10); i += 1) {
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const skip = nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(start, start + size)
    entries[name] = (method === 8 ? inflateRawSync(raw) : raw).toString('utf8')
    p += 46 + skip
  }
  const text = (s) =>
    s.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e] ?? String.fromCodePoint(Number(e.slice(1))))
  const shared = [...(entries['xl/sharedStrings.xml'] ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    text([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  )
  const firstSheet = /<sheet [^>]*r:id="(\w+)"/.exec(entries['xl/workbook.xml'])[1]
  const target = new RegExp(`Id="${firstSheet}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${firstSheet}"`).exec(entries['xl/_rels/workbook.xml.rels'])
  const sheet = entries[`xl/${(target[1] ?? target[2]).replace(/^\/?xl\//, '')}`]
  return [...sheet.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].map((row) => ({
    r: Number(row[1]),
    cells: Object.fromEntries(
      [...row[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)]
        .map((c) => {
          const type = /t="(\w+)"/.exec(c[2])?.[1]
          const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] ?? '')?.[1]
          const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[3] ?? '')?.[1]
          const value = type === 's' ? shared[Number(v)] : type === 'inlineStr' ? text(inline ?? '') : v != null ? text(v) : null
          return [c[1], value?.trim()]
        })
        .filter(([, v]) => v),
    ),
  }))
}
