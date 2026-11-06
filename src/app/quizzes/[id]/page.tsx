import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import QuizDetail from '@/components/quizzes/QuizDetail'

export const metadata: Metadata = {
  title: 'Quiz — ConnectToCampus',
}

export default async function QuizDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return <QuizDetail quizId={id} user={user ? { id: user.id } : null} />
}
