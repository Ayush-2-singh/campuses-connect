'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const TABS = ['Overview', 'Users', 'Posts', 'Colleges']

export default function AdminPage() {
  const [profile, setProfile] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('Overview')
  const [users, setUsers] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [stats, setStats] = useState({ users: 0, posts: 0, colleges: 0 })
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()

      if (!prof || !['platform_admin', 'campus_admin'].includes(prof.role)) {
        router.push('/feed')
        return
      }
      setProfile(prof)

      // Load stats
      const [{ count: userCount }, { count: postCount }, { count: collegeCount }] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('posts').select('*', { count: 'exact', head: true }),
        supabase.from('colleges').select('*', { count: 'exact', head: true }),
      ])
      setStats({ users: userCount || 0, posts: postCount || 0, colleges: collegeCount || 0 })
      setLoading(false)
    }
    load()
  }, [])

  const loadUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*, colleges(name), campuses(name)')
      .order('created_at', { ascending: false })
      .limit(50)
    setUsers(data || [])
  }

  const loadPosts = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, profiles(full_name, username)')
      .order('created_at', { ascending: false })
      .limit(50)
    setPosts(data || [])
  }

  const updateRole = async (userId: string, role: string) => {
    await supabase.from('profiles').update({ role }).eq('id', userId)
    loadUsers()
  }

  const togglePin = async (postId: string, current: boolean) => {
    await supabase.from('posts').update({ is_pinned: !current }).eq('id', postId)
    loadPosts()
  }

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post?')) return
    await supabase.from('posts').delete().eq('id', postId)
    loadPosts()
  }

  useEffect(() => {
    if (activeTab === 'Users') loadUsers()
    if (activeTab === 'Posts') loadPosts()
  }, [activeTab])

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-500">Loading admin panel...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Admin Panel</h1>
            <p className="text-gray-500 text-xs mt-0.5">CampusConnect · {profile?.role}</p>
          </div>
          <button onClick={() => router.push('/feed')}
            className="text-gray-400 text-sm hover:text-white transition">
            ← Back to Feed
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-gray-800 pb-0">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-white'
              }`}>
              {tab}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'Overview' && (
          <div>
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { label: 'Total Users', value: stats.users, icon: '👥' },
                { label: 'Total Posts', value: stats.posts, icon: '📝' },
                { label: 'Colleges', value: stats.colleges, icon: '🏫' },
              ].map(stat => (
                <div key={stat.label} className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
                  <p className="text-3xl mb-1">{stat.icon}</p>
                  <p className="text-3xl font-bold text-white">{stat.value}</p>
                  <p className="text-gray-400 text-sm mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h3 className="text-white font-semibold mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setActiveTab('Users')}
                  className="bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-xl px-4 py-3 text-sm hover:bg-blue-600/20 transition text-left">
                  👥 Manage Users & Roles
                </button>
                <button onClick={() => setActiveTab('Posts')}
                  className="bg-purple-600/10 border border-purple-500/20 text-purple-400 rounded-xl px-4 py-3 text-sm hover:bg-purple-600/20 transition text-left">
                  📌 Pin / Manage Posts
                </button>
                <button onClick={() => setActiveTab('Colleges')}
                  className="bg-green-600/10 border border-green-500/20 text-green-400 rounded-xl px-4 py-3 text-sm hover:bg-green-600/20 transition text-left">
                  🏫 Manage Colleges
                </button>
                <button onClick={() => router.push('/feed')}
                  className="bg-gray-800 border border-gray-700 text-gray-300 rounded-xl px-4 py-3 text-sm hover:bg-gray-700 transition text-left">
                  🏠 Go to Feed
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'Users' && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h3 className="text-white font-semibold">All Users ({users.length})</h3>
            </div>
            <div className="divide-y divide-gray-800">
              {users.map(u => (
                <div key={u.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                      {u.full_name?.[0] || '?'}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{u.full_name || 'No name'}</p>
                      <p className="text-gray-500 text-xs">@{u.username || 'no username'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      u.role === 'platform_admin' ? 'bg-red-500/20 text-red-400' :
                      u.role === 'campus_admin' ? 'bg-orange-500/20 text-orange-400' :
                      u.role === 'ambassador' ? 'bg-blue-500/20 text-blue-400' :
                      u.role === 'faculty' ? 'bg-green-500/20 text-green-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>
                      {u.role}
                    </span>
                    <select
                      defaultValue={u.role}
                      onChange={e => updateRole(u.id, e.target.value)}
                      className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1 text-xs outline-none"
                    >
                      <option value="student">Student</option>
                      <option value="ambassador">Ambassador</option>
                      <option value="faculty">Faculty</option>
                      <option value="campus_admin">Campus Admin</option>
                      <option value="platform_admin">Platform Admin</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Posts Tab */}
        {activeTab === 'Posts' && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h3 className="text-white font-semibold">All Posts ({posts.length})</h3>
            </div>
            <div className="divide-y divide-gray-800">
              {posts.map(p => (
                <div key={p.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-400 text-xs mb-1">
                        @{p.profiles?.username} · {p.post_type}
                        {p.is_pinned && <span className="ml-2 text-blue-400">📌 Pinned</span>}
                      </p>
                      <p className="text-white text-sm truncate">{p.body}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => togglePin(p.id, p.is_pinned)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                          p.is_pinned
                            ? 'border-blue-500/30 text-blue-400 hover:bg-blue-500/10'
                            : 'border-gray-700 text-gray-400 hover:border-blue-500/30 hover:text-blue-400'
                        }`}
                      >
                        {p.is_pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button
                        onClick={() => deletePost(p.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Colleges Tab */}
        {activeTab === 'Colleges' && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
            <h3 className="text-white font-semibold mb-4">College Management</h3>
            <p className="text-gray-500 text-sm mb-6">Add new colleges and campuses to expand CampusConnect.</p>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <p className="text-gray-400 text-sm">To add a new college, run in Supabase SQL Editor:</p>
              <pre className="text-green-400 text-xs mt-3 overflow-x-auto">
{`INSERT INTO colleges (name, slug, is_active, is_verified)
VALUES ('College Name', 'college-slug', true, true);

INSERT INTO campuses (college_id, name, slug, city, state, is_active)
VALUES ((SELECT id FROM colleges WHERE slug = 'college-slug'),
        'Campus City', 'city', 'City', 'State', true);`}
              </pre>
            </div>
            <p className="text-gray-600 text-xs mt-4">Full college onboarding UI coming in next version.</p>
          </div>
        )}
      </div>
    </div>
  )
}
