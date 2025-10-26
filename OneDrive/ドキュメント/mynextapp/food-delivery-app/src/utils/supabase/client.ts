// import { createBrowserClient } from '@supabase/ssr'
// import { Database } from '../../../database.types'

// export function createClient() {
//   return createBrowserClient<Database>(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
//   )
// }

// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '../../../database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // 公開キー (ブラウザで使う)
  )
}