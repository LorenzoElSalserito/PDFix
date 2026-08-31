import { describe, expect, it } from 'vitest'
import { isRunnable, unavailableReason } from '../src/composables/useOperations.js'
import { useDocuments } from '../src/composables/useDocuments.js'
import { isDarkTheme } from '../src/composables/useTheme.js'

const merge = { name: 'merge', label: 'Unisci PDF', minFiles: 2, maxFiles: null }
const convert = { name: 'convert', label: 'Converti', minFiles: 1, maxFiles: 1 }
const immagini = { name: 'images', label: 'Immagini', minFiles: 1, maxFiles: null, inputExtensions: ['.jpg', '.png'] }

/** Documenti finti: conta solo il nome, da cui si ricava l estensione. */
const pdf = (count) => Array.from({ length: count }, (_, index) => ({ name: `f${index}.pdf` }))

describe('disponibilita delle operazioni', () => {
  it('rispetta il numero minimo di file', () => {
    expect(isRunnable(merge, pdf(1))).toBe(false)
    expect(isRunnable(merge, pdf(2))).toBe(true)
    expect(isRunnable(merge, pdf(50))).toBe(true)
  })

  it('rispetta il numero massimo di file', () => {
    expect(isRunnable(convert, pdf(1))).toBe(true)
    expect(isRunnable(convert, pdf(2))).toBe(false)
  })

  it('rispetta i tipi di file accettati', () => {
    expect(isRunnable(immagini, pdf(1))).toBe(false)
    expect(isRunnable(immagini, [{ name: 'foto.jpg' }, { name: 'logo.png' }])).toBe(true)
    expect(isRunnable(merge, [{ name: 'a.pdf' }, { name: 'foto.jpg' }])).toBe(false)
  })

  it('spiega perche un operazione non e disponibile', () => {
    expect(unavailableReason(merge, pdf(1))).toMatch(/almeno 2 file/)
    expect(unavailableReason(convert, pdf(3))).toMatch(/Massimo 1 file/)
    expect(unavailableReason(immagini, pdf(1))).toMatch(/solo file \.jpg/)
    expect(unavailableReason(convert, pdf(1))).toBe('')
  })
})

describe('elenco documenti', () => {
  it('aggiunge, deduplica, rimuove e svuota', () => {
    const { documents, add, remove, clear, paths, count, totalSize } = useDocuments()
    add([{ path: '/a.pdf', name: 'a.pdf', size: 10 }, { path: '/b.pdf', name: 'b.pdf', size: 20 }])
    expect(count.value).toBe(2)
    expect(totalSize.value).toBe(30)

    add([{ path: '/a.pdf', name: 'a.pdf', size: 10 }])
    expect(count.value).toBe(2)

    expect(paths.value).toEqual(['/a.pdf', '/b.pdf'])
    remove(documents.value[0].id)
    expect(paths.value).toEqual(['/b.pdf'])
    clear()
    expect(count.value).toBe(0)
  })

  it('assegna identificatori distinti', () => {
    const { documents, add } = useDocuments()
    add([{ path: '/a.pdf', name: 'a.pdf', size: 1 }, { path: '/b.pdf', name: 'b.pdf', size: 1 }])
    expect(documents.value[0].id).not.toBe(documents.value[1].id)
  })
})

describe('tema', () => {
  it('traduce la scelta dell utente in chiaro o scuro', () => {
    expect(isDarkTheme('scuro', false)).toBe(true)
    expect(isDarkTheme('chiaro', true)).toBe(false)
    expect(isDarkTheme('sistema', true)).toBe(true)
    expect(isDarkTheme('sistema', false)).toBe(false)
    expect(isDarkTheme(undefined, undefined)).toBe(false)
  })
})
