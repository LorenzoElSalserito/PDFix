/**
 * Riordino dei documenti: l'ordine dell'elenco e' l'ordine delle pagine nel
 * file prodotto, quindi il trascinamento e' parte del comportamento verificato.
 */

import { expect, test } from '@playwright/test'
import { addFiles, fixtures, launchApp, riordina } from './helpers.js'

test('trascinare una riga cambia l ordine di unione', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    await addFiles(page)
    await expect(page.getByTestId('file-name').first()).toContainText('sample1.pdf')

    await riordina(page, 1, 0)

    await expect(page.getByTestId('file-name').first()).toContainText('sample2.pdf')
    await expect(page.getByTestId('file-name').nth(1)).toContainText('sample1.pdf')

    // L'unione parte dall'ordine mostrato: il documento prodotto contiene
    // comunque tutte le pagine dei due sorgenti.
    await page.getByTestId('action-merge').click()
    await expect(page.getByTestId('status-success')).toContainText('2 pagine')
  } finally {
    await session.close()
  }
})

test('con tre documenti l ultimo puo salire in cima', async () => {
  const { copyFileSync, mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const path = (await import('node:path')).default

  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-ordine-'))
  const terzo = path.join(dir, 'terzo.pdf')
  copyFileSync(fixtures.first, terzo)

  const session = await launchApp({ openFiles: [fixtures.first, fixtures.second, terzo] })
  try {
    const { page } = session
    await addFiles(page)
    await expect(page.getByTestId('file-item')).toHaveCount(3)

    await riordina(page, 2, 0)

    await expect(page.getByTestId('file-name').first()).toContainText('terzo.pdf')
    await expect(page.getByTestId('file-name').nth(1)).toContainText('sample1.pdf')
    await expect(page.getByTestId('file-name').nth(2)).toContainText('sample2.pdf')
  } finally {
    await session.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('il trascinamento parte solo dalla maniglia, non da tutta la riga', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    await addFiles(page)

    // Trascinare il nome del file non deve riordinare nulla: senza maniglia
    // dedicata, selezionare il testo diventerebbe un riordino involontario.
    await page.getByTestId('file-name').nth(1).dragTo(page.getByTestId('file-name').first())

    await expect(page.getByTestId('file-name').first()).toContainText('sample1.pdf')
    await expect(page.getByTestId('file-name').nth(1)).toContainText('sample2.pdf')
  } finally {
    await session.close()
  }
})
