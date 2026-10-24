// Client PixelLab v2 dùng chung cho các tool vẽ (chân dung, sprite tướng).
// PIXELLAB_API_KEY có thể chứa nhiều key cách nhau bởi dấu phẩy: key nào hết credit (402) thì tự chuyển sang key kế tiếp.
export const API = "https://api.pixellab.ai/v2";

const keys = (process.env.PIXELLAB_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
let keyIdx = 0;

export function requireKey() {
  if (!keys.length) {
    console.error("Thiếu PIXELLAB_API_KEY (lấy tại https://www.pixellab.ai/account). Chạy thử không cần key: --dry-run");
    process.exit(1);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API}/${path}`, {
        method,
        headers: { Authorization: `Bearer ${keys[keyIdx]}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      // Rớt mạng giữa chừng → thử lại
      if (attempt < 8) { await sleep(2000 * 2 ** Math.min(attempt, 4)); continue; }
      throw e;
    }
    // 429: quá tần suất / quá số job đồng thời, 5xx: máy chủ lỗi tạm thời → chờ rồi thử lại
    if ((res.status === 429 || res.status >= 500) && attempt < 8) {
      await sleep(2000 * 2 ** Math.min(attempt, 6));
      continue;
    }
    if (res.status === 401) throw new Error("PIXELLAB_API_KEY không hợp lệ (401)");
    if (res.status === 402) {
      const detail = await res.text();
      // Gói Free bị tạm khoá khi máy chủ đông: không phải hết credit, chờ rồi thử lại
      if (/temporarily unavailable/i.test(detail) && attempt < 60) {
        if (attempt === 0) console.log("  … PixelLab tạm khoá lượt vẽ miễn phí (máy chủ đông), chờ 5 phút rồi thử lại");
        await sleep(5 * 60_000);
        continue;
      }
      if (keyIdx + 1 < keys.length) {
        console.log(`  … key #${keyIdx + 1} hết credit, chuyển sang key #${keyIdx + 2}`);
        keyIdx++;
        attempt = -1;
        continue;
      }
      throw new Error("Hết credit PixelLab (402)");
    }
    if (!res.ok) throw new Error(`PixelLab ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }
}

/** Job nền phải poll bằng đúng key đã tạo ra nó, nên giữ nguyên key cho tới khi xong. */
export async function waitJob<T>(jobId: string, timeoutMs = 15 * 60_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const job = await call<{ status: string; last_response?: T & { detail?: string } }>("GET", `background-jobs/${jobId}`);
    if (job.status === "completed") return job.last_response as T;
    if (job.status === "failed") throw new Error(`job thất bại: ${job.last_response?.detail ?? "không rõ"}`);
    if (Date.now() - start > timeoutMs) throw new Error("job quá thời gian chờ");
    await sleep(4000);
  }
}

export interface B64Image { type?: string; base64: string; format?: string }
export const toPng = (img: B64Image) => Buffer.from(img.base64.replace(/^data:image\/\w+;base64,/, ""), "base64");
export const fromPng = (buf: Buffer): B64Image => ({ type: "base64", base64: buf.toString("base64") });
