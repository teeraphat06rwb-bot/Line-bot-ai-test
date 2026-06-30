import { NextRequest, NextResponse } from "next/server";
import { validateSignature } from "@line/bot-sdk";
import { getFaqCsv } from "@/lib/sheet";
import { askGemini } from "@/lib/gemini";
import { replyText } from "@/lib/line";
import { buildSystemPrompt, DEFAULT_REPLY } from "@/lib/constants";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvent = Record<string, any>;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Verify LINE signature
  const signature = req.headers.get("x-line-signature") ?? "";
  const body = await req.text();

  const isValid = validateSignature(
    body,
    process.env.LINE_CHANNEL_SECRET!,
    signature
  );

  if (!isValid) {
    console.warn("[webhook] invalid signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = JSON.parse(body) as { events: AnyEvent[] };

  // ต้อง return 200 ให้ LINE เร็วที่สุด — ครอบ try-catch ทั้งหมด
  try {
    for (const event of parsed.events) {
      if (event.type !== "message" || event.message?.type !== "text") continue;

      const userMessage: string = event.message.text;
      const replyToken: string = event.replyToken;
      const start = Date.now();

      let replyMsg = DEFAULT_REPLY;

      try {
        const csvData = await getFaqCsv();
        const systemPrompt = buildSystemPrompt(csvData, userMessage);
        replyMsg = await askGemini(systemPrompt);
      } catch (err) {
        const msg = err instanceof Error ? `${err.message} | stack: ${err.stack?.split("\n")[1]}` : String(err);
        console.error("[webhook] gemini/sheet error:", msg);
        replyMsg = DEFAULT_REPLY;
      }

      const elapsed = Date.now() - start;
      console.log(`[webhook] replied in ${elapsed}ms`);

      try {
        await replyText(replyToken, replyMsg);
      } catch (err) {
        console.error("[webhook] LINE reply error:", err);
      }
    }
  } catch (err) {
    console.error("[webhook] unexpected error:", err);
  }

  return NextResponse.json({ ok: true });
}
