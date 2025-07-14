const Database = require('better-sqlite3');
const path = require('path');

// Database path
const DB_PATH = path.join(__dirname, 'data', 'finance.db');

try {
  // Initialize database
  const db = new Database(DB_PATH);
  
  console.log('🔍 Querying all expenses from database...\n');
  
  // Query all expenses (type = 'expense')
  const expensesStmt = db.prepare(`
    SELECT 
      id,
      date,
      amount,
      currency,
      vendor,
      description,
      category,
      original_amount,
      original_currency,
      converted_amount,
      converted_currency,
      conversion_rate
    FROM transactions 
    WHERE type = 'expense'
    ORDER BY date DESC
  `);
  
  const expenses = expensesStmt.all();
  
  console.log(`📊 Found ${expenses.length} expenses in the database:\n`);
  
  // Group by currency and calculate totals
  const totalsByCurrency = {};
  let totalUSD = 0;
  
  expenses.forEach((expense, index) => {
    const amount = expense.converted_amount || expense.amount;
    const currency = expense.converted_currency || expense.currency;
    
    // Initialize currency totals
    if (!totalsByCurrency[currency]) {
      totalsByCurrency[currency] = 0;
    }
    
    totalsByCurrency[currency] += amount;
    
    // For USD total calculation
    if (currency === 'USD') {
      totalUSD += amount;
    } else if (expense.conversion_rate && expense.conversion_rate !== 1) {
      // Convert to USD using conversion rate
      totalUSD += amount;
    }
    
    console.log(`${index + 1}. ${expense.date} - ${expense.vendor}`);
    console.log(`   Amount: ${amount} ${currency}`);
    console.log(`   Category: ${expense.category}`);
    console.log(`   Description: ${expense.description}`);
    if (expense.original_currency && expense.original_currency !== currency) {
      console.log(`   Original: ${expense.original_amount} ${expense.original_currency}`);
    }
    console.log('');
  });
  
  console.log('💰 TOTAL EXPENSES BY CURRENCY:');
  console.log('================================');
  
  Object.entries(totalsByCurrency).forEach(([currency, total]) => {
    console.log(`${currency}: ${total.toFixed(2)}`);
  });
  
  console.log('\n💵 TOTAL EXPENSES (USD equivalent):');
  console.log('====================================');
  console.log(`USD: $${totalUSD.toFixed(2)}`);
  
  // Also show income for comparison
  const incomeStmt = db.prepare(`
    SELECT 
      SUM(converted_amount) as total_income,
      converted_currency
    FROM transactions 
    WHERE type = 'income'
    GROUP BY converted_currency
  `);
  
  const incomeTotals = incomeStmt.all();
  
  console.log('\n📈 INCOME TOTALS:');
  console.log('==================');
  incomeTotals.forEach(income => {
    console.log(`${income.converted_currency}: ${income.total_income.toFixed(2)}`);
  });
  
  // Calculate net (income - expenses)
  const totalIncomeUSD = incomeTotals.reduce((sum, income) => {
    return sum + (income.converted_currency === 'USD' ? income.total_income : income.total_income);
  }, 0);
  
  const netAmount = totalIncomeUSD - totalUSD;
  
  console.log('\n📊 NET AMOUNT (Income - Expenses):');
  console.log('====================================');
  console.log(`Net: $${netAmount.toFixed(2)} ${netAmount >= 0 ? '(Positive)' : '(Negative)'}`);
  
  db.close();
  
} catch (error) {
  console.error('❌ Error querying database:', error.message);
  process.exit(1);
}