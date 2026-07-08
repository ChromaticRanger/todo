import { ref } from 'vue'

// Shared flag: true while any category item (todo / bookmark / note) is being
// dragged, anywhere. Grid-mode drop zones use it to stay collapsed at rest —
// so a category holding only bookmarks isn't padded out by an empty
// non-bookmark zone — yet expand into droppable targets the instant a drag
// begins, including drags that started in a different category card.
const dragging = ref(false)

export function useItemDrag() {
  return { dragging }
}
