let cachedCsv: string | null = null;
let cacheExpireAt: number = 0;
const CACHE_TTL_MS = 60 * 1000;

// ค้นหาแถวที่เกี่ยวข้องกับคำถาม แทนที่จะส่ง CSV ทั้งหมด
export function filterRelevantFaq(csv: string, userMessage: string): string {
  const lines = csv.split("\n");
  const header = lines[0];
  const rows = lines.slice(1).filter((r) => r.trim());
  const query = userMessage.toLowerCase();

  const scored = rows
    .map((row) => {
      const text = row.toLowerCase();
      let score = 0;
      for (const word of query.split(/\s+/)) {
        if (word.length > 1 && text.includes(word)) score++;
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
