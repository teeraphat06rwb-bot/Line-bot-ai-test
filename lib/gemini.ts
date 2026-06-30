import Groq from "groq-sdk";
import { DEFAULT_REPLY } from "./constants";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function askGemini(systemPrompt: string): Promise<string> {
  console.log("[groq] key present:", !!process.env.GROQ_API_KEY);

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: systemPrompt }],
    temperature: 1.0,
    max_tokens: 1024,
  });

  const choice = response.choices?.[0];
  const finishReason = choice?.finish_reason ?? "UNKNOWN";
  const totalTokens = response.usage?.total_tokens ?? 0;

  console.log(`[groq] finishReason=${finishReason} totalTokens=${totalTokens}`);

  if (finishReason === "length") {
    return DEFAULT_REPLY;
  }

  return choice?.message?.content?.trim() ?? DEFAULT_REPLY;
}
