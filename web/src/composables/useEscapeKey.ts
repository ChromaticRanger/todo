import { onMounted, onUnmounted } from 'vue'

export function useEscapeKey(handler: () => void) {
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handler()
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown))
}
