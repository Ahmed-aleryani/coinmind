"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/formatters";
import { TransactionCategory, TransactionType } from "@/lib/types/transaction";
import {
  getCurrencyConversionHistory,
  getCurrencyPairs,
  generateExchangeRateData,
  getConversionStats,
  getConversionTrends,
  getCurrencyExposure,
  getConversionEfficiency,
  type CurrencyConversionHistory,
  type CurrencyPair,
} from "@/lib/utils/currency-history";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  PieChart as PieChartIcon,
} from "lucide-react";

interface ApiTransaction {
  id: string;
  date: string;
  amount: number;
  currency?: string;
  vendor: string;
  description: string;
  category?: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  originalAmount?: number;
  originalCurrency?: string;
  convertedAmount?: number;
  convertedCurrency?: string;
  conversionRate?: number;
  conversionFee?: number;
}

interface Transaction {
  id: string;
  date: Date;
  amount: number;
  currency: string;
  vendor: string;
  description: string;
  category: TransactionCategory;
  type: TransactionType;
  createdAt: Date;
  updatedAt: Date;
  originalAmount?: number;
  originalCurrency?: string;
  convertedAmount?: number;
  convertedCurrency?: string;
  conversionRate?: number;
  conversionFee?: number;
}

const CHART_COLORS = [
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7c7c",
  "#8dd1e1",
  "#d084d0",
];

export default function CurrencyAnalyticsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [conversionHistory, setConversionHistory] = useState<
    CurrencyConversionHistory[]
  >([]);
  const [currencyPairs, setCurrencyPairs] = useState<CurrencyPair[]>([]);
  const [selectedPair, setSelectedPair] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/transactions");
        const data = await response.json();

        if (data.success) {
          const parsedTransactions: Transaction[] = data.data.map(
            (t: ApiTransaction) => ({
              ...t,
              date: new Date(t.date),
              createdAt: new Date(t.createdAt || t.date),
              updatedAt: new Date(t.updatedAt || t.date),
              currency: t.currency || "USD",
              category: (t.category as TransactionCategory) || "Other",
              type: (t.type as TransactionType) || "expense",
            })
          );
          setTransactions(parsedTransactions);

          // Generate conversion history
          const history = getCurrencyConversionHistory(parsedTransactions);
          setConversionHistory(history);

          // Get currency pairs
          const pairs = getCurrencyPairs(history);
          setCurrencyPairs(pairs);

          if (pairs.length > 0) {
            setSelectedPair(pairs[0].label);
          }
        }
      } catch (error) {
        console.error("Error fetching analytics data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const conversionStats = getConversionStats(conversionHistory);
  const conversionTrends = getConversionTrends(conversionHistory, 7);
  const currencyExposure = getCurrencyExposure(transactions);
  const conversionEfficiency = getConversionEfficiency(conversionHistory);

  const selectedPairData = currencyPairs.find((p) => p.label === selectedPair);
  const exchangeRateData = selectedPairData
    ? generateExchangeRateData(
        conversionHistory,
        selectedPairData.from,
        selectedPairData.to,
        30
      )
    : [];

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
          <div className="h-64 bg-muted rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Currency Analytics</h1>
        <p className="text-muted-foreground">
          Advanced insights into your multi-currency transactions
        </p>
      </div>

      {/* Conversion Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Conversions
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {conversionStats.totalConversions}
            </div>
            <p className="text-xs text-muted-foreground">
              Currency conversions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(conversionStats.totalVolume)}
            </div>
            <p className="text-xs text-muted-foreground">Converted amount</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {conversionStats.averageRate.toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground">
              Average conversion rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Efficiency</CardTitle>
            <TrendingDown className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {conversionEfficiency.efficiency}%
            </div>
            <p className="text-xs text-muted-foreground">Rate efficiency</p>
          </CardContent>
        </Card>
      </div>

      {/* Exchange Rate Chart */}
      {exchangeRateData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Exchange Rate Trends
            </CardTitle>
            <CardDescription>
              Historical exchange rates for selected currency pair
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Select value={selectedPair} onValueChange={setSelectedPair}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select currency pair" />
                </SelectTrigger>
                <SelectContent>
                  {currencyPairs.map((pair) => (
                    <SelectItem key={pair.label} value={pair.label}>
                      {pair.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={exchangeRateData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip
                  formatter={(value: number) => [value.toFixed(4), "Rate"]}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="#8884d8"
                  strokeWidth={2}
                  name="Exchange Rate"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Conversion Trends */}
      {conversionTrends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Conversion Trends (Last 7 Days)
            </CardTitle>
            <CardDescription>
              Daily conversion activity and volume
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={conversionTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    name === "conversions" ? value : formatCurrency(value),
                    name === "conversions" ? "Conversions" : "Volume",
                  ]}
                />
                <Bar
                  yAxisId="left"
                  dataKey="conversions"
                  fill="#8884d8"
                  name="Conversions"
                />
                <Bar
                  yAxisId="right"
                  dataKey="volume"
                  fill="#82ca9d"
                  name="Volume"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Currency Exposure */}
      {currencyExposure.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5" />
              Currency Exposure
            </CardTitle>
            <CardDescription>
              Distribution of your money across different currencies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={currencyExposure}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ currency, amount }) =>
                      `${currency}: ${formatCurrency(Math.abs(amount))}`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="amount"
                  >
                    {currencyExposure.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [
                      formatCurrency(Math.abs(value)),
                      "Amount",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="space-y-4">
                <h3 className="font-semibold">Currency Breakdown</h3>
                {currencyExposure.map((exposure, index) => (
                  <div
                    key={exposure.currency}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{
                          backgroundColor:
                            CHART_COLORS[index % CHART_COLORS.length],
                        }}
                      />
                      <div>
                        <div className="font-medium">{exposure.currency}</div>
                        <div className="text-sm text-muted-foreground">
                          {exposure.amount > 0 ? "Positive" : "Negative"}{" "}
                          exposure
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-semibold ${
                          exposure.amount > 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {formatCurrency(Math.abs(exposure.amount))}
                      </div>
                      <Badge
                        variant={exposure.amount > 0 ? "default" : "secondary"}
                      >
                        {exposure.amount > 0 ? "Asset" : "Liability"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conversion Efficiency */}
      {conversionEfficiency.savings > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              Conversion Efficiency
            </CardTitle>
            <CardDescription>
              Analysis of your conversion rate performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">
                    {conversionEfficiency.efficiency}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Rate Efficiency
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(conversionEfficiency.savings)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Potential Savings
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Rate Analysis</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Best Rate:</span>
                    <span className="font-medium">
                      {conversionStats.bestRate.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Worst Rate:</span>
                    <span className="font-medium">
                      {conversionStats.worstRate.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Average Rate:</span>
                    <span className="font-medium">
                      {conversionStats.averageRate.toFixed(4)}
                    </span>
                  </div>
                </div>

                {conversionStats.mostActivePair && (
                  <div className="mt-4 p-3 bg-muted rounded-lg">
                    <div className="text-sm font-medium">Most Active Pair</div>
                    <div className="text-lg font-bold">
                      {conversionStats.mostActivePair.pair}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {conversionStats.mostActivePair.count} conversions
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
