"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { DateRange } from "react-day-picker";
import {
  formatCurrency,
  formatDate,
  getCategoryEmoji,
} from "@/lib/utils/formatters";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar as CalendarIcon,
  Target,
  ArrowUpDown,
  Filter,
  ChevronDown,
  ChevronUp,
  PieChart as PieChartIcon,
  BarChart3,
  LineChart as LineChartIcon,
  Eye,
  EyeOff,
  User,
  Lock,
  Mail,
  UserIcon,
  MessageCircle,
  List,
} from "lucide-react";
import { CurrencyInfo } from "@/components/ui/currency-info";
import { useCurrency } from "@/components/providers/currency-provider";
import { useAuth } from "@/components/providers/auth-provider";
import logger from "@/lib/utils/logger";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabaseClient } from "@/lib/auth-client";

interface Transaction {
  id: string;
  date: Date;
  amount: number;
  vendor: string;
  description: string;
  category: string;
  type: "income" | "expense";
  // Multi-currency fields
  originalAmount?: number;
  originalCurrency?: string;
  convertedAmount?: number;
  convertedCurrency?: string;
  conversionRate?: number;
  conversionFee?: number;
}

interface CategoryStat {
  category: string;
  expenseAmount: number;
  incomeAmount: number;
  expenseCount: number;
  incomeCount: number;
  totalAmount: number;
  expensePercentage: number;
  incomePercentage: number;
  netAmount: number;
}



interface CashFlowData {
  date: string;
  income: number;
  expenses: number;
  net: number;
}

type TimePeriod = "week" | "month" | "year" | "custom";
type ChartType = "bar" | "line" | "area" | "pie";
type CategoryView = "all" | "expenses" | "income";

const CHART_COLORS = [
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7c7c",
  "#8dd1e1",
  "#d084d0",
  "#ff7300",
  "#00ff00",
];

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [cashFlowData, setCashFlowData] = useState<CashFlowData[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("month");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [categoryView, setCategoryView] = useState<CategoryView>("all");
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSignupOpen, setIsSignupOpen] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupFullName, setSignupFullName] = useState("");
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState<string | null>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const { defaultCurrency } = useCurrency();

  // Filter transactions based on selected time period and categories
  useEffect(() => {
    const { start, end } = getDateRange();

    const filtered = transactions.filter((t) => {
      const transactionDate = new Date(t.date);
      const isInDateRange = transactionDate >= start && transactionDate <= end;
      const isInCategory =
        selectedCategories.length === 0 ||
        selectedCategories.includes(t.category);
      return isInDateRange && isInCategory;
    });

    setFilteredTransactions(filtered);
  }, [transactions, timePeriod, customDateRange, selectedCategories]);

  // Generate cash flow data for the selected period
  useEffect(() => {
    const { start, end } = getDateRange();
    const daysDiff = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );

    const cashFlowMap = new Map<string, { income: number; expenses: number }>();

    // Initialize all dates in range
    for (let i = 0; i <= daysDiff; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dateKey = date.toISOString().split("T")[0];
      cashFlowMap.set(dateKey, { income: 0, expenses: 0 });
    }

    // Add transaction data
    filteredTransactions.forEach((t) => {
      const dateKey = new Date(t.date).toISOString().split("T")[0];
      const existing = cashFlowMap.get(dateKey);
      if (existing) {
        const amount = t.convertedAmount || t.amount;
        if (t.type === "income") {
          existing.income += amount;
        } else {
          existing.expenses += Math.abs(amount);
        }
      }
    });

    const cashFlowArray = Array.from(cashFlowMap.entries()).map(
      ([date, data]) => ({
        date,
        income: data.income,
        expenses: data.expenses,
        net: data.income - data.expenses,
      })
    );

    setCashFlowData(cashFlowArray);
  }, [filteredTransactions, timePeriod, customDateRange]);

  // Generate category statistics
  useEffect(() => {
    const categoryMap = new Map<
      string,
      {
        expenseAmount: number;
        incomeAmount: number;
        expenseCount: number;
        incomeCount: number;
      }
    >();

    filteredTransactions.forEach((t) => {
      const existing = categoryMap.get(t.category) || {
        expenseAmount: 0,
        incomeAmount: 0,
        expenseCount: 0,
        incomeCount: 0,
      };

      const amount = t.convertedAmount || t.amount;

      if (t.type === "income") {
        existing.incomeAmount += amount;
        existing.incomeCount += 1;
      } else {
        existing.expenseAmount += Math.abs(amount);
        existing.expenseCount += 1;
      }

      categoryMap.set(t.category, existing);
    });

    const fetchedTotalExpenses = filteredTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Math.abs(t.convertedAmount || t.amount), 0);

    const fetchedTotalIncome = filteredTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + (t.convertedAmount || t.amount), 0);

    const categoryStatsArray = Array.from(categoryMap.entries()).map(
      ([category, data]) => ({
        category,
        expenseAmount: data.expenseAmount,
        incomeAmount: data.incomeAmount,
        expenseCount: data.expenseCount,
        incomeCount: data.incomeCount,
        totalAmount: data.expenseAmount + data.incomeAmount,
        expensePercentage:
          fetchedTotalExpenses > 0
            ? (data.expenseAmount / fetchedTotalExpenses) * 100
            : 0,
        incomePercentage:
          fetchedTotalIncome > 0
            ? (data.incomeAmount / fetchedTotalIncome) * 100
            : 0,
        netAmount: data.incomeAmount - data.expenseAmount,
      })
    );

    setCategoryStats(categoryStatsArray);
  }, [filteredTransactions]);

  // Fetch data on mount and when currency or selected period changes
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        logger.info({ defaultCurrency, timePeriod, hasCustomRange: Boolean(customDateRange?.from && customDateRange?.to) }, "Fetching dashboard data");

        const response = await fetch(
          `/api/transactions?currency=${defaultCurrency}&limit=1000&offset=0&t=${Date.now()}`
        );
        const data = await response.json();

        if (data.success) {
          const parsedTransactions = data.data.map((t: any) => ({
            ...t,
            date: new Date(t.date),
          }));

          setTransactions(parsedTransactions);
          logger.info(
            {
              defaultCurrency,
              success: data.success,
              transactionCount: data.data?.length || 0,
            },
            "Dashboard data fetched successfully"
          );
        } else {
          logger.error(
            { defaultCurrency, error: data.error },
            "Failed to fetch dashboard data"
          );
        }
      } catch {
        logger.error(
          { defaultCurrency },
          "Error fetching dashboard data"
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (defaultCurrency) {
      fetchData();
    }
  }, [defaultCurrency, timePeriod, customDateRange]);

  // Get date range based on selected time period
  const getDateRange = useCallback(() => {
    const now = new Date();
    const start = new Date();

    switch (timePeriod) {
      case "week":
        start.setDate(now.getDate() - 7);
        break;
      case "month":
        start.setMonth(now.getMonth() - 1);
        break;
      case "year":
        start.setFullYear(now.getFullYear() - 1);
        break;
      case "custom":
        if (customDateRange?.from && customDateRange?.to) {
          return { start: customDateRange.from, end: customDateRange.to };
        }
        start.setMonth(now.getMonth() - 1);
        break;
    }

    return { start, end: now };
  }, [timePeriod, customDateRange]);

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated (no user at all)
  if (!user) {
    return null; // Component will unmount and redirect
  }

  // Summary stats - use converted amounts for calculations
  const totalIncome = filteredTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + (t.convertedAmount || t.amount), 0);

  const totalExpenses = filteredTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Math.abs(t.convertedAmount || t.amount), 0);

  const netAmount = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netAmount / totalIncome) * 100 : 0;
  const totalWealth = totalIncome + Math.abs(totalExpenses); // Total money flow

  logger.info(
    {
      totalIncome,
      totalExpenses,
      netAmount,
      savingsRate,
      currency: defaultCurrency,
      transactionCount: filteredTransactions.length,
    },
    "Dashboard calculations completed"
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        setLoginError(error.message);
      } else {
        setIsLoginOpen(false);
        setLoginEmail("");
        setLoginPassword("");
      }
    } catch {
      setLoginError("An unexpected error occurred");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupLoading(true);
    setSignupError(null);
    setSignupMessage(null);

    if (signupPassword !== signupConfirmPassword) {
      setSignupError("Passwords do not match");
      setSignupLoading(false);
      return;
    }

    if (signupPassword.length < 6) {
      setSignupError("Password must be at least 6 characters long");
      setSignupLoading(false);
      return;
    }

    try {
      const { error } = await supabaseClient.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          data: {
            full_name: signupFullName,
          },
        },
      });

      if (error) {
        setSignupError(error.message);
      } else {
        setSignupMessage("Check your email for the confirmation link!");
        setSignupEmail("");
        setSignupPassword("");
        setSignupConfirmPassword("");
        setSignupFullName("");
      }
    } catch {
      setSignupError("An unexpected error occurred");
    } finally {
      setSignupLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordLoading(true);
    setForgotPasswordMessage(null);

    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(forgotPasswordEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      });

      if (error) {
        setForgotPasswordMessage(`Error: ${error.message}`);
      } else {
        setForgotPasswordMessage("Check your email for the password reset link!");
        setForgotPasswordEmail("");
      }
    } catch {
      setForgotPasswordMessage("An unexpected error occurred");
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'github' | 'apple') => {
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/`,
        },
      });

      if (error) {
        console.error(`${provider} sign-in error:`, error.message);
      }
    } catch {
      console.error(`${provider} sign-in error occurred`);
    }
  };

  // Show guest message if no user is authenticated
  if (!user) {
    return (
      <div className="p-6 space-y-6">
        <Card className="border-dashed">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center mb-4">
              <User className="h-12 w-12 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">Welcome to Coinmind</CardTitle>
            <CardDescription>
              You&apos;re currently browsing as a guest. Explore the app and try our features!
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button asChild variant="outline" className="w-full">
                <Link href="/transactions">
                  <List className="mr-2 h-4 w-4" />
                  View Transactions
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Go to Chat
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Login Modal */}
        <Dialog open={isLoginOpen} onOpenChange={setIsLoginOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                <img src="/coinmind-logo.svg" alt="Coinmind" className="w-12 h-12" />
              </div>
              <DialogTitle className="text-2xl font-bold">Welcome back</DialogTitle>
              <DialogDescription>
                Sign in to your account to continue
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* OAuth Buttons */}
              <div className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => handleOAuthSignIn('google')}
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => handleOAuthSignIn('github')}
                >
                  <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  Continue with GitHub
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => handleOAuthSignIn('apple')}
                >
                  <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  Continue with Apple
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              {/* Email/Password Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                {loginError && (
                  <Alert variant="destructive">
                    <AlertDescription>{loginError}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="Enter your email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type={showLoginPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                    >
                      {showLoginPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="link"
                    className="px-0 text-sm"
                    onClick={() => {
                      setIsLoginOpen(false);
                      setIsForgotPasswordOpen(true);
                    }}
                  >
                    Forgot password?
                  </Button>
                </div>

                <Button type="submit" className="w-full" disabled={loginLoading}>
                  {loginLoading ? "Signing in..." : "Sign in"}
                </Button>
              </form>

              <div className="text-center text-sm">
                Don&apos;t have an account?{" "}
                <Button
                  variant="link"
                  className="px-0"
                  onClick={() => {
                    setIsLoginOpen(false);
                    setIsSignupOpen(true);
                  }}
                >
                  Sign up
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Signup Modal */}
        <Dialog open={isSignupOpen} onOpenChange={setIsSignupOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                <img src="/coinmind-logo.svg" alt="Coinmind" className="w-12 h-12" />
              </div>
              <DialogTitle className="text-2xl font-bold">Create your account</DialogTitle>
              <DialogDescription>
                Sign up to start tracking your finances
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* OAuth Buttons */}
              <div className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => handleOAuthSignIn('google')}
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => handleOAuthSignIn('github')}
                >
                  <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  Continue with GitHub
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => handleOAuthSignIn('apple')}
                >
                  <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  Continue with Apple
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              {/* Email/Password Form */}
              <form onSubmit={handleSignup} className="space-y-4">
                {signupError && (
                  <Alert variant="destructive">
                    <AlertDescription>{signupError}</AlertDescription>
                  </Alert>
                )}
                {signupMessage && (
                  <Alert>
                    <AlertDescription>{signupMessage}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Enter your full name"
                      value={signupFullName}
                      onChange={(e) => setSignupFullName(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="Enter your email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type={showSignupPassword ? "text" : "password"}
                      placeholder="Create a password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                    >
                      {showSignupPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-confirm-password"
                      type={showSignupConfirmPassword ? "text" : "password"}
                      placeholder="Confirm your password"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowSignupConfirmPassword(!showSignupConfirmPassword)}
                    >
                      {showSignupConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={signupLoading}>
                  {signupLoading ? "Creating account..." : "Create account"}
                </Button>
              </form>

              <div className="text-center text-sm">
                Already have an account?{" "}
                <Button
                  variant="link"
                  className="px-0"
                  onClick={() => {
                    setIsSignupOpen(false);
                    setIsLoginOpen(true);
                  }}
                >
                  Sign in
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Forgot Password Modal */}
        <Dialog open={isForgotPasswordOpen} onOpenChange={setIsForgotPasswordOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                <img src="/coinmind-logo.svg" alt="Coinmind" className="w-12 h-12" />
              </div>
              <DialogTitle className="text-2xl font-bold">Reset your password</DialogTitle>
              <DialogDescription>
                Enter your email address and we&apos;ll send you a link to reset your password
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleForgotPassword} className="space-y-4">
              {forgotPasswordMessage && (
                <Alert variant={forgotPasswordMessage.startsWith('Error') ? "destructive" : "default"}>
                  <AlertDescription>{forgotPasswordMessage}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="forgot-password-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="forgot-password-email"
                    type="email"
                    placeholder="Enter your email"
                    value={forgotPasswordEmail}
                    onChange={(e) => setForgotPasswordEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={forgotPasswordLoading}>
                {forgotPasswordLoading ? "Sending..." : "Send reset link"}
              </Button>
            </form>

            <div className="text-center text-sm">
              Remember your password?{" "}
              <Button
                variant="link"
                className="px-0"
                onClick={() => {
                  setIsForgotPasswordOpen(false);
                  setIsLoginOpen(true);
                }}
              >
                Sign in
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-0 pb-2">
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Financial Dashboard</h1>
          <p className="text-muted-foreground">
            Your financial overview for {formatDate(new Date(), "long")}
          </p>
        </div>
        {/* Filters Toggle Button */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className="flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
            Filters
            {isFiltersExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Collapsible Filters Section */}
      <div className="space-y-3">
        {/* Active Filters Indicator */}
        <div className="w-full flex justify-end">
          {(selectedCategories.length > 0 || timePeriod !== "month") && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {selectedCategories.length > 0 &&
                  `${selectedCategories.length} categories`}
                {selectedCategories.length > 0 &&
                  timePeriod !== "month" &&
                  " • "}
                {timePeriod !== "month" && timePeriod}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedCategories([]);
                  setTimePeriod("month");
                  setCustomDateRange(undefined);
                }}
                className="h-6 px-2 text-xs text-muted-foreground"
              >
                Clear
              </Button>
            </div>
          )}
        </div>
        {/* Expandable Filters Content */}
        {isFiltersExpanded && (
          <Card className="border-dashed animate-in slide-in-from-top-2 duration-200">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                {/* Time Period Filter */}
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={timePeriod}
                    onValueChange={(value: TimePeriod) => setTimePeriod(value)}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">Last Week</SelectItem>
                      <SelectItem value="month">Last Month</SelectItem>
                      <SelectItem value="year">Last Year</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Categories Quick Filter */}
                <div className="flex items-center gap-2 flex-1">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-wrap gap-1">
                    {Array.from(new Set(transactions.map((t) => t.category)))
                      .sort()
                      .slice(0, 8)
                      .map((category) => (
                        <Button
                          key={category}
                          variant={
                            selectedCategories.includes(category)
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() => {
                            if (selectedCategories.includes(category)) {
                              setSelectedCategories(
                                selectedCategories.filter((c) => c !== category)
                              );
                            } else {
                              setSelectedCategories([
                                ...selectedCategories,
                                category,
                              ]);
                            }
                          }}
                          className="h-7 px-2 text-xs"
                        >
                          <span className="mr-1">
                            {getCategoryEmoji(category)}
                          </span>
                          {category}
                        </Button>
                      ))}
                    {Array.from(new Set(transactions.map((t) => t.category)))
                      .length > 8 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const allCategories = Array.from(
                            new Set(transactions.map((t) => t.category))
                          );
                          if (
                            selectedCategories.length === allCategories.length
                          ) {
                            setSelectedCategories([]);
                          } else {
                            setSelectedCategories(allCategories);
                          }
                        }}
                        className="h-7 px-2 text-xs text-muted-foreground"
                      >
                        {selectedCategories.length ===
                        Array.from(new Set(transactions.map((t) => t.category)))
                          .length
                          ? "Clear All"
                          : `+${
                              Array.from(
                                new Set(transactions.map((t) => t.category))
                              ).length - 8
                            } more`}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Custom Date Range - Only show when custom is selected */}
              {timePeriod === "custom" && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-dashed">
                  <div className="flex-1">
                    <input
                      type="date"
                      placeholder="From"
                      value={
                        customDateRange?.from
                          ? customDateRange.from.toISOString().split("T")[0]
                          : ""
                      }
                      onChange={(e) => {
                        const fromDate = e.target.value
                          ? new Date(e.target.value)
                          : undefined;
                        setCustomDateRange((prev) => ({
                          from: fromDate,
                          to: prev?.to,
                        }));
                      }}
                      className="w-full h-8 px-2 text-xs border rounded bg-background"
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="date"
                      placeholder="To"
                      value={
                        customDateRange?.to
                          ? customDateRange.to.toISOString().split("T")[0]
                          : ""
                      }
                      onChange={(e) => {
                        const toDate = e.target.value
                          ? new Date(e.target.value)
                          : undefined;
                        setCustomDateRange((prev) => ({
                          from: prev?.from,
                          to: toDate,
                        }));
                      }}
                      className="w-full h-8 px-2 text-xs border rounded bg-background"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalIncome, { currency: defaultCurrency })}
            </div>
            <p className="text-xs text-muted-foreground">
              +{filteredTransactions.filter((t) => t.type === "income").length}{" "}
              transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Expenses
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalExpenses, { currency: defaultCurrency })}
            </div>
            <p className="text-xs text-muted-foreground">
              {filteredTransactions.filter((t) => t.type === "expense").length}{" "}
              transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Cash Flow</CardTitle>
            <DollarSign className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                netAmount >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(netAmount, { currency: defaultCurrency })}
            </div>
            <p className="text-xs text-muted-foreground">
              {netAmount >= 0 ? "Surplus" : "Deficit"} this period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Wealth</CardTitle>
            <Target className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalWealth, { currency: defaultCurrency })}
            </div>
            <Progress
              value={Math.max(0, Math.min(100, savingsRate))}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {savingsRate.toFixed(1)}% savings rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Currency Conversion Summary */}
      {(() => {
        const multiCurrencyTransactions = transactions.filter(
          (t) =>
            t.originalAmount &&
            t.originalAmount !== (t.convertedAmount || t.amount)
        );

        if (multiCurrencyTransactions.length > 0) {
          const totalConversionFees = multiCurrencyTransactions.reduce(
            (sum, t) => sum + (t.conversionFee || 0),
            0
          );
          const avgConversionRate =
            multiCurrencyTransactions.reduce(
              (sum, t) => sum + (t.conversionRate || 1),
              0
            ) / multiCurrencyTransactions.length;

          return (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpDown className="h-5 w-5" />
                  Multi-Currency Summary
                </CardTitle>
                <CardDescription>
                  Overview of transactions in different currencies
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {multiCurrencyTransactions.length}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Multi-currency transactions
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(totalConversionFees, {
                        currency: defaultCurrency,
                      })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Total conversion fees
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {avgConversionRate.toFixed(4)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Average conversion rate
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        }
        return null;
      })()}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cash Flow Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {chartType === "bar" && <BarChart3 className="h-5 w-5" />}
                {chartType === "line" && <LineChartIcon className="h-5 w-5" />}
                {chartType === "area" && <LineChartIcon className="h-5 w-5" />}
                {chartType === "pie" && <PieChartIcon className="h-5 w-5" />}
                <CardTitle>Cash Flow Overview</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium flex items-center gap-1">
                  <BarChart3 className="h-3 w-3" />
                  Chart Type
                </label>
                <Select
                  value={chartType}
                  onValueChange={(value: ChartType) => setChartType(value)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">Bar Chart</SelectItem>
                    <SelectItem value="line">Line Chart</SelectItem>
                    <SelectItem value="area">Area Chart</SelectItem>
                    <SelectItem value="pie">Pie Chart</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <CardDescription>
              Income vs Expenses over the selected period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              {(() => {
                if (chartType === "bar") {
                  return (
                    <BarChart data={cashFlowData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number) => [
                          formatCurrency(value, { currency: defaultCurrency }),
                          "",
                        ]}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Bar dataKey="income" fill="#10b981" name="Income" />
                      <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
                    </BarChart>
                  );
                }
                if (chartType === "line") {
                  return (
                    <LineChart data={cashFlowData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number) => [
                          formatCurrency(value, { currency: defaultCurrency }),
                          "",
                        ]}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="income"
                        stroke="#10b981"
                        name="Income"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="expenses"
                        stroke="#ef4444"
                        name="Expenses"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="net"
                        stroke="#3b82f6"
                        name="Net"
                        strokeWidth={2}
                      />
                    </LineChart>
                  );
                }
                if (chartType === "area") {
                  return (
                    <AreaChart data={cashFlowData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number) => [
                          formatCurrency(value, { currency: defaultCurrency }),
                          "",
                        ]}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="income"
                        stackId="1"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.6}
                      />
                      <Area
                        type="monotone"
                        dataKey="expenses"
                        stackId="1"
                        stroke="#ef4444"
                        fill="#ef4444"
                        fillOpacity={0.6}
                      />
                    </AreaChart>
                  );
                }
                if (chartType === "pie") {
                  return (
                    <PieChart>
                      <Pie
                        data={[
                          {
                            name: "Income",
                            value: totalIncome,
                            color: "#10b981",
                          },
                          {
                            name: "Expenses",
                            value: totalExpenses,
                            color: "#ef4444",
                          },
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) =>
                          `${name}: ${formatCurrency(value, {
                            currency: defaultCurrency,
                          })}`
                        }
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {[
                          {
                            name: "Income",
                            value: totalIncome,
                            color: "#10b981",
                          },
                          {
                            name: "Expenses",
                            value: totalExpenses,
                            color: "#ef4444",
                          },
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [
                          formatCurrency(value, { currency: defaultCurrency }),
                          "Amount",
                        ]}
                      />
                    </PieChart>
                  );
                }
                // Default to bar chart if no valid chart type
                return (
                  <BarChart data={cashFlowData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => [
                        formatCurrency(value, { currency: defaultCurrency }),
                        "",
                      ]}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Bar dataKey="income" fill="#10b981" name="Income" />
                    <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
                  </BarChart>
                );
              })()}
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PieChartIcon className="h-5 w-5" />
                <CardTitle>Category Breakdown</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium flex items-center gap-1">
                  <PieChartIcon className="h-3 w-3" />
                  Category View
                </label>
                <Select
                  value={categoryView}
                  onValueChange={(value: CategoryView) =>
                    setCategoryView(value)
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="expenses">Expenses Only</SelectItem>
                    <SelectItem value="income">Income Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <CardDescription>Income and expenses by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Chart Container */}
              <div className="relative">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryStats
                        .filter((stat) => {
                          if (categoryView === "expenses")
                            return stat.expenseAmount > 0;
                          if (categoryView === "income")
                            return stat.incomeAmount > 0;
                          return true; // 'all' view
                        })
                        .map((stat) => ({
                          ...stat,
                          amount:
                            categoryView === "expenses"
                              ? stat.expenseAmount
                              : categoryView === "income"
                              ? stat.incomeAmount
                              : stat.totalAmount,
                        }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ category, amount }) =>
                        `${category}: ${formatCurrency(amount, {
                          currency: defaultCurrency,
                        })}`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="amount"
                    >
                      {categoryStats
                        .filter((stat) => {
                          if (categoryView === "expenses")
                            return stat.expenseAmount > 0;
                          if (categoryView === "income")
                            return stat.incomeAmount > 0;
                          return true;
                        })
                        .map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [
                        formatCurrency(value, { currency: defaultCurrency }),
                        categoryView === "expenses"
                          ? "Expense Amount"
                          : categoryView === "income"
                          ? "Income Amount"
                          : "Total Amount",
                      ]}
                      contentStyle={{
                        backgroundColor: "rgba(0, 0, 0, 0.8)",
                        border: "none",
                        borderRadius: "8px",
                        color: "white",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Enhanced Category Legend */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Category Details</h4>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Total:{" "}
                      {formatCurrency(
                        categoryStats
                          .filter((stat) => {
                            if (categoryView === "expenses")
                              return stat.expenseAmount > 0;
                            if (categoryView === "income")
                              return stat.incomeAmount > 0;
                            return true;
                          })
                          .reduce(
                            (sum, stat) =>
                              sum +
                              (categoryView === "expenses"
                                ? stat.expenseAmount
                                : categoryView === "income"
                                ? stat.incomeAmount
                                : stat.totalAmount),
                            0
                          ),
                        { currency: defaultCurrency }
                      )}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {categoryStats
                    .filter((stat) => {
                      if (categoryView === "expenses")
                        return stat.expenseAmount > 0;
                      if (categoryView === "income")
                        return stat.incomeAmount > 0;
                      return true;
                    })
                    .map((stat, index) => {
                      const amount =
                        categoryView === "expenses"
                          ? stat.expenseAmount
                          : categoryView === "income"
                          ? stat.incomeAmount
                          : stat.totalAmount;
                      let percentage = 0;
                      if (categoryView === "expenses") {
                        percentage = stat.expensePercentage;
                      } else if (categoryView === "income") {
                        percentage = stat.incomePercentage;
                      } else {
                        // For 'all' view, calculate percentage based on total amount
                        const totalAmount = categoryStats.reduce(
                          (sum, s) => sum + s.totalAmount,
                          0
                        );
                        percentage =
                          totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
                      }

                      return (
                        <div
                          key={stat.category}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{
                                backgroundColor:
                                  CHART_COLORS[index % CHART_COLORS.length],
                              }}
                            />
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {getCategoryEmoji(stat.category)}
                              </span>
                              <div>
                                <div className="font-medium text-sm">
                                  {stat.category}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {percentage.toFixed(1)}% •{" "}
                                  {stat.expenseCount + stat.incomeCount}{" "}
                                  transaction
                                  {stat.expenseCount + stat.incomeCount !== 1
                                    ? "s"
                                    : ""}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-sm">
                              {formatCurrency(amount, {
                                currency: defaultCurrency,
                              })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {stat.expenseAmount > 0 &&
                              stat.incomeAmount > 0 ? (
                                <span>
                                  +
                                  {formatCurrency(stat.incomeAmount, {
                                    currency: defaultCurrency,
                                  })}{" "}
                                  / -
                                  {formatCurrency(stat.expenseAmount, {
                                    currency: defaultCurrency,
                                  })}
                                </span>
                              ) : (
                                <span>
                                  {stat.incomeAmount > 0 ? "Income" : "Expense"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Summary Stats */}
              {categoryView === "all" && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(
                        categoryStats.reduce(
                          (sum, stat) => sum + stat.incomeAmount,
                          0
                        ),
                        { currency: defaultCurrency }
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Total Income
                    </div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950/20">
                    <div className="text-lg font-bold text-red-600">
                      {formatCurrency(
                        categoryStats.reduce(
                          (sum, stat) => sum + stat.expenseAmount,
                          0
                        ),
                        { currency: defaultCurrency }
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Total Expenses
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Spending Trends Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Spending Trends Analysis
          </CardTitle>
          <CardDescription>
            Insights into your spending patterns and financial health
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Average Daily Spending */}
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(
                  totalExpenses /
                    Math.max(
                      1,
                      filteredTransactions.filter((t) => t.type === "expense")
                        .length
                    ),
                  { currency: defaultCurrency }
                )}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Average per Transaction
              </div>
              <div className="text-xs text-muted-foreground">
                {
                  filteredTransactions.filter((t) => t.type === "expense")
                    .length
                }{" "}
                expense transactions
              </div>
            </div>

            {/* Top Spending Category */}
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {categoryStats.length > 0 ? categoryStats[0].category : "N/A"}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Top Spending Category
              </div>
              <div className="text-xs text-muted-foreground">
                {categoryStats.length > 0
                  ? `${categoryStats[0].expensePercentage.toFixed(
                      1
                    )}% of total expenses`
                  : ""}
              </div>
            </div>

            {/* Savings Rate */}
            <div className="text-center p-4 border rounded-lg">
              <div
                className={`text-2xl font-bold ${
                  savingsRate >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {savingsRate.toFixed(1)}%
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Savings Rate
              </div>
              <div className="text-xs text-muted-foreground">
                {savingsRate >= 0 ? "Positive cash flow" : "Negative cash flow"}
              </div>
            </div>
          </div>

          {/* Spending Insights */}
          <div className="mt-6 space-y-4">
            <h4 className="text-sm font-medium">Key Insights</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium">
                    Income Distribution
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {
                    filteredTransactions.filter((t) => t.type === "income")
                      .length
                  }{" "}
                  income transactions totaling{" "}
                  {formatCurrency(totalIncome, { currency: defaultCurrency })}
                </p>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span className="text-sm font-medium">
                    Expense Distribution
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {
                    filteredTransactions.filter((t) => t.type === "expense")
                      .length
                  }{" "}
                  expense transactions totaling{" "}
                  {formatCurrency(totalExpenses, { currency: defaultCurrency })}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Your latest financial activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredTransactions.slice(0, 10).map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className="text-xl">
                    {getCategoryEmoji(transaction.category)}
                  </div>
                  <div>
                    <div className="font-medium">{transaction.description}</div>
                    <div className="text-sm text-muted-foreground">
                      {transaction.vendor} • {formatDate(transaction.date)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`font-semibold ${
                      transaction.type === "income"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {transaction.type === "income" ? "+" : "-"}
                    {formatCurrency(
                      Math.abs(
                        transaction.convertedAmount || transaction.amount
                      ),
                      { currency: defaultCurrency }
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs">
                        {transaction.category}
                      </Badge>
                      {transaction.originalCurrency &&
                        transaction.originalCurrency !==
                          (transaction.convertedCurrency ||
                            defaultCurrency) && (
                          <Badge variant="secondary" className="text-xs">
                            {transaction.originalCurrency}
                          </Badge>
                        )}
                    </div>
                    <CurrencyInfo
                      originalAmount={transaction.originalAmount}
                      originalCurrency={transaction.originalCurrency}
                      convertedAmount={
                        transaction.convertedAmount || transaction.amount
                      }
                      convertedCurrency={transaction.convertedCurrency}
                      conversionRate={transaction.conversionRate}
                      conversionFee={transaction.conversionFee}
                      className="text-right"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
