// Tuning knobs for the QR animation. Smaller frames = lower QR density = easier
// to scan from a screen/camera, but more frames (a longer loop).
// Max ~2270 at error correction M (QR version 40 holds 2331 bytes incl. header).
export const CHUNK_SIZE = 2048 // bytes of file data per frame
// One XOR parity frame per this many data frames (0 = off). Lower = more
// redundancy: 4 adds 25% frames and survives 1 lost page in every 4.
export const PARITY_GROUP = 4
export const QR_ERROR_CORRECTION = 'M' // L | M | Q | H
export const QR_MARGIN = 4 // quiet zone, in modules
export const FRAME_FPS = 8 // QR frames shown per second
