import { CHUNK_SIZE, PARITY_GROUP } from './config.js'
import { crc32 } from './crc32.js'

/*
 * Binary frame layout (v2, all integers big-endian):
 *
 *   off  size  field
 *   0    2     magic "Q2"
 *   2    1     format version (2)
 *   3    2     fileId       - index of the file within this transfer
 *   5    4     checksum     - CRC-32 of the whole file
 *   9    4     fileSize     - bytes
 *   13   4     page         - data frame: 1-based page number
 *                             parity frame: 1-based parity group number
 *   17   4     totalPages   - number of data pages
 *   21   2     chunkSize    - bytes per full data page
 *   23   1     groupSize    - data pages per parity group (0 = no parity)
 *   24   1     flags        - bit 0: this is a parity frame
 *   25   1     extLen
 *   26   n     extension    - UTF-8, no leading dot, lowercase
 *   26+n 2     dataLen
 *   28+n m     data
 *
 * Parity: data pages are dealt round-robin into numGroups = ceil(totalPages /
 * groupSize) groups (page p is in group (p-1) % numGroups), so neighbouring
 * frames always land in different groups and a burst of missed frames costs
 * each group at most one page. Each parity frame is the XOR of its group's
 * pages (zero-padded), which lets the receiver rebuild any one missing page
 * per group.
 */
const MAGIC = [0x51, 0x32] // "Q2"
const VERSION = 2
const HEADER = 28
const FLAG_PARITY = 1
const MAX_EXT_BYTES = 32
const enc = new TextEncoder()
const dec = new TextDecoder()

export function getExtension(name) {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function totalPagesFor(size, chunkSize = CHUNK_SIZE) {
  return Math.max(1, Math.ceil(size / chunkSize))
}

export function numGroupsFor(totalPages, groupSize) {
  return groupSize > 0 ? Math.ceil(totalPages / groupSize) : 0
}

/** Parity group (0-based) a data page (1-based) belongs to. */
export function groupOf(page, numGroups) {
  return (page - 1) % numGroups
}

/** Byte length of a data page, derived from the header alone. */
export function pageLength(page, { fileSize, totalPages, chunkSize }) {
  return page < totalPages ? chunkSize : fileSize - (totalPages - 1) * chunkSize
}

/**
 * Read a File and split it into encoded frames, with parity frames mixed in
 * evenly throughout (about one per groupSize data frames).
 * Returns { checksum, totalPages, totalFrames, frames } where frames is a
 * lazy iterator of encoded frames.
 */
export async function fileToFrames(file, fileId, chunkSize = CHUNK_SIZE, groupSize = PARITY_GROUP) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const checksum = crc32(bytes)
  const totalPages = totalPagesFor(bytes.length, chunkSize)
  const numGroups = numGroupsFor(totalPages, groupSize)
  const ext = enc.encode(getExtension(file.name)).slice(0, MAX_EXT_BYTES)
  const base = { fileId, checksum, fileSize: bytes.length, totalPages, chunkSize, groupSize, ext }
  const pageData = (page) => bytes.subarray((page - 1) * chunkSize, page * chunkSize)

  // Parity needs every page of a group, so compute it all up front.
  const parity = Array.from({ length: numGroups }, () =>
    new Uint8Array(Math.min(chunkSize, bytes.length)),
  )
  for (let page = 1; page <= totalPages; page++) {
    xorInto(parity[groupOf(page, numGroups)], pageData(page))
  }

  // Where each parity frame goes: a map of data page -> groups to emit after it.
  const paritySlots = placeParity(totalPages, numGroups, groupSize)

  function* frames() {
    for (let page = 1; page <= totalPages; page++) {
      yield encodeFrame({ ...base, page, data: pageData(page) })
      for (const g of paritySlots.get(page) ?? []) yield parityFrame(g)
    }
  }
  const parityFrame = (g) => encodeFrame({ ...base, page: g + 1, parity: true, data: parity[g] })

  return { checksum, totalPages, totalFrames: totalPages + numGroups, frames: frames() }
}

/**
 * Decide which data page each group's parity frame follows.
 *
 * Group g's pages sit at offset g in every round of numGroups pages, so the
 * spot furthest from all of them is offset g + numGroups/2. We put g's
 * parity there, so one burst of misses has to be about numGroups/2 frames
 * long to take out both a page and the parity that would rebuild it. The
 * round is picked from the offset (offset % groupSize), which spreads the
 * parity frames evenly: roughly one every groupSize data frames.
 */
function placeParity(totalPages, numGroups, groupSize) {
  const slots = new Map()
  const half = Math.floor(numGroups / 2)
  for (let g = 0; g < numGroups; g++) {
    const offset = (g + half) % numGroups
    let page = (offset % groupSize) * numGroups + offset + 1
    while (page > totalPages) page -= numGroups // last round may be partial
    if (!slots.has(page)) slots.set(page, [])
    slots.get(page).push(g)
  }
  return slots
}

/** XOR src into dst in place (src may be shorter; it is treated as zero-padded). */
export function xorInto(dst, src) {
  for (let i = 0; i < src.length; i++) dst[i] ^= src[i]
  return dst
}

export function encodeFrame({
  fileId, checksum, fileSize, page, totalPages, chunkSize, groupSize, parity = false, ext, data,
}) {
  const out = new Uint8Array(HEADER + ext.length + data.length)
  const view = new DataView(out.buffer)
  out.set(MAGIC, 0)
  view.setUint8(2, VERSION)
  view.setUint16(3, fileId)
  view.setUint32(5, checksum)
  view.setUint32(9, fileSize)
  view.setUint32(13, page)
  view.setUint32(17, totalPages)
  view.setUint16(21, chunkSize)
  view.setUint8(23, groupSize)
  view.setUint8(24, parity ? FLAG_PARITY : 0)
  view.setUint8(25, ext.length)
  out.set(ext, 26)
  view.setUint16(26 + ext.length, data.length)
  out.set(data, HEADER + ext.length)
  return out
}

/** Inverse of encodeFrame — for the Receive side. Returns null if not a frame. */
export function decodeFrame(bytes) {
  if (bytes.length < HEADER || bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1]) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint8(2) !== VERSION) return null
  const extLen = view.getUint8(25)
  if (bytes.length < HEADER + extLen) return null
  const dataLen = view.getUint16(26 + extLen)
  if (bytes.length < HEADER + extLen + dataLen) return null
  return {
    fileId: view.getUint16(3),
    checksum: view.getUint32(5),
    fileSize: view.getUint32(9),
    page: view.getUint32(13),
    totalPages: view.getUint32(17),
    chunkSize: view.getUint16(21),
    groupSize: view.getUint8(23),
    parity: (view.getUint8(24) & FLAG_PARITY) !== 0,
    extension: dec.decode(bytes.subarray(26, 26 + extLen)),
    data: bytes.slice(HEADER + extLen, HEADER + extLen + dataLen),
  }
}
