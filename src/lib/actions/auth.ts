'use server'

import { createClientAction } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function signOut() {
  const supabase = await createClientAction()
  await supabase.auth.signOut()
  redirect('/')
}

export async function signIn(formData: FormData) {
  const supabase = await createClientAction()

  // type-cast since we know these exist
  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    redirect('/auth/login?message=Could not authenticate user')
  }

  redirect('/dashboard')
}

export async function signUp(formData: FormData) {
  const supabase = await createClientAction()

  // type-cast since we know these exist
  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signUp(data)

  if (error) {
    redirect('/auth/signup?message=Could not authenticate user')
  }

  redirect('/auth/signup?message=Check email to continue sign in process')
} 