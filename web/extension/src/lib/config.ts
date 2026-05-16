// Where the web app + API lives, switched at build time.
// `import.meta.env.DEV` is true when running `vite` (dev), false for prod builds.
const isDev = import.meta.env.DEV

export const WEB_ORIGIN = isDev
  ? 'http://localhost:5173'
  : 'https://stashsquirrel.com'

// In dev the Vite dev server proxies /api, but the extension makes
// cross-origin requests directly from chrome-extension://, so we hit Express
// on :3001 ourselves. In prod, the API and the page share an origin.
export const API_ORIGIN = isDev
  ? 'http://localhost:3001'
  : 'https://stashsquirrel.com'

export const CONNECT_URL = `${WEB_ORIGIN}/connect-extension`
