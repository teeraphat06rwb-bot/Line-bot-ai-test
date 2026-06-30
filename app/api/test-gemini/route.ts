import { NextResponse } from "next/server";
import Groq from "groq-sdk";

export async function GET(): Promise<NextResponse> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return NextResponse.json({ error: "no key" });

  try {
    const groq = new Groq({ apiKey: key });
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: "สวัสดี ตอบสั้นๆ" }],
      temperature: 1.0,
      max_tokens: 50,
    });
    const text = response.choices?.[0]?.message?.content;
    return NextResponse.json({ ok: true, text, keyPrefix: key.slice(0, 6) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg, keyPrefix: key.slice(0, 6) });
  }
}
