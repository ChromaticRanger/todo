import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { useSettingsStore } from './stores/settingsStore'
import { useListPrefsStore } from './stores/listPrefsStore'

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)

// Apply cached theme/list-prefs before mount to prevent a flash of defaults
useSettingsStore().loadFromCache()
useListPrefsStore().loadFromCache()

app.mount('#app')
