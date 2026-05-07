<script setup lang="ts">
import { computed, ref } from 'vue'
import { apiFetch } from '../lib/api'
import { useEscapeKey } from '../composables/useEscapeKey'
import { useListStore } from '../stores/listStore'
import { useTodoStore } from '../stores/todoStore'

const emit = defineEmits<{
  close: []
}>()

interface FolderSummary {
  name: string
  bookmarkCount: number
  categories: string[]
}

interface PreviewResponse {
  importId: string
  topLevelFolders: FolderSummary[]
  rootBookmarks: number
  totals: { parsed: number; duplicatesIfDefaults: number }
  existingLists: string[]
}

interface CommitResponse {
  inserted: number
  skippedDuplicates: number
  listsCreated: number
}

interface Mapping {
  action: 'new' | 'merge'
  newListName: string
  targetList: string
}

type Step = 'upload' | 'review' | 'success'

const step = ref<Step>('upload')
const selectedFile = ref<File | null>(null)
const isDragging = ref(false)
const submitting = ref(false)
const errorMsg = ref('')
const preview = ref<PreviewResponse | null>(null)
const mappings = ref<Record<string, Mapping>>({})
const rootList = ref('Imported')
const result = ref<CommitResponse | null>(null)

const listStore = useListStore()
const todoStore = useTodoStore()

useEscapeKey(() => {
  if (!submitting.value) emit('close')
})

const fileSizeMB = computed(() => {
  if (!selectedFile.value) return 0
  return selectedFile.value.size / (1024 * 1024)
})

function pickFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (f) chooseFile(f)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) chooseFile(f)
}

function chooseFile(f: File) {
  errorMsg.value = ''
  selectedFile.value = f
}

function clearFile() {
  selectedFile.value = null
  errorMsg.value = ''
}

async function submitPreview() {
  if (!selectedFile.value) return
  if (selectedFile.value.size > 5 * 1024 * 1024) {
    errorMsg.value = 'File is larger than 5 MB.'
    return
  }
  submitting.value = true
  errorMsg.value = ''
  try {
    const fd = new FormData()
    fd.append('file', selectedFile.value)
    const res = await apiFetch('/api/import/bookmarks/preview', { method: 'POST', body: fd })
    if (!res.ok) {
      const body = await readError(res)
      errorMsg.value = previewErrorText(res.status, body)
      return
    }
    const data = (await res.json()) as PreviewResponse
    preview.value = data
    const seed: Record<string, Mapping> = {}
    for (const folder of data.topLevelFolders) {
      seed[folder.name] = {
        action: 'new',
        newListName: folder.name,
        targetList: data.existingLists[0] ?? '',
      }
    }
    mappings.value = seed
    rootList.value = 'Imported'
    step.value = 'review'
  } catch (e) {
    errorMsg.value = String(e)
  } finally {
    submitting.value = false
  }
}

async function submitCommit() {
  if (!preview.value) return
  for (const folder of preview.value.topLevelFolders) {
    const m = mappings.value[folder.name]
    if (m.action === 'new' && !m.newListName.trim()) {
      errorMsg.value = `Pick a list name for "${folder.name}".`
      return
    }
    if (m.action === 'merge' && !m.targetList.trim()) {
      errorMsg.value = `Pick an existing list to merge "${folder.name}" into.`
      return
    }
  }
  submitting.value = true
  errorMsg.value = ''
  try {
    const body = {
      importId: preview.value.importId,
      folderMappings: preview.value.topLevelFolders.map((f) => {
        const m = mappings.value[f.name]
        return m.action === 'new'
          ? { sourceFolder: f.name, action: 'new', newListName: m.newListName.trim() }
          : { sourceFolder: f.name, action: 'merge', targetList: m.targetList }
      }),
      rootBookmarksList: rootList.value.trim() || 'Imported',
    }
    const res = await apiFetch('/api/import/bookmarks/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await readError(res)
      errorMsg.value = commitErrorText(res.status, err)
      return
    }
    result.value = (await res.json()) as CommitResponse
    step.value = 'success'

    // Refresh state so newly imported lists/items appear without a reload.
    await listStore.fetchLists()
    todoStore.invalidateList(listStore.activeList)
    await todoStore.fetchTodos(listStore.activeList, todoStore.currentView)
  } catch (e) {
    errorMsg.value = String(e)
  } finally {
    submitting.value = false
  }
}

interface ApiError {
  error?: string
  message?: string
  limit?: number
  found?: number
  limit_bytes?: number
}

async function readError(res: Response): Promise<ApiError> {
  try {
    return (await res.json()) as ApiError
  } catch {
    return {}
  }
}

function previewErrorText(status: number, body: ApiError): string {
  if (status === 413) return 'That file is larger than the 5 MB limit.'
  if (body.error === 'too_many_bookmarks')
    return `That file has ${body.found} bookmarks; the import limit is ${body.limit}.`
  if (body.error === 'invalid_netscape')
    return "That file doesn't look like a Netscape bookmark export. Try exporting from your browser's bookmark manager."
  if (body.error === 'no_bookmarks') return 'No bookmarks found in that file.'
  if (body.error === 'pro_required') return 'Importing bookmarks is a Pro feature.'
  return body.message || `Upload failed (HTTP ${status}).`
}

function commitErrorText(status: number, body: ApiError): string {
  if (body.error === 'import_expired')
    return 'This import has expired. Please upload the file again.'
  if (body.error === 'import_not_found')
    return 'Import session not found. Please upload the file again.'
  if (body.error === 'pro_required') return 'Importing bookmarks is a Pro feature.'
  return body.message || `Import failed (HTTP ${status}).`
}

function close() {
  if (submitting.value) return
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
    <div class="bg-surface border border-border-strong/60 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col dark:shadow-none shadow-2xl dark:inset-ring dark:inset-ring-white/5">
      <div class="px-4 py-2.5 border-b border-border-strong/60 bg-surface-hover/40 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-muted uppercase tracking-wider">
          {{ step === 'success' ? 'Import complete' : 'Import bookmarks' }}
          <span class="rounded-full bg-accent/15 text-accent text-[10px] font-semibold px-1.5 py-0.5 tracking-wide ml-2">Pro</span>
        </h3>
        <button
          type="button"
          class="text-muted hover:text-text disabled:opacity-50"
          :disabled="submitting"
          aria-label="Close"
          @click="close"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Upload step -->
      <div v-if="step === 'upload'" class="p-5 overflow-y-auto">
        <p class="text-sm text-muted mb-4">
          Upload a bookmarks file exported from your browser. Most browsers
          (Chrome, Firefox, Edge, Safari) export to an
          <code class="font-mono text-xs">.html</code> file from their bookmark
          manager.
        </p>

        <label
          class="block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
          :class="isDragging
            ? 'border-accent bg-accent/5'
            : 'border-border-strong hover:border-accent/60 hover:bg-surface-hover/40'"
          @dragenter.prevent="isDragging = true"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop="onDrop"
        >
          <input
            type="file"
            accept=".html,.htm,text/html"
            class="hidden"
            @change="pickFile"
          />
          <svg class="size-8 mx-auto text-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
          </svg>
          <div v-if="!selectedFile" class="text-sm text-text">
            <span class="font-medium">Click to choose a file</span>
            <span class="text-muted"> or drop one here</span>
          </div>
          <div v-else class="text-sm text-text">
            <div class="font-medium">{{ selectedFile.name }}</div>
            <div class="text-xs text-muted mt-0.5">{{ fileSizeMB.toFixed(2) }} MB</div>
          </div>
          <p class="text-xs text-muted mt-2">Max 5 MB · 5,000 bookmarks</p>
        </label>

        <p v-if="errorMsg" class="mt-3 text-sm text-danger-fg">{{ errorMsg }}</p>

        <div class="flex gap-3 justify-end mt-5">
          <button
            type="button"
            class="px-4 py-1.5 rounded-lg text-sm text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-50"
            :disabled="submitting"
            @click="close"
          >
            Cancel
          </button>
          <button
            v-if="selectedFile"
            type="button"
            class="px-3 py-1.5 rounded-lg text-sm text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-50"
            :disabled="submitting"
            @click="clearFile"
          >
            Clear
          </button>
          <button
            type="button"
            :disabled="!selectedFile || submitting"
            class="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-accent-fg text-sm font-medium transition-colors"
            @click="submitPreview"
          >
            {{ submitting ? 'Analysing…' : 'Continue' }}
          </button>
        </div>
      </div>

      <!-- Review step -->
      <div v-else-if="step === 'review' && preview" class="p-5 overflow-y-auto">
        <div class="rounded-lg bg-surface-hover/40 px-3 py-2 text-sm text-text mb-4 flex flex-wrap gap-x-4 gap-y-1">
          <span><strong>{{ preview.totals.parsed }}</strong> bookmarks parsed</span>
          <span class="text-muted">·</span>
          <span class="text-muted">
            <strong class="text-text">{{ preview.totals.duplicatesIfDefaults }}</strong>
            already in your account (will be skipped)
          </span>
        </div>

        <div v-if="preview.topLevelFolders.length === 0 && preview.rootBookmarks === 0" class="text-sm text-muted">
          No folders or bookmarks found.
        </div>

        <div v-if="preview.topLevelFolders.length > 0" class="space-y-3 mb-4">
          <h4 class="text-xs font-semibold text-muted uppercase tracking-wider">Top-level folders</h4>
          <div
            v-for="folder in preview.topLevelFolders"
            :key="folder.name"
            class="border border-border rounded-lg p-3"
          >
            <div class="flex items-baseline justify-between gap-3 mb-2">
              <div class="font-medium text-sm text-text truncate">{{ folder.name }}</div>
              <div class="text-xs text-muted shrink-0">
                {{ folder.bookmarkCount }} {{ folder.bookmarkCount === 1 ? 'bookmark' : 'bookmarks' }}
                · {{ folder.categories.length }} {{ folder.categories.length === 1 ? 'category' : 'categories' }}
              </div>
            </div>

            <div class="flex flex-col sm:flex-row gap-2">
              <select
                v-model="mappings[folder.name].action"
                class="bg-bg border border-border-strong rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-accent"
              >
                <option value="new">Create new list</option>
                <option value="merge" :disabled="preview.existingLists.length === 0">Merge into existing list</option>
              </select>

              <input
                v-if="mappings[folder.name].action === 'new'"
                v-model="mappings[folder.name].newListName"
                type="text"
                placeholder="List name"
                class="flex-1 bg-bg border border-border-strong rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-accent"
              />

              <select
                v-else
                v-model="mappings[folder.name].targetList"
                class="flex-1 bg-bg border border-border-strong rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-accent"
              >
                <option v-for="list in preview.existingLists" :key="list" :value="list">{{ list }}</option>
              </select>
            </div>

            <details v-if="folder.categories.length > 0" class="mt-2">
              <summary class="text-xs text-muted cursor-pointer hover:text-text">
                Categories ({{ folder.categories.length }})
              </summary>
              <ul class="mt-1 text-xs text-muted space-y-0.5 max-h-32 overflow-y-auto pl-1">
                <li v-for="cat in folder.categories" :key="cat">{{ cat }}</li>
              </ul>
            </details>
          </div>
        </div>

        <div v-if="preview.rootBookmarks > 0" class="border border-border rounded-lg p-3 mb-4">
          <div class="flex items-baseline justify-between gap-3 mb-2">
            <div class="font-medium text-sm text-text">Loose bookmarks (no folder)</div>
            <div class="text-xs text-muted">{{ preview.rootBookmarks }} {{ preview.rootBookmarks === 1 ? 'bookmark' : 'bookmarks' }}</div>
          </div>
          <input
            v-model="rootList"
            type="text"
            placeholder="List name (default: Imported)"
            class="w-full bg-bg border border-border-strong rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-accent"
          />
        </div>

        <p v-if="errorMsg" class="text-sm text-danger-fg mb-3">{{ errorMsg }}</p>

        <div class="flex gap-3 justify-end">
          <button
            type="button"
            class="px-4 py-1.5 rounded-lg text-sm text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-50"
            :disabled="submitting"
            @click="step = 'upload'"
          >
            Back
          </button>
          <button
            type="button"
            :disabled="submitting"
            class="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-accent-fg text-sm font-medium transition-colors"
            @click="submitCommit"
          >
            {{ submitting ? 'Importing…' : 'Import' }}
          </button>
        </div>
      </div>

      <!-- Success step -->
      <div v-else-if="step === 'success' && result" class="p-5 overflow-y-auto">
        <div class="text-center py-4">
          <svg class="size-10 mx-auto text-accent mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-base text-text font-medium">Imported {{ result.inserted }} {{ result.inserted === 1 ? 'bookmark' : 'bookmarks' }}.</p>
          <p class="text-sm text-muted mt-1">
            <span v-if="result.skippedDuplicates > 0">
              Skipped {{ result.skippedDuplicates }} {{ result.skippedDuplicates === 1 ? 'duplicate' : 'duplicates' }}.
            </span>
            <span v-if="result.listsCreated > 0">
              Created {{ result.listsCreated }} new {{ result.listsCreated === 1 ? 'list' : 'lists' }}.
            </span>
          </p>
        </div>
        <div class="flex justify-end mt-3">
          <button
            type="button"
            class="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition-colors"
            @click="emit('close')"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
