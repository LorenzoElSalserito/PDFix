import { defineConfig } from '@playwright/test'

/**
 * Test end-to-end sull'applicazione Electron reale.
 *
 * Un solo worker: ogni test avvia e chiude una vera finestra, e i test delle
 * preferenze misurano il limite di memoria del processo di elaborazione — una
 * esecuzione parallela falserebbe la misura.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
})
