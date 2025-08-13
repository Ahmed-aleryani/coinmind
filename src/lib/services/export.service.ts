import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { promises as fs } from 'fs';
import path from 'path';
import { formatCurrency } from '@/lib/utils/formatters';
import { formatDate } from '@/lib/utils/formatters';
import { EnrichedTransaction } from '@/lib/services/transaction.service';
import { convertAmount } from '@/lib/utils/currency';
import logger from '@/lib/utils/logger';

export interface ExportOptions {
  format: 'pdf' | 'excel' | 'csv';
  dateRange: {
    type: 'custom' | 'today' | 'this_month' | 'last_month' | 'last_7_days';
    startDate?: Date;
    endDate?: Date;
  };
  viewType: 'detailed' | 'summary';
  includeCharts: boolean;
  targetCurrency?: string;
}

export interface ExportData {
  transactions: EnrichedTransaction[];
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netAmount: number;
    categoryTotals: Record<string, number>;
    currencyTotals: Record<string, number>;
  };
  metadata: {
    dateRange: string;
    categories: string[];
    viewType: string;
    exportDate: Date;
  };
}

export class ExportService {
  private getDateRange(options: ExportOptions): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (options.dateRange.type) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        break;
      case 'last_7_days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case 'custom':
        startDate = options.dateRange.startDate || new Date(0);
        endDate = options.dateRange.endDate || now;
        break;
      default:
        startDate = new Date(0);
        endDate = now;
    }

    return { startDate, endDate };
  }

  private filterTransactions(transactions: EnrichedTransaction[], options: ExportOptions): EnrichedTransaction[] {
    const { startDate, endDate } = this.getDateRange(options);
    
    return transactions.filter(transaction => {
      // Date filter only
      const transactionDate = new Date(transaction.date);
      if (transactionDate < startDate || transactionDate > endDate) {
        return false;
      }

      return true;
    });
  }

  private async convertTransactionAmounts(transactions: EnrichedTransaction[], targetCurrency: string): Promise<EnrichedTransaction[]> {
    const convertedTransactions = await Promise.all(
      transactions.map(async (tx) => {
        // If the transaction is already in the target currency, no conversion needed
        if (tx.convertedCurrency === targetCurrency) {
          return tx;
        }

        try {
          // Use original amount and currency for conversion
          const originalAmount = tx.originalAmount || tx.amount;
          const originalCurrency = tx.originalCurrency || tx.currency;
          
          // Convert to target currency
          const convertedAmount = await convertAmount(originalAmount, originalCurrency, targetCurrency);
          
          return {
            ...tx,
            convertedAmount: convertedAmount,
            convertedCurrency: targetCurrency
          };
        } catch (error) {
          console.warn(`Failed to convert transaction ${tx.id} to ${targetCurrency}, using original amount`);
          return tx;
        }
      })
    );

    return convertedTransactions;
  }

  private async calculateSummary(transactions: EnrichedTransaction[], options: ExportOptions) {
    // Convert transactions to target currency if specified
    const targetCurrency = options.targetCurrency || 'USD';
    const convertedTransactions = await this.convertTransactionAmounts(transactions, targetCurrency);
    
    const categoryTotals: Record<string, number> = {};
    const currencyTotals: Record<string, number> = {};
    let totalIncome = 0;
    let totalExpenses = 0;

    convertedTransactions.forEach(transaction => {
      // Use converted amounts for summary (user's target currency)
      const amount = transaction.convertedAmount || transaction.amount;

      if (transaction.type === 'income') {
        totalIncome += amount;
      } else {
        totalExpenses += amount;
      }

      // Category totals
      if (!categoryTotals[transaction.category]) {
        categoryTotals[transaction.category] = 0;
      }
      categoryTotals[transaction.category] += amount;

      // Currency totals (use target currency)
      if (!currencyTotals[targetCurrency]) {
        currencyTotals[targetCurrency] = 0;
      }
      currencyTotals[targetCurrency] += amount;
    });

    return {
      totalIncome,
      totalExpenses,
      netAmount: totalIncome - totalExpenses,
      categoryTotals,
      currencyTotals
    };
  }

  private generateFilename(options: ExportOptions, summary: any): string {
    const format = options.format.toUpperCase();
    const dateRange = this.getDateRange(options);
    const startMonth = dateRange.startDate.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = dateRange.endDate.toLocaleDateString('en-US', { month: 'short' });
    const year = dateRange.endDate.getFullYear();
    
    const filename = `expenses_${options.viewType}_${startMonth}-${endMonth}_${year}`;
    
    return `${filename}.${options.format}`;
  }

  async exportToPDF(transactions: EnrichedTransaction[], options: ExportOptions): Promise<{ data: Uint8Array; filename: string }> {
    const filteredTransactions = this.filterTransactions(transactions, options);
    
    // Convert transactions to target currency
    const targetCurrency = options.targetCurrency || 'USD';
    const convertedTransactions = await this.convertTransactionAmounts(filteredTransactions, targetCurrency);
    
    const summary = await this.calculateSummary(convertedTransactions, options);
    const filename = this.generateFilename(options, summary);

    // Split transactions into income and expenses
    const incomeTx = convertedTransactions.filter(tx => tx.type === 'income');
    const expenseTx = convertedTransactions.filter(tx => tx.type === 'expense');

    // Use jsPDF
    const doc = new jsPDF({
      orientation: 'p',
      unit: 'pt',
      format: 'a4',
    });

    // Add CoinMind logo (best-effort; ignore if not available)
    try {
      const logoPath = path.join(process.cwd(), 'public', 'coinmind-logo.svg');
      const svgBuffer = await fs.readFile(logoPath);
      const logoBase64 = 'data:image/svg+xml;base64,' + svgBuffer.toString('base64');
      // Some environments may not support SVG images in jsPDF; this is best-effort
      try {
        // Try to add SVG; environments without plugin may throw
        doc.addImage(logoBase64 as any, 'SVG' as any, 20, 20, 40, 40);
      } catch {
        // Fallback: draw a simple brand mark rectangle if SVG unsupported
        doc.setFillColor(0, 0, 0);
        doc.roundedRect(20, 20, 40, 40, 6, 6, 'S');
      }
    } catch {
      // Ignore if logo missing
    }

    // Header: App Name (positioned next to logo)
    doc.setFontSize(24);
    doc.setTextColor(44, 62, 80);
    doc.setFont('Arial', 'bold');
    doc.text('CoinMind', 80, 45);

    // Print date aligned with app name on the right
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.setFont('Arial', 'bold');
    doc.text(`Print: ${new Date().toLocaleDateString()}`, 400, 45, { align: 'right' });

    // Report Title
    doc.setFontSize(20);
    doc.setTextColor(255, 165, 0);
    doc.setFont('Arial', 'bold');
    doc.text('Summary', 60, 85);

    // Date range under summary
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    const startDate = options.dateRange?.startDate || new Date();
    const endDate = options.dateRange?.endDate || new Date();
    
    // Draw "From:" bold, then the date normal
    doc.setFont('Arial', 'bold');
    doc.text('From:', 60, 105);
    doc.setFont('Arial', 'normal');
    doc.text(formatDate(startDate), 100, 105);
    
    // Draw "To:" bold, then the date normal
    doc.setFont('Arial', 'bold');
    doc.text('To:', 200, 105);
    doc.setFont('Arial', 'normal');
    doc.text(formatDate(endDate), 230, 105);

    // Summary Section with more spacing
    let y = 140;
    doc.setFontSize(13);
    doc.setFont('Arial', 'bold');
    doc.setTextColor(0,0,0);
    doc.text(`Total Transactions:`, 60, y);
    doc.text(`${convertedTransactions.length}`, 200, y);
    y += 20;
    doc.text(`Total Income:`, 60, y);
    doc.setTextColor(0,128,0);
    doc.text(formatCurrency(summary.totalIncome, { currency: targetCurrency }), 200, y);
    y += 20;
    doc.setTextColor(0,0,0);
    doc.text(`Total Expenses:`, 60, y);
    doc.setTextColor(255,0,0);
    doc.text(formatCurrency(summary.totalExpenses, { currency: targetCurrency }), 200, y);
    y += 20;
    doc.setTextColor(0,0,0);
    doc.text(`Net Amount:`, 60, y);
    if (summary.netAmount >= 0) doc.setTextColor(0,128,0);
    else doc.setTextColor(255,0,0);
    doc.text(formatCurrency(summary.netAmount, { currency: targetCurrency }), 200, y);
    doc.setTextColor(0,0,0);
    y += 30;

    // Income Table
    if (incomeTx.length > 0) {
      doc.setFontSize(14);
      doc.setFont('Arial', 'bold');
      doc.text(`Income Transactions`, 60, y);
      y += 10;
      doc.setFont('Arial', 'normal');
      
      // Calculate income total
      const incomeTotal = incomeTx.reduce((sum, tx) => sum + (tx.convertedAmount || tx.amount), 0);
      
      autoTable(doc, {
        head: [['Date', 'Category', 'Description', 'Vendor', 'Original Amount', 'Converted Amount']],
        body: [
          ...incomeTx.map((tx) => [
            formatDate(tx.date),
            tx.category || '',
            tx.description || '',
            tx.vendor || '',
            formatCurrency(tx.originalAmount || tx.amount, { currency: tx.originalCurrency || tx.currency }),
            formatCurrency(tx.convertedAmount || tx.amount, { currency: targetCurrency })
          ]),
          // Add total row
          ['', '', '', '', 'Total Income:', formatCurrency(incomeTotal, { currency: targetCurrency })]
        ],
        startY: y + 10,
        styles: { fontSize: 10, cellPadding: 2 },
        headStyles: { fillColor: [66, 66, 66], textColor: 255 },
        margin: { left: 60, right: 60 },
        theme: 'grid',
        didDrawPage: (data) => { 
          if (data.cursor) {
            y = data.cursor.y + 20; 
          }
        },
        didParseCell: (data) => {
          // Make the total row bold and black
          if (data.row.index === incomeTx.length) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [0, 0, 0];
          }
        }
      });
    }

    // Expense Table
    if (expenseTx.length > 0) {
      doc.setFontSize(14);
      doc.setFont('Arial', 'bold');
      doc.text(`Expense Transactions`, 60, y);
      y += 10;
      doc.setFont('Arial', 'normal');
      
      // Calculate expense total
      const expenseTotal = expenseTx.reduce((sum, tx) => sum + (tx.convertedAmount || tx.amount), 0);
      
      autoTable(doc, {
        head: [['Date', 'Category', 'Description', 'Vendor', 'Original Amount', 'Converted Amount']],
        body: [
          ...expenseTx.map((tx) => [
            formatDate(tx.date),
            tx.category || '',
            tx.description || '',
            tx.vendor || '',
            formatCurrency(tx.originalAmount || tx.amount, { currency: tx.originalCurrency || tx.currency }),
            formatCurrency(tx.convertedAmount || tx.amount, { currency: targetCurrency })
          ]),
          // Add total row
          ['', '', '', '', 'Total Expenses:', formatCurrency(expenseTotal, { currency: targetCurrency })]
        ],
        startY: y + 10,
        styles: { fontSize: 10, cellPadding: 2 },
        headStyles: { fillColor: [66, 66, 66], textColor: 255 },
        margin: { left: 60, right: 60 },
        theme: 'grid',
        didDrawPage: (data) => { 
          if (data.cursor) {
            y = data.cursor.y + 20; 
          }
        },
        didParseCell: (data) => {
          // Make the total row bold and black
          if (data.row.index === expenseTx.length) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [0, 0, 0];
          }
        }
      });
    }

    // Currency breakdown (if needed)
    if (Object.keys(summary.currencyTotals).length > 1) {
      doc.setFontSize(12);
      doc.setFont('Arial', 'bold');
      doc.text(`Currency Breakdown:`, 60, y);
      y += 15;
      doc.setFont('Arial', 'normal');
      Object.entries(summary.currencyTotals).forEach(([currency, amount]) => {
        doc.text(`${currency}: ${formatCurrency(amount, { currency })}`, 60, y);
        y += 15;
      });
    }

    // Category breakdown (if needed)
    if (Object.keys(summary.categoryTotals).length > 0) {
      // Add line separator above Category Breakdown
      doc.setDrawColor(200, 200, 200);
      doc.line(60, y + 5, 500, y + 5);
      y += 20;
      
      doc.setFontSize(12);
      doc.setFont('Arial', 'bold');
      doc.text(`Category Breakdown:`, 60, y);
      y += 25; // Add margin between header and items
      
      // Determine category types (income vs expense)
      const categoryTypes: Record<string, 'income' | 'expense'> = {};
      convertedTransactions.forEach(tx => {
        if (tx.category) {
          categoryTypes[tx.category] = tx.type as 'income' | 'expense';
        }
      });
      
      Object.entries(summary.categoryTotals).forEach(([category, amount]) => {
        // Category name in bold black
        doc.setFont('Arial', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`${category}: `, 60, y);
        
        // Value in color based on category type
        const categoryType = categoryTypes[category] || 'expense';
        if (categoryType === 'income') {
          doc.setTextColor(0, 128, 0); // Green for income
        } else {
          doc.setTextColor(255, 0, 0); // Red for expense
        }
        doc.setFont('Arial', 'normal');
        doc.text(formatCurrency(amount, { currency: targetCurrency }), 200, y);
        
        y += 15;
      });
    }

    return {
      data: new Uint8Array(doc.output('arraybuffer')),
      filename
    };
  }

  async exportToExcel(transactions: EnrichedTransaction[], options: ExportOptions): Promise<{ data: Uint8Array; filename: string }> {
    const filteredTransactions = this.filterTransactions(transactions, options);
    
    // Convert transactions to target currency
    const targetCurrency = options.targetCurrency || 'USD';
    const convertedTransactions = await this.convertTransactionAmounts(filteredTransactions, targetCurrency);
    
    const summary = await this.calculateSummary(convertedTransactions, options);
    const filename = this.generateFilename(options, summary);

    // Split transactions into income and expenses
    const incomeTx = convertedTransactions.filter(tx => tx.type === 'income');
    const expenseTx = convertedTransactions.filter(tx => tx.type === 'expense');

    const workbook = XLSX.utils.book_new();

    // Income transactions sheet
    if (incomeTx.length > 0) {
      const incomeData = incomeTx.map(t => ({
        Date: formatDate(t.date),
        Category: t.category || '',
        Description: t.description || '',
        Vendor: t.vendor || '',
        'Original Amount': t.originalAmount || t.amount,
        'Original Currency': t.originalCurrency || t.currency,
        'Converted Amount': t.convertedAmount || t.amount,
        'Converted Currency': targetCurrency
      }));

      // Add total row
      const incomeTotal = incomeTx.reduce((sum, tx) => sum + (tx.convertedAmount || tx.amount), 0);
      incomeData.push({
        Date: '',
        Category: '',
        Description: '',
        Vendor: '',
        'Original Amount': 0,
        'Original Currency': 'Total Income:',
        'Converted Amount': incomeTotal,
        'Converted Currency': targetCurrency
      });

      const incomeWorksheet = XLSX.utils.json_to_sheet(incomeData);
      XLSX.utils.book_append_sheet(workbook, incomeWorksheet, 'Income Transactions');
    }

    // Expense transactions sheet
    if (expenseTx.length > 0) {
      const expenseData = expenseTx.map(t => ({
        Date: formatDate(t.date),
        Category: t.category || '',
        Description: t.description || '',
        Vendor: t.vendor || '',
        'Original Amount': t.originalAmount || t.amount,
        'Original Currency': t.originalCurrency || t.currency,
        'Converted Amount': t.convertedAmount || t.amount,
        'Converted Currency': targetCurrency
      }));

      // Add total row
      const expenseTotal = expenseTx.reduce((sum, tx) => sum + (tx.convertedAmount || tx.amount), 0);
      expenseData.push({
        Date: '',
        Category: '',
        Description: '',
        Vendor: '',
        'Original Amount': 0,
        'Original Currency': 'Total Expenses:',
        'Converted Amount': expenseTotal,
        'Converted Currency': targetCurrency
      });

      const expenseWorksheet = XLSX.utils.json_to_sheet(expenseData);
      XLSX.utils.book_append_sheet(workbook, expenseWorksheet, 'Expense Transactions');
    }

    // Summary sheet with proper formatting
    const summaryData = [
      { Metric: 'Total Income', Value: summary.totalIncome, Color: 'green' },
      { Metric: 'Total Expenses', Value: summary.totalExpenses, Color: 'red' },
      { Metric: 'Net Amount', Value: summary.netAmount, Color: summary.netAmount >= 0 ? 'green' : 'red' }
    ];

    const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');

    // Category summary sheet
    const categoryData = Object.entries(summary.categoryTotals).map(([category, amount]) => ({
      Category: category,
      Total: amount
    }));

    const categoryWorksheet = XLSX.utils.json_to_sheet(categoryData);
    XLSX.utils.book_append_sheet(workbook, categoryWorksheet, 'Category Summary');

    // Currency summary sheet (if multi-currency)
    if (Object.keys(summary.currencyTotals).length > 1) {
      const currencyData = Object.entries(summary.currencyTotals).map(([currency, amount]) => ({
        Currency: currency,
        Total: amount
      }));

      const currencyWorksheet = XLSX.utils.json_to_sheet(currencyData);
      XLSX.utils.book_append_sheet(workbook, currencyWorksheet, 'Currency Summary');
    }

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return {
      data: new Uint8Array(excelBuffer),
      filename
    };
  }

  async exportToCSV(transactions: EnrichedTransaction[], options: ExportOptions): Promise<{ data: string; filename: string }> {
    const filteredTransactions = this.filterTransactions(transactions, options);
    
    // Convert transactions to target currency
    const targetCurrency = options.targetCurrency || 'USD';
    const convertedTransactions = await this.convertTransactionAmounts(filteredTransactions, targetCurrency);
    
    const summary = await this.calculateSummary(convertedTransactions, options);
    const filename = this.generateFilename(options, summary);

    // Split transactions into income and expenses
    const incomeTx = convertedTransactions.filter(tx => tx.type === 'income');
    const expenseTx = convertedTransactions.filter(tx => tx.type === 'expense');

    let csvContent = '';

    // Income transactions section
    if (incomeTx.length > 0) {
      csvContent += '=== INCOME TRANSACTIONS ===\n';
      csvContent += 'Date,Category,Description,Vendor,Original Amount,Original Currency,Converted Amount,Converted Currency\n';
      
      incomeTx.forEach(t => {
        const row = [
          formatDate(t.date),
          t.category || '',
          t.description || '',
          t.vendor || '',
          t.originalAmount || t.amount,
          t.originalCurrency || t.currency,
          t.convertedAmount || t.amount,
          targetCurrency
        ];
        
        const escapedRow = row.map(field => {
          if (typeof field === 'string' && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
            return `"${field.replace(/"/g, '""')}"`;
          }
          return field;
        });
        
        csvContent += escapedRow.join(',') + '\n';
      });

      // Add income total
      const incomeTotal = incomeTx.reduce((sum, tx) => sum + (tx.convertedAmount || tx.amount), 0);
      csvContent += `,,,,Total Income:,${incomeTotal}\n`;
    }

    // Expense transactions section
    if (expenseTx.length > 0) {
      csvContent += '\n=== EXPENSE TRANSACTIONS ===\n';
      csvContent += 'Date,Category,Description,Vendor,Original Amount,Original Currency,Converted Amount,Converted Currency\n';
      
      expenseTx.forEach(t => {
        const row = [
          formatDate(t.date),
          t.category || '',
          t.description || '',
          t.vendor || '',
          t.originalAmount || t.amount,
          t.originalCurrency || t.currency,
          t.convertedAmount || t.amount,
          targetCurrency
        ];
        
        const escapedRow = row.map(field => {
          if (typeof field === 'string' && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
            return `"${field.replace(/"/g, '""')}"`;
          }
          return field;
        });
        
        csvContent += escapedRow.join(',') + '\n';
      });

      // Add expense total
      const expenseTotal = expenseTx.reduce((sum, tx) => sum + (tx.convertedAmount || tx.amount), 0);
      csvContent += `,,,,Total Expenses:,${expenseTotal}\n`;
    }
    
    // Summary section
    csvContent += '\n=== SUMMARY ===\n';
    csvContent += 'Metric,Value\n';
    csvContent += `Total Income,${summary.totalIncome}\n`;
    csvContent += `Total Expenses,${summary.totalExpenses}\n`;
    csvContent += `Net Amount,${summary.netAmount}\n`;
    
    // Category breakdown
    if (Object.keys(summary.categoryTotals).length > 0) {
      csvContent += '\n=== CATEGORY BREAKDOWN ===\n';
      csvContent += 'Category,Total\n';
      Object.entries(summary.categoryTotals).forEach(([category, amount]) => {
        csvContent += `"${category}",${amount}\n`;
      });
    }
    
    // Currency breakdown if multiple currencies
    if (Object.keys(summary.currencyTotals).length > 1) {
      csvContent += '\n=== CURRENCY BREAKDOWN ===\n';
      csvContent += 'Currency,Total\n';
      Object.entries(summary.currencyTotals).forEach(([currency, amount]) => {
        csvContent += `"${currency}",${amount}\n`;
      });
    }

    return {
      data: csvContent,
      filename
    };
  }

  async export(transactions: EnrichedTransaction[], options: ExportOptions): Promise<{ data: Uint8Array | string; filename: string }> {
    logger.info({ 
      format: options.format, 
      dateRange: options.dateRange, 
      viewType: options.viewType,
      transactionCount: transactions.length 
    }, 'Starting export process');

    try {
      switch (options.format) {
        case 'pdf':
          return await this.exportToPDF(transactions, options);
        case 'excel':
          return await this.exportToExcel(transactions, options);
        case 'csv':
          return await this.exportToCSV(transactions, options);
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error, options }, 'Export failed');
      throw error;
    }
  }
} 