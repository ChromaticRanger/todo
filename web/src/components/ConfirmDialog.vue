<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useEscapeKey } from '../composables/useEscapeKey'

defineProps<{ message: string }>()
const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const cancelBtn = ref<HTMLButtonElement | null>(null)
onMounted(() => cancelBtn.value?.focus())
useEscapeKey(() => emit('cancel'))
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
      <p class="text-gray-100 mb-6">{{ message }}</p>
      <div class="flex gap-3 justify-end">
        <button
          ref="cancelBtn"
          class="px-4 py-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
          @click="emit('confirm')"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
