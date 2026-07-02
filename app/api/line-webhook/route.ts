import { NextRequest, NextResponse } from "next/server";
import { validateSignature } from "@line/bot-sdk";
import { getFaqCsv, filterRelevantFaq } from "@/lib/sheet";
import { askGemini } from "@/lib/gemini";
import { replyText, replyFlex, buildReplyBubble } from "@/lib/line";
import {
  buildSystemPrompt,
  DEFAULT_REPLY,
  DIAGNOSIS_REPLY,
  STAFF_REPLY,
  DIAGNOSIS_KEYWORDS,
  STAFF_KEYWORDS,
  CONTACT_INFO,
} from "@/lib/constants";
import {
  buildDoctorCarousel,
  buildDoctorDetailBubble,
  getDoctorById,
} from "@/lib/doctors";
import { getHistory, appendHistory, clearHistory } from "@/lib/memory";

const DOCTOR_KEYWORDS = ["รายชื่อแพทย์", "ดูหมอ", "แนะนำหมอ", "หมอท่านไหน", "แพทย์ท่านไหน", "รายชื่อหมอ", "หมอค่ะ", "พบหมอ", "ทีมแพทย์"];
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

      // --- Postback ---
      if (event.type === "postback") {
        const data: string = event.postback?.data ?? "";
        const params = new URLSearchParams(data);
        const action = params.get("action");
        const docId = params.get("id") ?? "";
        const doc = getDoctorById(docId);

        if (action === "show_doctors") {
          await replyFlex(replyToken, "ทีมแพทย์ศูนย์มะเร็ง", buildDoctorCarousel());
          continue;
        }

        if (!doc) {
          await replyFlex(replyToken, "ไม่พบข้อมูลแพทย์", buildReplyBubble("ขออภัยค่ะ ไม่พบข้อมูลแพทย์ท่านนี้ค่ะ\n\n" + CONTACT_INFO, true));
          continue;
        }

        if (action === "view_doctor") {
          try {
            await replyFlex(replyToken, `รายละเอียด ${doc.name}`, buildDoctorDetailBubble(doc));
          } catch (err) {
            console.error("[webhook] flex detail error:", err);
            await replyText(replyToken, DEFAULT_REPLY);
          }
        } else if (action === "book_doctor") {
          const bookMsg = `ขอบคุณที่สนใจนัดพบ ${doc.name} นะคะ 😊\n\nกรุณาแจ้งข้อมูลด้านล่าง แล้วเจ้าหน้าที่จะติดต่อกลับภายใน 1 วันทำการค่ะ\n\n📝 ชื่อ-นามสกุล:\n📱 เบอร์โทรศัพท์:\n🕐 ช่วงเวลาที่สะดวกรับสาย:\n\n${CONTACT_INFO}`;
          await replyText(replyToken, bookMsg);
        }
        continue;
      }

      // --- Message ---
      if (event.type !== "message" || event.message?.type !== "text") continue;

      const userMessage: string = event.message.text;
      const userId: string = event.source?.userId ?? "unknown";
      const start = Date.now();

      // 1. เคลียร์ประวัติ
      if (["เคลียร์", "clear", "ลืมเลย", "เริ่มใหม่", "/clear"].includes(userMessage.trim().toLowerCase())) {
        await clearHistory(userId);
        await replyText(replyToken, "น้องใส่ใจลืมบทสนทนาเก่าหมดแล้วนะคะ 🧹 เริ่มใหม่ได้เลยค่ะ 😊");
        continue;
      }

      // 2. SAFETY: วินิจฉัยโรค → hard-code ทันที ไม่ส่ง AI
      if (DIAGNOSIS_KEYWORDS.some((kw) => userMessage.includes(kw))) {
        await replyText(replyToken, DIAGNOSIS_REPLY);
        continue;
      }

      // 3. SAFETY: ขอคุยกับเจ้าหน้าที่ → hard-code ทันที ไม่ส่ง AI
      if (STAFF_KEYWORDS.some((kw) => userMessage.includes(kw))) {
        await replyText(replyToken, STAFF_REPLY);
        continue;
      }

      // 4. ดูรายชื่อแพทย์ → Flex Carousel
      if (DOCTOR_KEYWORDS.some((kw) => userMessage.includes(kw))) {
        try {
          await replyFlex(replyToken, "ทีมแพทย์ศูนย์มะเร็ง", buildDoctorCarousel());
        } catch (err) {
          console.error("[webhook] flex carousel error:", err);
          await replyText(replyToken, DEFAULT_REPLY);
        }
        continue;
      }

      // 5. นัดหมาย → ขอข้อมูลติดต่อ (ใช้ AI ดึง context จาก history)
      if (BOOK_KEYWORDS.some((kw) => userMessage.includes(kw))) {
        let bookMsg = `ยินดีช่วยนัดหมายให้เลยค่ะ 😊\n\nกรุณาแจ้งข้อมูลด้านล่าง แล้วเจ้าหน้าที่จะติดต่อกลับภายใน 1 วันทำการค่ะ\n\n📝 ชื่อ-นามสกุล:\n📱 เบอร์โทรศัพท์:\n🕐 ช่วงเวลาที่สะดวกรับสาย:\n🏥 บริการที่สนใจ:\n\n${CONTACT_INFO}`;
        try {
          const history = await getHistory(userId);
          if (history.length > 0) {
            const bookPrompt = `คุณคือ "น้องใส่ใจ" ผู้ช่วยหญิงของศูนย์มะเร็งชีวารักษ์ ลงท้ายด้วย "ค่ะ" เท่านั้น
ผู้ใช้ต้องการนัดหมาย ให้อ้างอิง context ว่าสนใจบริการอะไร แล้วขอข้อมูล: ชื่อ เบอร์โทร ช่วงเวลาที่สะดวก และบริการที่สนใจ
ตอบสั้นๆ อบอุ่น ห้ามใช้ markdown จบด้วย "${CONTACT_INFO}"`;
            bookMsg = await askGemini(bookPrompt, [...history, { role: "user", content: userMessage }]);
            await appendHistory(userId, userMessage, bookMsg);
          }
        } catch (err) {
          console.error("[webhook] book ai error:", err);
        }
        await replyText(replyToken, bookMsg);
        continue;
      }

      // 6. คำถามทั่วไป → AI + FAQ
      let replyMsg = DEFAULT_REPLY;
      try {
        const csvData = await getFaqCsv();
        const relevantFaq = filterRelevantFaq(csvData, userMessage);
        const history = await getHistory(userId);
        const systemPrompt = buildSystemPrompt(relevantFaq);
        replyMsg = await askGemini(systemPrompt, [...history, { role: "user", content: userMessage }]);
        await appendHistory(userId, userMessage, replyMsg);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[webhook] ai error:", msg);
        replyMsg = DEFAULT_REPLY;
      }

      console.log(`[webhook] replied in ${Date.now() - start}ms`);
      await replyText(replyToken, replyMsg);
    }
  } catch (err) {
    console.error("[webhook] unexpected error:", err);
  }

  return NextResponse.json({ ok: true });
}
