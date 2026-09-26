<script setup lang="ts">
import { ref } from 'vue'
import { useCollabStore } from '../stores/collabStore'

// The fetch lives in App.vue's bootstrap, not here: this component only renders
// once there's an invite to show, so fetching on mount would never run.
const collab = useCollabStore()
const busy = ref<number | null>(null)
// Dismissed for this session only — the invite itself stays pending, so it
// reappears on the next load until it's actually accepted or declined.
const dismissed = ref<Set<number>>(new Set())

async function accept(id: number) {
  busy.value = id
  await collab.acceptInvite(id)
  busy.value = null
}

async function decline(id: number) {
  busy.value = id
  await collab.declineInvite(id)
  busy.value = null
}
</script>

<template>
  <div
    v-for="invite in collab.pending.filter((i) => !dismissed.has(i.id))"
    :key="invite.id"
    class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm"
  >
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      class="size-5 shrink-0 text-accent" aria-hidden="true"
    >
      <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" stroke-linecap="round" stroke-linejoin="round" />
    </svg>

    <p class="min-w-0 flex-1 text-text">
      <strong class="font-semibold">{{ invite.inviter }}</strong>
      shared the list
      <strong class="font-semibold">“{{ invite.list_name }}”</strong>
      with you
      <span class="text-muted">
        ({{ invite.role === 'editor' ? 'you can add and edit items' : 'view only' }})
      </span>
    </p>

    <span class="flex shrink-0 items-center gap-2">
      <button
        type="button"
        class="btn-primary px-3 py-1 text-xs disabled:opacity-50"
        :disabled="busy === invite.id"
        @click="accept(invite.id)"
      >Accept</button>
      <button
        type="button"
        class="btn-ghost px-3 py-1 text-xs disabled:opacity-50"
        :disabled="busy === invite.id"
        @click="decline(invite.id)"
      >Decline</button>
      <button
        type="button"
        class="btn-icon"
        aria-label="Dismiss for now"
        title="Dismiss for now"
        @click="dismissed = new Set([...dismissed, invite.id])"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-4" aria-hidden="true">
          <path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </span>
  </div>

  <p
    v-if="collab.error && collab.pending.length"
    class="rounded-lg border border-danger/40 bg-danger-bg/50 px-3 py-2 text-sm text-danger-fg"
  >
    {{ collab.error }}
  </p>
</template>
