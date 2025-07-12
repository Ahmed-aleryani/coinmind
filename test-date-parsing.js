// Simple test script to verify date parsing
const { parseTransactionText } = require('./dist/lib/api/gemini.js');

function computeRelativeDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().split('T')[0];
}

function computeLastMonday() {
  const date = new Date();
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day; // Adjust for Sunday (0) or other days
  date.setDate(date.getDate() + offset);
  return date.toISOString().split('T')[0];
}

async function testDateParsing() {
  const testCases = [
    { input: 'I received 500$ salary 2 days ago', expectedDate: computeRelativeDate(-2) },
    { input: 'Paid 50$ for dinner yesterday', expectedDate: computeRelativeDate(-1) },
    { input: 'Got 1000$ payment last Monday', expectedDate: computeLastMonday() },
    { input: 'Spent 20$ on coffee today', expectedDate: computeRelativeDate(0) },
  ];

  console.log('\n=== Testing Date Parsing ===');
  console.log(`Current date: ${new Date().toISOString().split('T')[0]}`);
  
  for (const testCase of testCases) {
    try {
      console.log(`\nTesting: "${testCase.input}"`);
      const result = await parseTransactionText(testCase.input);
      const resultDate = result.date?.toISOString().split('T')[0];
      const status = resultDate === testCase.expectedDate ? '✅' : '❌';
      
      console.log(`${status} Expected: ${testCase.expectedDate}`);
      console.log(`   Got:      ${resultDate || 'undefined'}`);
      console.log('   Full result:', JSON.stringify(result, null, 2));
      
      if (status === '❌') {
        console.log('   WARNING: Date does not match expected value!');
      }
    } catch (error) {
      console.error(`❌ Error processing input: "${testCase.input}"`);
      console.error('   Error:', error instanceof Error ? error.message : error);
    }
  }
  console.log('\n=== End of Tests ===\n');
}

// Run the tests
testDateParsing().catch(console.error);
