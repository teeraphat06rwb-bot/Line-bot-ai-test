import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_HISTORY = 4; // เก็บ 4 ข้อความล่าสุด (2 รอบ)
const TTL_SECONDS = 60 * 60 * 6; // ลืมหลัง 6 ชั่วโมงไม่คุย

export async function getHistory(userId: string): Promise<ChatMessage[]> {
  try {
    const data = await redis.get<ChatMessage[]>(`chat:${userId}`);
    return data ?? [];
  } catch {
    return [];
  }
}

export async function appendHistory(
  userId: string,
  userMsg: string,
  botMsg: string
): Promise<void> {
  try {
    const history = await getHistory(userId);
    history.push({ role: "user", content: userMsg });
    history.push({ role: "assistant", content: botMsg });

    // ตัดเหลือแค่ MAX_HISTORY รายการล่าสุด
    const trimmed = history.slice(-MAX_HISTORY);
    await redis.set(`chat:${userId}`, trimmed, { ex: TTL_SECONDS });
  } catch (err) {
    console.error("[memory] appendHistory error:", err);
  }
}

export async function clearHistory(userId: string): Promise<void> {
  try {
    await redis.del(`chat:${userId}`);
  } catch {
    // ignore
  }
}
