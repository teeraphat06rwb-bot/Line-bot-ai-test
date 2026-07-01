import { GoogleGenerativeAI } from "@google/generative-ai";
import { DEFAULT_REPLY } from "./constants";
import type { ChatMessage } from "./memory";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function askGemini(
  systemPrompt: string,
  history: ChatMessage[] = []
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt,
    generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
  });

  const lastUser = history[history.length - 1];
  const prevHistory = history.slice(0, -1);

  const chat = model.startChat({
    history: prevHistory.map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    })),
  });

  try {
    const result = await chat.sendMessage(lastUser?.content ?? "");
    const text = result.response.text().trim();
    console.log(`[gemini] tokens=${result.response.usageMetadata?.totalTokenCount ?? 0}`);
    return text || DEFAULT_REPLY;
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    console.error(`[gemini] error status=${status}`, err);
    if (status === 429) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const retry = await chat.sendMessage(lastUser?.content ?? "");
        return retry.response.text().trim() || DEFAULT_REPLY;
      } catch {
        return DEFAULT_REPLY;
      }
    }
    return DEFAULT_REPLY;
  }
}
