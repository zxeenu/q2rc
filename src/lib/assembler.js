import { crc32 } from './crc32.js'
import { decodeFrame, groupOf, numGroupsFor, pageLength, xorInto } from './frames.js'

/**
 * Collects decoded frames (in any order, with any number of repeats) and
 * rebuilds each file once every page has been seen. A page that was never
 * read is rebuilt from its group's parity frame when it is the only one
 * missing from that group; anything else gets picked up as the sender loops.
 *
 * Files are keyed by fileId + checksum, so two different transfers that
 * reuse fileId 0 never get mixed together.
 */
export function createAssembler() {
  const files = new Map() // key -> per-file state, see push()

  return {
    /**
     * Feed raw QR payload bytes. Returns:
     *   null                       - not one of our frames
     *   { file, isNew: false }     - duplicate page, nothing changed
     *   { file, isNew: true }      - new page stored (file.result set once complete)
     */
    push(bytes) {
      const frame = decodeFrame(bytes)
      if (!frame) return null
      const numGroups = numGroupsFor(frame.totalPages, frame.groupSize)
      const limit = frame.parity ? numGroups : frame.totalPages
      if (frame.page < 1 || frame.page > limit) return null

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
          chunkSize: frame.chunkSize,
          numGroups,
          pages: new Map(), // page -> data
          parity: new Map(), // group -> XOR of the group's pages
          recovered: 0, // pages rebuilt from parity
          result: null, // { blob, ok } once complete
        }
        files.set(key, file)
      }

      if (file.result) return { file, isNew: false }
      // Parity frames are stored by 0-based group, data frames by 1-based page.
      const group = frame.parity ? frame.page - 1 : groupOf(frame.page, numGroups)
      const [store, slot] = frame.parity ? [file.parity, group] : [file.pages, frame.page]
      if (store.has(slot)) return { file, isNew: false }
      store.set(slot, frame.data)

      if (numGroups) tryRecover(file, group)
      if (file.pages.size === file.totalPages) file.result = assemble(file)
      return { file, isNew: true }
    },

    get files() {
      return [...files.values()].sort((a, b) => a.fileId - b.fileId)
    },
  }
}

/** If exactly one data page of a group is missing and we have its parity, rebuild it. */
function tryRecover(file, group) {
  const parity = file.parity.get(group)
  if (!parity) return
  let missing = 0
  for (let page = group + 1; page <= file.totalPages; page += file.numGroups) {
    if (file.pages.has(page)) continue
    if (missing) return // two or more missing: parity can't help yet
    missing = page
  }
  if (!missing) return

  const data = Uint8Array.from(parity)
  for (let page = group + 1; page <= file.totalPages; page += file.numGroups) {
    if (page !== missing) xorInto(data, file.pages.get(page))
  }
  file.pages.set(missing, data.subarray(0, pageLength(missing, file)))
  file.recovered++
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
  file.parity.clear()
  return { blob: new Blob([bytes]), ok }
}
