import Groq from "groq-sdk";
import { DEFAULT_REPLY } from "./constants";
import type { ChatMessage } from "./memory";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callGroq(messages: Groq.Chat.ChatCompletionMessageParam[]): Promise<string> {
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    temperature: 0.4,
    max_tokens: 300,
  });
  const choice = response.choices?.[0];
  const finishReason = choice?.finish_reason ?? "UNKNOWN";
  const totalTokens = response.usage?.total_tokens ?? 0;
  console.log(`[groq] finishReason=${finishReason} tokens=${totalTokens}`);
  if (finishReason === "length") return DEFAULT_REPLY;
  return choice?.message?.content?.trim() ?? DEFAULT_REPLY;
}

export async function askGemini(
  systemPrompt: string,
  history: ChatMessage[] = []
): Promise<string> {
  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((h) => ({ role: h.role, content: h.content })),
  ];

  try {
    return await callGroq(messages);
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      for (const delay of [5000, 10000]) {
        console.warn(`[groq] 429 — retrying in ${delay / 1000}s`);
        await new Promise((r) => setTimeout(r, delay));
        try {
          return await callGroq(messages);
        } catch (retryErr) {
          const retryStatus = (retryErr as { status?: number })?.status;
          if (retryStatus !== 429) throw retryErr;
        }
      }
      return DEFAULT_REPLY;
    }
    throw err;
  }
}
