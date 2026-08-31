/**
 * Operazione "diagnostics": non tocca alcun file, riporta i limiti effettivi
 * del processo di elaborazione.
 *
 * Serve a rendere verificabile dall'interfaccia (e dai test E2E) il limite di
 * memoria impostato nelle preferenze: il valore restituito e' quello che V8 ha
 * realmente applicato al processo figlio, non quello richiesto.
 */

import { operationDescriptor } from '../catalog.js'
import v8 from 'node:v8'
import os from 'node:os'
import process from 'node:process'

export default {
  ...operationDescriptor('diagnostics'),

  async run() {
    const heapStatistics = v8.getHeapStatistics()
    return {
      heapLimitMb: Math.round(heapStatistics.heap_size_limit / 1024 / 1024),
      heapUsedMb: Math.round(heapStatistics.used_heap_size / 1024 / 1024),
      totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
      freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
      execArgv: process.execArgv,
      versions: { node: process.versions.node, v8: process.versions.v8 },
    }
  },
}
