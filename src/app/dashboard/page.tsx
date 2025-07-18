"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { CurrencyInfo } from "@/components/ui/currency-info";
import { useCurrency } from "@/components/providers/currency-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";
import logger from "@/lib/utils/logger";
import Link from "next/link";

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

interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
  net: number;
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
  const [filteredTransactions, setFilteredTransactions] = useState<
    Transaction[]
  >([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [cashFlowData, setCashFlowData] = useState<CashFlowData[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("month");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(
    undefined
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [categoryView, setCategoryView] = useState<CategoryView>("all");
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const {
    defaultCurrency,
    supportedCurrencies,
    isCurrencyLoading,
    setDefaultCurrency,
  } = useCurrency();
  const { user, loading: authLoading } = useAuth();

  const handleCurrencyChange = async (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newCurrency = e.target.value;
    logger.info({ newCurrency }, "Currency changed in dashboard");
    setIsLoading(true); // Show loading state while refetching data
    await setDefaultCurrency(newCurrency);
    logger.info(
      { newCurrency },
      "Currency update completed, useEffect should trigger"
    );
    // The useEffect will automatically refetch data when defaultCurrency changes
  };

  // Get date range based on selected time period
  const getDateRange = () => {
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
  };

  // Filter transactions based on selected time period and categories
  useEffect(() => {
    const { start, end } = getDateRange();

    let filtered = transactions.filter((t) => {
      const transactionDate = new Date(t.date);
      const isInDateRange = transactionDate >= start && transactionDate <= end;
      const isInCategory =
        selectedCategories.length === 0 ||
        selectedCategories.includes(t.category);
      return isInDateRange && isInCategory;
    });

    setFilteredTransactions(filtered);
  }, [transactions, timePeriod, customDateRange, selectedCategories]);

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

    const categoryArray = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
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
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    setCategoryStats(categoryArray);
  }, [filteredTransactions]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        logger.info(
          { defaultCurrency },
          "Fetching dashboard data for currency"
        );
        // Fetch transactions converted to the selected default currency with cache busting
        const response = await fetch(
          `/api/transactions?currency=${defaultCurrency}&t=${Date.now()}`
        );
        const data = await response.json();

        logger.info(
          {
            defaultCurrency,
            success: data.success,
            transactionCount: data.data?.length || 0,
          },
          "Dashboard API response received"
        );

        if (data.success) {
          const parsedTransactions = data.data.map((t: any) => ({
            ...t,
            date: new Date(t.date),
          }));
          logger.debug(
            {
              defaultCurrency,
              transactionCount: parsedTransactions.length,
              sampleTransaction: parsedTransactions[0],
              incomeTransactions: parsedTransactions
                .filter((t: Transaction) => t.type === "income")
                .map((t: Transaction) => ({
                  amount: t.convertedAmount || t.amount,
                  originalAmount: t.originalAmount,
                  originalCurrency: t.originalCurrency,
                })),
            },
            "Parsed transactions for dashboard"
          );
          setTransactions(parsedTransactions);

          // Generate monthly data (last 6 months)
          const monthlyMap = new Map<
            string,
            { income: number; expenses: number }
          >();
          const now = new Date();

          for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthKey = date.toLocaleDateString("en-US", {
              month: "short",
              year: "2-digit",
            });
            monthlyMap.set(monthKey, { income: 0, expenses: 0 });
          }

          parsedTransactions.forEach((t: Transaction) => {
            const monthKey = t.date.toLocaleDateString("en-US", {
              month: "short",
              year: "2-digit",
            });
            const existing = monthlyMap.get(monthKey);
            if (existing) {
              const amount = t.convertedAmount || t.amount;
              if (t.type === "income") {
                existing.income += amount;
              } else {
                existing.expenses += Math.abs(amount);
              }
            }
          });

          const monthlyArray = Array.from(monthlyMap.entries()).map(
            ([month, data]) => ({
              month,
              income: data.income,
              expenses: data.expenses,
              net: data.income - data.expenses,
            })
          );

          setMonthlyData(monthlyArray);

          // Generate category stats
          const categoryMap = new Map<
            string,
            { amount: number; count: number }
          >();
          const expenseTransactions = parsedTransactions.filter(
            (t: Transaction) => t.type === "expense"
          );

          expenseTransactions.forEach((t: Transaction) => {
            const existing = categoryMap.get(t.category) || {
              amount: 0,
              count: 0,
            };
            const amount = t.convertedAmount || t.amount;
            existing.amount += Math.abs(amount);
            existing.count += 1;
            categoryMap.set(t.category, existing);
          });

          // Calculate total expenses from the fetched data
          const fetchedTotalExpenses = expenseTransactions.reduce(
            (sum: number, t: Transaction) =>
              sum + Math.abs(t.convertedAmount || t.amount),
            0
          );

          const categoryArray = Array.from(categoryMap.entries())
            .map(([category, data]) => ({
              category,
              expenseAmount: data.amount,
              incomeAmount: 0,
              expenseCount: data.count,
              incomeCount: 0,
              totalAmount: data.amount,
              expensePercentage:
                fetchedTotalExpenses > 0
                  ? (data.amount / fetchedTotalExpenses) * 100
                  : 0,
              incomePercentage: 0,
              netAmount: -data.amount,
            }))
            .sort((a, b) => b.totalAmount - a.totalAmount);

          setCategoryStats(categoryArray);
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [defaultCurrency]);

  // Show loading state while auth is loading
  if (authLoading) {
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
              You're currently browsing as a guest. Sign in to save your data and access all features.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild>
                <Link href="/auth/signup">
                  Create Account
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/auth/login">
                  Sign In
                </Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Your data will be saved locally for this session. Sign in to sync across devices.
            </p>
          </CardContent>
        </Card>
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
