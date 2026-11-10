// Tuning knobs for the QR animation. Smaller frames = lower QR density = easier
// to scan from a screen/camera, but more frames (a longer loop).
export const CHUNK_SIZE = 1024 // bytes of file data per frame
export const QR_ERROR_CORRECTION = 'M' // L | M | Q | H
export const QR_MARGIN = 4 // quiet zone, in modules
export const FRAME_FPS = 10 // QR frames shown per second
