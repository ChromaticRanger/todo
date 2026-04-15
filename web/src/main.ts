import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { useSettingsStore } from './stores/settingsStore'

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)

// Apply cached theme before mount to prevent flash of default theme
useSettingsStore().loadFromCache()

app.mount('#app')
