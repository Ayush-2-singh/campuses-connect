'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function MessagesRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/connections?tab=chats')
  }, [router])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Opening your chats…</p>
    </div>
  )
}
