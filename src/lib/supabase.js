import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// iOS Safari (Private Browsing, "Block All Cookies", or low storage) can throw
// when the app tries to use localStorage. Left unhandled, that crashes the
// whole app with a blank white screen. This wrapper catches that and falls
// back to a temporary in-memory store instead, so the app keeps working
// (session just won't persist between visits on that device).
function createSafeStorage() {
  let memoryStore = {}

  const isLocalStorageAvailable = () => {
    try {
      const testKey = '__tricycall_test__'
      window.localStorage.setItem(testKey, '1')
      window.localStorage.removeItem(testKey)
      return true
    } catch {
      return false
    }
  }

  const useLocalStorage = typeof window !== 'undefined' && isLocalStorageAvailable()

  return {
    getItem: (key) => {
      try {
        return useLocalStorage ? window.localStorage.getItem(key) : memoryStore[key] ?? null
      } catch {
        return memoryStore[key] ?? null
      }
    },
    setItem: (key, value) => {
      try {
        if (useLocalStorage) {
          window.localStorage.setItem(key, value)
        } else {
          memoryStore[key] = value
        }
      } catch {
        memoryStore[key] = value
      }
    },
    removeItem: (key) => {
      try {
        if (useLocalStorage) {
          window.localStorage.removeItem(key)
        } else {
          delete memoryStore[key]
        }
      } catch {
        delete memoryStore[key]
      }
    },
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: typeof window !== 'undefined' ? createSafeStorage() : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
})