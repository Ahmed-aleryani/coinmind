// Simple test script to verify date parsing
const { parseTransactionText } = require('./dist/lib/api/gemini.js');

async function testDateParsing() {
  const testCases = [
    { input: 'I received 500$ salary 2 days ago', expectedDate: '2025-07-09' },
    { input: 'Paid 50$ for dinner yesterday', expectedDate: '2025-07-10' },
    { input: 'Got 1000$ payment last Monday', expectedDate: '2025-07-07' },
    { input: 'Spent 20$ on coffee today', expectedDate: '2025-07-11' },
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
