import { defineConfig } from 'vite'
import { builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'

/**
 * Build del motore PDF.
 *
 * Tutte le dipendenze (pdf-lib incluso) finiscono dentro un unico file
 * CommonJS: il pacchetto distribuito non contiene `node_modules` e non richiede
 * nulla di installato sul computer dell'utente. Il formato CJS è deliberato —
 * `fork()` deve poter caricare il motore anche dall'interno dell'archivio asar.
 */
export default defineConfig({
  // `ssr.noExternal` è ciò che rende il bundle autosufficiente: senza, Vite
  // lascerebbe `pdf-lib` come require esterno.
  ssr: { noExternal: true },
  build: {
    outDir: fileURLToPath(new URL('./dist/engine', import.meta.url)),
    emptyOutDir: true,
    ssr: true,
    target: 'node20',
    minify: false,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./core/child.js', import.meta.url)),
      formats: ['cjs'],
    },
    rollupOptions: {
      external: [...builtinModules, ...builtinModules.map((name) => `node:${name}`), 'electron'],
      output: { entryFileNames: 'engine.cjs' },
    },
  },
})
