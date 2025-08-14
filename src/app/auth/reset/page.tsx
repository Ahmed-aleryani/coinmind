"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { supabaseClient } from "@/lib/auth-client"
import { getAppBaseUrl } from "@/lib/utils"
import { Mail } from "lucide-react"
import Link from "next/link"

export default function ResetRequestPage() {
  const [message, setMessage] = useState<string | null>(null)
  const ResetSchema = z.object({
    email: z.string().email({ message: "Please enter a valid email" }),
  })
  const form = useForm<z.infer<typeof ResetSchema>>({
    resolver: zodResolver(ResetSchema),
    defaultValues: { email: "" },
  })

  const onSubmit = async (values: z.infer<typeof ResetSchema>) => {
    setMessage(null)
    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(values.email, {
        redirectTo: `${getAppBaseUrl()}/auth/callback?next=/auth/reset-password`,
      })
      if (error) {
        form.setError("root", { message: error.message })
        return
      }
      setMessage("If an account exists for this email, we've sent a reset link.")
      form.reset()
    } catch {
      form.setError("root", { message: "An unexpected error occurred" })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-2">
            <img src="/coinmind-logo.svg" alt="Coinmind" className="w-10 h-10 mr-2 dark:invert" />
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              Coinmind
            </span>
          </div>
          <CardTitle className="text-2xl text-center">Reset your password</CardTitle>
          <CardDescription className="text-center">
            Enter your email to receive a password reset link
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
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Sending..." : "Send reset link"}
              </Button>
            </form>
          </Form>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">Remembered your password? </span>
            <Link href="/auth/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


