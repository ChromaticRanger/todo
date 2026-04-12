import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('auth_token'))

  const isAuthenticated = computed(() => !!token.value)

  async function login(username: string, password: string): Promise<boolean> {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) return false
    const data = await res.json() as { token: string }
    token.value = data.token
    localStorage.setItem('auth_token', data.token)
    return true
  }

  function logout() {
    token.value = null
    localStorage.removeItem('auth_token')
  }

  return { token, isAuthenticated, login, logout }
})
