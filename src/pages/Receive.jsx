import { useEffect, useRef, useState } from 'react'
import DropZone from '../components/DropZone.jsx'
import { createAssembler } from '../lib/assembler.js'
import { decodeSvgStack, startCameraScan } from '../lib/scanner.js'

export default function Receive() {
  const videoRef = useRef(null)
  const scanRef = useRef(null)
  const assemblerRef = useRef(createAssembler())
  const [scanning, setScanning] = useState(false)
  const [files, setFiles] = useState([]) // snapshot of assembler state for rendering
  const [stats, setStats] = useState({ reads: 0, fresh: 0 })
  const [error, setError] = useState(null)
  const urls = useRef(new Map()) // file key -> object URL

  // Stop the camera and free blob URLs when leaving the page.
  useEffect(
    () => () => {
      scanRef.current?.stop()
      urls.current.forEach((url) => URL.revokeObjectURL(url))
    },
    [],
  )

  function handlePayload(bytes) {
    const res = assemblerRef.current.push(bytes)
    setStats((s) => ({ reads: s.reads + 1, fresh: s.fresh + (res?.isNew ? 1 : 0) }))
    if (res?.isNew) setFiles(snapshot(assemblerRef.current, urls.current))
  }

  async function startScan() {
    setError(null)
    try {
      scanRef.current = await startCameraScan(videoRef.current, handlePayload)
      setScanning(true)
    } catch (err) {
      console.error(err)
      setError(cameraError(err))
    }
  }

  function stopScan() {
    scanRef.current?.stop()
    scanRef.current = null
    setScanning(false)
  }

  async function handleSvgFiles(list) {
    setError(null)
    for (const file of list) {
      try {
        const n = decodeSvgStack(await file.text(), handlePayload)
        if (n === 0) setError(`${file.name}: no readable QR frames.`)
      } catch (err) {
        setError(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  function reset() {
    assemblerRef.current = createAssembler()
    urls.current.forEach((url) => URL.revokeObjectURL(url))
    urls.current.clear()
    setFiles([])
    setStats({ reads: 0, fresh: 0 })
  }

  return (
    <section className="send-page">
      <div className="send-body">
        <video ref={videoRef} className="qr-preview scan-video" hidden={!scanning} />

        {!scanning && (
          <DropZone
            accept=".svg,image/svg+xml"
            title="Drop a q2rc .svg here"
            hint="or use the camera to watch one playing on another screen"
            onFiles={handleSvgFiles}
          />
        )}

        {scanning && (
          <p className="muted">
            Point the camera at the playing QR loop. Missed frames are picked up on the next
            pass. {stats.reads} reads, {stats.fresh} new
          </p>
        )}

        {error && <p className="error">{error}</p>}

        {files.length > 0 && (
          <ul className="file-list">
            {files.map((f) => (
              <li key={f.key} className={f.done ? '' : 'active'}>
                <span>{f.name}</span>
                {f.done ? (
                  f.ok ? (
                    <span>
                      {f.recovered > 0 && (
                        <span className="muted">{f.recovered} rebuilt from parity · </span>
                      )}
                      <a href={f.url} download={f.name}>
                        Download ({formatSize(f.size)})
                      </a>
                    </span>
                  ) : (
                    <span className="error">Checksum mismatch</span>
                  )
                ) : (
                  <span className="muted">
                    {f.have} / {f.total}
                    {f.recovered > 0 && ` (${f.recovered} rebuilt)`}
                    {f.missing.length > 0 && f.missing.length <= 8 && ` · missing ${f.missing.join(', ')}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="send-footer">
        {files.length > 0 && !scanning && (
          <button type="button" className="secondary" onClick={reset}>
            Clear
          </button>
        )}
        <button type="button" className="primary" onClick={scanning ? stopScan : startScan}>
          {scanning ? 'Stop camera' : 'Scan with camera'}
        </button>
      </div>
    </section>
  )
}

function snapshot(assembler, urls) {
  return assembler.files.map((f) => {
    const name = `received-${f.fileId + 1}${f.extension ? `.${f.extension}` : ''}`
    if (f.result) {
      if (f.result.ok && !urls.has(f.key)) urls.set(f.key, URL.createObjectURL(f.result.blob))
      return {
        key: f.key, name, done: true, ok: f.result.ok, url: urls.get(f.key), size: f.fileSize,
        recovered: f.recovered,
      }
    }
    const missing = []
    for (let p = 1; p <= f.totalPages && missing.length <= 8; p++) {
      if (!f.pages.has(p)) missing.push(p)
    }
    return {
      key: f.key, name, done: false, have: f.pages.size, total: f.totalPages, missing,
      recovered: f.recovered,
    }
  })
}

function cameraError(err) {
  if (!navigator.mediaDevices?.getUserMedia) return 'Camera access needs HTTPS (or localhost).'
  if (err?.name === 'NotAllowedError') return 'Camera permission was denied.'
  if (err?.name === 'NotFoundError') return 'No camera found.'
  return err instanceof Error ? err.message : String(err)
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
