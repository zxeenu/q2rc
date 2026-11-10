import { crc32 } from './crc32.js'
import { decodeFrame } from './frames.js'

/**
 * Collects decoded frames (in any order, with any number of repeats) and
 * rebuilds each file once every page has been seen. Because the sender
 * loops, missed frames simply get picked up on the next pass.
 *
 * Files are keyed by fileId + checksum, so two different transfers that
 * reuse fileId 0 never get mixed together.
 */
export function createAssembler() {
  const files = new Map() // key -> { fileId, checksum, fileSize, extension, totalPages, pages, result }

  return {
    /**
     * Feed raw QR payload bytes. Returns:
     *   null                       - not one of our frames
     *   { file, isNew: false }     - duplicate page, nothing changed
     *   { file, isNew: true }      - new page stored (file.result set once complete)
     */
    push(bytes) {
      const frame = decodeFrame(bytes)
      if (!frame || frame.page < 1 || frame.page > frame.totalPages) return null

      const key = `${frame.fileId}:${frame.checksum}`
      let file = files.get(key)
      if (!file) {
        file = {
          key,
          fileId: frame.fileId,
          checksum: frame.checksum,
          fileSize: frame.fileSize,
          extension: frame.extension,
          totalPages: frame.totalPages,
          pages: new Map(),
          result: null, // { blob, ok } once complete
        }
        files.set(key, file)
      }

      if (file.result || file.pages.has(frame.page)) return { file, isNew: false }
      file.pages.set(frame.page, frame.data)
      if (file.pages.size === file.totalPages) file.result = assemble(file)
      return { file, isNew: true }
    },

    get files() {
      return [...files.values()].sort((a, b) => a.fileId - b.fileId)
    },
  }
}

function assemble(file) {
  const bytes = new Uint8Array(file.fileSize)
  let offset = 0
  for (let page = 1; page <= file.totalPages; page++) {
    const data = file.pages.get(page)
    bytes.set(data.subarray(0, Math.max(0, bytes.length - offset)), offset)
    offset += data.length
  }
  const ok = offset === file.fileSize && crc32(bytes) === file.checksum
  file.pages.clear() // the blob now owns the data
  return { blob: new Blob([bytes]), ok }
}
