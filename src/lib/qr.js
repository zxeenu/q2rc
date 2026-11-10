import QRCode from 'qrcode'
import { QR_ERROR_CORRECTION, QR_MARGIN } from './config.js'

/**
 * Encode frame bytes as a QR code and return it as an SVG path `d` string
 * plus the module count. Each row is drawn as 1-unit-thick stroked
 * horizontal runs using relative moves ("m<gap> 0h<len>"), which keeps the
 * markup roughly 3x smaller than filled rectangles.
 */
export function qrPath(bytes) {
  const { modules } = QRCode.create([{ data: bytes, mode: 'byte' }], {
    errorCorrectionLevel: QR_ERROR_CORRECTION,
  })
  const { size, data } = modules
  let d = ''
  for (let y = 0; y < size; y++) {
    let x = 0
    let pen = -1 // x position of the pen on this row, -1 = not placed yet
    while (x < size) {
      if (!data[y * size + x]) {
        x++
        continue
      }
      const start = x
      while (x < size && data[y * size + x]) x++
      d += pen < 0 ? `M${start} ${y + 0.5}` : `m${start - pen} 0`
      d += `h${x - start}`
      pen = x
    }
  }
  return { d, size }
}

/** A single QR frame as a nested <svg>, normalised to fill a 1x1 viewport. */
export function qrFrameSvg(bytes, attrs = '') {
  const { d, size } = qrPath(bytes)
  const m = QR_MARGIN
  const box = size + m * 2
  return (
    `<svg viewBox="${-m} ${-m} ${box} ${box}" width="100%" height="100%"${attrs}>` +
    `<path stroke="#000" d="${d}"/></svg>`
  )
}
