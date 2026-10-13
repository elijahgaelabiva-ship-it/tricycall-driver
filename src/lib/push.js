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
// subscription so the server can push to it. Returns 'granted' | 'denied' | 'unsupported' | 'error'.
// Call it from a tap (e.g. going Online) so the browser allows the permission prompt.
export async function enablePush(driverId) {
  try {
    if (!pushSupported()) return 'unsupported'

    const permission =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission
    if (permission !== 'granted') return permission

    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      })
    }

    const { error } = await supabase.from('push_subscriptions').upsert({
      endpoint: subscription.endpoint,
      driver_id: driverId,
      subscription: subscription.toJSON(),
    })
    if (error) {
      console.log('Save subscription error:', error)
      return 'error'
    }
    return 'granted'
  } catch (err) {
    console.log('Push setup error:', err)
    return 'error'
  }
}
