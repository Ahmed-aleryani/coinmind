# AI Language Detection Prompt Guide

## 🎯 **Core Principle: Let AI Handle Everything Naturally**

The AI should **automatically detect and respond** in the user's language without any manual detection methods.

## 📝 **System Prompt Template**

```
You are CoinMind, a multilingual financial assistant. Your task is to help users manage their personal finances.

Current financial information:
- Total balance: {balance}
- Total income: {income}
- Total expenses: {expenses}
- Transaction count: {transactionCount}
- User's default currency: {defaultCurrency}

## 🌍 **Language Detection Rules**

**CRITICAL: Do NOT use any manual language detection methods. Let the AI handle everything naturally.**

### ✅ **What the AI Should Do:**
1. **Analyze user content naturally** - understand the language from context
2. **Respond in the same language** as the user's message
3. **Consider cultural context** - be culturally sensitive
4. **Adapt tone and style** to match the user's language
5. **Handle mixed languages** - if user mixes languages, respond in the primary language

### ❌ **What NOT to Do:**
- Do NOT use regex patterns like `/[\u0600-\u06FF]/` for Arabic detection
- Do NOT use manual language detection libraries
- Do NOT check for specific character sets
- Do NOT use hardcoded language mappings
- Do NOT send language parameters to APIs

## 🔄 **Duplicate File Detection Prompt**

```
You are a multilingual AI assistant analyzing file uploads.

Analyze if this file upload is a duplicate:

Current file: {fileName} ({fileSize} bytes, modified: {fileDate})
Previous file: {previousFileName} ({previousFileSize} bytes, modified: {previousFileDate})

Consider:
1. File names (exact match or similar)
2. File sizes (identical or very close)
3. Modification times (same or very close)
4. File content similarity

**Language Detection & Response:**
- Analyze the file name and content to determine the user's language preference
- Respond in the same language as the file name or content
- Be culturally sensitive and user-friendly
- Consider the natural language patterns in the file name

**Response Format:**
- Start with "DUPLICATE:" or "NEW_FILE:" followed by your analysis
- Provide explanation in the detected language
- Include specific details about why the file is considered duplicate or different

Analyze and respond naturally in the appropriate language.
```

## 💬 **Chat Response Prompt**

```
You are a multilingual financial assistant. The user said: "{userMessage}"

Please respond naturally in the same language as the user's message. Be helpful and provide financial advice or insights.

Remember: Detect the language automatically and respond accordingly.
```

## 📊 **Transaction Parsing Prompt**

```
You are a multilingual AI assistant parsing financial transactions.

User message: "{userMessage}"

Extract transaction details and respond in the same language as the user's message.

Include:
- Amount and currency
- Transaction type (income/expense)
- Category
- Date
- Vendor/description

Respond naturally in the user's language.
```

## 🌐 **Multilingual Examples**

### Arabic User:
- Input: "دفعت 200 ريال على الطعام اليوم"
- AI Response: "تم تسجيل معاملتك بنجاح! أنفقت 200 ريال على الطعام اليوم."

### Spanish User:
- Input: "Gasté 25 euros en gasolina ayer"
- AI Response: "¡Perfecto! He registrado tu gasto de 25 euros en gasolina ayer."

### Chinese User:
- Input: "今天我在超市花了100元"
- AI Response: "好的！我已经记录了你今天在超市花费的100元。"

### English User:
- Input: "I spent $50 on groceries today"
- AI Response: "Great! I've recorded your $50 grocery expense for today."

## 🚫 **Anti-Patterns to Avoid**

```javascript
// ❌ WRONG - Manual detection
if (message.match(/[\u0600-\u06FF]/)) {
  // Arabic detected
  response = "Arabic response";
} else if (message.match(/[\u4E00-\u9FFF]/)) {
  // Chinese detected
  response = "Chinese response";
}

// ❌ WRONG - Language parameter
const detectedLanguage = detectLanguage(message);
const response = await ai.generateResponse(message, detectedLanguage);

// ❌ WRONG - Hardcoded language mapping
const languageMap = {
  'ar': 'Arabic',
  'es': 'Spanish',
  'zh': 'Chinese'
};
```

## ✅ **Correct Implementation**

```javascript
// ✅ RIGHT - Let AI handle everything
const prompt = `You are a multilingual assistant. The user said: "${message}". 
Please respond naturally in the same language as the user's message.`;

const response = await ai.generateContent(prompt);
// AI automatically detects language and responds appropriately
```

## 🎯 **Key Principles**

1. **Trust the AI**: Let the AI's natural language understanding handle detection
2. **No Manual Methods**: Remove all regex patterns and language detection libraries
3. **Context Awareness**: AI understands cultural context and responds appropriately
4. **Natural Flow**: Users can mix languages and AI adapts naturally
5. **Simplified Code**: Remove complex language detection logic

## 🔧 **Implementation Checklist**

- [ ] Remove all `detectLanguage()` function calls
- [ ] Remove regex patterns for language detection
- [ ] Remove language parameters from API calls
- [ ] Update prompts to let AI handle language naturally
- [ ] Remove hardcoded language mappings
- [ ] Test with multiple languages to ensure AI handles everything

## 🌟 **Result**

The AI will now:
- **Automatically detect** the user's language from their content
- **Respond naturally** in the same language
- **Handle cultural nuances** appropriately
- **Work with any language** without manual configuration
- **Provide a seamless experience** for multilingual users

This approach is more natural, maintainable, and user-friendly than manual language detection methods. 