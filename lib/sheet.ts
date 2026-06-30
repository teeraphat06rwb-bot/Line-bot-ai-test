let cachedCsv: string | null = null;
let cacheExpireAt: number = 0;
const CACHE_TTL_MS = 60 * 1000;

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
