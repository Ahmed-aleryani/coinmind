'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate, getCategoryEmoji } from '@/lib/utils/formatters';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Calendar, Target, ArrowUpDown } from 'lucide-react';
import { CurrencyInfo } from '@/components/ui/currency-info';

interface Transaction {
  id: string;
  date: Date;
  amount: number;
  vendor: string;
  description: string;
  category: string;
  type: 'income' | 'expense';
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
  amount: number;
  count: number;
  percentage: number;
}

interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

const CHART_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0'];

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [supportedCurrencies, setSupportedCurrencies] = useState<string[]>([]);
  const [isCurrencyLoading, setIsCurrencyLoading] = useState(false);

  // Fetch supported currencies and user default currency
  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        setIsCurrencyLoading(true);
        const res = await fetch('/api/user-currency');
        const data = await res.json();
        setDefaultCurrency(data.defaultCurrency || 'USD');
        const curRes = await fetch('/api/currencies');
        const curData = await curRes.json();
        setSupportedCurrencies(curData.currencies || ['USD']);
      } catch (e) {
        setSupportedCurrencies(['USD']);
      } finally {
        setIsCurrencyLoading(false);
      }
    };
    fetchCurrencies();
  }, []);

  const handleCurrencyChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCurrency = e.target.value;
    setDefaultCurrency(newCurrency);
    await fetch('/api/user-currency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultCurrency: newCurrency })
    });
    // Optionally, refetch dashboard data here if needed
    window.location.reload();
  };

  // Summary stats - use converted amounts for calculations
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + (t.convertedAmount || t.amount), 0);
  
  const totalExpenses = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(t.convertedAmount || t.amount), 0);
  
  const netAmount = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? ((netAmount / totalIncome) * 100) : 0;

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch transactions converted to the selected default currency
        const response = await fetch(`/api/transactions?currency=${defaultCurrency}`);
        const data = await response.json();
        
        if (data.success) {
          const parsedTransactions = data.data.map((t: any) => ({
            ...t,
            date: new Date(t.date)
          }));
          setTransactions(parsedTransactions);
          
          // Generate monthly data (last 6 months)
          const monthlyMap = new Map<string, { income: number; expenses: number }>();
          const now = new Date();
          
          for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            monthlyMap.set(monthKey, { income: 0, expenses: 0 });
          }
          
          parsedTransactions.forEach((t: Transaction) => {
            const monthKey = t.date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            const existing = monthlyMap.get(monthKey);
            if (existing) {
              const amount = t.convertedAmount || t.amount;
              if (t.type === 'income') {
                existing.income += amount;
              } else {
                existing.expenses += Math.abs(amount);
              }
            }
          });
          
          const monthlyArray = Array.from(monthlyMap.entries()).map(([month, data]) => ({
            month,
            income: data.income,
            expenses: data.expenses,
            net: data.income - data.expenses
          }));
          
          setMonthlyData(monthlyArray);
          
          // Generate category stats
          const categoryMap = new Map<string, { amount: number; count: number }>();
          const expenseTransactions = parsedTransactions.filter((t: Transaction) => t.type === 'expense');
          
          expenseTransactions.forEach((t: Transaction) => {
            const existing = categoryMap.get(t.category) || { amount: 0, count: 0 };
            const amount = t.convertedAmount || t.amount;
            existing.amount += Math.abs(amount);
            existing.count += 1;
            categoryMap.set(t.category, existing);
          });
          
          // Calculate total expenses from the fetched data
          const fetchedTotalExpenses = expenseTransactions.reduce((sum: number, t: Transaction) => sum + Math.abs(t.convertedAmount || t.amount), 0);
          
          const categoryArray = Array.from(categoryMap.entries())
            .map(([category, data]) => ({
              category,
              amount: data.amount,
              count: data.count,
              percentage: fetchedTotalExpenses > 0 ? (data.amount / fetchedTotalExpenses) * 100 : 0
            }))
            .sort((a, b) => b.amount - a.amount);
          
          setCategoryStats(categoryArray);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [defaultCurrency]);

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
            Your financial overview for {formatDate(new Date(), 'long')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="currency-select" className="text-sm font-medium">Currency:</label>
          <select
            id="currency-select"
            value={defaultCurrency}
            onChange={handleCurrencyChange}
            className="border rounded px-2 py-1 text-sm"
            disabled={isCurrencyLoading}
          >
            {supportedCurrencies.map(cur => (
              <option key={cur} value={cur}>{cur}</option>
            ))}
          </select>
        </div>
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
              +{transactions.filter(t => t.type === 'income').length} transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalExpenses, { currency: defaultCurrency })}
            </div>
            <p className="text-xs text-muted-foreground">
              {transactions.filter(t => t.type === 'expense').length} transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Amount</CardTitle>
            <DollarSign className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(netAmount, { currency: defaultCurrency })}
            </div>
            <p className="text-xs text-muted-foreground">
              {netAmount >= 0 ? 'Surplus' : 'Deficit'} this period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Savings Rate</CardTitle>
            <Target className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {savingsRate.toFixed(1)}%
            </div>
            <Progress value={Math.max(0, Math.min(100, savingsRate))} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Currency Conversion Summary */}
      {(() => {
        const multiCurrencyTransactions = transactions.filter(t => 
          t.originalAmount && t.originalAmount !== (t.convertedAmount || t.amount)
        );
        
        if (multiCurrencyTransactions.length > 0) {
          const totalConversionFees = multiCurrencyTransactions.reduce((sum, t) => 
            sum + (t.conversionFee || 0), 0
          );
          const avgConversionRate = multiCurrencyTransactions.reduce((sum, t) => 
            sum + (t.conversionRate || 1), 0
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
                      {formatCurrency(totalConversionFees, { currency: defaultCurrency })}
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
        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Trend</CardTitle>
            <CardDescription>Income vs Expenses over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value, { currency: defaultCurrency }), '']}
                  labelFormatter={(label) => `Month: ${label}`}
                />
                <Bar dataKey="income" fill="#10b981" name="Income" />
                <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Categories</CardTitle>
            <CardDescription>Breakdown of your spending by category</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryStats}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ category, percentage }) => `${category}: ${percentage.toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="amount"
                >
                  {categoryStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [formatCurrency(value, { currency: defaultCurrency }), 'Amount']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Category Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Category Statistics</CardTitle>
          <CardDescription>Detailed breakdown of your spending categories</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {categoryStats.map((stat, index) => (
              <div key={stat.category} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">{getCategoryEmoji(stat.category)}</div>
                  <div>
                    <div className="font-medium">{stat.category}</div>
                    <div className="text-sm text-muted-foreground">
                      {stat.count} transaction{stat.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(stat.amount, { currency: defaultCurrency })}</div>
                  <Badge variant="secondary">
                    {stat.percentage.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            ))}
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
            {transactions.slice(0, 10).map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="text-xl">{getCategoryEmoji(transaction.category)}</div>
                  <div>
                    <div className="font-medium">{transaction.description}</div>
                    <div className="text-sm text-muted-foreground">
                      {transaction.vendor} • {formatDate(transaction.date)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${
                    transaction.type === 'income' 
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    {transaction.type === 'income' ? '+' : '-'}
                    {formatCurrency(Math.abs(transaction.convertedAmount || transaction.amount), { currency: defaultCurrency })}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs">
                        {transaction.category}
                      </Badge>
                      {transaction.originalCurrency && transaction.originalCurrency !== (transaction.convertedCurrency || defaultCurrency) && (
                        <Badge variant="secondary" className="text-xs">
                          {transaction.originalCurrency}
                        </Badge>
                      )}
                    </div>
                    <CurrencyInfo
                      originalAmount={transaction.originalAmount}
                      originalCurrency={transaction.originalCurrency}
                      convertedAmount={transaction.convertedAmount || transaction.amount}
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