import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

/** Test dei componenti e delle composable del renderer. */
export default defineConfig({
  plugins: [vue()],
  // @vue/test-utils viene risolto alla sua build ESM: quella CommonJS fa
  // `require('vue')` e caricherebbe una seconda copia di Vue, con il risultato
  // che i componenti aggiornano lo stato ma non vengono mai ridisegnati.
  resolve: {
    alias: {
      '@vue/test-utils': fileURLToPath(
        new URL('./node_modules/@vue/test-utils/dist/vue-test-utils.esm-bundler.mjs', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'happy-dom',
    server: { deps: { inline: ['@vue/test-utils'] } },
    globals: true,
    include: ['client/tests/**/*.test.js'],
  },
})
