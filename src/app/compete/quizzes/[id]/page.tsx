import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import Layout from '@/components/Layout'
import QuizDetail from '@/components/quizzes/QuizDetail'
import CompeteNav from '@/components/compete/CompeteNav'

export const metadata: Metadata = {
  title: 'Quiz — ConnectToCampus',
}

export default async function QuizDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Keep the detail view inside the section (and the app shell) so a shared
  // quiz link does not strand the reader on a bare page.
  const profile = user ? (await supabase.from('profiles').select('*').eq('id', user.id).single()).data : null

  return (
    <Layout user={user} profile={profile}>
      <div className="ambient ss-wrap">
        <CompeteNav active="quizzes" />
        <QuizDetail quizId={id} user={user ? { id: user.id } : null} />
      </div>
    </Layout>
  )
}
