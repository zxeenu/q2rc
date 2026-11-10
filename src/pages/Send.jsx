import { useEffect, useState } from 'react'
import DropZone from '../components/DropZone.jsx'
import { FRAME_FPS } from '../lib/config.js'
import { fileToFrames } from '../lib/frames.js'
import { createSvgStack } from '../lib/svgStack.js'

export default function Send() {
  const [files, setFiles] = useState([])
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [progress, setProgress] = useState(null) // { fileIndex, page, totalPages }
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { url, size, frames }

  // Free the previous SVG's memory when it's replaced or the page unmounts.
  useEffect(() => () => result && URL.revokeObjectURL(result.url), [result])

  const running = status === 'running'

  async function handleSend() {
    setStatus('running')
    setError(null)
    setResult(null)

    try {
      const stack = createSvgStack(FRAME_FPS)

      // Files are processed strictly one after another.
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const { totalFrames, frames } = await fileToFrames(files[fileIndex], fileIndex)
        let page = 0
        for (const frame of frames) {
          page++
          stack.add(frame)
          // Yield to the UI now and then so progress actually renders.
          if (page % 20 === 0 || page === totalFrames) {
            setProgress({ fileIndex, page, totalPages: totalFrames })
            await new Promise((r) => setTimeout(r))
          }
        }
      }

      const blob = stack.toBlob()
      setResult({ url: URL.createObjectURL(blob), size: blob.size, frames: stack.count })
      setStatus('done')
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  return (
    <section className="send-page">
      <div className="send-body">
        {!running && (
          <DropZone onFiles={(added) => setFiles((prev) => [...prev, ...added])} />
        )}

        {files.length > 0 && (
          <ul className="file-list">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className={progress?.fileIndex === i && running ? 'active' : ''}>
                <span>{file.name}</span>
                <span className="muted">
                  {progress?.fileIndex === i && running
                    ? `${progress.page} / ${progress.totalPages}`
                    : formatSize(file.size)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="error">{error}</p>}

        {result && (
          <div className="qr-result">
            <img src={result.url} alt="Animated QR code sequence" className="qr-preview" />
            <p className="muted">
              {result.frames} frames · {formatSize(result.size)}
            </p>
            <a href={result.url} download="q2rc-transfer.svg">Download SVG</a>
          </div>
        )}
      </div>

      <div className="send-footer">
        <button
          type="button"
          className="primary"
          disabled={files.length === 0 || running}
          onClick={handleSend}
        >
          {running ? 'Sending…' : "Let's Send"}
        </button>
      </div>
    </section>
  )
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
