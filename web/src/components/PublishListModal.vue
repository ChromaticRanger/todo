<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDiscoverStore, type PublicationStatus } from '../stores/discoverStore'

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

const submitting = ref(false)
const submitError = ref('')

onMounted(async () => {
  loadingStatus.value = true
  status.value = await discover.publicationStatus(props.listName)
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

async function unpublish() {
  if (!status.value.slug) return
  if (!confirm('Remove this list from the community catalogue? Existing clones in other users\' accounts are unaffected.')) return
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
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-md bg-surface border border-border-strong rounded-2xl shadow-2xl p-6 dark:inset-ring dark:inset-ring-white/5"
    >
      <h2 class="text-lg font-semibold text-text mb-1">
        {{ status.published ? 'Update community copy' : 'Publish to community' }}
      </h2>
      <p class="text-sm text-muted mb-4">
        <template v-if="status.published">
          Your list is currently published. Pushing an update replaces the items
          on the public copy with what's in your list right now. Existing user
          clones are unaffected.
          <span v-if="status.updated_at" class="block text-xs mt-1">
            Last updated: {{ formatDate(status.updated_at) }}
          </span>
        </template>
        <template v-else>
          Anyone with a Pro plan will be able to see and clone this list. Items
          are snapshotted now; you can re-publish later to push updates.
          Absolute due-dates are not shared (recurrence is).
        </template>
      </p>

      <div v-if="loadingStatus" class="flex justify-center py-4">
        <div class="size-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>

      <form v-else class="space-y-3" @submit.prevent="submit">
        <label class="block">
          <span class="block text-xs font-medium text-muted uppercase tracking-wider mb-1">
            Display name
          </span>
          <input
            v-model="name"
            type="text"
            required
            maxlength="80"
            class="w-full bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
          />
        </label>
        <label class="block">
          <span class="block text-xs font-medium text-muted uppercase tracking-wider mb-1">
            Description
          </span>
          <textarea
            v-model="description"
            rows="3"
            maxlength="500"
            class="w-full bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent resize-none"
            placeholder="What's this list for?"
          />
        </label>
        <div>
          <div class="flex items-baseline justify-between mb-1.5">
            <div class="text-xs font-medium text-muted uppercase tracking-wider">
              Icon
              <span v-if="icon" aria-hidden="true" class="ml-1.5 align-middle">{{ icon }}</span>
            </div>
            <button
              v-if="icon"
              type="button"
              class="text-xs text-muted hover:text-text transition-colors"
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
                class="aspect-square flex items-center justify-center rounded-md text-lg transition-colors"
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
          class="rounded-lg border border-danger/40 bg-danger-bg/50 text-danger-fg px-3 py-2 text-sm"
        >
          {{ submitError }}
        </p>

        <div class="flex items-center justify-between gap-2 pt-2">
          <button
            v-if="status.published"
            type="button"
            :disabled="submitting"
            class="px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger-bg/40 transition-colors disabled:opacity-50"
            @click="unpublish"
          >
            Unpublish
          </button>
          <span v-else />
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="px-3 py-2 rounded-lg text-sm text-muted hover:text-text hover:bg-surface-hover transition-colors"
              @click="emit('close')"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="submitting"
              class="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition-colors disabled:opacity-60"
            >
              {{ submitting ? 'Working…' : status.published ? 'Update' : 'Publish' }}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>
