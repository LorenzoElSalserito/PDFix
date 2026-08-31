/**
 * Regole sui parametri delle operazioni, condivise fra i componenti.
 *
 * Sono le stesse del catalogo nel processo principale, ma il renderer non può
 * importarlo: qui vive la copia che serve alla sola interfaccia.
 */

/** Un parametro è pertinente solo se la condizione dichiarata è soddisfatta. */
export function isParamVisible(param, values) {
  const rule = param?.visibleWhen
  return !rule || values?.[rule.key] === rule.equals
}

/** Valori iniziali proposti da un descrittore. */
export function defaultValues(operation) {
  return Object.fromEntries((operation?.params ?? []).map((param) => [param.key, param.default]))
}
