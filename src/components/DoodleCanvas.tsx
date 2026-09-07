'use client'

import React, { useRef, useState, useCallback, useEffect } from 'react'

interface DoodleCanvasProps {
  onSave: (dataUrl: string) => void
}

type Tool = 'pen' | 'eraser'

const BRUSH_SIZES = [2, 4, 8, 14]

export default function DoodleCanvas({ onSave }: DoodleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [brushSize, setBrushSize] = useState(4)
  const [isDrawing, setIsDrawing] = useState(false)
  const [undoStack, setUndoStack] = useState<ImageData[]>([])
  const [redoStack, setRedoStack] = useState<ImageData[]>([])
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  // Initialize canvas with white background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      const dpr = window.devicePixelRatio || 1
      // Save current content
      const imageData =
        canvas.width > 0 && canvas.height > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null

      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = rect.width + 'px'
      canvas.style.height = rect.height + 'px'
      ctx.scale(dpr, dpr)

      // Fill white background
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, rect.width, rect.height)

      // Restore content if exists
      if (imageData) {
        ctx.putImageData(imageData, 0, 0)
      }

      // Draw grid pattern (notebook lines)
      drawGrid(ctx, rect.width, rect.height)
    }

    resize()

    // We only want to run this once on mount
     
  }, [])

  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.strokeStyle = '#E8E8E8'
    ctx.lineWidth = 0.5
    // Horizontal lines
    for (let y = 20; y < h; y += 20) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    // Vertical margin line
    ctx.strokeStyle = '#FFCCCC'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(30, 0)
    ctx.lineTo(30, h)
    ctx.stroke()
  }

  function saveState() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setUndoStack((prev) => [...prev.slice(-50), imageData])
    setRedoStack([])
  }

  function undo() {
    if (undoStack.length === 0) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const prev = undoStack[undoStack.length - 1]
    setUndoStack((s) => s.slice(0, -1))
    setRedoStack((r) => [...r, current])
    ctx.putImageData(prev, 0, 0)
  }

  function redo() {
    if (redoStack.length === 0) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const next = redoStack[redoStack.length - 1]
    setRedoStack((r) => r.slice(0, -1))
    setUndoStack((s) => [...s, current])
    ctx.putImageData(next, 0, 0)
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    saveState()
    const rect = canvas.parentElement?.getBoundingClientRect()
    if (!rect) return
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, rect.width, rect.height)
    drawGrid(ctx, rect.width, rect.height)
  }

  function getPos(e: React.TouchEvent | React.MouseEvent) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()

    let clientX: number, clientY: number
    if ('touches' in e) {
      if (e.touches.length === 0) return lastPoint.current || { x: 0, y: 0 }
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  function startDraw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault()
    saveState()
    const pos = getPos(e)
    lastPoint.current = pos
    setIsDrawing(true)

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    ctx.beginPath()
    ctx.arc(pos.x, pos.y, (tool === 'pen' ? brushSize : brushSize * 3) / 2, 0, Math.PI * 2)
    ctx.fillStyle = tool === 'pen' ? '#000000' : '#FFFFFF'
    ctx.fill()
  }

  function draw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault()
    if (!isDrawing) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    const pos = getPos(e)
    const from = lastPoint.current || pos

    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = tool === 'pen' ? '#000000' : '#FFFFFF'
    ctx.lineWidth = tool === 'pen' ? brushSize : brushSize * 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    lastPoint.current = pos
  }

  function endDraw() {
    setIsDrawing(false)
    lastPoint.current = null
  }

  function handleSave() {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    onSave(dataUrl)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 14px',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {/* Pen tool */}
        <button
          onClick={() => setTool('pen')}
          title="Pen"
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: tool === 'pen' ? '2px solid var(--accent)' : '1px solid var(--border)',
            background: tool === 'pen' ? 'var(--accent-light)' : 'var(--bg-secondary)',
            color: tool === 'pen' ? 'var(--accent-text)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        </button>

        {/* Eraser tool */}
        <button
          onClick={() => setTool('eraser')}
          title="Eraser"
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: tool === 'eraser' ? '2px solid var(--accent)' : '1px solid var(--border)',
            background: tool === 'eraser' ? 'var(--accent-light)' : 'var(--bg-secondary)',
            color: tool === 'eraser' ? 'var(--accent-text)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
            <path d="M22 21H7" />
            <path d="m5 11 9 9" />
          </svg>
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />

        {/* Brush sizes */}
        {BRUSH_SIZES.map((size) => (
          <button
            key={size}
            onClick={() => setBrushSize(size)}
            title={`Size ${size}`}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: brushSize === size ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: brushSize === size ? 'var(--accent-light)' : 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: Math.min(size * 1.5, 20),
                height: Math.min(size * 1.5, 20),
                borderRadius: '50%',
                background: tool === 'pen' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            />
          </button>
        ))}

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />

        {/* Undo */}
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Undo"
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: undoStack.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: undoStack.length === 0 ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>

        {/* Redo */}
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          title="Redo"
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: redoStack.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: redoStack.length === 0 ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
          </svg>
        </button>

        {/* Clear */}
        <button
          onClick={clearCanvas}
          title="Clear canvas"
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: '1px solid var(--danger-border)',
            background: 'var(--danger-light)',
            color: 'var(--danger-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Save */}
        <button
          onClick={handleSave}
          title="Save doodle"
          style={{
            height: 38,
            borderRadius: 10,
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: '0 14px',
            fontSize: 13,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Save
        </button>
      </div>

      {/* Canvas area */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: '#FFFFFF',
          cursor: tool === 'pen' ? 'crosshair' : 'cell',
          touchAction: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
