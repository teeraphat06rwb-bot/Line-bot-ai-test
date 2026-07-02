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
  FAQ_NOT_FOUND_REPLY,
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

const DOCTOR_KEYWORDS = ["รายชื่อแพทย์", "ดูหมอ", "แนะนำหมอ", "หมอท่านไหน", "แพทย์ท่านไหน", "รายชื่อหมอ", "พบหมอ", "ทีมแพทย์"];
const BOOK_KEYWORDS = ["อยากนัด", "ขอนัด", "นัดหมาย", "จองคิว", "ลงทะเบียน", "อยากจอง", "ขอจอง", "นัดแพทย์", "นัดหมอ", "ทำนัด", "นัดได้ไหม", "จองได้ไหม", "ขอตรวจ", "สนใจตรวจ"];
// คำถามไม่ชัด → ถามกลับแทนที่จะ booking หรือ AI
const CLARIFY_KEYWORDS = ["ไม่รู้ว่า", "ไม่แน่ใจ", "ควรตรวจอะไร", "ตรวจอะไรดี", "แนะนำหน่อย", "คนในครอบครัว", "คนในบ้าน", "พ่อเป็น", "แม่เป็น", "พี่เป็น", "น้องเป็น"];
const CLARIFY_REPLY = "อยากช่วยแนะนำให้ถูกต้องนะคะ 😊 ขอถามเพิ่มนิดนึงได้ไหมคะ\n\nตอนนี้มีอาการที่กังวลอยู่ไหมคะ หรืออยากตรวจคัดกรองทั่วไปคะ?\n\nบอกได้เลยค่ะ น้องจะแนะนำให้เหมาะกับคุณค่ะ 🙏\n\nหรือติดต่อเจ้าหน้าที่โดยตรงได้เลยที่ LINE: @chgcancercenter หรือโทร 063-816-6058 ค่ะ";
// ข้อความสั้นมากๆ ที่คลุมเครือ เช่น "มะเร็ง" เดี่ยวๆ
const VAGUE_CANCER_REPLY = "ขอบคุณที่ติดต่อมานะคะ 😊 อยากทราบเพิ่มเติมว่าต้องการข้อมูลด้านใดคะ\n\n🔍 ตรวจคัดกรองมะเร็ง\n💊 ข้อมูลการรักษา\n👨‍👩‍👧 มีคนในครอบครัวที่ป่วยอยู่\n\nบอกได้เลยค่ะ น้องจะช่วยแนะนำให้ค่ะ 🙏";

// เบอร์โทร 9-10 หลัก (มี 0 นำหน้า หรือ +66)
const PHONE_REGEX = /(?:\+66|0)\d{8,9}/;

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
          await replyText(replyToken, "ขออภัยค่ะ ไม่พบข้อมูลแพทย์ท่านนี้\n\n" + CONTACT_INFO);
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

      // 2. SAFETY: วินิจฉัยโรค → hard-code ไม่ส่ง AI
      if (DIAGNOSIS_KEYWORDS.some((kw) => userMessage.includes(kw))) {
        console.log("[webhook] diagnosis keyword triggered");
        await replyText(replyToken, DIAGNOSIS_REPLY);
        continue;
      }

      // 3. SAFETY: ขอคุยกับเจ้าหน้าที่ → hard-code ไม่ส่ง AI
      if (STAFF_KEYWORDS.some((kw) => userMessage.includes(kw))) {
        console.log("[webhook] staff keyword triggered");
        await replyText(replyToken, STAFF_REPLY);
        continue;
      }

      // 4. ข้อความสั้นคลุมเครือ "มะเร็ง" เดี่ยวๆ → ถามกลับ
      if (userMessage.trim().length <= 6 && userMessage.includes("มะเร็ง")) {
        await replyText(replyToken, VAGUE_CANCER_REPLY);
        continue;
      }

      // ถามไม่ชัด → ถามกลับก่อน ไม่ต้อง booking
      if (CLARIFY_KEYWORDS.some((kw) => userMessage.includes(kw))) {
        await replyText(replyToken, CLARIFY_REPLY);
        continue;
      }

      // 5. ดูรายชื่อแพทย์ → Flex Carousel
      if (DOCTOR_KEYWORDS.some((kw) => userMessage.includes(kw))) {
        try {
          await replyFlex(replyToken, "ทีมแพทย์ศูนย์มะเร็ง", buildDoctorCarousel());
        } catch (err) {
          console.error("[webhook] flex carousel error:", err);
          await replyText(replyToken, DEFAULT_REPLY);
        }
        continue;
      }

      // 5. ลูกค้าส่งเบอร์โทร = ส่งข้อมูลการนัดมาแล้ว → ตอบรับเรื่องทันที
      if (PHONE_REGEX.test(userMessage)) {
        await replyText(replyToken,
          "น้องได้รับข้อมูลของคุณแล้วนะคะ 📋\n\nเจ้าหน้าที่จะติดต่อกลับหาคุณภายใน 1 วันทำการค่ะ\n\nถ้าต้องการติดต่อด่วน โทรหาเราได้เลยที่ 063-816-6058 หรือ LINE: @chgcancercenter ค่ะ 😊"
        );
        await clearHistory(userId);
        continue;
      }

      // 6. นัดหมาย → ขอข้อมูลติดต่อ (ใช้ AI ดึง context จาก history)
      if (BOOK_KEYWORDS.some((kw) => userMessage.includes(kw))) {
        let bookMsg = `ยินดีช่วยนัดหมายให้เลยค่ะ 😊\n\nกรุณาแจ้งข้อมูลด้านล่าง แล้วเจ้าหน้าที่จะติดต่อกลับภายใน 1 วันทำการค่ะ\n\n📝 ชื่อ-นามสกุล:\n📱 เบอร์โทรศัพท์:\n🕐 ช่วงเวลาที่สะดวกรับสาย:\n🏥 บริการที่สนใจ:\n\n${CONTACT_INFO}`;
        try {
          const history = await getHistory(userId);
          if (history.length > 0) {
            const bookPrompt = `คุณคือ "น้องใส่ใจ" ผู้ช่วยหญิงของศูนย์มะเร็งชีวารักษ์ ลงท้ายด้วย "ค่ะ" เท่านั้น ห้ามใช้ "ครับ"
ผู้ใช้ต้องการนัดหมาย ให้อ้างอิง context ว่าสนใจบริการอะไร แล้วขอข้อมูล: ชื่อ เบอร์โทร ช่วงเวลาที่สะดวก และบริการที่สนใจ
ตอบสั้นๆ อบอุ่น ห้าม markdown จบด้วย "LINE: @chgcancercenter หรือโทร 063-816-6058 ค่ะ"`;
            bookMsg = await askGemini(bookPrompt, [...history, { role: "user", content: userMessage }]);
            await appendHistory(userId, userMessage, bookMsg);
          }
        } catch (err) {
          console.error("[webhook] book ai error:", err);
        }
        await replyText(replyToken, bookMsg);
        continue;
      }

      // 6. คำถามทั่วไป → เช็ค FAQ ก่อน แล้วส่ง AI
      let replyMsg = DEFAULT_REPLY;
      try {
        const csvData = await getFaqCsv();
        const relevantFaq = filterRelevantFaq(csvData, userMessage);

        // ถ้า FAQ ไม่มีข้อมูลเกี่ยวข้องเลย → ตอบ fallback ทันที ไม่ส่ง AI
        if (relevantFaq === null) {
          console.log("[webhook] no FAQ match, using fallback");
          await replyText(replyToken, FAQ_NOT_FOUND_REPLY);
          continue;
        }

        const history = await getHistory(userId);
        const systemPrompt = buildSystemPrompt(relevantFaq);
        replyMsg = await askGemini(systemPrompt, [...history, { role: "user", content: userMessage }]);
        // กรอง output: ถ้า AI ยังใช้คำต้องห้าม ให้ตัดออก
        replyMsg = replyMsg.replace(/ไม่ต้องกลัว/g, "เข้าใจความรู้สึกนะคะ");
        replyMsg = replyMsg.replace(/ครับ(?=[^/]|$)/g, "ค่ะ");
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
