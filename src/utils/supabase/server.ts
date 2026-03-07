import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '../../../database.types'

export async function createClient() {
  const cookieStore = await cookies()

  try {
    const names = cookieStore.getAll().map(c => c.name)
    // console.log('[createClient] cookie names:', names)
  } catch (e) {
    // console.error('[createClient] cookie list error', e)
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          try {
            return cookieStore.getAll()
          } catch {
            return []
          }
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (error) {
            // Next.js may throw when setting cookies in certain contexts (like Server Components or specific Action flows)
            // We ignore it here to prevent the "Server Components render" crash
            console.warn('[Supabase/Server] Failed to set cookies:', error instanceof Error ? error.message : error);
          }
        },
      },
    }
  )
}