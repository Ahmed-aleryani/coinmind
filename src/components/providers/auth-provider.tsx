"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { User } from "@supabase/supabase-js"
import { supabaseClient } from "@/lib/auth-client"
import Cookies from "js-cookie"

interface AuthContextType {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
  signInAnonymously: () => Promise<void>
  isAnonymous: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Check if user is anonymous (no email and provider is anonymous)
  const isAnonymous = !user?.email && user?.app_metadata?.provider === 'anonymous'

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession()
        setUser(session?.user ?? null)
        const uid = session?.user?.id
        if (uid) {
          Cookies.set("cm_uid", uid, { expires: 7, sameSite: "lax" })
        } else {
          Cookies.remove("cm_uid")
        }
      } catch (error) {
        console.error("Error getting initial session:", error)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)

        // Persist user id in cookie for server routes to read
        const userId = session?.user?.id
        if (userId) {
          Cookies.set("cm_uid", userId, { expires: 7, sameSite: "lax" })
        } else {
          Cookies.remove("cm_uid")
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signInAnonymously = async () => {
    try {
      const { data, error } = await supabaseClient.auth.signInAnonymously()
      if (error) {
        console.error("Anonymous sign-in failed:", error)
        throw error
      }
      console.log("Anonymous sign-in successful:", data.user?.id)
    } catch (error) {
      console.error("Error signing in anonymously:", error)
      throw error
    }
  }

  const signOut = async () => {
    try {
      await supabaseClient.auth.signOut()
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut, signInAnonymously, isAnonymous }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
} 