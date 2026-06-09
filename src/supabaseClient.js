import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

const client = createClient(supabaseUrl, supabaseAnonKey)

function withTimeout(promise, milliseconds, fallback) {
  let timeoutId
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), milliseconds)
  })

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

const auth = new Proxy(client.auth, {
  get(target, prop) {
    if (prop === 'getSession') {
      return (...args) => withTimeout(
        target.getSession(...args),
        6000,
        { data: { session: null }, error: null },
      )
    }

    if (prop === 'signInWithPassword') {
      return (...args) => withTimeout(
        target.signInWithPassword(...args),
        15000,
        { data: null, error: new Error('Sign in timed out. Check your connection and try again.') },
      )
    }

    if (prop === 'signUp') {
      return (...args) => withTimeout(
        target.signUp(...args),
        15000,
        { data: null, error: new Error('Sign up timed out. Check your connection and try again.') },
      )
    }

    const value = target[prop]
    return typeof value === 'function' ? value.bind(target) : value
  },
})

export const supabase = new Proxy(client, {
  get(target, prop) {
    if (prop === 'auth') return auth
    const value = target[prop]
    return typeof value === 'function' ? value.bind(target) : value
  },
})
