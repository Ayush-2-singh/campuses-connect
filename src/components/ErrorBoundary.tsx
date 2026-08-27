'use client'

import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  pageName?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.pageName || 'Component'} error:`, error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--danger-border)',
          borderRadius: 14,
          padding: '32px 24px',
          textAlign: 'center',
          boxShadow: 'var(--shadow-sm)',
          margin: '20px auto',
          maxWidth: 480,
        }}>
          <p style={{ fontSize: 36, margin: '0 0 10px' }}>⚠️</p>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            Something went wrong
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            {this.props.pageName
              ? `The ${this.props.pageName} section hit an unexpected error.`
              : 'This section hit an unexpected error.'}
            <br />
            Try refreshing or going back.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '9px 20px', borderRadius: 10, border: 'none',
                background: 'var(--accent)', color: 'var(--on-accent)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '9px 20px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Reload page
            </button>
          </div>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre style={{
              marginTop: 16, fontSize: 11, color: 'var(--danger)',
              background: 'var(--danger-light)', borderRadius: 8, padding: 10,
              textAlign: 'left', overflow: 'auto', maxHeight: 120,
            }}>
              {this.state.error.message}
            </pre>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
