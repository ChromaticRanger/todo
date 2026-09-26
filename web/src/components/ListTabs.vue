<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, onUpdated } from 'vue'
import draggable from 'vuedraggable'
import { useListStore } from '../stores/listStore'
import { usePlanStore } from '../stores/planStore'
import { useTodoStore } from '../stores/todoStore'
import { useAuthStore } from '../stores/authStore'
import { useDiscoverStore } from '../stores/discoverStore'
import ConfirmDialog from './ConfirmDialog.vue'
import PublishListModal from './PublishListModal.vue'
import ShareListModal from './ShareListModal.vue'
import { useCollabStore } from '../stores/collabStore'

const listStore = useListStore()
const collab = useCollabStore()
const sharingList = ref<string | null>(null)
const confirmLeave = ref<string | null>(null)
const planStore = usePlanStore()
const todoStore = useTodoStore()
const authStore = useAuthStore()
const discover = useDiscoverStore()
const publishingList = ref<string | null>(null)
const publishToast = ref('')

function showPublishToast(msg: string) {
  publishToast.value = msg
  setTimeout(() => {
    if (publishToast.value === msg) publishToast.value = ''
  }, 4000)
}

const maxLists = computed(() => planStore.limits?.maxLists ?? null)
const atListCap = computed(() => {
  if (planStore.tier !== 'free') return false
  const cap = maxLists.value
  if (cap == null) return false
  return listStore.lists.length >= cap
})

const showNewInput = ref(false)
const newName = ref('')
const confirmDelete = ref<string | null>(null)
const editingList = ref<string | null>(null)
const editName = ref('')

const emit = defineEmits<{ select: [list: string] }>()

function selectList(name: string) {
  listStore.setActiveList(name)
  emit('select', name)
}

async function createList() {
  const name = newName.value.trim()
  if (!name) return
  if (atListCap.value) {
    todoStore.error = `You've reached the Free plan list limit (${maxLists.value}). Remove a list or upgrade to Pro.`
    setTimeout(() => {
      if (todoStore.error?.includes('list limit')) todoStore.error = null
    }, 6000)
    showNewInput.value = false
    newName.value = ''
    return
  }
  listStore.addListLocally(name)
  listStore.setActiveList(name)
  emit('select', name)
  newName.value = ''
  showNewInput.value = false
}

function startEdit(list: string) {
  editingList.value = list
  editName.value = list
}

async function confirmRename() {
  const trimmed = editName.value.trim()
  if (!trimmed || !editingList.value) { editingList.value = null; return }
  if (trimmed !== editingList.value) {
    const oldName = editingList.value
    await listStore.renameList(oldName, trimmed)
    discover.renamePublication(oldName, trimmed)
  }
  editingList.value = null
}

function cancelEdit() {
  editingList.value = null
}

async function deleteList() {
  if (!confirmDelete.value) return
  const name = confirmDelete.value
  await listStore.deleteList(name)
  discover.clearPublication(name)
  confirmDelete.value = null
}

// Own lists and shared ones share a single tab strip and a single saved order —
// a share key (`@12`) is a legal member of the order array.
const draggableLists = computed({
  get: () => listStore.allTabs,
  set: (value) => listStore.reorderLists(value),
})

/** Tooltip explaining who a shared tab belongs to and what you can do with it. */
function sharedTooltip(list: string): string {
  const meta = listStore.metaFor(list)
  if (!meta) return ''
  const what = meta.role === 'editor' ? 'you can add and edit items' : 'view only'
  return `Shared by ${meta.owner_name} — ${what}`
}

/** Tooltip for one of your own lists that you've shared with other people. */
function sharedByMeTooltip(list: string): string {
  const status = listStore.shareStatus(list)
  if (!status) return ''
  const parts: string[] = []
  if (status.member_count) {
    parts.push(`${status.member_count} ${status.member_count === 1 ? 'person has' : 'people have'} access`)
  }
  if (status.pending_invites) {
    parts.push(`${status.pending_invites} invitation${status.pending_invites === 1 ? '' : 's'} pending`)
  }
  // No fallback string: the dot only renders when one of the counts is
  // non-zero, so an empty tooltip here would mean the dot shouldn't be there.
  return parts.join(' · ')
}

async function leaveShare() {
  if (!confirmLeave.value) return
  const key = confirmLeave.value
  confirmLeave.value = null
  if (await collab.leaveShare(key)) {
    showPublishToast('You’ve left the shared list.')
    if (listStore.activeList === key) {
      const next = listStore.allTabs[0]
      if (next) selectList(next)
    }
  }
}

// Horizontal scroll arrows: shown only when the tab row overflows.
const scroller = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
const hasOverflow = computed(() => canScrollLeft.value || canScrollRight.value)

function updateScrollState() {
  const el = scroller.value
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 0
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

function scrollByPage(direction: -1 | 1) {
  const el = scroller.value
  if (!el) return
  el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.75), behavior: 'smooth' })
}

let ro: ResizeObserver | null = null
onMounted(() => {
  updateScrollState()
  scroller.value?.addEventListener('scroll', updateScrollState, { passive: true })
  ro = new ResizeObserver(updateScrollState)
  if (scroller.value) ro.observe(scroller.value)
  if (authStore.tier === 'pro') void discover.fetchPublications()
})

function publishedTooltip(list: string): string {
  const pub = discover.publications[list]
  if (!pub) return ''
  try {
    const formatted = new Date(pub.updated_at).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    return `Last published on ${formatted}`
  } catch {
    return `Last published on ${pub.updated_at}`
  }
}
onUpdated(updateScrollState)
onBeforeUnmount(() => {
  scroller.value?.removeEventListener('scroll', updateScrollState)
  ro?.disconnect()
})
</script>

<template>
  <div data-tour="list-tabs" class="flex items-center gap-1 pb-1 shrink-0">
    <!-- Scroll-left arrow (only when overflowing) -->
    <button
      v-if="hasOverflow"
      type="button"
      class="shrink-0 p-1 rounded-md text-muted hover:text-text hover:bg-surface-hover/40 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted disabled:cursor-not-allowed transition-colors"
      :disabled="!canScrollLeft"
      title="Scroll left"
      aria-label="Scroll lists left"
      @click="scrollByPage(-1)"
    >
      <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>

    <div ref="scroller" class="flex items-center gap-1 overflow-x-auto scrollbar-hide min-w-0 flex-1">
    <!-- List tabs -->
    <draggable
      v-model="draggableLists"
      tag="div"
      class="flex items-center gap-1"
      :item-key="(el: string) => el"
      :animation="150"
      handle=".list-tab-handle"
      filter="input,.tab-action"
      :prevent-on-filter="false"
      :delay="200"
      :delay-on-touch-only="true"
      :touch-start-threshold="5"
      ghost-class="opacity-40"
    >
      <template #item="{ element: list }">
    <div
      :key="list"
      class="list-tab-handle group flex items-center gap-2 px-3 py-1 rounded-t-lg text-sm font-medium whitespace-nowrap transition-colors border-b-2 cursor-pointer select-none"
      :class="[
        listStore.activeList === list
          ? 'tab-selected border-accent text-accent bg-surface-hover/60'
          : 'border-transparent text-muted hover:text-text hover:bg-surface-hover/40',
        // Shared lists carry a left rule as well as the people icon, so the
        // distinction survives at a glance and doesn't rely on colour alone.
        listStore.isShared(list) ? 'border-l-2 border-l-accent/50 pl-2' : '',
      ]"
      @click="selectList(list)"
    >
      <!-- Inline rename input -->
      <input
        v-if="editingList === list"
        v-model="editName"
        type="text"
        class="bg-surface-hover border border-accent rounded px-1.5 py-0.5 text-sm text-text focus:outline-none w-28 cursor-text"
        autofocus
        @click.stop
        @keydown.enter="confirmRename"
        @keydown.esc="cancelEdit"
        @blur="confirmRename"
      />
      <template v-else>
        <!-- Someone else's list: a people icon plus the owner's name, so a
             shared tab is never mistaken for one of your own. -->
        <svg
          v-if="listStore.isShared(list)"
          class="size-3.5 shrink-0 text-accent"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
          :aria-label="sharedTooltip(list)"
          :title="sharedTooltip(list)"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <!-- One of your own lists that you've shared with others -->
        <span
          v-else-if="listStore.isSharedByMe(list)"
          class="inline-block size-2 rounded-full bg-accent shrink-0"
          :aria-label="sharedByMeTooltip(list)"
          :title="sharedByMeTooltip(list)"
        />
        <span
          v-if="discover.publications[list]"
          class="inline-block size-2 rounded-full bg-emerald-500 shrink-0"
          aria-label="Published to community"
          :title="publishedTooltip(list)"
        />
        <span>{{ listStore.displayName(list) }}</span>
        <span
          v-if="listStore.roleOf(list) === 'viewer'"
          class="rounded px-1 py-px text-[10px] font-semibold uppercase tracking-wide bg-surface-hover text-muted"
          title="You have view-only access"
        >View</span>
      </template>

      <!-- A shared list isn't yours to rename, publish or delete — the only
           action available is leaving it. -->
      <template v-if="editingList !== list && listStore.isShared(list)">
        <span
          class="tab-action opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-danger-bg hover:text-danger transition-all"
          title="Leave this shared list"
          @click.stop="confirmLeave = list"
        >
          <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </span>
      </template>

      <template v-else-if="editingList !== list">
        <!-- Edit / rename icon -->
        <span
          class="tab-action opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-hover hover:text-text transition-all"
          title="Rename list"
          @click.stop="startEdit(list)"
        >
          <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H7v-3a2 2 0 01.586-1.414z" />
          </svg>
        </span>
        <!-- Share with people (Pro only, hidden for demo visitors). -->
        <span
          v-if="authStore.tier === 'pro' && !authStore.isDemo"
          class="tab-action opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-hover hover:text-accent transition-all"
          title="Share with people"
          @click.stop="sharingList = list"
        >
          <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8.684 13.342a3 3 0 100-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </span>
        <!-- Publish icon (Pro only, hidden for demo visitors so they can't
             push junk onto the public Discover feed). -->
        <span
          v-if="authStore.tier === 'pro' && !authStore.isDemo"
          class="tab-action opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-hover hover:text-accent transition-all"
          title="Publish to community"
          @click.stop="publishingList = list"
        >
          <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 6l-4-4m0 0L8 6m4-4v14" />
          </svg>
        </span>
        <!-- Delete icon -->
        <span
          class="tab-action opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-danger-bg hover:text-danger transition-all"
          title="Delete list"
          @click.stop="confirmDelete = list"
        >
          <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      </template>
    </div>
      </template>
    </draggable>

    <!-- New list button/input -->
    <div v-if="!showNewInput">
      <button
        class="px-2.5 py-1 rounded-t-lg text-sm transition-colors border-b-2 border-transparent whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        :class="atListCap
          ? 'text-muted'
          : 'text-muted hover:text-text hover:bg-surface-hover/40'"
        :disabled="atListCap"
        :title="atListCap
          ? `Free plan is capped at ${maxLists} lists — upgrade to Pro for more.`
          : 'Create a new list'"
        @click="showNewInput = true"
      >
        + New list
      </button>
    </div>
    <div v-else class="flex items-center gap-1">
      <input
        v-model="newName"
        type="text"
        placeholder="List name"
        class="bg-surface border border-border-strong rounded-lg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent w-36"
        autofocus
        @keydown.enter="createList"
        @keydown.esc="showNewInput = false"
      />
      <button
        class="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm transition-colors"
        @click="createList"
      >Add</button>
      <button
        class="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors"
        @click="showNewInput = false"
      >
        <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    </div>

    <!-- Scroll-right arrow (only when overflowing) -->
    <button
      v-if="hasOverflow"
      type="button"
      class="shrink-0 p-1 rounded-md text-muted hover:text-text hover:bg-surface-hover/40 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted disabled:cursor-not-allowed transition-colors"
      :disabled="!canScrollRight"
      title="Scroll right"
      aria-label="Scroll lists right"
      @click="scrollByPage(1)"
    >
      <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  </div>

  <!-- Delete confirmation -->
  <ConfirmDialog
    v-if="confirmDelete"
    :message="`Delete all todos in &quot;${confirmDelete}&quot;? This cannot be undone.`"
    @confirm="deleteList"
    @cancel="confirmDelete = null"
  />

  <!-- Leave a shared list -->
  <ConfirmDialog
    v-if="confirmLeave"
    :message="`Leave &quot;${listStore.displayName(confirmLeave)}&quot;? You'll lose access until someone invites you again. Nothing is deleted.`"
    @confirm="leaveShare"
    @cancel="confirmLeave = null"
  />

  <!-- Share with people -->
  <ShareListModal
    v-if="sharingList"
    :list-name="sharingList"
    @close="sharingList = null"
    @changed="() => { void listStore.fetchLists() }"
  />

  <!-- Publish to community -->
  <PublishListModal
    v-if="publishingList"
    :list-name="publishingList"
    @close="publishingList = null"
    @published="(r) => { publishingList = null; showPublishToast(r.updated ? 'Community copy updated.' : 'List published to community.'); void discover.fetchPublications() }"
    @unpublished="() => { publishingList = null; showPublishToast('Removed from community.'); void discover.fetchPublications() }"
  />

  <div
    v-if="publishToast"
    class="fixed bottom-4 right-4 z-50 bg-surface border border-border-strong text-text px-4 py-3 rounded-xl text-sm shadow-xl dark:shadow-none"
  >
    {{ publishToast }}
  </div>
</template>
