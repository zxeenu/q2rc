import { CHUNK_SIZE } from './config.js'
import { crc32 } from './crc32.js'

/*
 * Binary frame layout (v1, all integers big-endian):
 *
 *   off  size  field
 *   0    2     magic "Q2"
 *   2    1     format version (1)
 *   3    2     fileId       - index of the file within this transfer
 *   5    4     checksum     - CRC-32 of the whole file
 *   9    4     fileSize     - bytes
 *   13   4     page         - 1-based page number
 *   17   4     totalPages
 *   21   1     extLen
 *   22   n     extension    - UTF-8, no leading dot, lowercase
 *   22+n 2     dataLen
 *   24+n m     data
 */
const MAGIC = [0x51, 0x32] // "Q2"
const VERSION = 1
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

/**
 * Read a File and split it into encoded frames.
 * Returns { checksum, totalPages, frames } where frames is a lazy iterator,
 * so we never hold every encoded frame in memory at once.
 */
export async function fileToFrames(file, fileId, chunkSize = CHUNK_SIZE) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const checksum = crc32(bytes)
  const totalPages = totalPagesFor(bytes.length, chunkSize)
  const ext = enc.encode(getExtension(file.name)).slice(0, MAX_EXT_BYTES)

  function* frames() {
    for (let page = 1; page <= totalPages; page++) {
      const start = (page - 1) * chunkSize
      yield encodeFrame({
        fileId,
        checksum,
        fileSize: bytes.length,
        page,
        totalPages,
        ext,
        data: bytes.subarray(start, start + chunkSize),
      })
    }
  }

  return { checksum, totalPages, frames: frames() }
}

export function encodeFrame({ fileId, checksum, fileSize, page, totalPages, ext, data }) {
  const out = new Uint8Array(24 + ext.length + data.length)
  const view = new DataView(out.buffer)
  out.set(MAGIC, 0)
  view.setUint8(2, VERSION)
  view.setUint16(3, fileId)
  view.setUint32(5, checksum)
  view.setUint32(9, fileSize)
  view.setUint32(13, page)
  view.setUint32(17, totalPages)
  view.setUint8(21, ext.length)
  out.set(ext, 22)
  view.setUint16(22 + ext.length, data.length)
  out.set(data, 24 + ext.length)
  return out
}

/** Inverse of encodeFrame — for the Receive side. Returns null if not a frame. */
export function decodeFrame(bytes) {
  if (bytes.length < 24 || bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1]) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint8(2) !== VERSION) return null
  const extLen = view.getUint8(21)
  const dataLen = view.getUint16(22 + extLen)
  if (bytes.length < 24 + extLen + dataLen) return null
  return {
    fileId: view.getUint16(3),
    checksum: view.getUint32(5),
    fileSize: view.getUint32(9),
    page: view.getUint32(13),
    totalPages: view.getUint32(17),
    extension: dec.decode(bytes.subarray(22, 22 + extLen)),
    data: bytes.slice(24 + extLen, 24 + extLen + dataLen),
  }
}
