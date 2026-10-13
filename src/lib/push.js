import { supabase } from '@/lib/supabase'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// Asks permission (if needed), subscribes this device, and saves the
// subscription so the server can push to it.
// Always returns { ok: boolean, message: string } so the UI can show what happened.
// Call it from a tap so the browser allows the permission prompt.
export async function enablePush(driverId) {
  try {
    if (!pushSupported()) {
      return { ok: false, message: 'This browser does not support push notifications.' }
    }

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) {
      return { ok: false, message: 'Missing VAPID public key in the app build.' }
    }

    const permission =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission
    if (permission !== 'granted') {
      return {
        ok: false,
        message:
          permission === 'denied'
            ? 'Notifications are blocked. Tap the lock icon by the address, open Permissions, and set Notifications to Allow.'
            : 'Notification permission was not given.',
      }
    }

    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
    }

    const { error } = await supabase.from('push_subscriptions').upsert({
      endpoint: subscription.endpoint,
      driver_id: driverId,
      subscription: subscription.toJSON(),
    })
    if (error) {
      return { ok: false, message: `Could not save subscription: ${error.message}` }
    }
    return { ok: true, message: 'Notifications are on for this phone.' }
  } catch (err) {
    return { ok: false, message: `Push setup failed: ${err?.name || 'Error'} - ${err?.message || err}` }
  }
}
