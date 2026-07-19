// Normalizes Philippine mobile numbers to 09XXXXXXXXX format
export function normalizePhone(raw) {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length === 12) {
    digits = '0' + digits.slice(2)
  }
  return digits
}

// Valid PH mobile: starts with 09, 11 digits total
export function isValidPhone(phone) {
  return /^09\d{9}$/.test(phone)
}

// Builds a fake internal email so we can keep using Supabase's
// email/password auth under the hood, while users only ever see a phone number.
export function phoneToAuthEmail(phone) {
  return `${phone}@tricycall.local`
}