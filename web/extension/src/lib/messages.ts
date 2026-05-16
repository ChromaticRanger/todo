// Messages exchanged between content script and background worker.
// Kept in one place so both ends stay in sync.

export const TOKEN_MESSAGE_TYPE = 'stash-squirrel-token'

export interface TokenFromPage {
  type: typeof TOKEN_MESSAGE_TYPE
  token: string
  expiresAt: string | number
}

export type RuntimeMessage =
  | { kind: 'token-received'; token: string; expiresAt: string | number }
  | { kind: 'token-cleared' }
