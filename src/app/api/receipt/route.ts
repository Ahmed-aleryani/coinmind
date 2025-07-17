import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import logger from "@/lib/utils/logger";
// Removed unused import
import { TransactionCategory } from "@/lib/types/transaction";

// Initialize Gemini AI for OCR
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

// Expense categories for mapping
const EXPENSE_CATEGORIES: TransactionCategory[] = [
  "Food & Drink",
  "Transportation", 
  "Utilities",
  "Entertainment",
  "Shopping",
  "Healthcare",
  "Education",
  "Other"
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("receipt") as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: "No receipt file provided" },
        { status: 400 }
      );
    }

    // Check file type
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      return NextResponse.json(
        { success: false, error: "Invalid file type. Please upload an image or PDF." },
        { status: 400 }
      );
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");
    const mimeType = file.type;

    // Create enhanced OCR prompt with multilingual support
    const ocrPrompt = `You are ExpenseOCR, an AI assistant specialized in processing receipt images uploaded by users. Your job is to read the receipt, extract expense data, and prepare structured entries for review.

When analyzing this receipt image, follow these steps:

1. **OCR & Extraction**
   - Detect and read all text (support both Arabic and English text recognition)
   - Extract:
     • Merchant name
     • Transaction date (convert to YYYY-MM-DD format)
     • Currency
     • Total amount, tax amount, tip, and discounts

2. **Line-Item Breakdown**
   - Identify each item with:
     • Description
     • Quantity
     • Unit price
     • Subtotal
   - Always treat the receipt as a single total expense for saving.

3. **Categorization & Splitting**
   - Categorize each line item using these categories: ${EXPENSE_CATEGORIES.join(", ")}
   - If the receipt involves multiple people or cost centers, detect splits

4. **Multi-Currency Handling**
   - Detect and convert foreign currencies into USD using today's exchange rate

5. **Validation & Follow-up**
   - If any required field is missing or unclear, add it to "unclearFields" array and set confidence to a lower value (0.1-0.9).
   - If there are unclear fields, provide a short, precise follow-up question for each (e.g., "I can't read the date. Is it 05/12/2025 or 12/05/2025?").

6. **Language Detection**
   - Detect if the receipt is in Arabic or English
   - Respond in the same language as the receipt text

Return ONLY a valid JSON object in this exact format:
{
  "receiptId": "receipt_${Date.now()}",
  "merchant": "Store Name",
  "date": "YYYY-MM-DD",
  "currency": "USD",
  "total": 0.00,
  "tax": 0.00,
  "tip": 0.00,
  "lineItems": [
    {
      "description": "Item description",
      "quantity": 1,
      "unitPrice": 0.00,
      "subtotal": 0.00,
      "category": "Food & Drink"
    }
  ],
  "splits": [
    {
      "person": "Person name",
      "amount": 0.00
    }
  ],
  "convertedTotal": 0.00,
  "exchangeRate": 1.0,
  "confidence": 0.95,
  "unclearFields": [],
  "detectedLanguage": "en",
  "userMessage": "Review the extracted receipt details."
}

Important: Detect the language of the receipt text and respond accordingly. If the receipt contains Arabic text, set "detectedLanguage" to "ar" and provide all messages in Arabic. If English, set to "en" and provide in English.`;

    // Process with Gemini Vision
    const result = await model.generateContent([
      ocrPrompt,
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Image
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();

    // Try to parse JSON from response
    let receiptData;
    try {
      // Extract JSON from the response (handle cases where there's extra text)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        receiptData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      logger.error({ error: parseError, text }, "Failed to parse OCR response");
      return NextResponse.json(
        { 
          success: false, 
          error: "Failed to parse receipt data. Please try again or upload a clearer image." 
        },
        { status: 500 }
      );
    }

    // Validate required fields
    const requiredFields = ["merchant", "date", "total", "currency"];
    const missingFields = requiredFields.filter(field => !receiptData[field]);
    
    if (missingFields.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Missing required fields: ${missingFields.join(", ")}`,
        data: receiptData
      }, { status: 400 });
    }

    logger.info({
      receiptId: receiptData.receiptId,
      merchant: receiptData.merchant,
      total: receiptData.total,
      confidence: receiptData.confidence
    }, "Receipt processed successfully");

    return NextResponse.json({
      success: true,
      data: receiptData
    });

  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      "Receipt processing error"
    );
    
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process receipt. Please try again.",
      },
      { status: 500 }
    );
  }
} 