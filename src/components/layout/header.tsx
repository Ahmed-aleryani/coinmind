"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: "📊" },
  { name: "Transactions", href: "/transactions", icon: "📋" },
];

export function Header() {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        
        {/* Mobile Menu Button */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9 mr-3"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 sm:w-96">
            {/* Mobile Sheet Header */}
            <div className="flex items-center space-x-3 mb-8">
              <img src="/coinmind-logo.svg" alt="Coinmind" className="w-8 h-8" />
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                Coinmind
              </span>
            </div>
            
            {/* Mobile Navigation */}
            <nav className="flex flex-col space-y-2">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-accent hover:text-accent-foreground ${
                    pathname === item.href
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  <span className="mr-3 text-lg">{item.icon}</span>
                  {item.name}
                </Link>
              ))}
            </nav>
            
            {/* Mobile Footer */}
            <div className="absolute bottom-6 left-6 right-6">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>© 2024 Coinmind</span>
                <span>v1.0.0</span>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Desktop Logo and Navigation - Hidden on Mobile */}
        <div className="hidden md:flex items-center">
          <Link href="/" className="flex items-center space-x-3 mr-8">
            <img src="/coinmind-logo.svg" alt="Coinmind" className="w-8 h-8" />
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              Coinmind
            </span>
          </Link>
          
          {/* Desktop Navigation */}
          <nav className="flex items-center space-x-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 hover:bg-accent hover:text-accent-foreground ${
                  pathname === item.href
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                <span className="mr-2">{item.icon}</span>
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        {/* Mobile Logo (centered) - Only visible on mobile */}
        <div className="flex-1 flex justify-center md:hidden">
          <Link href="/" className="flex items-center space-x-2">
            <img src="/coinmind-logo.svg" alt="Coinmind" className="w-7 h-7" />
            <span className="text-lg font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              Coinmind
            </span>
          </Link>
        </div>

        {/* Right side actions */}
        <div className="flex items-center space-x-2 ml-auto">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="h-9 w-9"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </header>
  );
} 