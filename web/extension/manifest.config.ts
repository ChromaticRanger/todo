import { defineManifest } from '@crxjs/vite-plugin'

// Branch on Vite mode so the dev build also activates on the local Vite dev
// server (http://localhost:5173) and lets the popup hit the local API server
// on :3001. Production builds only know about https://stash-squirrel.com.
export default defineManifest(({ mode }) => {
  const isDev = mode !== 'production'

  const prodHosts = ['https://stash-squirrel.com/*']
  const devHosts = [
    'http://localhost:5173/*',
    'http://localhost:3001/*',
    'http://localhost:5174/*', // crxjs/Vite HMR endpoint
  ]

  const prodConnect = ['https://stash-squirrel.com/connect-extension*']
  const devConnect = ['http://localhost:5173/connect-extension*']

  return {
    manifest_version: 3,
    name: isDev ? 'Stash Squirrel (dev)' : 'Stash Squirrel',
    description: 'Save the page you\'re viewing to a Stash Squirrel list.',
    version: '0.1.0',
    action: {
      default_popup: 'src/popup/index.html',
      default_title: 'Stash Squirrel',
    },
    background: {
      service_worker: 'src/background/index.ts',
      type: 'module',
    },
    permissions: ['activeTab', 'storage'],
    host_permissions: isDev ? [...prodHosts, ...devHosts] : prodHosts,
    content_scripts: [
      {
        matches: isDev ? [...prodConnect, ...devConnect] : prodConnect,
        js: ['src/content/connect.ts'],
        run_at: 'document_end',
      },
    ],
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  }
})
