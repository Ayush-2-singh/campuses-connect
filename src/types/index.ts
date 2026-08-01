export type UserRole = 'student' | 'faculty' | 'ambassador' | 'club_lead' | 'campus_admin' | 'platform_admin'

export type PostType = 'general' | 'announcement' | 'opportunity' | 'resource' | 'event' | 'discussion'

export type OppType = 'hackathon' | 'internship' | 'freelance' | 'startup_role' | 'collab' | 'scholarship' | 'competition' | 'other'

export interface College {
  id: string
  name: string
  slug: string
  logo_url?: string
  is_active: boolean
}

export interface Campus {
  id: string
  college_id: string
  name: string
  slug: string
  city?: string
  is_active: boolean
}

export interface Department {
  id: string
  campus_id: string
  name: string
  short_name?: string
}

export interface Profile {
  id: string
  username?: string
  full_name?: string
  avatar_url?: string
  bio?: string
  role: UserRole
  college_id?: string
  campus_id?: string
  department_id?: string
  batch_year?: number
  current_year?: number
  github_url?: string
  linkedin_url?: string
  portfolio_url?: string
  college_email?: string
  college_email_verified: boolean
  is_verified: boolean
  is_public: boolean
}

export interface Post {
  id: string
  author_id: string
  campus_id?: string
  title?: string
  body: string
  post_type: PostType
  visibility: string
  is_pinned: boolean
  view_count: number
  created_at: string
  profiles?: Profile
}

export interface Opportunity {
  id: string
  posted_by: string
  title: string
  description?: string
  opp_type: OppType
  company_org?: string
  external_link?: string
  apply_link?: string
  deadline?: string
  is_paid?: boolean
  stipend_range?: string
  location_type?: string
  skills_required?: string[]
  is_verified: boolean
  created_at: string
}

export interface Note {
  id: string
  uploaded_by: string
  title: string
  subject: string
  semester?: number
  resource_type: string
  file_url?: string
  drive_link?: string
  download_count: number
  created_at: string
}
