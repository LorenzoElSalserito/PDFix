/**
 * Gruppi della pulsantiera: ordine e simbolo.
 *
 * Il renderer non può importare il catalogo del processo principale — riceve i
 * descrittori via IPC — quindi l'ordine dei gruppi è rispecchiato qui, come già
 * accade per le regole sui parametri. Un test verifica che le due liste
 * restino identiche: se il catalogo cambia e questa no, la suite se ne accorge.
 */

/** Identificatori dei gruppi, nell'ordine in cui compaiono nella pulsantiera. */
export const GROUP_ORDER = ['documento', 'pagine', 'impaginazione', 'contenuto', 'moduli', 'sicurezza']

/**
 * Un simbolo per gruppo, non uno per operazione: ventisei disegni diversi
 * sarebbero rumore: sei aiutano a ritrovare la famiglia con la coda dell'occhio.
 */
export const GROUP_ICONS = {
  documento:
    'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25M6 20.25h6.75A2.25 2.25 0 0015 18V9.75a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 9.75V18A2.25 2.25 0 006 20.25z',
  pagine:
    'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  impaginazione:
    'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  contenuto:
    'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
  moduli:
    'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
  sicurezza:
    'M16.5 10.5V6.75a4.5 4.5 0 00-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
}

/** Gruppo dichiarato dal descrittore; l'ultimo raccoglie i casi non previsti. */
export function groupOf(operation) {
  const declared = operation?.group
  return GROUP_ORDER.includes(declared) ? declared : GROUP_ORDER[GROUP_ORDER.length - 1]
}

/**
 * Gruppi presenti fra le operazioni ricevute, nell'ordine dichiarato.
 *
 * Le funzionalità disattivate nelle preferenze non arrivano fin qui: un gruppo
 * rimasto senza operazioni non deve comparire come scheda vuota.
 */
export function groupsPresentIn(operations) {
  const counts = new Map()
  for (const operation of operations ?? []) {
    const id = groupOf(operation)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return GROUP_ORDER.filter((id) => counts.has(id)).map((id) => ({ id, count: counts.get(id) }))
}
