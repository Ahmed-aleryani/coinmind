import { TransactionRepository, ProfileRepository, CategoryRepository } from '../domain/repositories';
import logger from '../utils/logger';

export interface QueryResult {
  success: boolean;
  data: any;
  query_description: string;
  metadata?: {
    total_count?: number;
    date_range?: string;
    currency?: string;
    period1_range?: string;
    period2_range?: string;
  };
}

export class DatabaseFunctions {
  constructor(
    private transactionRepo: TransactionRepository,
    private profileRepo: ProfileRepository,
    private categoryRepo: CategoryRepository
  ) {}

  // 1. Get transactions by type (income/expense)
  async getTransactionsByType(userId: string, args: any): Promise<QueryResult> {
    const { type, start_date, end_date, limit = 50 } = args;
    const startDate = start_date ? new Date(start_date) : new Date(0);
    const endDate = end_date ? new Date(end_date) : new Date();
    
    const transactions = await this.transactionRepo.findByDateRange(userId, startDate, endDate);
    
    // Filter by type using category information
    const filteredTransactions = [];
    for (const transaction of transactions) {
      const category = await this.categoryRepo.findById(transaction.categoryId);
      if (category && category.type === type) {
        filteredTransactions.push({
          id: transaction.transactionId,
          amount: Number(transaction.amount),
          description: transaction.description,
          date: transaction.transactionDate,
          category: category.name,
          vendor: transaction.description?.split(' ')[0] || 'Unknown'
        });
      }
    }
    
    const limitedTransactions = filteredTransactions.slice(0, limit);
    
    return {
      success: true,
      data: limitedTransactions,
      query_description: `Transactions of type: ${type}`,
      metadata: {
        total_count: filteredTransactions.length,
        date_range: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
      }
    };
  }

  // 2. Get transactions by vendor
  async getTransactionsByVendor(userId: string, args: any): Promise<QueryResult> {
    const { vendor, start_date, end_date, limit = 50 } = args;
    const startDate = start_date ? new Date(start_date) : new Date(0);
    const endDate = end_date ? new Date(end_date) : new Date();
    
    const transactions = await this.transactionRepo.findByDateRange(userId, startDate, endDate);
    
    // Filter by vendor (using description field)
    const filteredTransactions = transactions
      .filter(t => t.description?.toLowerCase().includes(vendor.toLowerCase()))
      .map(t => ({
        id: t.transactionId,
        amount: Number(t.amount),
        description: t.description,
        date: t.transactionDate,
        vendor: t.description?.split(' ')[0] || 'Unknown'
      }))
      .slice(0, limit);
    
    return {
      success: true,
      data: filteredTransactions,
      query_description: `Transactions from vendor: ${vendor}`,
      metadata: {
        total_count: filteredTransactions.length,
        date_range: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
      }
    };
  }

  // 3. Get transactions by category
  async getTransactionsByCategory(userId: string, args: any): Promise<QueryResult> {
    const { category, start_date, end_date, limit = 50 } = args;
    const startDate = start_date ? new Date(start_date) : new Date(0);
    const endDate = end_date ? new Date(end_date) : new Date();
    
    const transactions = await this.transactionRepo.findByDateRange(userId, startDate, endDate);
    
    // Filter by category
    const filteredTransactions = [];
    for (const transaction of transactions) {
      const cat = await this.categoryRepo.findById(transaction.categoryId);
      if (cat?.name.toLowerCase().includes(category.toLowerCase())) {
        filteredTransactions.push({
          id: transaction.transactionId,
          amount: Number(transaction.amount),
          description: transaction.description,
          date: transaction.transactionDate,
          category: cat.name,
          vendor: transaction.description?.split(' ')[0] || 'Unknown'
        });
      }
    }
    
    const limitedTransactions = filteredTransactions.slice(0, limit);
    
    return {
      success: true,
      data: limitedTransactions,
      query_description: `Transactions in category: ${category}`,
      metadata: {
        total_count: filteredTransactions.length,
        date_range: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
      }
    };
  }

  // 4. Get transactions for yesterday and today
  async getRecentTransactions(userId: string, args: any): Promise<QueryResult> {
    const { days = 2, limit = 50 } = args;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const transactions = await this.transactionRepo.findByDateRange(userId, startDate, endDate);
    
    const formattedTransactions = transactions.map(t => ({
      id: t.transactionId,
      amount: Number(t.amount),
      description: t.description,
      date: t.transactionDate,
      vendor: t.description?.split(' ')[0] || 'Unknown'
    })).slice(0, limit);
    
    return {
      success: true,
      data: formattedTransactions,
      query_description: `Transactions for the last ${days} days`,
      metadata: {
        total_count: formattedTransactions.length,
        date_range: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
      }
    };
  }

  // 5. Get category count
  async getCategoryCount(userId: string, args: any): Promise<QueryResult> {
    const transactions = await this.transactionRepo.findByUserId(userId);
    
    const categorySet = new Set<string>();
    for (const transaction of transactions) {
      const category = await this.categoryRepo.findById(transaction.categoryId);
      if (category) {
        categorySet.add(category.name);
      }
    }
    
    const categories = Array.from(categorySet);
    
    return {
      success: true,
      data: {
        total_categories: categories.length,
        categories: categories,
        unique_categories_used: categories.length
      },
      query_description: 'Category count and list',
      metadata: {
        total_count: categories.length
      }
    };
  }

  // 6. Get vendor count
  async getVendorCount(userId: string, args: any): Promise<QueryResult> {
    const transactions = await this.transactionRepo.findByUserId(userId);
    
    const vendorSet = new Set<string>();
    for (const transaction of transactions) {
      const vendor = transaction.description?.split(' ')[0] || 'Unknown';
      vendorSet.add(vendor);
    }
    
    const vendors = Array.from(vendorSet);
    
    return {
      success: true,
      data: {
        total_vendors: vendors.length,
        vendors: vendors,
        unique_vendors: vendors.length
      },
      query_description: 'Vendor count and list',
      metadata: {
        total_count: vendors.length
      }
    };
  }

  // 7. Get spending analysis
  async getSpendingAnalysis(userId: string, args: any): Promise<QueryResult> {
    const { start_date, end_date, analysis_type = 'overview' } = args;
    const startDate = start_date ? new Date(start_date) : new Date(0);
    const endDate = end_date ? new Date(end_date) : new Date();
    
    const transactions = await this.transactionRepo.findByDateRange(userId, startDate, endDate);
    
    // Filter to only include expense transactions for spending analysis
    const expenseTransactions = [];
    for (const transaction of transactions) {
      const category = await this.categoryRepo.findById(transaction.categoryId);
      if (category?.type === 'expense') {
        expenseTransactions.push(transaction);
      }
    }
    
    let analysis;
    switch (analysis_type) {
      case 'daily':
        analysis = this.analyzeDailySpending(expenseTransactions);
        break;
      case 'weekly':
        analysis = this.analyzeWeeklySpending(expenseTransactions);
        break;
      case 'monthly':
        analysis = this.analyzeMonthlySpending(expenseTransactions);
        break;
      default:
        analysis = this.analyzeOverallSpending(expenseTransactions);
    }
    
    return {
      success: true,
      data: analysis,
      query_description: `Spending analysis: ${analysis_type} (expenses only)`,
      metadata: {
        date_range: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
      }
    };
  }

  // 8. Get income vs expenses comparison
  async getIncomeVsExpenses(userId: string, args: any): Promise<QueryResult> {
    const { start_date, end_date } = args;
    const startDate = start_date ? new Date(start_date) : new Date(0);
    const endDate = end_date ? new Date(end_date) : new Date();
    
    const transactions = await this.transactionRepo.findByDateRange(userId, startDate, endDate);
    
    let totalIncome = 0;
    let totalExpenses = 0;
    const incomeTransactions = [];
    const expenseTransactions = [];
    
    for (const transaction of transactions) {
      const category = await this.categoryRepo.findById(transaction.categoryId);
      const amount = Number(transaction.amount);
      
      if (category?.type === 'income') {
        totalIncome += amount;
        incomeTransactions.push({
          id: transaction.transactionId,
          amount,
          description: transaction.description,
          date: transaction.transactionDate,
          category: category.name
        });
      } else {
        totalExpenses += Math.abs(amount);
        expenseTransactions.push({
          id: transaction.transactionId,
          amount: Math.abs(amount),
          description: transaction.description,
          date: transaction.transactionDate,
          category: category?.name || 'Unknown'
        });
      }
    }
    
    const netAmount = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (netAmount / totalIncome) * 100 : 0;
    
    return {
      success: true,
      data: {
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net_amount: netAmount,
        savings_rate_percentage: savingsRate,
        income_transactions: incomeTransactions.slice(0, 10),
        expense_transactions: expenseTransactions.slice(0, 10),
        income_count: incomeTransactions.length,
        expense_count: expenseTransactions.length
      },
      query_description: 'Income vs Expenses comparison',
      metadata: {
        date_range: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
      }
    };
  }

  // 9. Get top spending categories
  async getTopSpendingCategories(userId: string, args: any): Promise<QueryResult> {
    const { start_date, end_date, limit = 10 } = args;
    const startDate = start_date ? new Date(start_date) : new Date(0);
    const endDate = end_date ? new Date(end_date) : new Date();
    
    const transactions = await this.transactionRepo.findByDateRange(userId, startDate, endDate);
    
    const categoryStats: Record<string, { amount: number; count: number }> = {};
    
    for (const transaction of transactions) {
      const category = await this.categoryRepo.findById(transaction.categoryId);
      if (category?.type === 'expense') {
        const categoryName = category.name;
        const amount = Math.abs(Number(transaction.amount));
        
        if (!categoryStats[categoryName]) {
          categoryStats[categoryName] = { amount: 0, count: 0 };
        }
        categoryStats[categoryName].amount += amount;
        categoryStats[categoryName].count++;
      }
    }
    
    const results = Object.entries(categoryStats)
      .map(([category, stats]) => ({
        category,
        total_spent: stats.amount,
        transaction_count: stats.count,
        average_spent: stats.amount / stats.count
      }))
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, limit);
    
    return {
      success: true,
      data: results,
      query_description: `Top ${limit} spending categories`,
      metadata: {
        date_range: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
      }
    };
  }

  // 10. Get spending trends
  async getSpendingTrends(userId: string, args: any): Promise<QueryResult> {
    const { period = 'monthly', months = 6 } = args;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    
    const transactions = await this.transactionRepo.findByDateRange(userId, startDate, endDate);
    
    // Filter to only include expense transactions for spending trends
    const expenseTransactions = [];
    for (const transaction of transactions) {
      const category = await this.categoryRepo.findById(transaction.categoryId);
      if (category?.type === 'expense') {
        expenseTransactions.push(transaction);
      }
    }
    
    const trends = this.calculateSpendingTrends(expenseTransactions, period);
    
    return {
      success: true,
      data: trends,
      query_description: `Spending trends (${period}) (expenses only)`,
      metadata: {
        total_count: 0,
        date_range: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
        currency: 'USD'
      }
    };
  }

  // 11. Get budget analysis
  async getBudgetAnalysis(userId: string, args: any): Promise<QueryResult> {
    const { start_date, end_date, budget_limits } = args;
    const startDate = start_date ? new Date(start_date) : new Date(0);
    const endDate = end_date ? new Date(end_date) : new Date();
    
    const transactions = await this.transactionRepo.findByDateRange(userId, startDate, endDate);
    
    // Analyze spending against budget limits
    const categoryStats: Record<string, { spent: number; budget?: number; remaining?: number }> = {};
    
    for (const transaction of transactions) {
      const category = await this.categoryRepo.findById(transaction.categoryId);
      if (category?.type === 'expense') {
        const categoryName = category.name;
        const amount = Math.abs(Number(transaction.amount));
        
        if (!categoryStats[categoryName]) {
          categoryStats[categoryName] = { spent: 0 };
        }
        categoryStats[categoryName].spent += amount;
      }
    }
    
    // Apply budget limits if provided
    if (budget_limits) {
      Object.keys(budget_limits).forEach(category => {
        if (categoryStats[category]) {
          categoryStats[category].budget = budget_limits[category];
          categoryStats[category].remaining = budget_limits[category] - categoryStats[category].spent;
        }
      });
    }
    
    const results = Object.entries(categoryStats).map(([category, stats]) => ({
      category,
      spent: stats.spent,
      budget: stats.budget,
      remaining: stats.remaining,
      over_budget: stats.budget ? stats.spent > stats.budget : false,
      percentage_used: stats.budget ? (stats.spent / stats.budget) * 100 : null
    }));
    
    return {
      success: true,
      data: results,
      query_description: 'Budget analysis by category',
      metadata: {
        date_range: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
      }
    };
  }

  // 12. Get spending comparison
  async getSpendingComparison(userId: string, args: any): Promise<QueryResult> {
    const { period1_start, period1_end, period2_start, period2_end } = args;
    
    // Validate and parse dates
    if (!period1_start || !period1_end || !period2_start || !period2_end) {
      throw new Error('All date parameters are required for spending comparison');
    }
    
    const period1Start = new Date(period1_start);
    const period1End = new Date(period1_end);
    const period2Start = new Date(period2_start);
    const period2End = new Date(period2_end);
    
    // Validate that dates are valid
    if (isNaN(period1Start.getTime()) || isNaN(period1End.getTime()) || 
        isNaN(period2Start.getTime()) || isNaN(period2End.getTime())) {
      throw new Error('Invalid date format provided');
    }
    
    const period1Transactions = await this.transactionRepo.findByDateRange(userId, period1Start, period1End);
    const period2Transactions = await this.transactionRepo.findByDateRange(userId, period2Start, period2End);
    
    // Filter to only include expense transactions for spending comparison
    const period1ExpenseTransactions = [];
    const period2ExpenseTransactions = [];
    
    for (const transaction of period1Transactions) {
      const category = await this.categoryRepo.findById(transaction.categoryId);
      if (category?.type === 'expense') {
        period1ExpenseTransactions.push(transaction);
      }
    }
    
    for (const transaction of period2Transactions) {
      const category = await this.categoryRepo.findById(transaction.categoryId);
      if (category?.type === 'expense') {
        period2ExpenseTransactions.push(transaction);
      }
    }
    
    const period1Stats = this.analyzeOverallSpending(period1ExpenseTransactions);
    const period2Stats = this.analyzeOverallSpending(period2ExpenseTransactions);
    
    const change = period2Stats.total_spent - period1Stats.total_spent;
    const changePercent = period1Stats.total_spent > 0 ? (change / period1Stats.total_spent) * 100 : 0;
    
    return {
      success: true,
      data: {
        period1: {
          total_spent: period1Stats.total_spent,
          transaction_count: period1Stats.total_transactions,
          average_spent: period1Stats.average_spent,
          date_range: `${period1Start.toISOString().split('T')[0]} to ${period1End.toISOString().split('T')[0]}`
        },
        period2: {
          total_spent: period2Stats.total_spent,
          transaction_count: period2Stats.total_transactions,
          average_spent: period2Stats.average_spent,
          date_range: `${period2Start.toISOString().split('T')[0]} to ${period2End.toISOString().split('T')[0]}`
        },
        comparison: {
          change_amount: change,
          change_percentage: changePercent,
          trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable'
        }
      },
      query_description: 'Spending comparison between two periods (expenses only)',
      metadata: {
        period1_range: `${period1Start.toISOString().split('T')[0]} to ${period1End.toISOString().split('T')[0]}`,
        period2_range: `${period2Start.toISOString().split('T')[0]} to ${period2End.toISOString().split('T')[0]}`
      }
    };
  }

  // 13. Get financial health metrics
  async getFinancialHealthMetrics(userId: string, args: any): Promise<QueryResult> {
    const { start_date, end_date } = args;
    const startDate = start_date ? new Date(start_date) : new Date(0);
    const endDate = end_date ? new Date(end_date) : new Date();
    
    const transactions = await this.transactionRepo.findByDateRange(userId, startDate, endDate);
    
    let totalIncome = 0;
    let totalExpenses = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    const categorySpending: Record<string, number> = {};
    const vendorSpending: Record<string, number> = {};
    
    for (const transaction of transactions) {
      const category = await this.categoryRepo.findById(transaction.categoryId);
      const amount = Number(transaction.amount);
      
      if (category?.type === 'income') {
        totalIncome += amount;
        incomeCount++;
      } else {
        totalExpenses += Math.abs(amount);
        expenseCount++;
        
        // Track category spending
        const categoryName = category?.name || 'Unknown';
        categorySpending[categoryName] = (categorySpending[categoryName] || 0) + Math.abs(amount);
        
        // Track vendor spending
        const vendor = transaction.description?.split(' ')[0] || 'Unknown';
        vendorSpending[vendor] = (vendorSpending[vendor] || 0) + Math.abs(amount);
      }
    }
    
    const netAmount = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (netAmount / totalIncome) * 100 : 0;
    
    // Calculate diversity metrics
    const uniqueCategories = Object.keys(categorySpending).length;
    const uniqueVendors = Object.keys(vendorSpending).length;
    
    // Calculate concentration metrics
    const topCategory = Object.entries(categorySpending)
      .sort(([,a], [,b]) => b - a)[0];
    const topVendor = Object.entries(vendorSpending)
      .sort(([,a], [,b]) => b - a)[0];
    
    const categoryConcentration = topCategory ? (topCategory[1] / totalExpenses) * 100 : 0;
    const vendorConcentration = topVendor ? (topVendor[1] / totalExpenses) * 100 : 0;
    
    return {
      success: true,
      data: {
        income: {
          total: totalIncome,
          count: incomeCount
        },
        expenses: {
          total: totalExpenses,
          count: expenseCount
        },
        net_worth: netAmount,
        savings_rate: savingsRate,
        diversity: {
          unique_categories: uniqueCategories,
          unique_vendors: uniqueVendors,
          category_concentration: categoryConcentration,
          vendor_concentration: vendorConcentration
        },
        top_spenders: {
          category: topCategory ? { name: topCategory[0], amount: topCategory[1] } : null,
          vendor: topVendor ? { name: topVendor[0], amount: topVendor[1] } : null
        },
        health_score: this.calculateFinancialHealthScore(savingsRate, categoryConcentration, vendorConcentration)
      },
      query_description: 'Comprehensive financial health metrics',
      metadata: {
        date_range: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
      }
    };
  }

  // 14. Get current balance
  async getBalance(userId: string, args: any): Promise<QueryResult> {
    const { start_date, end_date } = args;
    const startDate = start_date ? new Date(start_date) : new Date(0);
    const endDate = end_date ? new Date(end_date) : new Date();
    
    const transactions = await this.transactionRepo.findByDateRange(userId, startDate, endDate);
    
    let totalIncome = 0;
    let totalExpenses = 0;
    
    for (const transaction of transactions) {
      const category = await this.categoryRepo.findById(transaction.categoryId);
      const amount = Number(transaction.amount);
      
      if (category?.type === 'income') {
        totalIncome += amount;
      } else {
        totalExpenses += Math.abs(amount);
      }
    }
    
    const netBalance = totalIncome - totalExpenses;
    
    return {
      success: true,
      data: {
        balance: netBalance,
        total_income: totalIncome,
        total_expenses: totalExpenses,
        is_positive: netBalance >= 0
      },
      query_description: 'Current balance calculation',
      metadata: {
        date_range: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
      }
    };
  }

  // Helper methods for analysis
  private analyzeDailySpending(transactions: any[]): any {
    const dailyStats: Record<string, { amount: number; count: number }> = {};
    
    for (const transaction of transactions) {
      const date = transaction.transactionDate.toISOString().split('T')[0];
      const amount = Math.abs(Number(transaction.amount));
      
      if (!dailyStats[date]) {
        dailyStats[date] = { amount: 0, count: 0 };
      }
      dailyStats[date].amount += amount;
      dailyStats[date].count++;
    }
    
    return Object.entries(dailyStats)
      .map(([date, stats]) => ({
        date,
        total_spent: stats.amount,
        transaction_count: stats.count,
        average_spent: stats.amount / stats.count
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  private analyzeWeeklySpending(transactions: any[]): any {
    const weeklyStats: Record<string, { amount: number; count: number }> = {};
    
    for (const transaction of transactions) {
      const date = new Date(transaction.transactionDate);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      
      const amount = Math.abs(Number(transaction.amount));
      
      if (!weeklyStats[weekKey]) {
        weeklyStats[weekKey] = { amount: 0, count: 0 };
      }
      weeklyStats[weekKey].amount += amount;
      weeklyStats[weekKey].count++;
    }
    
    return Object.entries(weeklyStats)
      .map(([week, stats]) => ({
        week_start: week,
        total_spent: stats.amount,
        transaction_count: stats.count,
        average_spent: stats.amount / stats.count
      }))
      .sort((a, b) => new Date(a.week_start).getTime() - new Date(b.week_start).getTime());
  }

  private analyzeMonthlySpending(transactions: any[]): any {
    const monthlyStats: Record<string, { amount: number; count: number }> = {};
    
    for (const transaction of transactions) {
      const date = new Date(transaction.transactionDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      const amount = Math.abs(Number(transaction.amount));
      
      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = { amount: 0, count: 0 };
      }
      monthlyStats[monthKey].amount += amount;
      monthlyStats[monthKey].count++;
    }
    
    return Object.entries(monthlyStats)
      .map(([month, stats]) => ({
        month,
        total_spent: stats.amount,
        transaction_count: stats.count,
        average_spent: stats.amount / stats.count
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  private analyzeOverallSpending(transactions: any[]): any {
    const totalSpent = transactions.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    const averageSpent = totalSpent / transactions.length || 0;
    
    return {
      total_transactions: transactions.length,
      total_spent: totalSpent,
      average_spent: averageSpent,
      highest_transaction: Math.max(...transactions.map(t => Math.abs(Number(t.amount)))) || 0,
      lowest_transaction: Math.min(...transactions.map(t => Math.abs(Number(t.amount)))) || 0
    };
  }

  private calculateSpendingTrends(transactions: any[], period: string): any {
    // This is a simplified trend calculation
    // In a real implementation, you might want more sophisticated trend analysis
    const periodStats = period === 'monthly' 
      ? this.analyzeMonthlySpending(transactions)
      : this.analyzeWeeklySpending(transactions);
    
    if (periodStats.length < 2) {
      return { trend: 'insufficient_data', periods: periodStats };
    }
    
    const recent = periodStats[periodStats.length - 1];
    const previous = periodStats[periodStats.length - 2];
    const change = recent.total_spent - previous.total_spent;
    const changePercent = previous.total_spent > 0 ? (change / previous.total_spent) * 100 : 0;
    
    return {
      trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
      change_amount: change,
      change_percentage: changePercent,
      periods: periodStats
    };
  }

  // Helper method to calculate financial health score
  private calculateFinancialHealthScore(savingsRate: number, categoryConcentration: number, vendorConcentration: number): number {
    let score = 0;
    
    // Savings rate component (0-40 points)
    if (savingsRate >= 20) score += 40;
    else if (savingsRate >= 10) score += 30;
    else if (savingsRate >= 0) score += 20;
    else score += Math.max(0, 20 + savingsRate);
    
    // Diversity component (0-30 points)
    const diversityScore = Math.max(0, 30 - (categoryConcentration + vendorConcentration) / 2);
    score += diversityScore;
    
    // Spending concentration component (0-30 points)
    const concentrationScore = Math.max(0, 30 - (categoryConcentration + vendorConcentration) / 2);
    score += concentrationScore;
    
    return Math.min(100, Math.max(0, score));
  }
} 