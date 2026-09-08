/**
 * Trascinamento dei file nella finestra.
 *
 * È il modo in cui i documenti entrano nell'applicazione più spesso del
 * dialog: qui si verifica l'intero percorso — evento del browser, preload,
 * validazione del processo principale — e non solo che l'area reagisca.
 */

import { expect, test } from '@playwright/test'
import path from 'node:path'
import { addFiles, dragOverUploader, dropFiles, fixtures, launchApp } from './helpers.js'

const fixtureDir = path.dirname(fixtures.first)

/** Avvia l'applicazione con la cartella delle fixture come sorgente dei drop. */
const conTrascinamento = (options = {}) => launchApp({ dropDir: fixtureDir, ...options })

test('i file trascinati entrano nell elenco', async () => {
  const session = await conTrascinamento()
  try {
    const { page } = session
    await dropFiles(page, ['sample1.pdf', 'sample2.pdf'])

    await expect(page.getByTestId('file-item')).toHaveCount(2)
    await expect(page.getByTestId('file-name').first()).toContainText('sample1.pdf')
    await expect(page.getByTestId('file-name').nth(1)).toContainText('sample2.pdf')
    await expect(page.getByTestId('status-error')).toHaveCount(0)
  } finally {
    await session.close()
  }
})

test('un documento trascinato viene elaborato come uno scelto dal dialog', async () => {
  const session = await conTrascinamento()
  try {
    const { page } = session
    await dropFiles(page, ['sample1.pdf', 'sample2.pdf'])
    await expect(page.getByTestId('file-item')).toHaveCount(2)

    await page.getByTestId('action-merge').click()
    await expect(page.getByTestId('status-success')).toContainText(session.outputPath)
    await expect(page.getByTestId('status-success')).toContainText('2 pagine')
  } finally {
    await session.close()
  }
})

test('anche le immagini si trascinano, e i comandi si adeguano', async () => {
  const session = await conTrascinamento()
  try {
    const { page } = session
    await dropFiles(page, ['sample.jpg', 'sample.png'])

    await expect(page.getByTestId('file-item')).toHaveCount(2)
    await expect(page.getByTestId('action-images')).toBeEnabled()
    // Unire due immagini non ha senso: il comando resta lì, ma spento.
    await expect(page.getByTestId('action-merge')).toBeDisabled()
  } finally {
    await session.close()
  }
})

test('un file trascinato che non e un documento viene rifiutato', async () => {
  const session = await conTrascinamento()
  try {
    const { page } = session
    await dropFiles(page, ['inesistente.pdf'])

    await expect(page.getByTestId('status-error')).toContainText('trascinati')
    await expect(page.getByTestId('file-item')).toHaveCount(0)
  } finally {
    await session.close()
  }
})

test('lo stesso file trascinato due volte resta una riga sola', async () => {
  const session = await conTrascinamento()
  try {
    const { page } = session
    await dropFiles(page, ['sample1.pdf'])
    await expect(page.getByTestId('file-item')).toHaveCount(1)

    await dropFiles(page, ['sample1.pdf'])
    await expect(page.getByTestId('file-item')).toHaveCount(1)
  } finally {
    await session.close()
  }
})

test('l area di caricamento si evidenzia mentre il puntatore la sorvola', async () => {
  const session = await conTrascinamento()
  try {
    const { page } = session
    const uploader = page.getByTestId('uploader')

    await dragOverUploader(page, 'dragover')
    await expect(uploader).toHaveClass(/border-blue-500/)

    await dragOverUploader(page, 'dragleave')
    await expect(uploader).not.toHaveClass(/border-blue-500/)
  } finally {
    await session.close()
  }
})

test('i file trascinati si aggiungono a quelli gia caricati', async () => {
  const session = await conTrascinamento({ openFiles: [fixtures.first] })
  try {
    const { page } = session
    await addFiles(page)
    await expect(page.getByTestId('file-item')).toHaveCount(1)

    await dropFiles(page, ['sample2.pdf'])

    await expect(page.getByTestId('file-item')).toHaveCount(2)
    await expect(page.getByTestId('file-name').nth(1)).toContainText('sample2.pdf')
    await expect(page.getByTestId('action-merge')).toBeEnabled()
  } finally {
    await session.close()
  }
})
