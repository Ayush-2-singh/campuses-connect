import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import QuizLibrary from '@/components/quizzes/QuizLibrary'

export const metadata: Metadata = {
  title: 'Quizzes — ConnectToCampus',
  description: 'Browse, build and practise quizzes, or run one live with your campus.',
}

export default async function QuizzesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return <QuizLibrary user={user ? { id: user.id, email: user.email ?? null } : null} />
}
