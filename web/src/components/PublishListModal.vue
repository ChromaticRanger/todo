<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDiscoverStore, type PublicationStatus } from '../stores/discoverStore'
import { LIST_CATEGORIES, type ListCategory } from '../shared/listCategories'
import ConfirmDialog from './ConfirmDialog.vue'

// Curated palette covering the most common list themes. Users can still type
// their own into the input — this is just the no-friction path.
const EMOJI_OPTIONS: readonly string[] = [
  '⚽','🏀','🏈','⚾','🎾','🏉','🏓','🏸','🥊','🥋','🏆','🎯','🎮','🎲','🧩',
  '🎨','🎭','🎬','🎤','🎧','🎼','🎵','🎸','🥁','🎹',
  '🛠️','🔧','⚙️','💻','🖥️','⌨️','📱','🤖','🔌','💾',
  '🏠','🛋️','🛏️','🧹','🧺','🧼','🛁','🍳','🍽️','☕','🍕','🍔','🥗',
  '✈️','🚗','🚆','🚲','🏖️','🏔️','🗺️','🧳','🎒',
  '💰','💳','💼','📈','📊','📅','📋','📌','📎','✂️','📞',
  '📚','📖','📰','📺','🎞️','📷','🎥','🔊',
  '🔬','🧪','🌱','🌳','🌸','🌍','⭐','🌙','☀️','🌧️',
  '❤️','🔥','✨','💡','🎁','🎉','✅','💎','🐿️',
]

const props = defineProps<{ listName: string }>()
const emit = defineEmits<{
  close: []
  published: [{ slug: string; updated: boolean }]
  unpublished: []
}>()

const discover = useDiscoverStore()

const status = ref<PublicationStatus>({ published: false })
const loadingStatus = ref(true)

const name = ref(props.listName)
const description = ref('')
const icon = ref('')
const category = ref<ListCategory>('Other')

const submitting = ref(false)
const submitError = ref('')
const showUnpublishConfirm = ref(false)

onMounted(async () => {
  loadingStatus.value = true
  status.value = await discover.publicationStatus(props.listName)
  if (status.value.category) category.value = status.value.category
  loadingStatus.value = false
})

async function submit() {
  submitting.value = true
  submitError.value = ''
  try {
    const result = await discover.publish(props.listName, {
      name: name.value.trim() || undefined,
      description: description.value.trim() || undefined,
      icon: icon.value.trim() || undefined,
      category: category.value,
    })
    if (!result) {
      submitError.value = discover.error || 'Publish failed'
      return
    }
    emit('published', { slug: result.slug, updated: result.updated })
  } finally {
    submitting.value = false
  }
}

function unpublish() {
  if (!status.value.slug) return
  showUnpublishConfirm.value = true
}

async function confirmUnpublish() {
  if (!status.value.slug) {
    showUnpublishConfirm.value = false
    return
  }
  showUnpublishConfirm.value = false
  submitting.value = true
  try {
    const ok = await discover.unpublish(status.value.slug)
    if (ok) emit('unpublished')
  } finally {
    submitting.value = false
  }
}

function formatDate(iso: string | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString() } catch { return iso }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card flex max-h-[88vh] max-w-md flex-col">
      <div class="modal-header">
        <span class="modal-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5" aria-hidden="true">
            <path d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <h2 class="flex-1 text-base font-semibold text-text">
          {{ status.published ? 'Update community copy' : 'Publish to community' }}
        </h2>
        <button type="button" class="btn-icon" aria-label="Close" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-5" aria-hidden="true">
            <path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <div v-if="loadingStatus" class="flex justify-center py-10">
        <div class="size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>

      <form v-else class="flex min-h-0 flex-col" @submit.prevent="submit">
        <div class="min-h-0 flex-1 space-y-3 overflow-y-auto scrollbar-thin p-5">
          <p class="text-sm text-muted">
            <template v-if="status.published">
              Your list is currently published. Pushing an update replaces the items
              on the public copy with what's in your list right now. Existing user
              clones are unaffected.
              <span v-if="status.updated_at" class="mt-1 block text-xs">
                Last updated: {{ formatDate(status.updated_at) }}
              </span>
            </template>
            <template v-else>
              Anyone with a Pro plan will be able to see and clone this list. Items
              are snapshotted now; you can re-publish later to push updates.
              Absolute due-dates are not shared (recurrence is).
            </template>
          </p>

          <label class="block">
            <span class="field-label">Display name</span>
            <input
              v-model="name"
              type="text"
              name="display-name"
              required
              maxlength="80"
              class="field-input"
            />
          </label>
          <label class="block">
            <span class="field-label">Description</span>
            <textarea
              v-model="description"
              name="description"
              rows="3"
              maxlength="500"
              class="field-input resize-none"
              placeholder="What's this list for?"
            />
          </label>
          <label class="block">
            <span class="field-label">Category</span>
            <select v-model="category" name="category" class="field-select">
              <option v-for="c in LIST_CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <div>
            <div class="mb-1.5 flex items-baseline justify-between">
              <div class="text-xs font-medium uppercase tracking-wider text-muted">
                Icon
                <span v-if="icon" aria-hidden="true" class="ml-1.5 align-middle">{{ icon }}</span>
              </div>
              <button
                v-if="icon"
                type="button"
                class="text-xs text-muted transition-colors hover:text-text"
                @click="icon = ''"
              >Clear</button>
            </div>
            <div
              class="max-h-40 overflow-y-auto rounded-lg border border-border-strong/60 bg-surface-hover/20 p-2"
            >
              <div
                class="grid grid-cols-10 gap-1"
                role="listbox"
                aria-label="Pick an icon"
              >
                <button
                  v-for="e in EMOJI_OPTIONS"
                  :key="e"
                  type="button"
                  :title="e"
                  :aria-selected="icon === e"
                  class="flex aspect-square items-center justify-center rounded-md text-lg transition-colors"
                  :class="icon === e
                    ? 'bg-accent/15 ring-1 ring-accent/40'
                    : 'hover:bg-surface-hover'"
                  @click="icon = e"
                >{{ e }}</button>
              </div>
            </div>
          </div>

          <p
            v-if="submitError"
            class="rounded-lg border border-danger/40 bg-danger-bg/50 px-3 py-2 text-sm text-danger-fg"
          >
            {{ submitError }}
          </p>
        </div>

        <div class="modal-footer">
          <button
            v-if="status.published"
            type="button"
            :disabled="submitting"
            class="btn-danger-ghost disabled:opacity-50"
            @click="unpublish"
          >
            Unpublish
          </button>
          <div class="flex-1" />
          <button type="button" class="btn-ghost" @click="emit('close')">
            Cancel
          </button>
          <button type="submit" :disabled="submitting" class="btn-primary">
            {{ submitting ? 'Working…' : status.published ? 'Update' : 'Publish' }}
          </button>
        </div>
      </form>
    </div>

    <ConfirmDialog
      v-if="showUnpublishConfirm"
      message="Remove this list from the community catalogue? Existing clones in other users' accounts are unaffected."
      confirm-label="Unpublish"
      @confirm="confirmUnpublish"
      @cancel="showUnpublishConfirm = false"
    />
  </div>
</template>
