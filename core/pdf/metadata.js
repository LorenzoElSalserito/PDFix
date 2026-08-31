/**
 * Costruzione dei metadati XMP richiesti da PDF/A.
 *
 * Il pacchetto XMP e' generato come testo: PDF/A impone che lo stream
 * `/Metadata` del catalogo sia in chiaro (niente compressione, niente
 * cifratura), quindi non c'e' vantaggio a costruirlo con una libreria XML.
 */

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => XML_ESCAPES[character])
}

/** Data in formato ISO 8601 con offset, come richiesto da XMP. */
export function xmpDate(date) {
  const pad = (value, size = 2) => String(Math.abs(value)).padStart(size, '0')
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const offset = `${sign}${pad(Math.trunc(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offset}`
  )
}

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.producer
 * @param {string} options.creator
 * @param {Date} options.date
 * @param {number} options.part      parte dello standard PDF/A (1 per PDF/A-1)
 * @param {string} options.conformance livello di conformita' ('B')
 * @returns {string} pacchetto XMP completo
 */
export function buildXmpMetadata({ title, producer, creator, date, part = 1, conformance = 'B' }) {
  const timestamp = xmpDate(date)
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="PDFix">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>${part}</pdfaid:part>
      <pdfaid:conformance>${escapeXml(conformance)}</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:format>application/pdf</dc:format>
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:creator>
        <rdf:Seq>
          <rdf:li>${escapeXml(creator)}</rdf:li>
        </rdf:Seq>
      </dc:creator>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreatorTool>${escapeXml(creator)}</xmp:CreatorTool>
      <xmp:CreateDate>${timestamp}</xmp:CreateDate>
      <xmp:ModifyDate>${timestamp}</xmp:ModifyDate>
      <xmp:MetadataDate>${timestamp}</xmp:MetadataDate>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>${escapeXml(producer)}</pdf:Producer>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}
