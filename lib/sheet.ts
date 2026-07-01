let cachedCsv: string | null = null;
let cacheExpireAt: number = 0;
const CACHE_TTL_MS = 60 * 1000;

// ค้นหาแถวที่เกี่ยวข้องกับคำถาม โดยใช้ substring matching (รองรับภาษาไทยที่ไม่มีเว้นวรรค)
export function filterRelevantFaq(csv: string, userMessage: string): string {
  const lines = csv.split("\n");
  const header = lines[0];
  const rows = lines.slice(1).filter((r) => r.trim());
  const query = userMessage.toLowerCase();

  const scored = rows
    .map((row) => {
      const text = row.toLowerCase();
      let score = 0;
      // ตรวจสอบ 2 ทิศทาง: คำใน query อยู่ใน row หรือคำใน row อยู่ใน query
      // แบ่ง row เป็น segments (แต่ละ cell) เพื่อ matching แม่นขึ้น
      const cells = text.split(",");
      for (const cell of cells) {
        const segment = cell.trim();
        if (segment.length >= 2 && query.includes(segment)) score += 3; // row → query (แม่นมาก)
      }
      // query substring อยู่ใน row (ใช้ทุก ngram ขนาด 2+ ตัว)
      for (let i = 0; i < query.length - 1; i++) {
        for (let len = 2; len <= Math.min(8, query.length - i); len++) {
          const chunk = query.slice(i, i + len);
          if (text.includes(chunk)) { score++; break; }
        }
      }
      return { row, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((r) => r.row);

  const selected = scored.length > 0 ? scored : rows.slice(0, 6);
  return [header, ...selected].join("\n");
}

export async function getFaqCsv(): Promise<string> {
  const now = Date.now();

  if (cachedCsv && now < cacheExpireAt) {
    return cachedCsv;
  }

  const url = process.env.SHEET_CSV_URL;
  if (!url) {
    console.error("[sheet] SHEET_CSV_URL is not set");
    return cachedCsv ?? "";
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    cachedCsv = text;
    cacheExpireAt = now + CACHE_TTL_MS;
    return cachedCsv;
  } catch (err) {
    console.error("[sheet] fetch failed:", err);
    // ใช้ cache เก่าแม้หมดอายุ ถ้ามี
    return cachedCsv ?? "";
  }
}
