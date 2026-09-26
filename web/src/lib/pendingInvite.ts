/**
 * A share invite token parked across the sign-in / sign-up round trip.
 *
 * Someone following an invite link usually has no account yet, and the trip
 * through auth loses the URL — so `/invite` stashes the token before sending
 * them off and App.vue redeems it when they come back authenticated.
 *
 * sessionStorage, not localStorage: an invite abandoned mid-signup should die
 * with the tab rather than silently join the user to a list weeks later.
 */

const KEY = 'stash.pendingInviteToken'

export function stashPendingInvite(token: string): void {
  try {
    sessionStorage.setItem(KEY, token)
  } catch {
    // Private mode or blocked site data. The invite isn't lost — the emailed
    // link still works once they're signed in.
  }
}

/** Reads and clears in one step, so a failed redeem can't loop forever. */
export function takePendingInvite(): string | null {
  try {
    const token = sessionStorage.getItem(KEY)
    if (token) sessionStorage.removeItem(KEY)
    return token
  } catch {
    return null
  }
}
