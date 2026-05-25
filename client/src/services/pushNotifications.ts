import { subscribePush } from './api';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Request notification permission, register the service worker, subscribe to
 * Web Push, and persist the subscription. Returns whether a subscription was
 * established. Never throws.
 */
export async function requestAndSubscribe(): Promise<{ subscribed: boolean }> {
  try {
    if (
      typeof Notification === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      return { subscribed: false };
    }

    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted' || !VAPID) return { subscribed: false };

    const reg =
      (await navigator.serviceWorker.getRegistration('/sw.js')) ??
      (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;

    const existing = await reg.pushManager.getSubscription();
    const subscription =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID),
      }));

    await subscribePush(subscription.toJSON());
    return { subscribed: true };
  } catch {
    return { subscribed: false };
  }
}
