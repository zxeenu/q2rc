import jsQR from 'jsqr'
import { QR_MARGIN } from './config.js'

/** Decode a QR code from RGBA pixels. Returns the raw payload bytes or null. */
export function decodeQrPixels(imageData) {
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert', // our codes are always dark-on-light
  })
  return code ? Uint8Array.from(code.binaryData) : null
}

/**
 * Watch a camera feed and call onPayload(bytes) for every QR decoded.
 * Only the centre square of the frame is scanned, which is where the
 * code should be and roughly halves the decode cost.
 * Returns { stop }.
 */
export async function startCameraScan(video, onPayload) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  })
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  let stopped = false
  let lastTime = -1

  const tick = () => {
    if (stopped) return
    if (video.readyState >= video.HAVE_CURRENT_DATA && video.currentTime !== lastTime) {
      lastTime = video.currentTime
      const side = Math.min(video.videoWidth, video.videoHeight)
      if (side > 0) {
        if (canvas.width !== side) canvas.width = canvas.height = side
        const sx = (video.videoWidth - side) / 2
        const sy = (video.videoHeight - side) / 2
        ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side)
        const bytes = decodeQrPixels(ctx.getImageData(0, 0, side, side))
        if (bytes) onPayload(bytes)
      }
    }
    schedule()
  }
  const schedule = () =>
    video.requestVideoFrameCallback
      ? video.requestVideoFrameCallback(tick)
      : requestAnimationFrame(tick)
  schedule()

  return {
    stop() {
      stopped = true
      stream.getTracks().forEach((t) => t.stop())
      video.srcObject = null
    },
  }
}

/**
 * Decode an SVG stack file (as produced by svgStack.js) directly, without a
 * camera: each frame's path is rasterised to a clean bitmap and run through
 * the same QR decoder. Calls onPayload(bytes) per frame; returns the frame count.
 */
export function decodeSvgStack(svgText, onPayload) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  if (doc.querySelector('parsererror')) throw new Error('Not a valid SVG file.')
  const frames = doc.querySelectorAll('svg > svg > path')
  if (!frames.length) throw new Error('No QR frames found in this SVG.')

  const scale = 4 // px per module; plenty for jsQR on a perfect image
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  let decoded = 0

  for (const path of frames) {
    const [minX, , box] = path.parentElement.getAttribute('viewBox').split(/\s+/).map(Number)
    const margin = -minX || QR_MARGIN
    canvas.width = canvas.height = box * scale
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(scale, 0, 0, scale, margin * scale, margin * scale)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.stroke(new Path2D(path.getAttribute('d')))
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const bytes = decodeQrPixels(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (bytes) {
      onPayload(bytes)
      decoded++
    }
  }
  return decoded
}
