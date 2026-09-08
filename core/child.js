/**
 * Punto di ingresso del motore quando gira come processo figlio.
 *
 * Il processo viene creato dal main Electron con `fork`, passando i flag V8 che
 * impongono il limite di memoria configurato dall'utente. Il protocollo è
 * minimo: un messaggio di richiesta con `id`, una risposta con lo stesso `id`.
 * Il campo `kind` distingue l'esecuzione dalla sola lettura dei parametri.
 */

import process from 'node:process'
import { inspectRequest, runRequest } from './engine.js'

if (typeof process.send !== 'function') {
  throw new Error('core/child.js deve essere avviato con fork().')
}

process.on('message', async (message) => {
  if (!message || typeof message !== 'object') return
  const { id, request, kind = 'run' } = message

  if (kind === 'inspect') {
    process.send({ id, result: await inspectRequest(request) })
    return
  }

  const result = await runRequest(request, {
    onProgress: (progress) => process.send({ id, progress }),
  })
  process.send({ id, result })
})

process.send({ ready: true, pid: process.pid })
