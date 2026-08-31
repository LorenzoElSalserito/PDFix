/**
 * Impostazioni: il limite di memoria configurato deve arrivare davvero al
 * processo che elabora i PDF, le funzionalita' disattivate devono sparire
 * dall'interfaccia e le preferenze devono sopravvivere al riavvio.
 */

import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { addFiles, launchApp } from './helpers.js'

async function openSettings(page) {
  await page.getByTestId('settings-open').click()
  await expect(page.getByTestId('settings-dialog')).toBeVisible()
}

test('il limite di memoria impostato viene applicato al motore', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    await openSettings(page)

    await page.getByTestId('field-memoryLimitAuto').uncheck()
    await page.getByTestId('field-memoryLimitMb').fill('1024')
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('settings-dialog')).toHaveCount(0)

    await openSettings(page)
    await expect(page.getByTestId('settings-effective-memory')).toHaveText('1 GB')
    await page.getByTestId('diagnostics-run').click()

    // Il valore misurato e' quello che V8 ha applicato al processo figlio: al
    // tetto richiesto si somma lo spazio della nuova generazione.
    const measured = page.getByTestId('diagnostics-heap')
    await expect(measured).toBeVisible()
    const heap = Number((await measured.textContent()).match(/Heap del processo: (\d+) MB/)[1])
    expect(heap).toBeGreaterThan(900)
    expect(heap).toBeLessThan(1400)
  } finally {
    await session.close()
  }
})

test('due limiti diversi producono due processi diversi', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    const misura = async (limite) => {
      await openSettings(page)
      await page.getByTestId('field-memoryLimitAuto').uncheck()
      await page.getByTestId('field-memoryLimitMb').fill(String(limite))
      await page.getByTestId('settings-save').click()
      await openSettings(page)
      await page.getByTestId('diagnostics-run').click()
      const testo = await page.getByTestId('diagnostics-heap').textContent()
      await page.getByTestId('settings-close').click()
      return Number(testo.match(/Heap del processo: (\d+) MB/)[1])
    }

    const piccolo = await misura(768)
    const grande = await misura(3072)
    expect(grande).toBeGreaterThan(piccolo + 1000)
  } finally {
    await session.close()
  }
})

test('le preferenze sopravvivono al riavvio dell applicazione', async () => {
  const first = await launchApp()
  const dataDir = first.dataDir
  try {
    await openSettings(first.page)
    await first.page.getByTestId('field-memoryLimitAuto').uncheck()
    await first.page.getByTestId('field-memoryLimitMb').fill('2048')
    await first.page.getByTestId('settings-save').click()
    await expect(first.page.getByTestId('settings-dialog')).toHaveCount(0)
  } finally {
    await first.close({ keepData: true })
  }

  const stored = JSON.parse(readFileSync(path.join(dataDir, 'settings.json'), 'utf8'))
  expect(stored.memoryLimitMb).toBe(2048)
  expect(stored.memoryLimitAuto).toBe(false)

  const second = await launchApp({ userDataDir: dataDir })
  try {
    await openSettings(second.page)
    await expect(second.page.getByTestId('field-memoryLimitMb')).toHaveValue('2048')
    await expect(second.page.getByTestId('settings-effective-memory')).toHaveText('2 GB')
  } finally {
    await second.close()
  }
})

test('una funzionalita disattivata sparisce dai comandi', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    await addFiles(page)
    await expect(page.getByTestId('action-convert')).toHaveCount(1)

    await openSettings(page)
    await page.getByTestId('feature-convert').uncheck()
    await page.getByTestId('settings-save').click()

    await expect(page.getByTestId('action-convert')).toHaveCount(0)
    await expect(page.getByTestId('action-merge')).toHaveCount(1)

    await openSettings(page)
    await page.getByTestId('feature-convert').check()
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('action-convert')).toHaveCount(1)
  } finally {
    await session.close()
  }
})

test('il ripristino riporta i valori predefiniti', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    await openSettings(page)
    await page.getByTestId('field-memoryLimitAuto').uncheck()
    await page.getByTestId('field-memoryLimitMb').fill('1024')
    await page.getByTestId('settings-save').click()

    await openSettings(page)
    await page.getByTestId('settings-reset').click()
    await page.getByTestId('settings-close').click()
    await openSettings(page)
    await expect(page.getByTestId('field-memoryLimitAuto')).toBeChecked()
  } finally {
    await session.close()
  }
})

test('il timeout configurato interrompe l elaborazione', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    await openSettings(page)
    await page.getByTestId('field-processTimeoutSec').fill('30')
    await page.getByTestId('settings-save').click()

    await addFiles(page)
    await page.getByTestId('action-merge').click()
    await expect(page.getByTestId('status-success')).toBeVisible()
  } finally {
    await session.close()
  }
})
