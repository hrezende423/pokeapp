/**
 * Moving an export (documentStore.exportDocuments) in and out of a file. No UI:
 * a screen supplies the button and the <input type="file">.
 */

/** `pokeapp-backup-2026-11-07.json`, by the local date. */
export function backupFileName(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `pokeapp-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`
}

/** Hand `text` to the browser as a downloaded file. */
export function downloadText(text: string, fileName: string = backupFileName(), type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked on the next task: some browsers start the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** The text of a file the reader chose, for `importDocuments`. */
export function readFileText(file: Blob): Promise<string> {
  return file.text()
}
