'use server'

import { createClient } from "@/utils/supabase/server"
import { redirect } from 'next/navigation'

import { headers } from 'next/headers'

export async function login() {
  //google login
  const supabase = await createClient()
  const headersList = await headers()
  const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  })
  if (error) {
    console.error(error);
  }

  if (data.url) {
    redirect(data.url) // use the redirect API for your server framework
  }
}

export async function logout() {
  const supabase = await createClient()
  let { error } = await supabase.auth.signOut();
  if (error) {
    console.error(error);
  }

  redirect("/login")
}

