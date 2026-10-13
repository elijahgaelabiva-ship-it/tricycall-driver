import { supabase } from '@/lib/supabase'

// Uploads a camera photo (Blob) as the driver's profile picture.
// Returns { url } on success or { error } on failure.
export async function uploadAvatar(userId, blob) {
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
