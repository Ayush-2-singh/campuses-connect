// ─── CampusConnect V3 types ─────────────────────────────────

export type PostScope = 'campus' | 'college_network' | 'global'

export type PostStatus = 'draft' | 'published' | 'held' | 'removed'

export type CategoryKey =
  | 'discussion'
  | 'resource'
  | 'notes'
  | 'hackathon'
  | 'internship'
  | 'event'
  | 'announcement'
  | 'project'
  | 'opportunity'

export type AdminTypeKey = 'community_admin' | 'campus_admin' | 'platform_admin'

export type ActorType = 'student' | AdminTypeKey

export type UserStatus = 'active' | 'suspended' | 'banned'

export interface College {
  id: string
  name: string
  slug: string
  city?: string
  state?: string
  logo_url?: string
  is_active: boolean
  is_verified?: boolean
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
  college_id?: string
  campus_id?: string
  department_id?: string
  batch_year?: number
  current_year?: number
  github_url?: string
  linkedin_url?: string
  portfolio_url?: string
  twitter_url?: string
  college_email?: string
  college_email_verified: boolean
  is_verified: boolean
  is_public: boolean
  karma_points?: number
  streak_days?: number
  status: UserStatus
  created_at?: string
  colleges?: College
  campuses?: Campus
  departments?: Department
}

export interface Community {
  id: string
  key: string
  name: string
  tagline?: string
  description?: string
  icon?: string
  is_global: boolean
  is_active: boolean
  created_at?: string
}

export interface ContentCategory {
  id: string
  key: CategoryKey | string
  label: string
  description?: string
  icon?: string
  sort_order: number
}

export interface Post {
  id: string
  author_id: string
  category_id: string
  scope: PostScope
  community_id?: string
  college_id?: string
  campus_id?: string
  title?: string
  body: string
  is_pinned: boolean
  status: PostStatus
  view_count: number
  share_count: number
  created_at: string
  // meta
  company_org?: string
  apply_link?: string
  deadline?: string
  is_paid?: boolean
  stipend_range?: string
  location_type?: string
  skills_required?: string[]
  is_verified_by?: string
  drive_link?: string
  external_link?: string
  file_url?: string
  held_reason?: string
  // joins
  profiles?: Profile
  categories?: ContentCategory
  communities?: Community
  colleges?: College
  campuses?: Campus
}

export interface AdminGrant {
  id: string
  user_id: string
  admin_type: AdminTypeKey
  community_id?: string
  college_id?: string
  campus_id?: string
  granted_by?: string
  created_at?: string
  profiles?: Profile
}

export interface ContentPermission {
  id: string
  actor_type: ActorType
  category_id: string
  max_scope?: PostScope | null
  updated_at?: string
  categories?: ContentCategory
}

export interface CreatableCategory {
  category_key: string
  label: string
  max_scope?: string
  category_id: string
}

export interface Comment {
  id: string
  post_id: string
  author_id: string
  body: string
  is_deleted: boolean
  created_at: string
  profiles?: Profile
}

export interface AIAgent {
  id: string
  key: string
  name: string
  description?: string
  enabled: boolean
  config: Record<string, unknown>
}

export interface ModerationQueueItem {
  id: string
  content_type: string
  content_id: string
  reason?: string
  source: 'ai' | 'user_report'
  status: 'open' | 'resolved' | 'dismissed'
  created_at: string
  resolved_at?: string
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

export interface Opportunity {
  id: string
  posted_by: string
  title: string
  description?: string
  opp_type: string
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
