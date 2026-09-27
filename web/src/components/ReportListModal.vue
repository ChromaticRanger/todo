<script setup lang="ts">
/**
 * Flag a published Discover list for moderator attention.
 *
 * ConfirmDialog can't carry a form, so this follows PublishListModal's shape
 * instead. A preset reason plus optional detail rather than free text alone:
 * it makes the admin queue triageable at a glance ("three spam reports")
 * without reading prose, and limits what a malicious reporter can put in front
 * of the moderator.
 */
import { ref } from 'vue'
import { REPORT_REASONS, type ReportReason } from '../stores/discoverStore'
import { useEscapeKey } from '../composables/useEscapeKey'

const props = defineProps<{ listName: string; submitting?: boolean; error?: string | null }>()
const emit = defineEmits<{
  (e: 'submit', reason: ReportReason, detail: string): void
  (e: 'close'): void
}>()

const reason = ref<ReportReason>('spam')
const detail = ref('')

useEscapeKey(() => emit('close'))

function onSubmit() {
  if (props.submitting) return
  emit('submit', reason.value, detail.value.trim())
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <form class="modal-card max-w-sm" @submit.prevent="onSubmit">
      <div class="modal-header">
        <span class="modal-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5" aria-hidden="true">
            <path d="M3 3v18M3 4h13l-2 4 2 4H3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <h2 class="flex-1 text-base font-semibold text-text">
          Report “{{ listName }}”
        </h2>
      </div>

      <div class="space-y-4 p-5">
        <fieldset>
          <legend class="field-label">Why are you reporting this list?</legend>
          <div class="mt-1 space-y-1.5">
            <label
              v-for="r in REPORT_REASONS"
              :key="r.value"
              class="flex items-center gap-2.5 text-sm text-text cursor-pointer"
            >
              <input v-model="reason" type="radio" name="report-reason" :value="r.value" class="accent-accent" />
              {{ r.label }}
            </label>
          </div>
        </fieldset>

        <label class="block">
          <span class="field-label">Anything else? (optional)</span>
          <textarea
            v-model="detail"
            rows="3"
            maxlength="1000"
            class="field-input resize-none"
            placeholder="What should we look at?"
          />
        </label>

        <p
          v-if="error"
          class="rounded-lg border border-danger/40 bg-danger-bg/50 px-3 py-2 text-sm text-danger-fg"
        >
          {{ error }}
        </p>

        <p class="text-xs text-muted">
          Reports go to the Stash Squirrel team. The publisher isn’t told who reported them.
        </p>
      </div>

      <div class="modal-footer justify-end">
        <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn-primary" :disabled="submitting">
          {{ submitting ? 'Sending…' : 'Report' }}
        </button>
      </div>
    </form>
  </div>
</template>
