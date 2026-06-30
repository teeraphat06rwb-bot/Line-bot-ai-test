import { GoogleGenAI } from "@google/genai";
import { DEFAULT_REPLY } from "./constants";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function askGemini(systemPrompt: string): Promise<string> {
  console.log("[gemini] key present:", !!process.env.GEMINI_API_KEY, "key prefix:", process.env.GEMINI_API_KEY?.slice(0,8));
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
    config: {
      temperature: 1.0,
      maxOutputTokens: 1024,
    },
  });

  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason ?? "UNKNOWN";
  const thoughtsTokenCount = response.usageMetadata?.thoughtsTokenCount ?? 0;
  const candidatesTokenCount = response.usageMetadata?.candidatesTokenCount ?? 0;

  console.log(
    `[gemini] finishReason=${finishReason} thoughtsTokens=${thoughtsTokenCount} candidatesTokens=${candidatesTokenCount}`
  );

  if (
    finishReason === "MAX_TOKENS" ||
    finishReason === "SAFETY" ||
    finishReason === "RECITATION"
  ) {
    return DEFAULT_REPLY;
  }

  return candidate?.content?.parts?.[0]?.text?.trim() ?? DEFAULT_REPLY;
}
