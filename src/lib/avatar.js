import { supabase } from '@/lib/supabase'

// Saves a camera photo (Blob) for the driver.
//
// - Not yet approved (registration): the photo becomes the profile picture
//   right away. Returns { url }.
// - Approved driver: the live photo is locked, so the new photo is saved as a
//   pending photo that an admin must approve. Returns { pending: true }.
//
// Returns { error } on failure.
export async function uploadAvatar(userId, blob) {
  const { data: driver } = await supabase
    .from('drivers')
    .select('is_approved')
    .eq('id', userId)
    .maybeSingle()

  if (driver?.is_approved) return uploadPendingAvatar(userId, blob)

  const filePath = `${userId}/avatar.jpg`

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(filePath, blob, { upsert: true, contentType: 'image/jpeg' })
  if (uploadErr) return { error: uploadErr.message }

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
  // Cache-busting timestamp so a retaken photo shows immediately
  const url = `${data.publicUrl}?t=${Date.now()}`

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', userId)
  if (updateErr) return { error: updateErr.message }

  return { url }
}

async function uploadPendingAvatar(userId, blob) {
  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(`${userId}/pending.jpg`, blob, { upsert: true, contentType: 'image/jpeg' })
  if (uploadErr) return { error: uploadErr.message }

  const at = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ pending_avatar_at: at })
    .eq('id', userId)
  if (updateErr) return { error: updateErr.message }

  return { pending: true, pendingAt: at }
}
