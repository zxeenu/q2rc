import { qrFrameSvg } from './qr.js'

/**
 * Builds one self-animating SVG out of a stack of QR frames.
 *
 * Every frame sits in the same spot, hidden by default. A shared CSS
 * animation makes each frame visible for 1/N of the loop, offset by its
 * index, so the file plays as a QR "video" in any browser or <img> tag
 * while staying vector (crisp at any size) and far smaller than a video.
 */
export function createSvgStack(fps) {
  const frameSec = 1 / fps
  const parts = []

  return {
    get count() {
      return parts.length
    },
    add(bytes) {
      const delay = (parts.length * frameSec).toFixed(3)
      parts.push(qrFrameSvg(bytes, ` class="f" style="animation-delay:${delay}s"`))
    },
    toBlob() {
      const n = Math.max(1, parts.length)
      const total = (n * frameSec).toFixed(3)
      const visiblePct = (100 / n).toFixed(6)
      const css =
        `.f{visibility:hidden;animation:q ${total}s step-end infinite}` +
        `@keyframes q{0%{visibility:visible}${visiblePct}%{visibility:hidden}}` +
        // Single frame: just show it.
        (n === 1 ? '.f{visibility:visible;animation:none}' : '')
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" shape-rendering="crispEdges">` +
        `<style>${css}</style>` +
        `<rect width="1" height="1" fill="#fff"/>` +
        parts.join('') +
        `</svg>`
      return new Blob([svg], { type: 'image/svg+xml' })
    },
  }
}
