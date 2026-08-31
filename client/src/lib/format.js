/** Formattazioni condivise dall'interfaccia. */

export function formatSize(bytes) {
  if (bytes === null || bytes === undefined || bytes === '') return '—'
  const value = Number(bytes)
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** Rende leggibile un limite di memoria espresso in MB. */
export function formatMemory(megabytes) {
  if (megabytes === null || megabytes === undefined || megabytes === '') return '—'
  const value = Number(megabytes)
  if (!Number.isFinite(value)) return '—'
  return value >= 1024 ? `${(value / 1024).toFixed(value % 1024 === 0 ? 0 : 1)} GB` : `${value} MB`
}
