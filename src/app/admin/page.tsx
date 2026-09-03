'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'


// ── Types ────────────────────────────────────────────────────
interface FeatureFlag {
  id: string
  key: string
  label: string
  description: string | null
  enabled: boolean
  category: string
  sort_order: number
}

interface PlatformSetting {
  key: string
  value: string
  description: string | null
  category: string
}

interface AuditEntry {
  id: string
  actor_id: string
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: any
  created_at: string
  profiles?: { full_name: string; username: string } | null
}

const TABS = [
  'Overview',
  'Analytics',
  'Features',
  'Settings',
  'Users',
  'Verify',
  'Premium',
  'Posts',
  'Moderation',
  'Colleges',
  'Content',
  'Campus Changes',
  'Audit Log',
] as const

type Tab = typeof TABS[number]

export default function AdminPage() {
  // ── Auth / Access ───────────────────────────────────────
  const [profile, setProfile] = useState<any>(null)
  const [grants, setGrants] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('Overview')
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  // ── Overview ────────────────────────────────────────────
  const [stats, setStats] = useState({ users: 0, posts: 0, colleges: 0 })

  // ── Users ───────────────────────────────────────────────
  const [users, setUsers] = useState<any[]>([])
  const [allGrants, setAllGrants] = useState<any[]>([])
  const [adminError, setAdminError] = useState('')

  // ── Posts ───────────────────────────────────────────────
  const [posts, setPosts] = useState<any[]>([])
  const [showAnnouncement, setShowAnnouncement] = useState(false)
  const [announcementText, setAnnouncementText] = useState('')
  const [announcementScope, setAnnouncementScope] = useState('global')
  const [campuses, setCampuses] = useState<any[]>([])
  const [postingAnnouncement, setPostingAnnouncement] = useState(false)

  // ── Moderation ──────────────────────────────────────────
  const [modItems, setModItems] = useState<any[]>([])
  const [modLoading, setModLoading] = useState(false)
  const [modBusy, setModBusy] = useState<string | null>(null)
  const [modDigest, setModDigest] = useState('')
  const [digestLoading, setDigestLoading] = useState(false)
  const [aiNotes, setAiNotes] = useState<Record<string, any>>({})

  // ── Colleges ────────────────────────────────────────────
  const [colleges, setColleges] = useState<any[]>([])

  // ── Content ─────────────────────────────────────────────
  const [campusToGlobal, setCampusToGlobal] = useState(false)
  const [contentSaving, setContentSaving] = useState(false)

  // ── Features (NEW) ──────────────────────────────────────
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([])
  const [featuresLoading, setFeaturesLoading] = useState(false)
  const [featureToggling, setFeatureToggling] = useState<string | null>(null)
  const [newFeature, setNewFeature] = useState({ key: '', label: '', description: '', category: 'custom' })
  const [showAddFeature, setShowAddFeature] = useState(false)
  const [featureSaving, setFeatureSaving] = useState(false)
  const [featureFilter, setFeatureFilter] = useState('all')

  // ── Settings (NEW) ──────────────────────────────────────
  const [platformSettings, setPlatformSettings] = useState<PlatformSetting[]>([])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState<string | null>(null)
  const [settingsFilter, setSettingsFilter] = useState('all')
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({})

  // ── Audit Log (NEW) ─────────────────────────────────────
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditOffset, setAuditOffset] = useState(0)
  const [auditActionFilter, setAuditActionFilter] = useState('')

  // ── Campus Changes (NEW) ────────────────────────────────
  const [campusChanges, setCampusChanges] = useState<any[]>([])
  const [campusChangesLoading, setCampusChangesLoading] = useState(false)
  const [campusChangeFilter, setCampusChangeFilter] = useState('pending')
  const [campusChangeBusy, setCampusChangeBusy] = useState<string | null>(null)

  // ── Verifications (NEW) ─────────────────────────────────
  const [verifyUsers, setVerifyUsers] = useState<any[]>([])
  const [verifyCampuses, setVerifyCampuses] = useState<any[]>([])
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifySearch, setVerifySearch] = useState('')
  const [verifyBusy, setVerifyBusy] = useState<string | null>(null)
  const [verifyUserDetail, setVerifyUserDetail] = useState<any>(null)
  const [verifyUserVerifications, setVerifyUserVerifications] = useState<any[]>([])
  const [verifyAction, setVerifyAction] = useState('change_campus')
  const [verifyForm, setVerifyForm] = useState({ campus_id: '', skill: '', role: '', label: '', value: '', notes: '' })

  // ── Premium (NEW) ───────────────────────────────────────
  const [premiumUsers, setPremiumUsers] = useState<any[]>([])
  const [premiumLoading, setPremiumLoading] = useState(false)
  const [premiumSearch, setPremiumSearch] = useState('')
  const [premiumBusy, setPremiumBusy] = useState<string | null>(null)

  // ── Init ────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/auth/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : ''))
        return
      }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)

      const { data: grantData } = await supabase.rpc('my_admin_grants')
      const grantsArr = (grantData as any[]) || []
      const isAdmin = grantsArr.some(
        (g: any) => g.admin_type === 'platform_admin' || g.admin_type === 'campus_admin'
      )
      if (!isAdmin) {
        router.push('/feed')
        return
      }
      setGrants(grantsArr)

      const [{ count: userCount }, { count: postCount }, { count: collegeCount }] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('posts').select('*', { count: 'exact', head: true }),
        supabase.from('colleges').select('*', { count: 'exact', head: true }),
      ])
      setStats({ users: userCount || 0, posts: postCount || 0, colleges: collegeCount || 0 })

      const { data: setting } = await supabase.from('app_settings').select('value').eq('key', 'campus_content_to_global').maybeSingle()
      setCampusToGlobal(setting?.value === 'true')

      setLoading(false)
    }
    load()
  }, [])

  const isPlatformAdmin = grants.some((g: any) => g.admin_type === 'platform_admin')

  // ── Data loaders ────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*, colleges(name), campuses(name)')
      .order('created_at', { ascending: false })
      .limit(50)
    setUsers(data || [])
    const { data: ag } = await supabase.from('admin_grants').select('user_id, admin_type')
    setAllGrants(ag || [])
  }, [supabase])

  const loadPosts = useCallback(async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, profiles(full_name, username)')
      .order('created_at', { ascending: false })
      .limit(50)
    setPosts(data || [])
  }, [supabase])

  const loadColleges = useCallback(async () => {
    const { data } = await supabase.from('colleges').select('*').order('name')
    setColleges(data || [])
  }, [supabase])

  const loadModeration = useCallback(async () => {
    setModLoading(true)
    try {
      const res = await fetch('/api/admin/copilot/queue')
      if (res.ok) {
        const data = await res.json()
        setModItems(data.items || [])
      }
    } catch { /* ignore */ }
    setModLoading(false)
  }, [])

  const loadFeatures = useCallback(async () => {
    setFeaturesLoading(true)
    try {
      const res = await fetch('/api/admin/feature-flags')
      if (res.ok) {
        const data = await res.json()
        setFeatureFlags(data.flags || [])
      }
    } catch { /* ignore */ }
    setFeaturesLoading(false)
  }, [])

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const res = await fetch('/api/admin/platform-settings')
      if (res.ok) {
        const data = await res.json()
        setPlatformSettings(data.settings || [])
        const draft: Record<string, string> = {}
        for (const s of data.settings || []) {
          // value may come as jsonb (boolean/number/string) — normalize to string
          draft[s.key] = typeof s.value === 'string' ? s.value : String(s.value)
        }
        setSettingsDraft(draft)
      }
    } catch { /* ignore */ }
    setSettingsLoading(false)
  }, [])

  const loadAuditLog = useCallback(async (offset = 0, actionFilter = '') => {
    setAuditLoading(true)
    try {
      let url = `/api/admin/audit-log?limit=50&offset=${offset}`
      if (actionFilter) url += `&action=${encodeURIComponent(actionFilter)}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setAuditEntries(data.entries || [])
        setAuditTotal(data.total || 0)
      }
    } catch { /* ignore */ }
    setAuditLoading(false)
  }, [])

  // ── Verifications load ──────────────────────────────────
  const loadVerifyUsers = useCallback(async (search?: string) => {
    setVerifyLoading(true)
    try {
      const res = await fetch(`/api/admin/verify?search=${encodeURIComponent(search || verifySearch)}`)
      if (res.ok) {
        const data = await res.json()
        setVerifyUsers(data.users || [])
        setVerifyCampuses(data.campuses || [])
      }
    } catch { /* ignore */ }
    setVerifyLoading(false)
  }, [verifySearch])

  const loadUserVerifications = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/verify?user_id=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setVerifyUserVerifications(data.verifications || [])
      }
    } catch { /* ignore */ }
  }

  const performVerification = async (userId: string, action: string, extra: any = {}) => {
    setVerifyBusy(userId)
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, user_id: userId, ...extra, notes: verifyForm.notes || undefined }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      alert(data.message || 'Done!')
      setVerifyForm({ campus_id: '', skill: '', role: '', label: '', value: '', notes: '' })
      if (verifyUserDetail) loadUserVerifications(verifyUserDetail.user_id)
    } catch (err: any) {
      alert(err.message || 'Failed')
    }
    setVerifyBusy(null)
  }

  const revokeVerification = async (verificationId: string) => {
    if (!confirm('Revoke this verification?')) return
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verification_id: verificationId }),
        credentials: 'include',
      })
      if (res.ok && verifyUserDetail) loadUserVerifications(verifyUserDetail.user_id)
    } catch { /* ignore */ }
  }

  // ── Premium load ────────────────────────────────────────
  const loadPremiumUsers = useCallback(async (search?: string) => {
    setPremiumLoading(true)
    try {
      const { data, error } = await supabase
        .from('user_premium')
        .select('*, profiles:user_id(full_name, username, avatar_url, email)')
        .order('created_at', { ascending: false })
      setPremiumUsers((data as any[]) || [])
    } catch { /* ignore */ }
    setPremiumLoading(false)
  }, [])

  const grantPremium = async (userId: string, type: string = 'admin_granted') => {
    setPremiumBusy(userId)
    try {
      const { error } = await supabase.from('user_premium').upsert({
        user_id: userId,
        is_premium: true,
        premium_type: type,
        granted_by: profile?.id,
      }, { onConflict: 'user_id' })
      if (error) throw new Error(error.message)
      loadPremiumUsers()
    } catch (err: any) {
      alert(err.message || 'Failed')
    }
    setPremiumBusy(null)
  }

  const revokePremium = async (userId: string) => {
    if (!confirm('Revoke premium access?')) return
    setPremiumBusy(userId)
    try {
      const { error } = await supabase.from('user_premium').delete().eq('user_id', userId)
      if (error) throw new Error(error.message)
      loadPremiumUsers()
    } catch (err: any) {
      alert(err.message || 'Failed')
    }
    setPremiumBusy(null)
  }

  // ── Campus Changes load ─────────────────────────────────
  const loadCampusChanges = useCallback(async (status?: string) => {
    setCampusChangesLoading(true)
    try {
      const s = status || campusChangeFilter
      const res = await fetch(`/api/admin/campus-change?status=${s}`)
      if (res.ok) {
        const data = await res.json()
        setCampusChanges(data.requests || [])
      }
    } catch { /* ignore */ }
    setCampusChangesLoading(false)
  }, [campusChangeFilter])

  const reviewCampusChange = async (requestId: string, action: 'approve' | 'reject', reason?: string) => {
    setCampusChangeBusy(requestId)
    try {
      const res = await fetch('/api/admin/campus-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, action, reason }),
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed')
      }
      loadCampusChanges()
    } catch { /* ignore */ }
    setCampusChangeBusy(null)
  }

  // ── Tab data loading ────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'Analytics') { router.push('/admin/analytics'); return }
    if (activeTab === 'Users') loadUsers()
    if (activeTab === 'Posts') loadPosts()
    if (activeTab === 'Colleges') loadColleges()
    if (activeTab === 'Moderation') loadModeration()
    if (activeTab === 'Features') loadFeatures()
    if (activeTab === 'Settings') loadSettings()
    if (activeTab === 'Verify') loadVerifyUsers()
    if (activeTab === 'Premium') loadPremiumUsers()
    if (activeTab === 'Campus Changes') loadCampusChanges()
    if (activeTab === 'Audit Log') loadAuditLog()
  }, [activeTab])

  // ── User actions ────────────────────────────────────────
  const setAdminAccess = async (userId: string, access: string) => {
    setAdminError('')
    if (userId === profile?.id && access !== 'platform_admin') {
      setAdminError('You cannot remove your own platform admin access.')
      return
    }
    const target = users.find(u => u.id === userId)
    const isLastPlatformAdmin =
      allGrants.filter(g => g.admin_type === 'platform_admin').length <= 1 &&
      allGrants.some(g => g.user_id === userId && g.admin_type === 'platform_admin')
    if (isLastPlatformAdmin && access !== 'platform_admin') {
      setAdminError('Cannot revoke the last platform admin — you would lock everyone out.')
      return
    }
    let failed = false

    const { error: delErr } = await supabase
      .from('admin_grants')
      .delete()
      .eq('user_id', userId)
      .in('admin_type', ['platform_admin', 'campus_admin'])
    if (delErr) failed = true

    if (access !== 'none' && !failed) {
      const { error: insErr } = await supabase.from('admin_grants').insert({
        user_id: userId,
        admin_type: access,
        campus_id: access === 'campus_admin' ? target?.campus_id || profile?.campus_id || null : null,
        college_id: access === 'campus_admin' ? target?.college_id || profile?.college_id || null : null,
        granted_by: profile?.id,
      })
      if (insErr) failed = true
    }

    if (failed) setAdminError('Could not update admin access.')
    loadUsers()
  }

  const userAccess = (userId: string) => {
    const gs = allGrants.filter((g: any) => g.user_id === userId)
    if (gs.some((g: any) => g.admin_type === 'platform_admin')) return 'platform_admin'
    if (gs.some((g: any) => g.admin_type === 'campus_admin')) return 'campus_admin'
    return 'none'
  }

  const ADMIN_OPTIONS = [
    { value: 'none', label: 'No admin access' },
    { value: 'campus_admin', label: 'Campus Admin' },
    { value: 'platform_admin', label: 'Platform Admin' },
  ]

  // ── Post actions ────────────────────────────────────────
  const togglePin = async (postId: string, current: boolean) => {
    await supabase.from('posts').update({ is_pinned: !current }).eq('id', postId)
    loadPosts()
  }

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post?')) return
    await supabase.from('posts').delete().eq('id', postId)
    loadPosts()
  }

  const postAnnouncement = async () => {
    if (!announcementText.trim()) return
    setPostingAnnouncement(true)
    await supabase.from('posts').insert({
      author_id: profile?.id,
      body: announcementText,
      post_type: 'announcement',
      scope: announcementScope === 'global' ? 'global' : 'campus',
      is_official: true,
      is_pinned: true,
      campus_id: announcementScope !== 'global' ? announcementScope : null,
      college_id: profile?.college_id,
    })
    setAnnouncementText('')
    setShowAnnouncement(false)
    setPostingAnnouncement(false)
    loadPosts()
  }

  // ── Moderation actions ──────────────────────────────────
  const resolveMod = async (itemId: string, action: string) => {
    setModBusy(itemId)
    await fetch('/api/admin/copilot/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, action }),
    })
    setModBusy(null)
    loadModeration()
  }

  const aiAnalyze = async (item: any) => {
    setModBusy(item.item_id)
    const res = await fetch('/api/admin/copilot/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: item.preview || '', contentType: item.content_type }),
    })
    if (res.ok) {
      const data = await res.json()
      setAiNotes(n => ({ ...n, [item.item_id]: data.verdict }))
    }
    setModBusy(null)
  }

  const aiDigest = async () => {
    setDigestLoading(true)
    setModDigest('')
    const res = await fetch('/api/admin/copilot/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: modItems.map(i => ({ type: i.content_type, preview: i.preview || '', reason: i.reason || '' })),
      }),
    })
    if (res.ok) {
      const data = await res.json()
      setModDigest(data.digest || '')
    }
    setDigestLoading(false)
  }

  // ── Content actions ─────────────────────────────────────
  const toggleCampusToGlobal = async () => {
    setContentSaving(true)
    const next = !campusToGlobal
    const { error } = await supabase.from('app_settings').update({ value: String(next) }).eq('key', 'campus_content_to_global')
    if (error) {
      setAdminError('Only platform admins can change this setting.')
    } else {
      setCampusToGlobal(next)
      setAdminError('')
    }
    setContentSaving(false)
  }

  // ── Feature flag actions (NEW) ──────────────────────────
  const toggleFeature = async (key: string, currentEnabled: boolean) => {
    setFeatureToggling(key)
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, enabled: !currentEnabled }),
      })
      if (res.ok) {
        setFeatureFlags(flags =>
          flags.map(f => f.key === key ? { ...f, enabled: !currentEnabled } : f)
        )
      }
    } catch { /* ignore */ }
    setFeatureToggling(null)
  }

  const addFeature = async () => {
    if (!newFeature.key || !newFeature.label) return
    setFeatureSaving(true)
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFeature),
      })
      if (res.ok) {
        setNewFeature({ key: '', label: '', description: '', category: 'custom' })
        setShowAddFeature(false)
        loadFeatures()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to add feature')
      }
    } catch { /* ignore */ }
    setFeatureSaving(false)
  }

  const deleteFeature = async (key: string) => {
    if (!confirm(`Delete feature "${key}"? This cannot be undone.`)) return
    try {
      await fetch(`/api/admin/feature-flags?key=${key}`, { method: 'DELETE' })
      loadFeatures()
    } catch { /* ignore */ }
  }

  // ── Platform settings actions (NEW) ─────────────────────
  const saveSetting = async (key: string) => {
    setSettingsSaving(key)
    try {
      const res = await fetch('/api/admin/platform-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: settingsDraft[key] }),
      })
      if (res.ok) {
        setPlatformSettings(settings =>
          settings.map(s => s.key === key ? { ...s, value: settingsDraft[key] } : s)
        )
      }
    } catch { /* ignore */ }
    setSettingsSaving(null)
  }

  // ── Audit log actions (NEW) ─────────────────────────────
  const loadMoreAudit = () => {
    const newOffset = auditOffset + 50
    setAuditOffset(newOffset)
    loadAuditLog(newOffset, auditActionFilter)
  }

  // ── Derived data ────────────────────────────────────────
  const featureCategories = [...new Set(featureFlags.map(f => f.category))].sort()
  const filteredFeatures = featureFilter === 'all'
    ? featureFlags
    : featureFlags.filter(f => f.category === featureFilter)

  const settingsCategories = [...new Set(platformSettings.map(s => s.category))].sort()
  const filteredSettings = settingsFilter === 'all'
    ? platformSettings
    : platformSettings.filter(s => s.category === settingsFilter)

  const enabledCount = featureFlags.filter(f => f.enabled).length
  const disabledCount = featureFlags.filter(f => !f.enabled).length

  // ── Category colors ─────────────────────────────────────
  const categoryColors: Record<string, string> = {
    core: 'var(--accent)',
    social: 'var(--success-text)',
    academics: 'var(--purple-text)',
    tools: 'var(--orange-text)',
    custom: 'var(--text-muted)',
    general: 'var(--text-secondary)',
    appearance: 'var(--accent)',
    security: 'var(--danger)',
    ai: 'var(--purple-text)',
  }

  // ── Loading state ───────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading admin panel…</p>
    </div>
  )

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg-secondary)' }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div className="admin-header" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 24px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>
              Connect<span style={{ color: 'var(--accent)' }}>MyCampus</span> Admin
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              {isPlatformAdmin ? '🛡️ Platform Admin' : '🏫 Campus Admin'} · {enabledCount}/{featureFlags.length} features active
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => router.push('/feed')}
              style={{ background: 'none', border: '1px solid var(--border)', padding: '7px 14px', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Back to Feed
            </button>
          </div>
        </div>
      </div>

      <div className="admin-content" style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>

        {/* ── Tabs ─────────────────────────────────────── */}
        <div className="admin-tabs" style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 18px', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap',
                border: 'none', background: 'none', cursor: 'pointer',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1, fontFamily: 'inherit',
              }}>
              {tab}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════
            OVERVIEW
        ═══════════════════════════════════════════════════ */}
        {activeTab === 'Overview' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Users', value: stats.users, emoji: '👥' },
                { label: 'Total Posts', value: stats.posts, emoji: '📝' },
                { label: 'Colleges', value: stats.colleges, emoji: '🏫' },
                { label: 'Active Features', value: enabledCount, emoji: '⚡' },
                { label: 'Disabled Features', value: disabledCount, emoji: '🚫' },
                { label: 'Platform Settings', value: platformSettings.length, emoji: '⚙️' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  <p style={{ fontSize: 32, margin: '0 0 8px' }}>{s.emoji}</p>
                  <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)', margin: '0 0 4px' }}>{s.value}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>🚀 Quick Actions</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <button onClick={() => router.push('/admin/analytics')}
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <p style={{ fontSize: 20, margin: '0 0 4px' }}>📊</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Analytics Dashboard</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>Metrics, growth, heatmap</p>
                </button>
                <button onClick={() => setActiveTab('Features')}
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <p style={{ fontSize: 20, margin: '0 0 4px' }}>⚡</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Manage Features</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>Toggle features on/off</p>
                </button>
                <button onClick={() => setActiveTab('Settings')}
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <p style={{ fontSize: 20, margin: '0 0 4px' }}>⚙️</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Platform Settings</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>Configure platform behavior</p>
                </button>
                <button onClick={() => setActiveTab('Users')}
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <p style={{ fontSize: 20, margin: '0 0 4px' }}>👥</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Manage Users</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>Admin access & roles</p>
                </button>
                <button onClick={() => setActiveTab('Moderation')}
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <p style={{ fontSize: 20, margin: '0 0 4px' }}>🛡️</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Moderation</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>AI copilot & reports</p>
                </button>
                <button onClick={() => setActiveTab('Audit Log')}
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <p style={{ fontSize: 20, margin: '0 0 4px' }}>📋</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Audit Log</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>All admin actions</p>
                </button>
              </div>
            </div>

            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 16, boxShadow: 'var(--shadow-sm)' }}>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                Welcome to the <strong>full admin panel</strong>. You can now manage <strong>Features</strong> (toggle on/off), <strong>Settings</strong> (platform configuration),
                <strong> Users</strong> (grant or revoke admin access), <strong>Posts</strong> (pin or delete), <strong>Colleges</strong> (view registered institutions),
                <strong> Moderation</strong> (AI copilot), and review the <strong>Audit Log</strong> — all from this dashboard.
              </p>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            FEATURES (NEW)
        ═══════════════════════════════════════════════════ */}
        {activeTab === 'Features' && (
          <div>
            {/* Stats bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>⚡ Feature Flags</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  Toggle platform features on/off — changes take effect immediately, no code deploy needed.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'var(--success-light)', color: 'var(--success-text)', fontWeight: 600 }}>
                  ✅ {enabledCount} active
                </span>
                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'var(--danger-light)', color: 'var(--danger)', fontWeight: 600 }}>
                  🚫 {disabledCount} disabled
                </span>
                {isPlatformAdmin && (
                  <button onClick={() => setShowAddFeature(!showAddFeature)}
                    style={{ padding: '6px 14px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    + Add Feature
                  </button>
                )}
              </div>
            </div>

            {/* Add feature form */}
            {showAddFeature && (
              <div style={{ background: 'var(--bg)', border: '2px solid var(--accent)', borderRadius: 14, padding: 20, marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>➕ Add New Feature Flag</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <input
                    value={newFeature.key}
                    onChange={e => setNewFeature({ ...newFeature, key: e.target.value })}
                    placeholder="Feature key (e.g., new_dashboard)"
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'monospace', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  />
                  <input
                    value={newFeature.label}
                    onChange={e => setNewFeature({ ...newFeature, label: e.target.value })}
                    placeholder="Display label (e.g., New Dashboard)"
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <input
                    value={newFeature.description}
                    onChange={e => setNewFeature({ ...newFeature, description: e.target.value })}
                    placeholder="Description (optional)"
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  />
                  <select
                    value={newFeature.category}
                    onChange={e => setNewFeature({ ...newFeature, category: e.target.value })}
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <option value="core">Core</option>
                    <option value="social">Social</option>
                    <option value="academics">Academics</option>
                    <option value="tools">Tools</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setShowAddFeature(false)}
                    style={{ flex: 1, background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                  <button onClick={addFeature} disabled={!newFeature.key || !newFeature.label || featureSaving}
                    style={{ flex: 2, background: featureSaving ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '9px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {featureSaving ? 'Saving...' : '✓ Add Feature'}
                  </button>
                </div>
              </div>
            )}

            {/* Category filter */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {['all', ...featureCategories].map(cat => (
                <button key={cat} onClick={() => setFeatureFilter(cat)}
                  style={{ padding: '5px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    background: featureFilter === cat ? (categoryColors[cat] || 'var(--accent)') : 'var(--bg)',
                    color: featureFilter === cat ? '#fff' : 'var(--text-secondary)' }}>
                  {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>

            {/* Feature list */}
            {featuresLoading ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading features…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredFeatures.map(f => (
                  <div key={f.key}
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-sm)', opacity: f.enabled ? 1 : 0.7 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{f.label}</span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: `${categoryColors[f.category] || 'var(--text-muted)'}22`, color: categoryColors[f.category] || 'var(--text-muted)', fontWeight: 600 }}>
                          {f.category}
                        </span>
                        <code style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{f.key}</code>
                      </div>
                      {f.description && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{f.description}</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      {isPlatformAdmin && (
                        <button onClick={() => deleteFeature(f.key)}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--danger-border)', background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✕
                        </button>
                      )}
                      <button
                        onClick={() => toggleFeature(f.key, f.enabled)}
                        disabled={!isPlatformAdmin || featureToggling === f.key}
                        aria-pressed={f.enabled}
                        style={{ flexShrink: 0, width: 52, height: 30, borderRadius: 20, border: 'none', cursor: isPlatformAdmin ? 'pointer' : 'default', position: 'relative', background: f.enabled ? 'var(--success)' : 'var(--border-strong)', transition: 'background 0.2s' }}>
                        <span style={{ position: 'absolute', top: 3, left: f.enabled ? 25 : 3, width: 24, height: 24, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            PLATFORM SETTINGS (NEW)
        ═══════════════════════════════════════════════════ */}
        {activeTab === 'Settings' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>⚙️ Platform Settings</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  Configure platform behavior, appearance, security, and AI — no code changes required.
                </p>
              </div>
            </div>

            {/* Category filter */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {['all', ...settingsCategories].map(cat => (
                <button key={cat} onClick={() => setSettingsFilter(cat)}
                  style={{ padding: '5px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    background: settingsFilter === cat ? (categoryColors[cat] || 'var(--accent)') : 'var(--bg)',
                    color: settingsFilter === cat ? '#fff' : 'var(--text-secondary)' }}>
                  {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>

            {settingsLoading ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading settings…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredSettings.map(s => {
                  const isBoolean = s.value === 'true' || s.value === 'false'
                  const hasChanged = settingsDraft[s.key] !== s.value
                  return (
                    <div key={s.key}
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {s.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: `${categoryColors[s.category] || 'var(--text-muted)'}22`, color: categoryColors[s.category] || 'var(--text-muted)', fontWeight: 600 }}>
                          {s.category}
                        </span>
                        {hasChanged && (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--orange-light)', color: 'var(--orange-text)', fontWeight: 600 }}>
                            unsaved
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>{s.description}</p>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {isBoolean ? (
                          <button
                            onClick={() => {
                              setSettingsDraft(d => ({ ...d, [s.key]: s.value === 'true' ? 'false' : 'true' }))
                            }}
                            aria-pressed={settingsDraft[s.key] === 'true'}
                            style={{ flexShrink: 0, width: 52, height: 30, borderRadius: 20, border: 'none', cursor: isPlatformAdmin ? 'pointer' : 'default', position: 'relative', background: settingsDraft[s.key] === 'true' ? 'var(--success)' : 'var(--border-strong)', transition: 'background 0.2s' }}>
                            <span style={{ position: 'absolute', top: 3, left: settingsDraft[s.key] === 'true' ? 25 : 3, width: 24, height: 24, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                          </button>
                        ) : (
                          <input
                            value={settingsDraft[s.key] || ''}
                            onChange={e => setSettingsDraft(d => ({ ...d, [s.key]: e.target.value }))}
                            disabled={!isPlatformAdmin}
                            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)', minWidth: 0 }}
                          />
                        )}
                        {isPlatformAdmin && (
                          <button onClick={() => saveSetting(s.key)}
                            disabled={settingsSaving === s.key || !hasChanged}
                            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: hasChanged ? 'pointer' : 'default', fontFamily: 'inherit',
                              background: settingsSaving === s.key ? 'var(--disabled)' : hasChanged ? 'var(--accent)' : 'var(--border-strong)',
                              color: hasChanged ? 'var(--on-accent)' : 'var(--text-muted)' }}>
                            {settingsSaving === s.key ? 'Saving...' : 'Save'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            USERS
        ═══════════════════════════════════════════════════ */}
        {activeTab === 'Users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {adminError && (
              <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 4 }}>
                {adminError}
              </div>
            )}
            {users.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading users…</p>
            ) : users.map(u => (
              <div key={u.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{u.full_name || 'No name'}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    @{u.username || '—'} · {u.colleges?.name || 'No college'}
                  </p>
                </div>
                {isPlatformAdmin ? (
                  <select
                    value={userAccess(u.id)}
                    onChange={e => setAdminAccess(u.id, e.target.value)}
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {ADMIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Platform admins manage access</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            VERIFY (NEW) — Admin Manual Verification
        ═══════════════════════════════════════════════════ */}
        {activeTab === 'Verify' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>🛡️ Manual Verification</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                Manually verify users — campus, identity, email, skills, roles. No AI needed.
              </p>
            </div>

            {/* Search */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input value={verifySearch} onChange={e => setVerifySearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadVerifyUsers(verifySearch)}
                placeholder="🔍 Search users by name, username, or email..."
                style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-primary)' }} />
              <button onClick={() => loadVerifyUsers(verifySearch)}
                style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Search
              </button>
            </div>

            {/* User Detail Panel (when selected) */}
            {verifyUserDetail && (
              <div style={{ background: 'var(--bg)', border: '2px solid var(--accent)', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => { setVerifyUserDetail(null); setVerifyUserVerifications([]) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)', padding: 4 }}>←</button>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{verifyUserDetail.full_name}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>@{verifyUserDetail.username} · {verifyUserDetail.campus_name || 'No campus'}</p>
                    </div>
                  </div>
                </div>

                {/* Verification actions */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
                  {[
                    { key: 'change_campus', label: '🏫 Change Campus', color: 'var(--accent)' },
                    { key: 'verify_identity', label: '🪪 Verify Identity', color: 'var(--success-text)' },
                    { key: 'verify_email', label: '📧 Verify Email', color: 'var(--purple-text)' },
                    { key: 'endorse_skill', label: '⭐ Endorse Skill', color: 'var(--yellow-text)' },
                    { key: 'assign_role', label: '🎯 Assign Role', color: 'var(--orange-text)' },
                    { key: 'custom', label: '📝 Custom Verify', color: 'var(--text-secondary)' },
                  ].map(a => (
                    <button key={a.key} onClick={() => setVerifyAction(a.key)}
                      disabled={verifyBusy === verifyUserDetail.user_id}
                      style={{ padding: '10px 12px', borderRadius: 10, border: verifyAction === a.key ? `2px solid ${a.color}` : '1px solid var(--border)',
                        background: verifyAction === a.key ? `${a.color}15` : 'var(--bg-secondary)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--text-primary)' }}>
                      {a.label}
                    </button>
                  ))}
                </div>

                {/* Action-specific inputs */}
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                  {verifyAction === 'change_campus' && (
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>New Campus</label>
                      <select value={verifyForm.campus_id} onChange={e => setVerifyForm({ ...verifyForm, campus_id: e.target.value })}
                        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-primary)' }}>
                        <option value="">Select campus...</option>
                        {verifyCampuses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}
                  {verifyAction === 'verify_email' && (
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Email to verify</label>
                      <input value={verifyForm.value} onChange={e => setVerifyForm({ ...verifyForm, value: e.target.value })} placeholder="user@college.edu"
                        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-primary)' }} />
                    </div>
                  )}
                  {verifyAction === 'endorse_skill' && (
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Skill to endorse</label>
                      <input value={verifyForm.skill} onChange={e => setVerifyForm({ ...verifyForm, skill: e.target.value })} placeholder="e.g. React, DSA, Python"
                        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-primary)' }} />
                    </div>
                  )}
                  {verifyAction === 'assign_role' && (
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Role to assign</label>
                      <input value={verifyForm.role} onChange={e => setVerifyForm({ ...verifyForm, role: e.target.value })} placeholder="e.g. Placement Head, TA, Club Lead"
                        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-primary)' }} />
                    </div>
                  )}
                  {verifyAction === 'custom' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Label</label>
                        <input value={verifyForm.label} onChange={e => setVerifyForm({ ...verifyForm, label: e.target.value })} placeholder="e.g. Hackathon Winner"
                          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-primary)' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Value (optional)</label>
                        <input value={verifyForm.value} onChange={e => setVerifyForm({ ...verifyForm, value: e.target.value })} placeholder="Details"
                          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-primary)' }} />
                      </div>
                    </div>
                  )}
                  {/* Notes */}
                  <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Admin Notes (optional)</label>
                    <input value={verifyForm.notes} onChange={e => setVerifyForm({ ...verifyForm, notes: e.target.value })} placeholder="Why this verification..."
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-primary)' }} />
                  </div>
                </div>

                {/* Submit */}
                <button onClick={() => {
                    const extras: any = {}
                    if (verifyAction === 'change_campus') extras.campus_id = verifyForm.campus_id
                    if (verifyAction === 'verify_email') extras.email = verifyForm.value
                    if (verifyAction === 'endorse_skill') extras.skill = verifyForm.skill
                    if (verifyAction === 'assign_role') extras.role = verifyForm.role
                    if (verifyAction === 'custom') { extras.label = verifyForm.label; extras.value = verifyForm.value }
                    performVerification(verifyUserDetail.user_id, verifyAction, extras)
                  }}
                  disabled={verifyBusy === verifyUserDetail.user_id}
                  style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: verifyBusy ? 'var(--disabled)' : 'var(--success-text)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {verifyBusy === verifyUserDetail.user_id ? '⏳ Processing...' : '✅ Confirm Verification'}
                </button>

                {/* Existing verifications */}
                {verifyUserVerifications.length > 0 && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 8px' }}>📋 Verification History</p>
                    {verifyUserVerifications.map((v: any) => (
                      <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'var(--success-light)', color: 'var(--success-text)', fontWeight: 600, flexShrink: 0 }}>
                          {v.verification_type}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
                          {v.admin_notes || JSON.stringify(v.metadata)}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                          {new Date(v.verified_at).toLocaleDateString()}
                        </span>
                        <button onClick={() => revokeVerification(v.id)}
                          style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid var(--danger-border)', background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Users list */}
            {verifyLoading ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
            ) : verifyUsers.length === 0 ? (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>🛡️</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Search for users to verify</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Type a name, username, or email above</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {verifyUsers.map((u: any) => (
                  <div key={u.user_id} onClick={() => { setVerifyUserDetail(u); loadUserVerifications(u.user_id) }}
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.full_name || 'Unknown'}
                        </p>
                        {u.is_verified && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 6, background: 'var(--success-light)', color: 'var(--success-text)', fontWeight: 600 }}>✅</span>}
                        {u.verification_count > 0 && (
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 }}>
                            🛡️ {u.verification_count}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                        @{u.username} · {u.campus_name || 'No campus'} · ⭐ {u.karma_points}
                      </p>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 14, flexShrink: 0 }}>→</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            PREMIUM (NEW)
        ═══════════════════════════════════════════════════ */}
        {activeTab === 'Premium' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>👑 Premium Users</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                Manage premium access — grant or revoke Pro membership
              </p>
            </div>

            {/* Search + Grant */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <input value={premiumSearch} onChange={e => setPremiumSearch(e.target.value)}
                placeholder="🔍 Search users..."
                style={{ flex: 1, minWidth: 200, border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-primary)' }} />
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px', textAlign: 'center' }}>
                <p style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b', margin: '0 0 2px' }}>👑 {premiumUsers.length}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Premium Users</p>
              </div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px', textAlign: 'center' }}>
                <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>🧠 Brain</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Premium Feature</p>
              </div>
            </div>

            {/* Premium users list */}
            {premiumLoading ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
            ) : premiumUsers.length === 0 ? (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>👑</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No premium users yet</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Grant premium access from the Users tab</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {premiumUsers.map((pu: any) => {
                  const u = pu.profiles
                  return (
                    <div key={pu.id}
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{u?.full_name || 'Unknown'}</p>
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#fff', fontWeight: 700 }}>👑 {pu.premium_type}</span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>@{u?.username} · Since {new Date(pu.created_at).toLocaleDateString()}</p>
                      </div>
                      <button onClick={() => revokePremium(pu.user_id)}
                        disabled={premiumBusy === pu.user_id}
                        style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--danger-border)', background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Revoke
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            POSTS
        ═══════════════════════════════════════════════════ */}
        {activeTab === 'Posts' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              {!showAnnouncement ? (
                <button onClick={() => setShowAnnouncement(true)}
                  style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  🌐 Post Global Announcement
                </button>
              ) : (
                <div style={{ background: 'var(--bg)', border: '2px solid var(--accent-text)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>🌐 Post Official Announcement</h3>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <button onClick={() => setAnnouncementScope('global')} style={{ padding: '6px 16px', borderRadius: 20, border: 'none', background: announcementScope === 'global' ? 'var(--accent)' : 'var(--border-strong)', color: announcementScope === 'global' ? 'var(--on-accent)' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>🌐 All Campuses</button>
                    {campuses.map(c => (
                      <button key={c.id} onClick={() => setAnnouncementScope(c.id)} style={{ padding: '6px 16px', borderRadius: 20, border: 'none', background: announcementScope === c.id ? 'var(--success)' : 'var(--border-strong)', color: announcementScope === c.id ? 'var(--on-accent)' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>🏫 {c.name}</button>
                    ))}
                  </div>
                  <textarea value={announcementText} onChange={e => setAnnouncementText(e.target.value)}
                    placeholder="Write your official announcement..." rows={4}
                    style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => setShowAnnouncement(false)} style={{ flex: 1, background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    <button onClick={postAnnouncement} disabled={!announcementText.trim() || postingAnnouncement}
                      style={{ flex: 2, background: postingAnnouncement ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '9px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {postingAnnouncement ? 'Posting...' : announcementScope === 'global' ? '🌐 Post Global Announcement' : '🏫 Post Campus Announcement'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {posts.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading posts…</p>
              ) : posts.map(p => (
                <div key={p.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.5 }}>
                        {p.body?.slice(0, 160)}{p.body?.length > 160 ? '…' : ''}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                        @{p.profiles?.username} · {p.post_type} {p.is_pinned ? '· 📌 Pinned' : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => togglePin(p.id, p.is_pinned)}
                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: p.is_pinned ? 'var(--orange-light)' : 'var(--bg)', color: p.is_pinned ? 'var(--orange-text)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {p.is_pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button onClick={() => deletePost(p.id)}
                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--danger-border)', background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            MODERATION
        ═══════════════════════════════════════════════════ */}
        {activeTab === 'Moderation' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>🤖 AI Admin Copilot</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  {modItems.length} open {modItems.length === 1 ? 'item' : 'items'} (AI flags + user reports)
                </p>
              </div>
              <button onClick={aiDigest} disabled={digestLoading || !modItems.length}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: digestLoading || !modItems.length ? 'var(--purple-border)' : 'var(--accent-purple)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {digestLoading ? 'Thinking...' : '✨ AI Summary'}
              </button>
            </div>

            {modDigest && (
              <div style={{ background: 'var(--purple-light)', border: '1px solid var(--purple-border)', borderRadius: 14, padding: '16px 18px', marginBottom: 16, fontSize: 13, color: 'var(--purple-text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                <strong>🤖 Copilot digest:</strong>
                {'\n'}{modDigest}
              </div>
            )}

            {modLoading ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading moderation queue…</p>
            ) : modItems.length === 0 ? (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>🛡️</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Queue is clear</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  No content waiting for review. New posts are AI-checked automatically.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {modItems.map(item => {
                  const aiNote = aiNotes[item.item_id]
                  const severityColor =
                    item.ai_verdict?.severity === 'high' ? 'var(--danger)'
                    : item.ai_verdict?.severity === 'medium' ? '#d97706' : 'var(--success-text)'
                  return (
                    <div key={item.item_id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, background: item.source === 'ai' ? 'var(--purple-light)' : 'var(--warning-light)', color: item.source === 'ai' ? 'var(--purple-text)' : 'var(--warning-text)', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>
                            {item.source === 'ai' ? '🤖 AI Flag' : '🚩 User Report'}
                          </span>
                          <span style={{ fontSize: 11, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>{item.content_type}</span>
                          {item.ai_verdict?.severity && (
                            <span style={{ fontSize: 11, background: 'var(--danger-light)', color: severityColor, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                              {item.ai_verdict.severity}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {item.source === 'ai' ? (item.author_name || 'Anonymous') : `reported by ${item.author_name || 'Anonymous'}`} ·{' '}
                            {new Date(item.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {item.preview ? item.preview.slice(0, 300) : '(no preview)'}
                        {item.preview?.length > 300 ? '…' : ''}
                      </p>

                      {(item.reason || item.ai_verdict?.reason) && (
                        <p style={{ fontSize: 12, color: 'var(--warning-text)', background: 'var(--warning-light)', border: '1px solid var(--warning-border)', borderRadius: 8, padding: '6px 10px', margin: '0 0 8px', lineHeight: 1.5 }}>
                          ⚠️ {item.ai_verdict?.reason || item.reason}
                        </p>
                      )}

                      {aiNote && (
                        <div style={{ fontSize: 12, color: 'var(--purple-text)', background: 'var(--purple-light)', border: '1px solid var(--purple-border)', borderRadius: 8, padding: '8px 10px', marginBottom: 10, lineHeight: 1.5 }}>
                          🤖 Fresh analysis: {aiNote.flagged ? `${aiNote.reason} (action: ${aiNote.action})` : 'Looks fine to publish.'}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => resolveMod(item.item_id, 'approve')} disabled={modBusy === item.item_id}
                          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✓ Approve
                        </button>
                        <button onClick={() => resolveMod(item.item_id, 'remove')} disabled={modBusy === item.item_id}
                          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--danger)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✕ Remove
                        </button>
                        <button onClick={() => resolveMod(item.item_id, 'dismiss')} disabled={modBusy === item.item_id}
                          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Dismiss
                        </button>
                        {item.source === 'user_report' && (
                          <button onClick={() => aiAnalyze(item)} disabled={modBusy === item.item_id}
                            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--purple-border)', background: 'var(--purple-light)', color: 'var(--purple-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {modBusy === item.item_id ? 'Analyzing...' : '🤖 AI Analyze'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            COLLEGES
        ═══════════════════════════════════════════════════ */}
        {activeTab === 'Colleges' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {colleges.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading colleges…</p>
            ) : colleges.map(c => (
              <div key={c.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'var(--shadow-sm)' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{c.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{c.slug}</p>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: c.is_active ? 'var(--success-light)' : 'var(--danger-light)',
                  color: c.is_active ? 'var(--success-text)' : 'var(--danger)',
                }}>
                  {c.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            CONTENT
        ═══════════════════════════════════════════════════ */}
        {activeTab === 'Content' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>🌐 Global vs Campus content</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 16px' }}>
                Global students (no college yet) only see content marked <strong>Global</strong>. Anything marked
                <strong> Campus</strong> stays inside its own branch. Use the switch below to open campus content to everyone.
              </p>

              {adminError && (
                <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--danger)' }}>{adminError}</div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--bg-secondary)', borderRadius: 12, padding: '14px 16px' }}>
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>Campus content visible to Global users</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{campusToGlobal ? 'ON — global students can see campus opportunities, notes & posts.' : 'OFF — global students only see global content. (recommended)'}</p>
                </div>
                <button
                  onClick={toggleCampusToGlobal}
                  disabled={contentSaving}
                  aria-pressed={campusToGlobal}
                  style={{ flexShrink: 0, width: 52, height: 30, borderRadius: 20, border: 'none', cursor: contentSaving ? 'default' : 'pointer', position: 'relative', background: campusToGlobal ? 'var(--accent)' : 'var(--border-strong)', transition: 'background 0.2s' }}>
                  <span style={{ position: 'absolute', top: 3, left: campusToGlobal ? 25 : 3, width: 24, height: 24, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                </button>
              </div>

              <div style={{ background: 'var(--accent-light)', borderRadius: 10, padding: '12px 14px', marginTop: 14 }}>
                <p style={{ fontSize: 12.5, color: 'var(--accent-text)', margin: 0, lineHeight: 1.6 }}>
                  💡 When posting opportunities or notes, choose <strong>Global</strong> (every student) or
                  <strong> Campus</strong> (your branch only) — the same choice you see for posts in the composer.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            CAMPUS CHANGES (NEW)
        ═══════════════════════════════════════════════════ */}
        {activeTab === 'Campus Changes' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>🏫 Campus Change Requests</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  Review ID cards and approve/reject campus change requests
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['pending', 'all', 'approved', 'rejected'].map(s => (
                  <button key={s} onClick={() => { setCampusChangeFilter(s); loadCampusChanges(s) }}
                    style={{ padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                      background: campusChangeFilter === s ? 'var(--accent)' : 'var(--bg)',
                      color: campusChangeFilter === s ? 'var(--on-accent)' : 'var(--text-secondary)' }}>
                    {s === 'pending' ? '⏳ Pending' : s === 'approved' ? '✅ Approved' : s === 'rejected' ? '❌ Rejected' : '📋 All'}
                  </button>
                ))}
              </div>
            </div>

            {campusChangesLoading ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
            ) : campusChanges.length === 0 ? (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>🏫</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No campus change requests</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  {campusChangeFilter === 'pending' ? 'All caught up!' : 'Try a different filter'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {campusChanges.map((req: any) => {
                  const user = req.profiles
                  const fromCampus = req.campuses?.name || 'Unknown'
                  const toCampus = req['campuses']?.name || 'Unknown'
                  const statusColors: Record<string, string> = { pending: '#f59e0b', approved: '#16a34a', rejected: '#ef4444', cancelled: '#6b7280' }
                  return (
                    <div key={req.id}
                      style={{ background: 'var(--bg)', border: `1px solid ${statusColors[req.status] || 'var(--border)'}`, borderRadius: 14, padding: '16px 18px', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        {/* User info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: `${statusColors[req.status]}22`, color: statusColors[req.status], fontWeight: 700 }}>
                              {req.status.toUpperCase()}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {new Date(req.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                            {user?.full_name || 'Unknown'} (@{user?.username || '—'})
                          </p>
                          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                            {fromCampus} → <strong>{toCampus}</strong>
                          </p>
                          {req.roll_number && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>🎓 Roll: {req.roll_number}</p>}
                          {req.college_email && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>📧 {req.college_email}</p>}
                          {req.reason && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0', fontStyle: 'italic' }}>&ldquo;{req.reason}&rdquo;</p>}
                          {/* AI Score */}
                          {req.ai_verification_score > 0 && (
                            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>🤖 AI Score:</span>
                              <div style={{ flex: 1, maxWidth: 120, height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 3, width: `${req.ai_verification_score}%`, background: req.ai_verification_score > 70 ? 'var(--success-text)' : req.ai_verification_score > 40 ? 'var(--yellow-text)' : 'var(--danger)' }} />
                              </div>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{req.ai_verification_score}/100</span>
                            </div>
                          )}
                          {req.rejection_reason && (
                            <p style={{ fontSize: 12, color: 'var(--danger)', margin: '4px 0 0' }}>❌ {req.rejection_reason}</p>
                          )}
                        </div>

                        {/* ID Card preview + Actions */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                          {req.id_card_url && (
                            <a href={req.id_card_url} target="_blank" rel="noopener noreferrer"
                              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--accent)', fontSize: 11, fontWeight: 600, textDecoration: 'none', fontFamily: 'inherit' }}>
                              📄 View ID Card
                            </a>
                          )}
                          {req.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => reviewCampusChange(req.id, 'approve')}
                                disabled={campusChangeBusy === req.id}
                                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--success-text)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: campusChangeBusy === req.id ? 0.6 : 1 }}>
                                ✅ Approve
                              </button>
                              <button onClick={() => {
                                const reason = prompt('Rejection reason (optional):')
                                reviewCampusChange(req.id, 'reject', reason || undefined)
                              }}
                                disabled={campusChangeBusy === req.id}
                                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--danger-border)', background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: campusChangeBusy === req.id ? 0.6 : 1 }}>
                                ❌ Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            AUDIT LOG (NEW)
        ═══════════════════════════════════════════════════ */}
        {activeTab === 'Audit Log' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>📋 Audit Log</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  {auditTotal} total admin actions · Showing {auditEntries.length}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={auditActionFilter}
                  onChange={e => setAuditActionFilter(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { setAuditOffset(0); loadAuditLog(0, auditActionFilter) } }}
                  placeholder="Filter by action..."
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, outline: 'none', fontFamily: 'inherit', width: 180, background: 'var(--bg)', color: 'var(--text-primary)' }}
                />
                <button onClick={() => { setAuditOffset(0); loadAuditLog(0, auditActionFilter) }}
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  🔍 Search
                </button>
              </div>
            </div>

            {auditLoading ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading audit log…</p>
            ) : auditEntries.length === 0 ? (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>📋</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No audit entries yet</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  Admin actions (feature toggles, setting changes, user role updates) will appear here.
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {auditEntries.map(entry => {
                    const actionParts = entry.action.split('.')
                    const category = actionParts[0]
                    const action = actionParts.slice(1).join('.')
                    const categoryEmoji: Record<string, string> = {
                      feature_flag: '⚡',
                      platform_setting: '⚙️',
                      users: '👥',
                      post: '📝',
                      moderation: '🛡️',
                      admin_grant: '🔑',
                    }
                    const catColor: Record<string, string> = {
                      feature_flag: 'var(--success-text)',
                      platform_setting: 'var(--accent)',
                      users: 'var(--purple-text)',
                      post: 'var(--orange-text)',
                      moderation: 'var(--danger)',
                      admin_grant: 'var(--yellow-text)',
                    }
                    return (
                      <div key={entry.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{categoryEmoji[category] || '📝'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: catColor[category] || 'var(--text-primary)' }}>{entry.action}</span>
                            {entry.entity_type && (
                              <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                                {entry.entity_type}
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                            by @{entry.profiles?.username || 'system'} · {new Date(entry.created_at).toLocaleString()}
                            {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                              <> · {JSON.stringify(entry.metadata)}</>
                            )}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {auditEntries.length < auditTotal && (
                  <button onClick={loadMoreAudit}
                    style={{ width: '100%', marginTop: 12, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Load more ({auditTotal - auditEntries.length} remaining)
                  </button>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
