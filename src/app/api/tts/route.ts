import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(request: NextRequest) {
  try {
    const { text, voice = "Puck", responseMimeType = "audio/mp3" } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { success: false, error: "'text' is required" },
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { responseMimeType, voice } as any
    });

    const response = await result.response;
    // Audio is returned as inlineData base64 in the first part
    const candidate = (response as any)?.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const inlineData = part?.inlineData;
    const base64 = inlineData?.data;
    const mimeType = inlineData?.mimeType || responseMimeType;

    if (!base64) {
      return NextResponse.json(
        { success: false, error: "No audio data returned from Gemini" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, audio: base64, mimeType });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `TTS failed: ${message}` },
      { status: 500 }
    );
  }
}


