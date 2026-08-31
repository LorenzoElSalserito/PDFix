/**
 * Percorso principale: caricare documenti, riordinarli, rimuoverli, unirli e
 * convertirli. Il file prodotto viene riletto dal disco: il test verifica il
 * risultato reale, non un messaggio nell'interfaccia.
 */

import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { addFiles, fixtures, launchApp } from './helpers.js'

test('unione di due PDF salvata su disco', async () => {
  const session = await launchApp()
  try {
    const { page, outputPath } = session
    await expect(page.getByRole('heading', { name: 'PDFix' })).toBeVisible()

    await addFiles(page)
    await expect(page.getByText('File caricati (2)')).toBeVisible()
    await expect(page.getByTestId('file-name').first()).toContainText('sample1.pdf')

    await page.getByTestId('action-merge').click()
    await expect(page.getByTestId('status-success')).toContainText(outputPath)

    expect(existsSync(outputPath)).toBe(true)
    const content = readFileSync(outputPath, 'latin1')
    expect(content.startsWith('%PDF-')).toBe(true)
    await expect(page.getByTestId('status-success')).toContainText('2 pagine')
  } finally {
    await session.close()
  }
})

test('conversione in PDF/A-1b di un singolo documento', async () => {
  const session = await launchApp({ openFiles: [fixtures.first] })
  try {
    const { page, outputPath } = session
    await addFiles(page)
    await expect(page.getByText('File caricati (1)')).toBeVisible()

    // Con un solo file l'unione non e' eseguibile: solo la conversione lo e'.
    await expect(page.getByTestId('action-merge')).toBeDisabled()
    await page.getByTestId('action-convert').click()
    await expect(page.getByTestId('status-success')).toContainText(outputPath)

    const content = readFileSync(outputPath, 'latin1')
    expect(content.startsWith('%PDF-1.4')).toBe(true)
    expect(content).toContain('GTS_PDFA1')
    expect(content).toContain('pdfaid:part')
    await expect(page.getByTestId('status-success')).toContainText('PDF/A-1b')
  } finally {
    await session.close()
  }
})

test('unione marcata PDF/A tramite l interruttore', async () => {
  const session = await launchApp()
  try {
    const { page, outputPath } = session
    await addFiles(page)
    await page.getByTestId('pdfa-toggle').check()
    await page.getByTestId('action-merge').click()
    await expect(page.getByTestId('status-success')).toBeVisible()

    const content = readFileSync(outputPath, 'latin1')
    expect(content.startsWith('%PDF-1.4')).toBe(true)
    expect(content).toContain('pdfaid:conformance')
  } finally {
    await session.close()
  }
})

test('rimozione e svuotamento dell elenco', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    await addFiles(page)
    await expect(page.getByTestId('file-item')).toHaveCount(2)

    await page.getByTestId('remove-file').first().click()
    await expect(page.getByTestId('file-item')).toHaveCount(1)
    await expect(page.getByTestId('file-name').first()).toContainText('sample2.pdf')

    await page.getByTestId('clear-files').click()
    await expect(page.getByTestId('file-list')).toHaveCount(0)
    await expect(page.getByTestId('action-bar')).toHaveCount(0)
  } finally {
    await session.close()
  }
})

test('i duplicati non vengono aggiunti due volte', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    await addFiles(page)
    await page.getByTestId('uploader').click()
    await expect(page.getByTestId('file-item')).toHaveCount(2)
  } finally {
    await session.close()
  }
})

test('un file non valido viene rifiutato dal processo principale', async () => {
  const session = await launchApp({ openFiles: [path.join(process.cwd(), 'package.json')] })
  try {
    const { page } = session
    await page.getByTestId('uploader').click()
    await expect(page.getByTestId('status-error')).toContainText('non valido o non supportato')
    await expect(page.getByTestId('file-list')).toHaveCount(0)
  } finally {
    await session.close()
  }
})
