'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const ACTOR_TYPES = ['student', 'community_admin', 'campus_admin', 'platform_admin']
const ACTOR_LABELS: Record<string, string> = {
  student: 'Student', community_admin: 'Community Admin', campus_admin: 'Campus Admin', platform_admin: 'Platform Admin',
}
const SCOPE_LABELS: Record<string, string> = {
  campus: 'Campus', college_network: 'College', global: 'Global',
}

const TABS = ['Overview', 'Content Permissions', 'Admins & Agents', 'Communities', 'AI Agents', 'Moderation', 'Posts', 'Colleges']

export default function AdminPage() {
  const [profile, setProfile] = useState<any>(null)
  const [isPlatform, setIsPlatform] = useState(false)
  const [activeTab, setActiveTab] = useState('Overview')
  const [loading, setLoading] = useState(true)
  const [pwState, setPwState] = useState<'checking' | 'locked' | 'open'>('checking')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Admin password gate — server-side check of the session cookie.
    // Fail-closed: any error keeps the gate locked (the route itself returns
    // authed:true when no password is configured, so no fail-open is needed).
    fetch('/api/admin/verify')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('verify failed'))))
      .then(d => setPwState(d.authed ? 'open' : 'locked'))
      .catch(() => setPwState('locked'))
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!prof) { router.push('/feed'); return }
      const { data: grants } = await supabase.rpc('my_admin_grants')
      const g = (grants as any[]) || []
      const isAdmin = g.some((x: any) => x.admin_type === 'platform_admin' || x.admin_type === 'campus_admin')
      if (!isAdmin) { router.push('/feed'); return }
      setProfile(prof)
      setIsPlatform(g.some((x: any) => x.admin_type === 'platform_admin'))
      setLoading(false)
    }
    load()
  }, [supabase, router])

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-500">Loading admin panel...</p></div>

  if (pwState === 'locked') {
    return <AdminPasswordGate onUnlock={() => setPwState('open')} />
  }

  if (pwState === 'checking') {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-500">Unlocking...</p></div>
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Admin Panel</h1>
            <p className="text-gray-500 text-xs mt-0.5">CampusConnect V3 · {profile?.full_name}</p>
          </div>
          <button onClick={() => router.push('/feed')} className="text-gray-400 text-sm hover:text-white transition">← Back to Feed</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex gap-2 mb-8 border-b border-gray-800 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px whitespace-nowrap ${
                activeTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-white'
              }`}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Overview' && <OverviewTab supabase={supabase} onNav={setActiveTab} />}
        {activeTab === 'Content Permissions' && <PermissionsMatrix supabase={supabase} isPlatform={isPlatform} />}
        {activeTab === 'Admins & Agents' && <AdminsTab supabase={supabase} isPlatform={isPlatform} />}
        {activeTab === 'Communities' && <CommunitiesTab supabase={supabase} />}
        {activeTab === 'AI Agents' && <AIAgentsTab supabase={supabase} isPlatform={isPlatform} />}
        {activeTab === 'Moderation' && <ModerationTab supabase={supabase} />}
        {activeTab === 'Posts' && <PostsTab supabase={supabase} />}
        {activeTab === 'Colleges' && <CollegesTab />}
      </div>
    </div>
  )
}

/* ── Overview ─────────────────────────────────────────────── */
function OverviewTab({ supabase, onNav }: { supabase: any; onNav: (t: string) => void }) {
  const [stats, setStats] = useState({ users: 0, posts: 0, colleges: 0, queue: 0 })

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('posts').select('*', { count: 'exact', head: true }),
      supabase.from('colleges').select('*', { count: 'exact', head: true }),
      supabase.from('moderation_queue').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    ]).then(([u, p, c, q]) => setStats({ users: u.count || 0, posts: p.count || 0, colleges: c.count || 0, queue: q.count || 0 }))
  }, [supabase])

  const cards = [
    { label: 'Total Users', value: stats.users, icon: '👥' },
    { label: 'Total Posts', value: stats.posts, icon: '📝' },
    { label: 'Colleges', value: stats.colleges, icon: '🏫' },
    { label: 'Open Moderation', value: stats.queue, icon: '🛡️' },
  ]

  return (
    <div>
      <div className="grid grid-cols-4 gap-4 mb-8">
        {cards.map(c => (
          <div key={c.label} className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
            <p className="text-3xl mb-1">{c.icon}</p>
            <p className="text-3xl font-bold text-white">{c.value}</p>
            <p className="text-gray-400 text-sm mt-1">{c.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <QuickAction label="⚙️ Content Permissions" sub="Who can create what" onClick={() => onNav('Content Permissions')} />
        <QuickAction label="🛡️ Moderation Queue" sub={`${stats.queue} items waiting`} onClick={() => onNav('Moderation')} />
        <QuickAction label="🤖 AI Agents" sub="Turn automation on/off" onClick={() => onNav('AI Agents')} />
        <QuickAction label="🧑‍💼 Admins & Agents" sub="Grant or revoke access" onClick={() => onNav('Admins & Agents')} />
      </div>
    </div>
  )
}

function QuickAction({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-xl px-4 py-3 text-sm hover:bg-blue-600/20 transition text-left">
      {label}
      <p className="text-gray-500 text-xs mt-1">{sub}</p>
    </button>
  )
}

/* ── Content Permissions Matrix ───────────────────────────── */
function PermissionsMatrix({ supabase, isPlatform }: { supabase: any; isPlatform: boolean }) {
  const [categories, setCategories] = useState<any[]>([])
  const [perms, setPerms] = useState<Record<string, Record<string, string | null>>>({}) // actor → categoryKey → maxScope
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data: cats } = await supabase.from('content_categories').select('*').order('sort_order')
    setCategories(cats || [])
    const { data: ps } = await supabase.from('content_permissions').select('*, content_categories(key)')
    const map: Record<string, Record<string, string | null>> = {}
    ACTOR_TYPES.forEach(a => { map[a] = {} })
    ;(ps || []).forEach((p: any) => {
      if (!map[p.actor_type]) map[p.actor_type] = {}
      map[p.actor_type][p.categories?.key] = p.max_scope || null
    })
    setPerms(map)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const setCell = async (actor: string, catKey: string, scope: string) => {
    const next = { ...perms, [actor]: { ...perms[actor], [catKey]: scope } }
    setPerms(next)
    setSaving(true)
    const cat = categories.find(c => c.key === catKey)
    const { error } = await supabase.from('content_permissions').upsert(
      { actor_type: actor, category_id: cat?.id, max_scope: scope === 'none' ? null : scope },
      { onConflict: 'actor_type,category_id' }
    )
    if (!error) await supabase.rpc('log_audit', { p_action: 'matrix_update', p_entity_type: 'content_permissions', p_metadata: { actor, category: catKey, max_scope: scope } })
    setSaving(false)
  }

  const cellButton = (value: string | null | undefined) => {
    const v = value || 'none'
    const styles: Record<string, string> = {
      none: 'bg-gray-800 text-gray-500 border-gray-700',
      campus: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      college_network: 'bg-green-500/10 text-green-400 border-green-500/30',
      global: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    }
    return `${styles[v] || styles.none} border rounded-lg px-2 py-1 text-xs font-medium`
  }

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold">Content Permissions</h3>
          <p className="text-gray-500 text-xs mt-1">Click a cell to cycle: None → Campus → College → Global. Changes apply instantly.</p>
        </div>
        {saving && <span className="text-gray-500 text-xs">Saving…</span>}
      </div>

      {!isPlatform && (
        <p className="text-yellow-500 text-xs mb-4">⚠️ Matrix editing is reserved for Platform Admins.</p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs uppercase">
            <th className="text-left py-2 pr-4">Actor</th>
            {categories.map(c => <th key={c.key} className="py-2 px-2 text-center whitespace-nowrap">{c.icon} {c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {ACTOR_TYPES.map(actor => (
            <tr key={actor}>
              <td className="py-3 pr-4 text-white font-medium whitespace-nowrap">{ACTOR_LABELS[actor]}</td>
              {categories.map(c => {
                const val = perms[actor]?.[c.key]
                return (
                  <td key={c.key} className="py-3 px-2 text-center">
                    <button
                      disabled={!isPlatform}
                      onClick={() => {
                        const order = ['none', 'campus', 'college_network', 'global']
                        const idx = order.indexOf(val || 'none')
                        setCell(actor, c.key, order[(idx + 1) % order.length])
                      }}
                      className={cellButton(val)}
                      title="Cycle scope"
                    >
                      {val && val !== 'none' ? SCOPE_LABELS[val] : '✕'}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Admins & Agents ──────────────────────────────────────── */
function AdminsTab({ supabase, isPlatform }: { supabase: any; isPlatform: boolean }) {
  const [users, setUsers] = useState<any[]>([])
  const [grants, setGrants] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [communities, setCommunities] = useState<any[]>([])

  const load = useCallback(async () => {
    const { data: us } = await supabase.from('profiles').select('id, full_name, username, college_id, colleges(name)').order('created_at', { ascending: false }).limit(50)
    setUsers(us || [])
    const { data: gs } = await supabase.from('admin_grants').select('*, profiles(full_name, username), communities(name)')
    setGrants(gs || [])
    const { data: cs } = await supabase.from('communities').select('*')
    setCommunities(cs || [])
  }, [supabase])

  useEffect(() => { load() }, [load])

  const grant = async (userId: string, adminType: string, scope: { communityId?: string; campusId?: string; collegeId?: string }) => {
    if (!isPlatform) return
    await supabase.from('admin_grants').insert({
      user_id: userId, admin_type: adminType,
      community_id: scope.communityId || null, campus_id: scope.campusId || null, college_id: scope.collegeId || null,
      granted_by: (await supabase.auth.getUser()).data.user?.id,
    })
    load()
  }

  const revoke = async (grantId: string) => {
    if (!isPlatform) return
    await supabase.from('admin_grants').delete().eq('id', grantId)
    load()
  }

  const visibleUsers = users.filter(u => (u.full_name || '').toLowerCase().includes(search.toLowerCase()) || (u.username || '').toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
        <h3 className="text-white font-semibold mb-4">Grant Admin Access</h3>
        {!isPlatform && <p className="text-yellow-500 text-xs mb-4">⚠️ Only Platform Admins can grant access.</p>}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none mb-4" />
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {visibleUsers.map(u => (
            <GrantRow key={u.id} user={u} communities={communities}
              onGrant={(type: string, scope: any) => grant(u.id, type, scope)} disabled={!isPlatform} />
          ))}
        </div>
      </div>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
        <h3 className="text-white font-semibold mb-4">Current Admins ({grants.length})</h3>
        <div className="space-y-3">
          {grants.length === 0 && <p className="text-gray-500 text-sm">No admin grants yet</p>}
          {grants.map((g: any) => (
            <div key={g.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
              <div>
                <p className="text-white text-sm font-medium">{g.profiles?.full_name || 'Unknown'} <span className="text-gray-500">@{g.profiles?.username}</span></p>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">
                  {g.admin_type} {g.communities?.name ? `· ${g.communities.name}` : g.campus_id ? '· Campus' : g.college_id ? '· College' : '· Global'}
                </p>
              </div>
              <button onClick={() => revoke(g.id)} disabled={!isPlatform}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition disabled:opacity-40">
                Revoke
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function GrantRow({ user, communities, onGrant, disabled }: any) {
  const [type, setType] = useState('community_admin')
  const [community, setCommunity] = useState('')
  return (
    <div className="bg-gray-800 rounded-lg px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{user.full_name || 'No name'}</p>
        <p className="text-gray-500 text-xs">@{user.username} {user.colleges?.name && `· ${user.colleges.name}`}</p>
      </div>
      <select value={type} onChange={e => setType(e.target.value)} className="bg-gray-900 border border-gray-700 text-gray-300 rounded-lg px-2 py-1 text-xs outline-none">
        <option value="community_admin">Community Admin</option>
        <option value="campus_admin">Campus Admin</option>
        <option value="platform_admin">Platform Admin</option>
      </select>
      {type === 'community_admin' && (
        <select value={community} onChange={e => setCommunity(e.target.value)} className="bg-gray-900 border border-gray-700 text-gray-300 rounded-lg px-2 py-1 text-xs outline-none">
          <option value="">Community…</option>
          {communities.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <button
        disabled={disabled || (type === 'community_admin' && !community)}
        onClick={() => onGrant(
          type,
          type === 'community_admin' ? { communityId: community }
            : type === 'campus_admin' ? { collegeId: user.college_id || undefined }
            : {}
        )}
        className="text-xs px-3 py-1.5 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition disabled:opacity-40">
        Grant
      </button>
    </div>
  )
}

/* ── Communities ──────────────────────────────────────────── */
function CommunitiesTab({ supabase }: { supabase: any }) {
  const [communities, setCommunities] = useState<any[]>([])
  useEffect(() => {
    supabase.from('communities').select('*').then(({ data }: any) => setCommunities(data || []))
  }, [supabase])
  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
      <h3 className="text-white font-semibold mb-4">Global Communities</h3>
      <div className="grid gap-3 md:grid-cols-3">
        {communities.map(c => (
          <div key={c.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <p className="text-2xl mb-2">{c.icon}</p>
            <p className="text-white font-semibold">{c.name}</p>
            <p className="text-gray-500 text-xs mt-1">{c.tagline}</p>
            <span className={`inline-block mt-3 text-xs px-2 py-1 rounded-full ${c.is_active ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
              {c.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        ))}
      </div>
      <p className="text-gray-600 text-xs mt-4">Community creation/edit UI ships in the next iteration.</p>
    </div>
  )
}

/* ── AI Agents ────────────────────────────────────────────── */
function AIAgentsTab({ supabase, isPlatform }: { supabase: any; isPlatform: boolean }) {
  const [agents, setAgents] = useState<any[]>([])
  useEffect(() => {
    supabase.from('ai_agents').select('*').then(({ data }: any) => setAgents(data || []))
  }, [supabase])

  const toggle = async (id: string, enabled: boolean) => {
    if (!isPlatform) return
    setAgents(agents.map(a => a.id === id ? { ...a, enabled } : a))
    await supabase.from('ai_agents').update({ enabled }).eq('id', id)
  }

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
      <h3 className="text-white font-semibold mb-1">AI Agents</h3>
      <p className="text-gray-500 text-xs mb-5">AI assists admins — it never bypasses permission rules. Toggles apply instantly.</p>
      {!isPlatform && <p className="text-yellow-500 text-xs mb-4">⚠️ Only Platform Admins can toggle agents.</p>}
      <div className="space-y-4">
        {agents.map(a => (
          <div key={a.id} className="flex items-center justify-between bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div>
              <p className="text-white font-semibold text-sm">🤖 {a.name}</p>
              <p className="text-gray-500 text-xs mt-1 max-w-xl">{a.description}</p>
            </div>
            <button
              disabled={!isPlatform}
              onClick={() => toggle(a.id, !a.enabled)}
              className={`relative w-12 h-7 rounded-full transition ${a.enabled ? 'bg-green-500/60' : 'bg-gray-600'} disabled:opacity-40`}>
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${a.enabled ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        ))}
        {agents.length === 0 && <p className="text-gray-500 text-sm">No AI agents configured.</p>}
      </div>
    </div>
  )
}

/* ── Moderation ───────────────────────────────────────────── */
function ModerationTab({ supabase }: { supabase: any }) {
  const [items, setItems] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])

  const load = useCallback(async () => {
    const { data: q } = await supabase.from('moderation_queue').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(30)
    setItems(q || [])
    const ids = (q || []).map((i: any) => i.content_id)
    if (ids.length) {
      const { data: ps } = await supabase.from('posts').select('id, body, content_categories(label), profiles!posts_author_id_fkey(username)').in('id', ids)
      setPosts(ps || [])
    } else setPosts([])
  }, [supabase])

  useEffect(() => { load() }, [load])

  const resolve = async (item: any, action: 'resolved' | 'dismissed') => {
    if (action === 'resolved') {
      if (item.content_type === 'comment') {
        await supabase.from('post_comments').delete().eq('id', item.content_id)
      } else {
        await supabase.from('posts').update({ status: 'removed' }).eq('id', item.content_id)
      }
    }
    await supabase.from('moderation_queue').update({ status: action, resolved_at: new Date().toISOString() }).eq('id', item.id)
    load()
  }

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
      <h3 className="text-white font-semibold mb-4">Moderation Queue ({items.length})</h3>
      {items.length === 0 ? (
        <p className="text-gray-500 text-sm">Queue is clear ✨</p>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const post = posts.find(p => p.id === item.content_id)
            return (
              <div key={item.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 mb-1">
                      {item.source === 'ai' ? '🤖 AI flagged' : '🚩 User reported'} · {item.content_type} · {new Date(item.created_at).toLocaleString()}
                    </p>
                    <p className="text-white text-sm line-clamp-2">{post?.body || `Content ${item.content_id}`}</p>
                    {item.reason && <p className="text-yellow-500 text-xs mt-1">Reason: {item.reason}</p>}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => resolve(item, 'resolved')} className="text-xs px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition">Remove</button>
                    <button onClick={() => resolve(item, 'dismissed')} className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-600 transition">Dismiss</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Posts ────────────────────────────────────────────────── */
function PostsTab({ supabase }: { supabase: any }) {
  const [posts, setPosts] = useState<any[]>([])
  useEffect(() => {
    supabase.from('posts').select('*, profiles!posts_author_id_fkey(full_name, username), content_categories(label)').order('created_at', { ascending: false }).limit(50)
      .then(({ data }: any) => setPosts(data || []))
  }, [supabase])

  const togglePin = async (id: string, pinned: boolean) => {
    await supabase.from('posts').update({ is_pinned: !pinned }).eq('id', id)
    setPosts(posts.map(p => p.id === id ? { ...p, is_pinned: !pinned } : p))
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this post?')) return
    await supabase.from('posts').update({ status: 'removed' }).eq('id', id)
    setPosts(posts.filter(p => p.id !== id))
  }

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800"><h3 className="text-white font-semibold">All Posts ({posts.length})</h3></div>
      <div className="divide-y divide-gray-800">
        {posts.map(p => (
          <div key={p.id} className="px-6 py-4 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-gray-400 text-xs mb-1">@{p.profiles?.username} · {p.categories?.label} {p.is_pinned && <span className="ml-2 text-blue-400">📌</span>}</p>
              <p className="text-white text-sm truncate">{p.body}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => togglePin(p.id, p.is_pinned)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-blue-500/30 hover:text-blue-400 transition">{p.is_pinned ? 'Unpin' : 'Pin'}</button>
              <button onClick={() => remove(p.id)} className="text-xs px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Password Gate ───────────────────────────────────────── */
function AdminPasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        onUnlock()
      } else {
        setError('Incorrect password')
        setPassword('')
      }
    } catch {
      setError('Something went wrong — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center text-2xl mb-5">
          🔐
        </div>
        <h1 className="text-xl font-bold text-white">Admin Access</h1>
        <p className="text-gray-500 text-sm mt-1 mb-6">Enter the admin password to continue.</p>
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          placeholder="Admin password"
          autoFocus
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/50 transition"
        />
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full mt-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold rounded-xl py-3 text-sm transition"
        >
          {busy ? 'Checking…' : 'Unlock Admin Panel'}
        </button>
      </form>
    </div>
  )
}

/* ── Colleges ─────────────────────────────────────────────── */
function CollegesTab() {
  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
      <h3 className="text-white font-semibold mb-4">College Management</h3>
      <p className="text-gray-500 text-sm mb-6">Add new colleges and campuses to expand CampusConnect (CSE-focused).</p>
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <p className="text-gray-400 text-sm">To add a college, run in the Supabase SQL editor:</p>
        <pre className="text-green-400 text-xs mt-3 overflow-x-auto">
{`INSERT INTO colleges (name, slug, city, state, is_active, is_verified)
VALUES ('College Name', 'college-slug', 'City', 'State', true, true);

INSERT INTO campuses (college_id, name, slug, city, is_active)
VALUES ((SELECT id FROM colleges WHERE slug = 'college-slug'),
        'Campus City', 'city', 'City', true);

-- Add CSE departments
INSERT INTO departments (campus_id, name, short_name) VALUES
  ((SELECT id FROM campuses WHERE slug = 'city'), 'Computer Science & Engineering', 'CSE'),
  ((SELECT id FROM campuses WHERE slug = 'city'), 'Information Technology', 'IT');`}
        </pre>
      </div>
    </div>
  )
}
