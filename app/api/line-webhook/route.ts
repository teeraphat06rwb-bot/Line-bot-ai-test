import { NextRequest, NextResponse } from "next/server";
import { validateSignature } from "@line/bot-sdk";
import { getFaqCsv, filterRelevantFaq } from "@/lib/sheet";
import { askGemini } from "@/lib/gemini";
import { replyText, replyFlex, buildReplyBubble } from "@/lib/line";
import { buildSystemPrompt, DEFAULT_REPLY } from "@/lib/constants";
import {
  buildDoctorCarousel,
  buildDoctorDetailBubble,
  getDoctorById,
} from "@/lib/doctors";
import { getHistory, appendHistory, clearHistory } from "@/lib/memory";

// ใช้ phrase เต็มๆ ไม่ใช่ substring เพื่อป้องกัน false match เช่น "ไหมอะ" → "หมอ"
const DOCTOR_KEYWORDS = ["แพทย์", "ดูหมอ", "แนะนำหมอ", "หมอท่านไหน", "แพทย์ท่านไหน", "รายชื่อหมอ", "หมอค่ะ", "หมอครับ", "พบหมอ"];
const BOOK_KEYWORDS = ["อยากนัด", "ขอนัด", "นัดหมาย", "จองคิว", "ลงทะเบียน", "อยากจอง", "ขอจอง", "นัดแพทย์", "นัดหมอ", "ทำนัด", "นัดได้ไหม", "จองได้ไหม", "อยากตรวจ", "ขอตรวจ", "สนใจตรวจ"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvent = Record<string, any>;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("x-line-signature") ?? "";
  const body = await req.text();

  const isValid = validateSignature(body, process.env.LINE_CHANNEL_SECRET!, signature);
  if (!isValid) {
    console.warn("[webhook] invalid signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = JSON.parse(body) as { events: AnyEvent[] };

  try {
    for (const event of parsed.events) {
      const replyToken: string = event.replyToken;

      // --- Postback: ดูรายละเอียด / นัดพบแพทย์ ---
      if (event.type === "postback") {
        const data: string = event.postback?.data ?? "";
        const params = new URLSearchParams(data);
        const action = params.get("action");
        const docId = params.get("id") ?? "";
        const doc = getDoctorById(docId);

        if (action === "show_doctors") {
          await replyFlex(replyToken, "ข้อมูลแพทย์ศูนย์มะเร็ง", buildDoctorCarousel());
          continue;
        }

        if (!doc) {
          await replyFlex(replyToken, "ไม่พบข้อมูลแพทย์", buildReplyBubble("ขออภัยค่ะ ไม่พบข้อมูลแพทย์ท่านนี้ 🙏", true));
          continue;
        }

        if (action === "view_doctor") {
          try {
            await replyFlex(replyToken, `รายละเอียด ${doc.name}`, buildDoctorDetailBubble(doc));
          } catch (err) {
            console.error("[webhook] flex detail error:", err);
            await replyFlex(replyToken, DEFAULT_REPLY, buildReplyBubble(DEFAULT_REPLY, true));
          }
        } else if (action === "book_doctor") {
          const bookMsg = `ขอบคุณที่สนใจนัดพบ ${doc.name} นะคะ 😊\n\nกรุณาแจ้งข้อมูลด้านล่างนี้ แล้วเจ้าหน้าที่จะติดต่อกลับภายใน 1 วันทำการค่ะ 📞\n\n📝 ชื่อ-นามสกุล:\n📱 เบอร์โทรศัพท์:\n🕐 ช่วงเวลาที่สะดวกรับสาย:`;
          await replyFlex(replyToken, bookMsg, buildReplyBubble(bookMsg));
        }
        continue;
      }

      // --- Message: ข้อความทั่วไป ---
      if (event.type !== "message" || event.message?.type !== "text") continue;

      const userMessage: string = event.message.text;
      const userId: string = event.source?.userId ?? "unknown";
      const start = Date.now();

      // เคลียร์ประวัติการสนทนา
      if (["เคลียร์", "clear", "ลืมเลย", "เริ่มใหม่", "/clear"].includes(userMessage.trim().toLowerCase())) {
        await clearHistory(userId);
        await replyText(replyToken, "น้องใส่ใจลืมบทสนทนาเก่าหมดแล้วนะคะ 🧹 เริ่มใหม่ได้เลยค่ะ 😊");
        continue;
      }

      // ถามเรื่องการนัด/จอง → ให้ AI ตอบโดยอ้าง context จาก history
      const isBookQuery = BOOK_KEYWORDS.some((kw) => userMessage.includes(kw));
      if (isBookQuery) {
        let bookMsg = `ยินดีช่วยนัดหมายให้เลยค่ะ 😊\n\nกรุณาแจ้งข้อมูลด้านล่าง แล้วเจ้าหน้าที่จะติดต่อกลับภายใน 1 วันทำการค่ะ 📞\n\n📝 ชื่อ-นามสกุล:\n📱 เบอร์โทรศัพท์:\n🕐 ช่วงเวลาที่สะดวกรับสาย:\n🏥 บริการที่สนใจ:`;
        try {
          const history = await getHistory(userId);
          if (history.length > 0) {
            const bookSystemPrompt = `คุณคือ "น้องใส่ใจ" ผู้ช่วยของศูนย์โรคมะเร็ง รพ.จุฬารัตน์ 3
ผู้ใช้ต้องการนัดหมายหรือจองบริการ ให้ตอบโดยอ้างอิงจากบทสนทนาก่อนหน้าว่าผู้ใช้สนใจบริการอะไร
ตอบสั้นๆ อบอุ่น แล้วขอข้อมูล: ชื่อ-นามสกุล, เบอร์โทรศัพท์, ช่วงเวลาที่สะดวก และระบุบริการที่สนใจจาก context ให้ล่วงหน้า
ห้ามใช้ markdown ตอบเป็นภาษาไทยเท่านั้น`;
            bookMsg = await askGemini(bookSystemPrompt, [...history, { role: "user", content: userMessage }]);
            await appendHistory(userId, userMessage, bookMsg);
          }
        } catch (err) {
          console.error("[webhook] book ai error:", err);
        }
        try {
          await replyText(replyToken, bookMsg);
        } catch (err) {
          console.error("[webhook] book reply error:", err);
        }
        continue;
      }

      // ถามเรื่องแพทย์ → ส่ง Flex Carousel
      const isDoctorQuery = DOCTOR_KEYWORDS.some((kw) => userMessage.includes(kw));
      if (isDoctorQuery) {
        try {
          await replyFlex(replyToken, "ข้อมูลแพทย์ศูนย์มะเร็ง", buildDoctorCarousel());
        } catch (err) {
          console.error("[webhook] flex carousel error:", err);
          await replyFlex(replyToken, DEFAULT_REPLY, buildReplyBubble(DEFAULT_REPLY, true));
        }
        continue;
      }

      let replyMsg = DEFAULT_REPLY;
      try {
        const csvData = await getFaqCsv();
        const relevantFaq = filterRelevantFaq(csvData, userMessage);
        const history = await getHistory(userId);
        const systemPrompt = buildSystemPrompt(relevantFaq);
        replyMsg = await askGemini(systemPrompt, [...history, { role: "user", content: userMessage }]);
        await appendHistory(userId, userMessage, replyMsg);
      } catch (err) {
        const msg = err instanceof Error ? `${err.message} | stack: ${err.stack?.split("\n")[1]}` : String(err);
        console.error("[webhook] ai error:", msg);
        replyMsg = DEFAULT_REPLY;
      }

      console.log(`[webhook] replied in ${Date.now() - start}ms`);

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
