import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../lib/api'
import { useListStore, type ShareRole } from './listStore'

/** An invite waiting for the signed-in user to accept or decline. */
export interface PendingInvite {
  id: number
  role: ShareRole
  list_name: string
  inviter: string
  expires_at: string
}

export interface ShareMember {
  id: number
  user_id: string
  role: ShareRole
  name: string | null
  email: string
}

export interface ShareInvite {
  id: number
  email: string
  role: ShareRole
  expires_at: string
  expired: boolean
}

/** Owner-side view of one list's sharing state. */
export interface ShareDetail {
  collab_id: number | null
  members: ShareMember[]
  invites: ShareInvite[]
}

const EMPTY_DETAIL: ShareDetail = { collab_id: null, members: [], invites: [] }

export const useCollabStore = defineStore('collab', () => {
  const listStore = useListStore()

  const pending = ref<PendingInvite[]>([])
  const detail = ref<ShareDetail>({ ...EMPTY_DETAIL })
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** Maps a server error code onto something a person can act on. */
  function explain(code: string | undefined, status: number): string {
    switch (code) {
      case 'pro_required':
        return 'Sharing a list is a Pro feature.'
      case 'free_tier_share_limit':
        return 'Free accounts can join one shared list. Upgrade to Pro to join more.'
      case 'already_member':
        return 'They already have access to this list.'
      case 'cannot_invite_self':
        return "That's your own email address."
      case 'invalid_email':
        return 'That email address doesn’t look right.'
      case 'invite_expired':
        return 'That invitation has expired. Ask for a new one.'
      case 'cannot_join_own_list':
        return 'You already own this list.'
      case 'not_shareable':
        return 'That list can’t be shared.'
      case 'unknown_list':
        return 'That list no longer exists.'
      default:
        return status === 404
          ? 'That invitation is no longer available.'
          : 'Something went wrong. Please try again.'
    }
  }

  async function readError(res: Response): Promise<string> {
    let body: { error?: string } | null = null
    try { body = await res.json() } catch { /* noop */ }
    return explain(body?.error, res.status)
  }

  // ── Recipient side ────────────────────────────────────────────────────────

  async function fetchPending() {
    try {
      const res = await apiFetch('/api/collab/invites/pending')
      if (!res.ok) return
      const data = (await res.json()) as { invites: PendingInvite[] }
      pending.value = data.invites
    } catch {
      // non-fatal — the banner just stays hidden
    }
  }

  async function acceptInvite(id: number): Promise<boolean> {
    error.value = null
    try {
      const res = await apiFetch(`/api/collab/invites/${id}/accept`, { method: 'POST' })
      if (!res.ok) {
        error.value = await readError(res)
        return false
      }
      pending.value = pending.value.filter((i) => i.id !== id)
      // The new list has to appear in the tab strip straight away.
      await listStore.fetchLists()
      return true
    } catch (e) {
      error.value = String(e)
      return false
    }
  }

  async function declineInvite(id: number): Promise<boolean> {
    try {
      const res = await apiFetch(`/api/collab/invites/${id}/decline`, { method: 'POST' })
      if (!res.ok) return false
      pending.value = pending.value.filter((i) => i.id !== id)
      return true
    } catch {
      return false
    }
  }

  /** Accept from the emailed link. The token alone is proof. */
  async function acceptToken(token: string): Promise<boolean> {
    error.value = null
    try {
      const res = await apiFetch('/api/collab/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) {
        error.value = await readError(res)
        return false
      }
      await listStore.fetchLists()
      return true
    } catch (e) {
      error.value = String(e)
      return false
    }
  }

  /** Leave a list someone shared with us. */
  async function leaveShare(key: string): Promise<boolean> {
    const meta = listStore.metaFor(key)
    if (!meta) return false
    try {
      const res = await apiFetch(`/api/collab/members/${meta.member_id}`, { method: 'DELETE' })
      if (!res.ok) return false
      await listStore.fetchLists()
      return true
    } catch {
      return false
    }
  }

  // ── Owner side ────────────────────────────────────────────────────────────

  async function fetchDetail(listName: string) {
    loading.value = true
    error.value = null
    detail.value = { ...EMPTY_DETAIL }
    try {
      const res = await apiFetch(`/api/collab/lists/${encodeURIComponent(listName)}`)
      if (!res.ok) {
        error.value = await readError(res)
        return
      }
      detail.value = (await res.json()) as ShareDetail
    } catch (e) {
      error.value = String(e)
    } finally {
      loading.value = false
    }
  }

  async function invite(listName: string, email: string, role: ShareRole): Promise<boolean> {
    error.value = null
    try {
      const res = await apiFetch(`/api/collab/lists/${encodeURIComponent(listName)}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })
      if (!res.ok) {
        error.value = await readError(res)
        return false
      }
      await Promise.all([fetchDetail(listName), listStore.fetchLists()])
      return true
    } catch (e) {
      error.value = String(e)
      return false
    }
  }

  async function resendInvite(id: number, listName: string): Promise<boolean> {
    error.value = null
    const res = await apiFetch(`/api/collab/invites/${id}/resend`, { method: 'POST' })
    if (!res.ok) {
      error.value = await readError(res)
      return false
    }
    await fetchDetail(listName)
    return true
  }

  async function revokeInvite(id: number, listName: string): Promise<boolean> {
    const res = await apiFetch(`/api/collab/invites/${id}`, { method: 'DELETE' })
    if (!res.ok) return false
    await Promise.all([fetchDetail(listName), listStore.fetchLists()])
    return true
  }

  async function setRole(memberId: number, role: ShareRole, listName: string): Promise<boolean> {
    const res = await apiFetch(`/api/collab/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) return false
    await fetchDetail(listName)
    return true
  }

  async function removeMember(memberId: number, listName: string): Promise<boolean> {
    const res = await apiFetch(`/api/collab/members/${memberId}`, { method: 'DELETE' })
    if (!res.ok) return false
    await Promise.all([fetchDetail(listName), listStore.fetchLists()])
    return true
  }

  /** Stop sharing entirely. The list and its items are untouched. */
  async function unshare(listName: string): Promise<boolean> {
    const res = await apiFetch(`/api/collab/lists/${encodeURIComponent(listName)}`, {
      method: 'DELETE',
    })
    if (!res.ok) return false
    await Promise.all([fetchDetail(listName), listStore.fetchLists()])
    return true
  }

  function reset() {
    pending.value = []
    detail.value = { ...EMPTY_DETAIL }
    error.value = null
  }

  return {
    pending, detail, loading, error,
    fetchPending, acceptInvite, declineInvite, acceptToken, leaveShare,
    fetchDetail, invite, resendInvite, revokeInvite, setRole, removeMember,
    unshare, reset,
  }
})
