<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/authStore'
import { useCollabStore } from '../stores/collabStore'
import type { ShareRole } from '../stores/listStore'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{ listName: string }>()
const emit = defineEmits<{ close: []; changed: [] }>()

const collab = useCollabStore()
const authStore = useAuthStore()

const email = ref('')
const role = ref<ShareRole>('editor')
const submitting = ref(false)
const notice = ref('')
const showUnshareConfirm = ref(false)

const detail = computed(() => collab.detail)
const hasPeople = computed(
  () => detail.value.members.length > 0 || detail.value.invites.length > 0
)

// Sharing needs Pro, but a downgrade deliberately does NOT evict the people
// already on the list — taking away a third party's access as a side effect of
// someone else's billing reads as data loss. So existing collaborators carry on
// and only new invites are blocked, which needs saying out loud or the disabled
// form looks broken. The server enforces this independently (403 pro_required).
const canInvite = computed(() => authStore.tier === 'pro')
const hasLiveShare = computed(() => detail.value.members.length > 0)

onMounted(() => {
  void collab.fetchDetail(props.listName)
})

function flash(msg: string) {
  notice.value = msg
  setTimeout(() => {
    if (notice.value === msg) notice.value = ''
  }, 4000)
}

async function sendInvite() {
  const address = email.value.trim()
  if (!address || submitting.value) return
  submitting.value = true
  const ok = await collab.invite(props.listName, address, role.value)
  submitting.value = false
  if (ok) {
    email.value = ''
    flash(`Invitation sent to ${address}.`)
    emit('changed')
  }
}

async function changeRole(memberId: number, next: ShareRole) {
  if (await collab.setRole(memberId, next, props.listName)) emit('changed')
}

async function remove(memberId: number) {
  if (await collab.removeMember(memberId, props.listName)) {
    flash('Access removed.')
    emit('changed')
  }
}

async function resend(id: number) {
  if (await collab.resendInvite(id, props.listName)) {
    flash('Invitation sent again — the previous link no longer works.')
  }
}

async function revoke(id: number) {
  if (await collab.revokeInvite(id, props.listName)) {
    flash('Invitation revoked.')
    emit('changed')
  }
}

async function unshareAll() {
  showUnshareConfirm.value = false
  if (await collab.unshare(props.listName)) {
    flash('Sharing turned off. Everyone has lost access.')
    emit('changed')
  }
}

function expiryLabel(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (days <= 0) return 'expired'
  return days === 1 ? 'expires tomorrow' : `expires in ${days} days`
}

function initial(m: { name: string | null; email: string }): string {
  return (m.name || m.email).charAt(0).toUpperCase()
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card flex max-h-[88vh] max-w-md flex-col">
      <div class="modal-header">
        <span class="modal-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5" aria-hidden="true">
            <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <h2 class="flex-1 text-base font-semibold text-text">
          Share “{{ listName }}”
        </h2>
        <button type="button" class="btn-icon" aria-label="Close" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-5" aria-hidden="true">
            <path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin p-5">
        <p class="text-sm text-muted">
          People you invite see everything in this list and anything added to it
          later. Items they add belong to your list and count towards your plan.
        </p>

        <div
          v-if="!canInvite"
          class="rounded-xl bg-warning-bg/40 ring-1 ring-warning-fg/40 px-4 py-3 text-sm text-text"
        >
          <p class="font-medium">Inviting needs Pro</p>
          <p class="mt-1 text-muted text-balance">
            {{
              hasLiveShare
                ? 'The people already on this list keep their access — nothing changes for them. You just can\'t send new invitations until you upgrade.'
                : 'Upgrade to share a list with someone. You can still remove people and stop sharing at any time.'
            }}
          </p>
          <a href="/account" class="mt-2 inline-block text-sm font-medium text-accent hover:underline">
            See plans
          </a>
        </div>

        <form v-else class="space-y-3" @submit.prevent="sendInvite">
          <label class="block">
            <span class="field-label">Invite by email</span>
            <input
              v-model="email"
              type="email"
              name="invite-email"
              required
              placeholder="them@example.com"
              class="field-input"
            />
          </label>
          <label class="block">
            <span class="field-label">They can</span>
            <select v-model="role" name="invite-role" class="field-select">
              <option value="editor">Add and edit items</option>
              <option value="viewer">View only</option>
            </select>
          </label>
          <button type="submit" class="btn-primary w-full disabled:opacity-50" :disabled="submitting">
            {{ submitting ? 'Sending…' : 'Send invitation' }}
          </button>
          <p class="text-xs text-muted">
            They don’t need an account yet — we’ll send them a link to create one.
          </p>
        </form>

        <p
          v-if="collab.error"
          class="rounded-lg border border-danger/40 bg-danger-bg/50 px-3 py-2 text-sm text-danger-fg"
        >
          {{ collab.error }}
        </p>
        <p
          v-if="notice"
          class="rounded-lg border border-border-strong/60 bg-surface-hover/40 px-3 py-2 text-sm text-text"
        >
          {{ notice }}
        </p>

        <div v-if="collab.loading" class="flex justify-center py-6">
          <div class="size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>

        <div v-else-if="hasPeople" class="space-y-2">
          <div class="text-xs font-medium uppercase tracking-wider text-muted">
            People with access
          </div>

          <div
            v-for="m in detail.members"
            :key="`m${m.id}`"
            class="flex items-center gap-2 rounded-lg border border-border-strong/60 px-3 py-2"
          >
            <span
              class="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent"
              aria-hidden="true"
            >{{ initial(m) }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm text-text">{{ m.name || m.email }}</span>
              <span v-if="m.name" class="block truncate text-xs text-muted">{{ m.email }}</span>
            </span>
            <select
              :value="m.role"
              class="field-select w-auto py-1 text-xs"
              :aria-label="`Permission for ${m.name || m.email}`"
              @change="changeRole(m.id, ($event.target as HTMLSelectElement).value as ShareRole)"
            >
              <option value="editor">Can edit</option>
              <option value="viewer">View only</option>
            </select>
            <button
              type="button"
              class="btn-icon"
              :aria-label="`Remove ${m.name || m.email}`"
              title="Remove access"
              @click="remove(m.id)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-4" aria-hidden="true">
                <path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>

          <div
            v-for="i in detail.invites"
            :key="`i${i.id}`"
            class="flex items-center gap-2 rounded-lg border border-dashed border-border-strong/60 px-3 py-2"
          >
            <span
              class="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-hover text-xs text-muted"
              aria-hidden="true"
            >✉</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm text-text">{{ i.email }}</span>
              <span class="block text-xs text-muted">
                Invited as {{ i.role === 'editor' ? 'editor' : 'viewer' }} · {{ expiryLabel(i.expires_at) }}
              </span>
            </span>
            <button type="button" class="text-xs text-muted transition-colors hover:text-text" @click="resend(i.id)">
              Resend
            </button>
            <button type="button" class="text-xs text-danger transition-colors hover:underline" @click="revoke(i.id)">
              Revoke
            </button>
          </div>
        </div>

        <p v-else class="text-sm text-muted">
          This list isn’t shared with anyone yet.
        </p>
      </div>

      <div class="modal-footer">
        <button
          v-if="detail.members.length > 0"
          type="button"
          class="btn-danger-ghost"
          @click="showUnshareConfirm = true"
        >
          Stop sharing
        </button>
        <button type="button" class="btn-ghost ml-auto" @click="emit('close')">Done</button>
      </div>
    </div>

    <ConfirmDialog
      v-if="showUnshareConfirm"
      :message="`Stop sharing &quot;${listName}&quot;? Everyone will immediately lose access. Your items are not deleted.`"
      @confirm="unshareAll"
      @cancel="showUnshareConfirm = false"
    />
  </div>
</template>
