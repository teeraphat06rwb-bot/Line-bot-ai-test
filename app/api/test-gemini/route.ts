import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function GET(): Promise<NextResponse> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "no key" });

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: "สวัสดี ตอบสั้นๆ" }] }],
      config: { temperature: 1.0, maxOutputTokens: 50 },
    });
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    return NextResponse.json({ ok: true, text, keyPrefix: key.slice(0, 8) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg, keyPrefix: key.slice(0, 8) });
  }
}
