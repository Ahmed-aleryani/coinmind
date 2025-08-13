import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CurrencyProvider } from "@/components/providers/currency-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Navigation } from "@/components/layout/navigation";
import { Toaster } from "@/components/ui/sonner";
import { HotjarProvider } from "@/components/providers/hotjar-provider";
import { BetaBanner } from "@/components/ui/beta-banner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_BASE_URL || "https://www.coinmind-ai.com"),
  title: "AI-Powered Personal Finance Tracker",
  description: "Track your finances with natural language. Chat your way to better financial health.",
  keywords: [
    "Coinmind",
    "personal finance",
    "AI",
    "finance copilot",
    "budgeting",
    "expense tracking",
    "multi-currency",
    "receipts OCR",
    "analytics",
    "CSV export",
    "Excel export",
  ],
  authors: [{ name: "Coinmind" }],
  openGraph: {
    title: "AI-Powered Personal Finance Tracker",
    description: "Track your finances with natural language. Chat your way to better financial health.",
    url: "/",
    siteName: "Coinmind",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Coinmind — AI Finance Copilot",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI-Powered Personal Finance Tracker",
    description: "Track your finances with natural language. Chat your way to better financial health.",
    images: ["/opengraph-image"],
  },
  // File-based icons are provided via src/app/icon.svg and src/app/favicon.ico
  category: "finance",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased min-h-screen bg-background font-sans`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <CurrencyProvider>
              <div className="relative flex min-h-screen flex-col">
                <HotjarProvider />
                <BetaBanner />
                <Header />
                <main className="flex-1 pb-16 md:pb-0">
                  {children}
                </main>
                <Navigation />
              </div>
              <Toaster />
            </CurrencyProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
