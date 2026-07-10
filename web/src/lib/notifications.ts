// Thin wrapper around the browser Notification API. Native notifications are a
// best-effort enhancement to the in-app due toasts: they surface reminders when
// the tab is backgrounded, but everything degrades gracefully when the API is
// missing, blocked, or the context is insecure (non-HTTPS, non-localhost).

const ICON = '/stash-squirrel.svg'

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : 'denied'
}

/**
 * Ask the browser for notification permission. Must be called from a user
 * gesture (e.g. flipping the settings toggle) or the browser ignores it. A
 * prior grant/deny is sticky and cannot be re-prompted, so we short-circuit.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/** Fire a native OS notification. No-op unless permission has been granted. */
export function showNativeNotification(title: string, body: string): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, icon: ICON })
  } catch {
    // Some engines throw if notifications are only allowed from a service
    // worker; the in-app toast still covers the user, so swallow it.
  }
}
