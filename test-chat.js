async function testChatAPI() {
  const baseURL = 'http://localhost:3000';
  
  const testQueries = [
    {
      message: "كم أنفقت هذا الشهر؟",
      language: "ar",
      description: "Arabic: How much did I spend this month?"
    },
    {
      message: "¿Cuánto gasté este mes?",
      language: "es", 
      description: "Spanish: How much did I spend this month?"
    },
    {
      message: "How much did I spend on food this month?",
      language: "en",
      description: "English: How much did I spend on food this month?"
    },
    {
      message: "ما هو رصيدي الحالي؟",
      language: "ar",
      description: "Arabic: What is my current balance?"
    },
    {
      message: "Show me my recent transactions",
      language: "en",
      description: "English: Show me my recent transactions"
    },
    {
      message: "What is my current balance?",
      language: "en",
      description: "English: What is my current balance?"
    },
    {
      message: "List my recent transactions",
      language: "en",
      description: "English: List my recent transactions"
    }
  ];

  console.log('🧪 Testing Chat API with Financial Queries\n');

  for (const test of testQueries) {
    console.log(`\n📝 Testing: ${test.description}`);
    console.log(`Message: "${test.message}"`);
    console.log('─'.repeat(50));

    try {
      const response = await fetch(`${baseURL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: test.message,
          language: test.language
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Success!');
        console.log('Response:');
        console.log(data.data.message);
      } else {
        console.log('❌ Error:');
        console.log(data.error);
      }
    } catch (error) {
      console.log('❌ Network Error:');
      console.log(error.message);
    }
    
    console.log('─'.repeat(50));
  }
}

// Run the test
testChatAPI().catch(console.error); 