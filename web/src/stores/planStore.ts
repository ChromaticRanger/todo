import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiFetch } from '../lib/api'

export interface PlanStatus {
  tier: 'free' | 'pro' | null
  listCount: number
  itemCount: number
  limits: { maxLists: number; maxItems: number }
  overListCap: boolean
  overItemCap: boolean
}

export const usePlanStore = defineStore('plan', () => {
  const status = ref<PlanStatus | null>(null)

  const limits = computed(() => status.value?.limits ?? null)
  const tier = computed(() => status.value?.tier ?? null)

  const atListCap = computed(() => {
    const s = status.value
    return !!s && s.tier === 'free' && s.listCount >= s.limits.maxLists
  })
  const atItemCap = computed(() => {
    const s = status.value
    return !!s && s.tier === 'free' && s.itemCount >= s.limits.maxItems
  })

  async function refresh() {
    try {
      const res = await apiFetch('/api/plan/status')
      if (!res.ok) return
      status.value = await res.json()
    } catch {
      // non-fatal
    }
  }

  function reset() {
    status.value = null
  }

  return { status, limits, tier, atListCap, atItemCap, refresh, reset }
})
