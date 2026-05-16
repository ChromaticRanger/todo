// Background service worker.
//
// Sole job today: take token-received messages from the connect content
// script and persist them. Kept thin — popup talks to chrome.storage.local
// directly via lib/auth.ts.

import { setToken } from '../lib/auth'
import type { RuntimeMessage } from '../lib/messages'

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message?.kind === 'token-received' && typeof message.token === 'string') {
    setToken(message.token, message.expiresAt)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }))
    return true // keep the channel open for the async response
  }
  return undefined
})
