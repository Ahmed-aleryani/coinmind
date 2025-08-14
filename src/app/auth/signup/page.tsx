"use client"

import { useState, Suspense } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { supabaseClient } from "@/lib/auth-client"
import { getAppBaseUrl } from "@/lib/utils"
import { useSearchParams } from "next/navigation"
import { Mail, Lock, Github, Chrome, User } from "lucide-react"
import Link from "next/link"

const SignupSchema = z.object({
  fullName: z.string().min(1, { message: "Full name is required" }),
  email: z.string().email({ message: "Please enter a valid email" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  confirmPassword: z.string().min(6, { message: "Confirm your password" }),
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match",
})

function SignupForm() {
  const form = useForm<z.infer<typeof SignupSchema>>({
    resolver: zodResolver(SignupSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  })
  const [message, setMessage] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirectTo") || "/dashboard"

  const onSubmit = async (values: z.infer<typeof SignupSchema>) => {
    setMessage(null)
    try {
      const { error } = await supabaseClient.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: { full_name: values.fullName },
          // NOTE: The URL used in emailRedirectTo must be whitelisted in your Supabase project's dashboard
          // under "Site URL" or "Redirect URLs" for email confirmation links to work as expected.
          emailRedirectTo: `${getAppBaseUrl()}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        },
      })
      if (error) {
        form.setError("root", { message: error.message })
        return
      }
      setMessage("Check your email for the confirmation link!")
    } catch {
      form.setError("root", { message: "An unexpected error occurred" })
    }
  }

  const handleOAuthSignup = async (provider: 'github' | 'google') => {
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${getAppBaseUrl()}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        },
      })
      if (error) {
        form.setError("root", { message: error.message })
      }
    } catch {
      form.setError("root", { message: "An unexpected error occurred" })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <img src="/coinmind-logo.svg" alt="Coinmind" className="w-12 h-12 mr-3 dark:invert" />
            <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              Coinmind
            </span>
          </div>
          <CardTitle className="text-2xl text-center">Create an account</CardTitle>
          <CardDescription className="text-center">
            Sign up to start tracking your finances
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.formState.errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
            </Alert>
          )}

          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <FormLabel htmlFor="fullName">Full Name</FormLabel>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input id="fullName" type="text" placeholder="Enter your full name" className="pl-10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <FormLabel htmlFor="email">Email</FormLabel>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input id="email" type="email" placeholder="Enter your email" className="pl-10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <FormLabel htmlFor="password">Password</FormLabel>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input id="password" type="password" placeholder="Create a password" className="pl-10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <FormLabel htmlFor="confirmPassword">Confirm Password</FormLabel>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input id="confirmPassword" type="password" placeholder="Confirm your password" className="pl-10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating account..." : "Create account"}
              </Button>
            </form>
          </Form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <Button
              variant="outline"
              onClick={() => handleOAuthSignup('google')}
              disabled={form.formState.isSubmitting}
              className="w-full"
            >
              <Chrome className="mr-2 h-4 w-4" />
              Google
            </Button>
          </div>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <Link href="/auth/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </div>

          <div className="text-center">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              Continue as guest
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </CardContent>
        </Card>
      </div>
    }>
      <SignupForm />
    </Suspense>
  )
} 