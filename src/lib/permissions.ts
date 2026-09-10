'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AdminGrant, AdminTypeKey, CreatableCategory, PostScope } from '@/types'

export interface AdminContext {
  loading: boolean
  adminType: AdminTypeKey | null
  isPlatformAdmin: boolean
  isCampusAdmin: boolean
  isCommunityAdmin: boolean
  isAdmin: boolean
  grants: AdminGrant[]
  communityIds: string[]
  campusIds: string[]
  collegeIds: string[]
}

export const EMPTY_CTX: AdminContext = {
  loading: true,
  adminType: null,
  isPlatformAdmin: false,
  isCampusAdmin: false,
  isCommunityAdmin: false,
  isAdmin: false,
  grants: [],
  communityIds: [],
  campusIds: [],
  collegeIds: [],
}

/** Load the current user's admin grants (from the my_admin_grants RPC). */
export function useAdminContext(userId?: string): AdminContext {
  const [ctx, setCtx] = useState<AdminContext>(EMPTY_CTX)

  useEffect(() => {
    let alive = true
    if (!userId) {
      setCtx({ ...EMPTY_CTX, loading: false })
      return
    }
    const supabase = createClient()
    supabase
      .rpc('my_admin_grants')
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          setCtx({ ...EMPTY_CTX, loading: false })
          return
        }
        const grants: AdminGrant[] = (data || []).map((g: any) => ({
          id: '',
          user_id: userId,
          admin_type: g.admin_type as AdminTypeKey,
          community_id: g.community_id,
          college_id: g.college_id,
          campus_id: g.campus_id,
        }))
        const has = (t: AdminTypeKey) => grants.some(g => g.admin_type === t)
        setCtx({
          loading: false,
          adminType: has('platform_admin')
            ? 'platform_admin'
            : has('campus_admin')
              ? 'campus_admin'
              : has('community_admin')
                ? 'community_admin'
                : null,
          isPlatformAdmin: has('platform_admin'),
          isCampusAdmin: has('campus_admin'),
          isCommunityAdmin: has('community_admin'),
          isAdmin: has('platform_admin') || has('campus_admin') || has('community_admin'),
          grants,
          communityIds: grants.filter(g => g.admin_type === 'community_admin').map(g => g.community_id!).filter(Boolean),
          campusIds: grants.filter(g => g.admin_type === 'campus_admin').map(g => g.campus_id!).filter(Boolean),
          collegeIds: grants.filter(g => g.admin_type === 'campus_admin').map(g => g.college_id!).filter(Boolean),
        })
      })
    return () => { alive = false }
  }, [userId])

  return ctx
}

/** Server/edge-checkable wrapper around the can_create_post RPC. */
export async function canCreatePost(
  userId: string,
  categoryKey: string,
  scope: PostScope,
  opts: { communityId?: string; campusId?: string; collegeId?: string } = {}
): Promise<boolean> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('can_create_post', {
    p_user_id: userId,
    p_category_key: categoryKey,
    p_scope: scope,
    p_community_id: opts.communityId || null,
    p_campus_id: opts.campusId || null,
    p_college_id: opts.collegeId || null,
  })
  if (error) return false
  return !!data
}

/** Which categories can this user create in a context — drives the composer. */
export async function listCreatableCategories(
  userId: string,
  opts: { communityId?: string; campusId?: string; collegeId?: string } = {}
): Promise<CreatableCategory[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_creatable_categories', {
    p_user_id: userId,
    p_community_id: opts.communityId || null,
    p_campus_id: opts.campusId || null,
    p_college_id: opts.collegeId || null,
  })
  if (error) return []
  return (data || []).map((c: any) => ({
    category_key: c.category_key,
    label: c.label,
    max_scope: c.max_scope,
    category_id: c.category_id,
  }))
}
