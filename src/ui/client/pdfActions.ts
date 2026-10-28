export const MAX_PDF_BYTES = 50 * 1024 * 1024

export function isPdfFile(f: { type: string; name: string }): boolean {
  return f.type === 'application/pdf' || (f.type === '' && /\.pdf$/i.test(f.name))
}

/** Liefert eine deutsche Fehlermeldung oder null, wenn die Datei akzeptiert wird. */
export function pdfRejection(f: { type: string; name: string; size: number }): string | null {
  if (!isPdfFile(f)) return `„${f.name}“ ist keine PDF-Datei.`
  if (f.size > MAX_PDF_BYTES) return `„${f.name}“ ist zu groß (maximal 50 MB).`
  return null
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

export function formatDateDe(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

const toBlob = (data: Uint8Array) => new Blob([data as BlobPart], { type: 'application/pdf' })

/** Öffnet das PDF in einem neuen Tab; die Object-URL wird nach einer Weile freigegeben. */
export function openPdf(data: Uint8Array): void {
  const url = URL.createObjectURL(toBlob(data))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function downloadPdf(data: Uint8Array, name: string): void {
  const url = URL.createObjectURL(toBlob(data))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
