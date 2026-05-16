import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [vue(), tailwindcss(), crx({ manifest })],
  server: {
    port: 5174,
    strictPort: true,
    hmr: { port: 5174 },
  },
})
