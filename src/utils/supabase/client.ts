// import { createBrowserClient } from '@supabase/ssr'
// import { Database } from '../../../database.types'

// export function createClient() {
//   return createBrowserClient<Database>(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
//   )
// }

// lib/supabase/client.ts



// import { createBrowserClient } from '@supabase/ssr'
// import { Database } from '../../../database.types'

// export function createClient() {
//   return createBrowserClient<Database>(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // 公開キー (ブラウザで使う)
//   )
// }

// utils/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '../../../database.types'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // まず ANON_KEY を探し、なければ PUBLISHABLE_KEY を使う
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !anonKey) {
    console.error("Supabase env missing:", { url, anonKey })
    throw new Error(
      "@supabase/ssr: Your project's URL and API key are required to create a Supabase client!\n" +
      "Check your Supabase project's API settings and ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) are set."
    )
  }

  return createBrowserClient<Database>(url, anonKey)
}
