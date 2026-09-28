'use client'

import React from 'react'
import { Icon } from '@/components/icons'

type Toast = { id: number; message: string; tone: 'default' | 'success' | 'danger' }

const ToastContext = React.createContext<{
  show: (message: string, opts?: { tone?: Toast['tone'] }) => void
}>({ show: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const idRef = React.useRef(0)

  const show = React.useCallback((message: string, opts?: { tone?: Toast['tone'] }) => {
    const id = ++idRef.current
    setToasts((t) => [...t.slice(-2), { id, message, tone: opts?.tone || 'default' }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-viewport" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast--${t.tone}`}
            style={{ display: 'flex', alignItems: 'center', gap: 7 }}
          >
            {t.tone === 'success' && (
              <span style={{ display: 'inline-flex', flexShrink: 0 }} aria-hidden="true">
                <Icon name="check" size={14} strokeWidth={2.8} />
              </span>
            )}
            {t.tone === 'danger' && (
              <span style={{ display: 'inline-flex', flexShrink: 0 }} aria-hidden="true">
                <Icon name="alert" size={14} strokeWidth={2.2} />
              </span>
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return React.useContext(ToastContext)
}
