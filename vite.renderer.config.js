import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

/** Build dell'interfaccia: pagina statica caricata da `file://` dentro Electron. */
export default defineConfig({
  root: fileURLToPath(new URL('./client', import.meta.url)),
  base: './',
  plugins: [vue()],
  build: {
    outDir: fileURLToPath(new URL('./dist/renderer', import.meta.url)),
    emptyOutDir: true,
    target: 'chrome130',
  },
  server: {
    // Indirizzo esplicito: il valore predefinito `localhost` su questa macchina
    // si risolve solo in IPv6, mentre lo script `dev` attende il server su
    // 127.0.0.1 prima di avviare Electron. Senza vincolo l'attesa non termina
    // mai e la finestra non si apre.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
