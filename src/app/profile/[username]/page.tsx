'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

export default function UserProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('posts')
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const router = useRouter()
  const params = useParams()
  const username = params.username as string
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUser(user)

      const { data: prof } = await supabase
        .from('profiles')
        .select('*, colleges(name), campuses(name), departments(name, short_name)')
        .eq('username', username)
        .single()

      if (!prof) { router.push('/talent'); return }
      setProfile(prof)

      const [postsRes, notesRes] = await Promise.all([
        supabase.from('posts').select('*').eq('author_id', prof.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('notes').select('*').eq('uploaded_by', prof.id).order('created_at', { ascending: false }).limit(10),
      ])

      setPosts(postsRes.data || [])
      setNotes(notesRes.data || [])

      if (user) {
        const { data: conn } = await supabase
          .from('connections')
          .select('id, status')
          .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .eq('status', 'accepted')
          .limit(1)
        setConnected((conn || []).length > 0)

      }

      setLoading(false)
    }
    load()
  }, [username])

  const handleConnect = async () => {
    if (!user || !profile) return
    setConnecting(true)
    await supabase.from('connections').insert({
      requester_id: user.id,
      receiver_id: profile.id,
      status: 'pending'
    })
    setConnecting(false)
    setConnected(true)
  }

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'today'
    if (days === 1) return 'yesterday'
    return `${days}d ago`
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-500 text-sm">Loading profile...</p>
    </div>
  )

  if (!profile) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">User not found</p>
    </div>
  )

  const isOwnProfile = user?.id === profile.id

  return (
    <div className="min-h-screen bg-gray-950 pb-24">
      <div className="sticky top-0 z-10 bg-gray-950/80 backdrop-blur border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white">←</button>
          <h1 className="text-lg font-bold text-white">@{profile.username}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                {profile.full_name?.[0] || '?'}
              </div>
              <div>
                <p className="text-white font-bold text-lg">{profile.full_name}</p>
                <p className="text-gray-400 text-sm">@{profile.username}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {profile.college_email_verified && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">✓ Verified</span>
                  )}
                </div>
              </div>
            </div>
            {!isOwnProfile && user && (
              <button onClick={handleConnect} disabled={connected || connecting}
                className={`text-sm font-semibold px-4 py-2 rounded-xl transition ${
                  connected ? 'bg-gray-800 text-gray-400 cursor-default' : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}>
                {connected ? '✓ Connected' : connecting ? 'Sending...' : 'Connect'}
              </button>
            )}
            {isOwnProfile && (
              <button onClick={() => router.push('/profile')}
                className="text-sm border border-gray-700 text-gray-300 px-4 py-2 rounded-xl hover:border-gray-600 transition">
                Edit
              </button>
            )}
          </div>

          {profile.bio && <p className="text-gray-300 text-sm mb-4">{profile.bio}</p>}

          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Posts', value: posts.length },
              { label: 'Notes', value: notes.length },
              { label: 'Karma', value: profile.karma_points || 0 },
              { label: 'Streak', value: `${profile.streak_days || 0}🔥` },
            ].map(stat => (
              <div key={stat.label} className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-white font-bold text-lg">{stat.value}</p>
                <p className="text-gray-500 text-xs mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {profile.colleges?.name && (
              <div className="bg-gray-800 rounded-lg px-3 py-2">
                <p className="text-gray-500">College</p>
                <p className="text-white mt-0.5">{profile.colleges.name}</p>
              </div>
            )}
            {profile.campuses?.name && (
              <div className="bg-gray-800 rounded-lg px-3 py-2">
                <p className="text-gray-500">Campus</p>
                <p className="text-white mt-0.5">{profile.campuses.name}</p>
              </div>
            )}
            {profile.departments?.short_name && (
              <div className="bg-gray-800 rounded-lg px-3 py-2">
                <p className="text-gray-500">Department</p>
                <p className="text-white mt-0.5">{profile.departments.short_name}</p>
              </div>
            )}
            {profile.current_year && (
              <div className="bg-gray-800 rounded-lg px-3 py-2">
                <p className="text-gray-500">Year</p>
                <p className="text-white mt-0.5">Year {profile.current_year} · {profile.batch_year}</p>
              </div>
            )}
          </div>

          {(profile.github_url || profile.linkedin_url || profile.portfolio_url) && (
            <div className="flex gap-2 mt-4">
              {profile.github_url && (
                <a href={profile.github_url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-center bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-2 rounded-lg transition">
                  🐙 GitHub
                </a>
              )}
              {profile.linkedin_url && (
                <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-center bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-2 rounded-lg transition">
                  💼 LinkedIn
                </a>
              )}
              {profile.portfolio_url && (
                <a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-center bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-2 rounded-lg transition">
                  🌐 Portfolio
                </a>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-4 border-b border-gray-800">
          {['posts', 'notes'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px capitalize ${
                activeTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-white'
              }`}>
              {tab} ({tab === 'posts' ? posts.length : notes.length})
            </button>
          ))}
        </div>

        {activeTab === 'posts' && (
          <div className="space-y-3">
            {posts.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-gray-600 text-sm">No posts yet</p>
              </div>
            ) : posts.map(post => (
              <div key={post.id} className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 capitalize">{post.post_type}</span>
                  <span className="text-xs text-gray-600">{timeAgo(post.created_at)}</span>
                </div>
                <p className="text-gray-200 text-sm">{post.body}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-3">
            {notes.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-gray-600 text-sm">No notes uploaded yet</p>
              </div>
            ) : notes.map(note => (
              <div key={note.id} className="bg-gray-900 rounded-2xl border border-gray-800 p-4 flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-medium">{note.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{note.subject} · Sem {note.semester}</p>
                </div>
                {note.drive_link && (
                  <a href={note.drive_link} target="_blank" rel="noopener noreferrer"
                    className="text-blue-400 text-xs hover:text-blue-300">Open →</a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gray-950/90 backdrop-blur border-t border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-around">
          <button onClick={() => router.push('/feed')} className="flex flex-col items-center gap-1 text-gray-500 hover:text-white py-1 transition">
            <span className="text-xl">🏠</span><span className="text-xs">Feed</span>
          </button>
          <button onClick={() => router.push('/opportunities')} className="flex flex-col items-center gap-1 text-gray-500 hover:text-white py-1 transition">
            <span className="text-xl">💼</span><span className="text-xs">Opportunities</span>
          </button>
          <button onClick={() => router.push('/notes')} className="flex flex-col items-center gap-1 text-gray-500 hover:text-white py-1 transition">
            <span className="text-xl">📚</span><span className="text-xs">Notes</span>
          </button>
          <button onClick={() => router.push('/talent')} className="flex flex-col items-center gap-1 text-gray-500 hover:text-white py-1 transition">
            <span className="text-xl">🔍</span><span className="text-xs">Talent</span>
          </button>
          <button onClick={() => router.push('/more')} className="flex flex-col items-center gap-1 text-gray-500 hover:text-white py-1 transition">
            <span className="text-xl">⋯</span><span className="text-xs">More</span>
          </button>
        </div>
      </div>
    </div>
  )
}
