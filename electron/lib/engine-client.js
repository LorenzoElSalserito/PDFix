/**
 * Client del motore PDF.
 *
 * Ogni richiesta gira in un processo figlio dedicato, creato con il flag V8 che
 * impone il limite di memoria scelto dall'utente. Un processo per richiesta
 * significa che una modifica delle preferenze ha effetto immediato, che una
 * elaborazione fuori controllo non intacca l'interfaccia e che il timeout può
 * essere applicato semplicemente terminando il figlio.
 */

import { fork as forkChild } from 'node:child_process'

const KILL_GRACE_MS = 2000

/**
 * @param {object} options
 * @param {string} options.engineEntry percorso del bundle del motore
 * @param {() => number} options.memoryLimitMb limite di heap da applicare
 * @param {() => number} options.timeoutMs tempo massimo per una richiesta
 * @param {typeof forkChild} [options.fork] iniettabile nei test
 */
export function createEngineClient({ engineEntry, memoryLimitMb, timeoutMs, fork = forkChild }) {
  const running = new Set()

  function terminate(child) {
    running.delete(child)
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill('SIGTERM')
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, KILL_GRACE_MS).unref?.()
  }

  /**
   * Esegue una richiesta sul motore.
   *
   * @param {object} request
   * @param {{onProgress?: (progress: object) => void}} [handlers]
   * @returns {Promise<object>} busta `{ok, ...}` prodotta dal motore
   */
  function run(request, { onProgress } = {}) {
    return new Promise((resolve) => {
      const limit = memoryLimitMb()
      const child = fork(engineEntry, [], {
        execArgv: [`--max-old-space-size=${limit}`],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      })
      running.add(child)

      let settled = false
      let stderr = ''
      child.stderr?.setEncoding('utf8').on('data', (chunk) => { stderr += chunk })

      const finish = (result) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        terminate(child)
        resolve(result)
      }

      const timer = setTimeout(() => {
        finish({ ok: false, error: `Elaborazione interrotta: superato il timeout di ${Math.round(timeoutMs() / 1000)} s.` })
      }, timeoutMs())

      child.on('message', (message) => {
        if (!message || typeof message !== 'object') return
        if (message.progress) onProgress?.(message.progress)
        else if (message.result) finish(message.result)
      })

      child.on('error', () => {
        finish({ ok: false, error: 'Impossibile avviare il motore di elaborazione.' })
      })

      child.on('exit', (code, signal) => {
        if (settled) return
        if (/heap out of memory|Allocation failed/i.test(stderr)) {
          finish({ ok: false, error: `Memoria insufficiente: il limite di ${limit} MB è stato superato. Aumentalo nelle impostazioni.` })
          return
        }
        finish({
          ok: false,
          error: stderr.trim().split('\n').pop() || `Motore terminato in modo anomalo (codice ${code ?? signal}).`,
        })
      })

      child.send({ id: 1, request })
    })
  }

  /** Termina eventuali elaborazioni ancora attive, alla chiusura dell'app. */
  function dispose() {
    for (const child of [...running]) terminate(child)
  }

  return { run, dispose, get activeCount() { return running.size } }
}
