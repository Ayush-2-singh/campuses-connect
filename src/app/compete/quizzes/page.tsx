import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import Layout from '@/components/Layout'
import QuizLibrary from '@/components/quizzes/QuizLibrary'
import CompeteNav from '@/components/compete/CompeteNav'

export const metadata: Metadata = {
  // The section layout canonicals to /compete; the library has its own URL now.
  title: 'Quizzes — ConnectToCampus',
  description: 'Browse, build and practise quizzes, or run one live with your campus.',
  alternates: { canonical: '/compete/quizzes' },
}

export default async function QuizzesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The library needs the app shell like every other section page: without it
  // this route had no top nav and no way back into Compete.
  const profile = user ? (await supabase.from('profiles').select('*').eq('id', user.id).single()).data : null

  return (
    <Layout user={user} profile={profile}>
      <div className="ambient ss-wrap">
        <div className="ss-head hc-reveal">
          <h1 className="ss-title">
            The quiz library, <em className="hc-em">ready to play.</em>
          </h1>
          <p className="ss-sub">
            Build a quiz once, then practise it solo or run it live with your campus. Everyone plays the same questions,
            and every attempt is graded by the database.
          </p>
        </div>

        <CompeteNav active="quizzes" />

        <QuizLibrary user={user ? { id: user.id, email: user.email ?? null } : null} />
      </div>
    </Layout>
  )
}
