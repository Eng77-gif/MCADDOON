// Client tối giản cho PixelLab API v1 (https://api.pixellab.ai/v1), không phụ thuộc thư viện.
// Định dạng request/response theo SDK chính thức @pixellab-code/pixellab 1.0.2.

export type Outline = "single color black outline" | "single color outline" | "selective outline" | "lineless";
export type Shading = "flat shading" | "basic shading" | "medium shading" | "detailed shading" | "highly detailed shading";
export type Detail = "low detail" | "medium detail" | "highly detailed";
export type CameraView = "side" | "low top-down" | "high top-down";
export type Direction = "south" | "south-east" | "east" | "north-east" | "north" | "north-west" | "west" | "south-west";

export interface PixfluxParams {
  description: string;
  width: number;
  height: number;
  negativeDescription?: string;
  textGuidanceScale?: number;
  outline?: Outline;
  shading?: Shading;
  detail?: Detail;
  view?: CameraView;
  direction?: Direction;
  noBackground?: boolean;
  seed?: number;
}

export interface PixfluxResult {
  /** PNG đã giải mã base64 */
  png: Uint8Array;
  usd: number;
}

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export class PixelLabError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class PixelLabClient {
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;

  constructor(secret: string, opts: { baseUrl?: string; fetch?: FetchLike } = {}) {
    if (!secret) throw new Error("Thiếu PIXELLAB_SECRET (API key lấy ở https://www.pixellab.ai)");
    this.secret = secret;
    this.baseUrl = opts.baseUrl ?? "https://api.pixellab.ai/v1";
    this.fetchFn = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  }

  private headers(json = false): Record<string, string> {
    return { Authorization: `Bearer ${this.secret}`, ...(json ? { "Content-Type": "application/json" } : {}) };
  }

  private async check(res: Awaited<ReturnType<FetchLike>>) {
    if (res.ok) return;
    const body = await res.text().catch(() => "");
    const hint = res.status === 401 ? " (API key sai)" : res.status === 402 ? " (hết số dư)" : res.status === 429 ? " (gọi quá nhanh)" : "";
    throw new PixelLabError(res.status, `PixelLab HTTP ${res.status}${hint}: ${body.slice(0, 300)}`);
  }

  async balance(): Promise<number> {
    const res = await this.fetchFn(`${this.baseUrl}/balance`, { method: "GET", headers: this.headers() });
    await this.check(res);
    const data = (await res.json()) as { usd: number };
    return data.usd;
  }

  /** Body đúng định dạng snake_case mà API nhận. Tách riêng để test. */
  static pixfluxBody(p: PixfluxParams) {
    return {
      description: p.description,
      image_size: { width: p.width, height: p.height },
      negative_description: p.negativeDescription ?? "",
      text_guidance_scale: p.textGuidanceScale ?? 8,
      outline: p.outline,
      shading: p.shading,
      detail: p.detail,
      view: p.view,
      direction: p.direction,
      isometric: false,
      no_background: p.noBackground ?? false,
      init_image: null,
      init_image_strength: 300,
      color_image: null,
      seed: p.seed ?? 0,
    };
  }

  async generatePixflux(p: PixfluxParams): Promise<PixfluxResult> {
    const res = await this.fetchFn(`${this.baseUrl}/generate-image-pixflux`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(PixelLabClient.pixfluxBody(p)),
    });
    await this.check(res);
    const data = (await res.json()) as { image: { base64: string }; usage?: { usd: number } };
    return { png: Uint8Array.from(Buffer.from(data.image.base64, "base64")), usd: data.usage?.usd ?? 0 };
  }
}
