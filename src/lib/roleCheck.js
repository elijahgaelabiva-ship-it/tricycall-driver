import { supabase } from '@/lib/supabase'

// One phone number can only have one account, and each app is for one kind of
// account. These helpers stop (for example) a driver account from using the
// passenger app, and vice versa.

export function wrongRoleMessage(actualRole, expectedRole) {
  if (actualRole === 'driver') {
    return 'This number is registered as a driver account. Please use the TRICYCALL driver app. To book rides, register a different phone number as a passenger.'
  }
  if (actualRole === 'passenger') {
    return 'This number is registered as a passenger account. Please use the TRICYCALL passenger app. To drive, register a different phone number as a driver.'
  }
  if (actualRole === 'admin') {
    return 'This is an admin account. Please use the TRICYCALL admin app.'
  }
  return `This account is not set up as a ${expectedRole} account. Please register again or contact support.`
}

// Checks the signed-in user has the role this app is for. If not, signs them
// out and returns the message to show. Returns null when everything is fine
// (or when the check could not be completed, so a network hiccup never logs
// anyone out).
export async function enforceRole(userId, expectedRole) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (error) return null
  if (profile && profile.role === expectedRole) return null

  await supabase.auth.signOut()
  return wrongRoleMessage(profile?.role, expectedRole)
}
