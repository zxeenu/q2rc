import { useRef, useState } from 'react'

export default function DropZone({
  onFiles,
  accept,
  title = 'Drag & drop files here',
  hint = 'or click to browse',
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)
  const depth = useRef(0) // dragenter/leave fire for child elements too

  const handleFiles = (fileList) => {
    const files = Array.from(fileList ?? [])
    if (files.length) onFiles(files)
  }

  return (
    <div
      className={`dropzone${dragging ? ' dragging' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        depth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current -= 1
        if (depth.current === 0) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={accept}
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
      </svg>
      <p><strong>{title}</strong></p>
      <p className="muted">{hint}</p>
    </div>
  )
}
