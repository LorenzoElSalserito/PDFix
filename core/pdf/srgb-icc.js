/**
 * Generatore di un profilo ICC sRGB v2 (matrix/TRC) costruito interamente in
 * memoria. Serve come `DestOutputProfile` dell'OutputIntent PDF/A: un file
 * PDF/A-1b deve incorporare il profilo colore di destinazione, e generarlo qui
 * evita di distribuire un binario ICC di terze parti dentro il pacchetto.
 *
 * Il profilo e' deterministico: due esecuzioni producono byte identici, cosi'
 * anche gli artefatti PDF generati restano confrontabili nei test.
 */

const PROFILE_DESCRIPTION = 'sRGB IEC61966-2.1'
const PROFILE_COPYRIGHT = 'Profilo generato da PDFix - nessuna rivendicazione di copyright.'

/** Punto di bianco D50 usato dal PCS (Profile Connection Space) ICC. */
const WHITE_POINT_D50 = [0.9642, 1.0, 0.8249]

/** Primarie sRGB gia' adattate a D50 (Bradford), come nei profili sRGB v2. */
const PRIMARIES_D50 = {
  red: [0.4360, 0.2225, 0.0139],
  green: [0.3851, 0.7169, 0.0971],
  blue: [0.1431, 0.0606, 0.7141],
}

/** Numero di campioni della curva di trasferimento. */
const TRC_SAMPLES = 512

function s15Fixed16(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeInt32BE(Math.round(value * 65536), 0)
  return buffer
}

function uint32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value >>> 0, 0)
  return buffer
}

function signature(text) {
  return Buffer.from(text.padEnd(4, ' ').slice(0, 4), 'latin1')
}

function padTo4(buffer) {
  const remainder = buffer.length % 4
  return remainder === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(4 - remainder)])
}

/** Curva di trasferimento sRGB (IEC 61966-2.1), da valore lineare a codifica. */
function srgbEncode(linear) {
  return linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055
}

/** Tabella `curv`: la TRC del profilo e' l'inversa della codifica sRGB. */
function curveType() {
  const samples = Buffer.alloc(TRC_SAMPLES * 2)
  for (let index = 0; index < TRC_SAMPLES; index++) {
    const encoded = index / (TRC_SAMPLES - 1)
    const linear = encoded <= 0.04045 ? encoded / 12.92 : Math.pow((encoded + 0.055) / 1.055, 2.4)
    samples.writeUInt16BE(Math.round(Math.min(1, Math.max(0, linear)) * 65535), index * 2)
  }
  return Buffer.concat([signature('curv'), Buffer.alloc(4), uint32(TRC_SAMPLES), samples])
}

function xyzType([x, y, z]) {
  return Buffer.concat([signature('XYZ '), Buffer.alloc(4), s15Fixed16(x), s15Fixed16(y), s15Fixed16(z)])
}

function textType(text) {
  return Buffer.concat([signature('text'), Buffer.alloc(4), Buffer.from(`${text}\0`, 'latin1')])
}

/** `desc` in formato ICC v2: parte ASCII, parte Unicode, parte ScriptCode. */
function descriptionType(text) {
  const ascii = Buffer.from(`${text}\0`, 'latin1')
  const unicode = Buffer.from(text, 'utf16le').swap16()
  return Buffer.concat([
    signature('desc'),
    Buffer.alloc(4),
    uint32(ascii.length),
    ascii,
    uint32(0),
    uint32(text.length + 1),
    unicode,
    Buffer.alloc(2),
    Buffer.alloc(1),
    Buffer.alloc(1),
    Buffer.alloc(67),
  ])
}

function profileHeader(totalSize) {
  const header = Buffer.alloc(128)
  header.set(uint32(totalSize), 0)
  header.set(signature('PDFx'), 4)
  header.writeUInt32BE(0x02100000, 8)
  header.set(signature('mntr'), 12)
  header.set(signature('RGB '), 16)
  header.set(signature('XYZ '), 20)
  header.writeUInt16BE(2026, 24)
  header.writeUInt16BE(1, 26)
  header.writeUInt16BE(1, 28)
  header.set(signature('acsp'), 36)
  header.writeUInt32BE(0, 64)
  header.set(s15Fixed16(WHITE_POINT_D50[0]), 68)
  header.set(s15Fixed16(WHITE_POINT_D50[1]), 72)
  header.set(s15Fixed16(WHITE_POINT_D50[2]), 76)
  return header
}

let cachedProfile = null

/**
 * Restituisce il profilo ICC sRGB come Uint8Array. Il risultato e' calcolato
 * una sola volta per processo.
 */
export function srgbIccProfile() {
  if (cachedProfile) return cachedProfile

  const trc = curveType()
  const tags = [
    ['desc', descriptionType(PROFILE_DESCRIPTION)],
    ['wtpt', xyzType(WHITE_POINT_D50)],
    ['rXYZ', xyzType(PRIMARIES_D50.red)],
    ['gXYZ', xyzType(PRIMARIES_D50.green)],
    ['bXYZ', xyzType(PRIMARIES_D50.blue)],
    ['rTRC', trc],
    ['gTRC', trc],
    ['bTRC', trc],
    ['cprt', textType(PROFILE_COPYRIGHT)],
  ]

  const tableSize = 4 + tags.length * 12
  let offset = 128 + tableSize
  if (offset % 4 !== 0) offset += 4 - (offset % 4)

  const entries = []
  const payloads = []
  const emitted = new Map()

  for (const [name, data] of tags) {
    const key = data.toString('latin1')
    if (emitted.has(key)) {
      const shared = emitted.get(key)
      entries.push({ name, offset: shared.offset, size: shared.size })
      continue
    }
    const padded = padTo4(data)
    entries.push({ name, offset, size: data.length })
    emitted.set(key, { offset, size: data.length })
    payloads.push(padded)
    offset += padded.length
  }

  const table = Buffer.concat([
    uint32(entries.length),
    ...entries.map((entry) => Buffer.concat([signature(entry.name), uint32(entry.offset), uint32(entry.size)])),
  ])

  const beforePayload = padTo4(Buffer.concat([Buffer.alloc(128), table]))
  const body = Buffer.concat([beforePayload, ...payloads])
  const profile = Buffer.concat([profileHeader(body.length), body.subarray(128)])

  cachedProfile = new Uint8Array(profile)
  return cachedProfile
}

export const SRGB_PROFILE_NAME = PROFILE_DESCRIPTION
