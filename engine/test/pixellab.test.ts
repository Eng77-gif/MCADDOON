import { test } from "node:test";
import assert from "node:assert/strict";
import { PixelLabClient, PixelLabError } from "../tools/pixellab/client.ts";
import { colorName, portraitParams, stableSeed } from "../tools/pixellab/prompts.ts";
import { realTeam } from "./fixtures.ts";

test("body gửi PixelLab đúng định dạng snake_case của API v1", () => {
  const body = PixelLabClient.pixfluxBody({ description: "x", width: 64, height: 64, noBackground: true, outline: "single color black outline", seed: 7 });
  assert.deepEqual(body.image_size, { width: 64, height: 64 });
  assert.equal(body.no_background, true);
  assert.equal(body.text_guidance_scale, 8);
  assert.equal(body.seed, 7);
  assert.ok("negative_description" in body && "init_image" in body);
});

test("client gọi đúng endpoint, gửi Bearer token và giải mã PNG", async () => {
  const calls: { url: string; init: any }[] = [];
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const fake = async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ image: { type: "base64", base64: png.toString("base64") }, usage: { type: "usd", usd: 0.01 } }), text: async () => "" };
  };
  const client = new PixelLabClient("secret-123", { fetch: fake });
  const r = await client.generatePixflux(portraitParams(realTeam("T1").roster.MID, realTeam("T1")));
  assert.equal(calls[0].url, "https://api.pixellab.ai/v1/generate-image-pixflux");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-123");
  assert.deepEqual([...r.png], [...png]);
  assert.equal(r.usd, 0.01);
});

test("lỗi HTTP được báo rõ ràng", async () => {
  const fake = async () => ({ ok: false, status: 402, json: async () => ({}), text: async () => "insufficient balance" });
  await assert.rejects(new PixelLabClient("k", { fetch: fake }).balance(), (e: unknown) => e instanceof PixelLabError && e.status === 402 && /hết số dư/.test(e.message));
});

test("mô tả chân dung ổn định, theo màu áo, không chứa tên tuyển thủ", () => {
  const t1 = realTeam("T1");
  const p = portraitParams(t1.roster.MID, t1);
  assert.deepEqual(p, portraitParams(t1.roster.MID, t1));
  assert.equal(p.seed, stableSeed(t1.roster.MID.id));
  assert.match(p.description, /red and black team jersey/);
  assert.ok(!p.description.toLowerCase().includes(t1.roster.MID.ign.toLowerCase()));
  assert.equal(colorName("#AA8A00"), "gold");
});
