"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/components/providers/auth-provider"
import { ChatInterface } from "@/components/chat/chat-interface"
import { ArrowRight, Sparkles, Shield, Zap } from "lucide-react"
import Link from "next/link"

export default function Home() {
  const { user, loading } = useAuth()

  // If user is authenticated, show the chat interface
  if (user && !loading) {
    return (
      <div className="h-[calc(100vh-8rem)]">
        <ChatInterface />
      </div>
    )
  }

  // Show welcome screen for guests
  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <img src="/coinmind-logo.svg" alt="Coinmind" className="w-16 h-16 mr-4" />
            <span className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              Coinmind
            </span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            AI-Powered Personal Finance Tracker
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Track your finances with natural language. Chat your way to better financial health.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle>AI-Powered</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Chat with AI to categorize expenses, analyze spending patterns, and get personalized financial insights.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle>Secure & Private</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Your financial data stays private and secure. Sign up to sync across devices or try as a guest.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Zap className="h-5 w-5 text-primary" />
                <CardTitle>Lightning Fast</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Get instant insights and real-time tracking with our optimized AI chat interface.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/auth/signup">
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href="/auth/login">
              Sign In
            </Link>
          </Button>
          
          <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
            <Link href="/dashboard">
              Try as Guest
            </Link>
          </Button>
        </div>

        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>
            By continuing, you agree to our{" "}
            <Link href="#" className="text-primary hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="#" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
} 