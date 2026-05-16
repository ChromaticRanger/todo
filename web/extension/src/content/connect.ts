// Content script injected only on /connect-extension. The page postMessages
// a freshly minted bearer token to its own window; we relay it to the
// background worker which stores it in chrome.storage.local.
//
// Security: we only trust messages whose source is this window AND whose
// origin matches the page we were injected into. Without those checks any
// third-party iframe or browser-side script could feed us a token.

import { TOKEN_MESSAGE_TYPE, type TokenFromPage, type RuntimeMessage } from '../lib/messages'

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.origin !== window.location.origin) return

  const data = event.data as Partial<TokenFromPage> | null
  if (!data || data.type !== TOKEN_MESSAGE_TYPE) return
  if (typeof data.token !== 'string' || !data.token) return

  const msg: RuntimeMessage = {
    kind: 'token-received',
    token: data.token,
    expiresAt: data.expiresAt ?? '',
  }
  chrome.runtime.sendMessage(msg).catch(() => {
    // Background may not be ready in edge cases; the page can retry by
    // hitting "Try again" which re-issues the postMessage.
  })
})
