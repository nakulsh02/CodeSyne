/**
 * Utility module for handling browser system notifications cleanly.
 * Sends polite, non-spammy notifications for important milestones like auth login, PWA install, and project creation.
 */

export function requestNotificationPermission(): void {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      try {
        Notification.requestPermission().catch(() => {});
      } catch (e) {
        // Fallback for older browsers
      }
    }
  }
}

export function sendBrowserNotification(key: string, title: string, body: string, icon = '/icon.svg'): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  // Prevent sending duplicate notifications for the same key in a single session
  const sessionKey = `codesyne_notif_sent_${key}`;
  if (sessionStorage.getItem(sessionKey)) return;

  try {
    const notification = new Notification(title, {
      body,
      icon,
      badge: icon,
      tag: key,
      silent: false,
    });

    sessionStorage.setItem(sessionKey, 'true');

    // Automatically close notification after 5 seconds to avoid desktop clutter
    setTimeout(() => {
      try {
        notification.close();
      } catch {
        // Ignore if already dismissed
      }
    }, 5000);
  } catch (err) {
    console.warn('[Notification System] Could not dispatch native notification:', err);
  }
}

export function getDeviceFileAccessState(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('codesyne_file_access_granted') === 'true';
}

export function setDeviceFileAccessState(granted: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('codesyne_file_access_granted', granted ? 'true' : 'false');
  if (granted) {
    sendBrowserNotification(
      'file_access_granted_notif',
      'Device File Access Enabled 📁',
      'CodeSyne is now authorized to sync, store, and export project files to your device storage.'
    );
  }
}
