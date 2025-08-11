import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("audio") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "'audio' file is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type || "audio/webm";

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `Transcribe the audio. Return only raw text. Preserve the original language.`;

    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: prompt }] },
        { role: 'user', parts: [{ inlineData: { data: base64, mimeType } }] }
      ],
      generationConfig: { maxOutputTokens: 128 }
    });

    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ success: true, text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `STT failed: ${message}` },
      { status: 500 }
    );
  }
}


