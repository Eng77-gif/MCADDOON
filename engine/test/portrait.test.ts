import { test } from "node:test";
import assert from "node:assert/strict";
import { hash32, jerseyColors, portraitRequest } from "../tools/portraitPrompt.ts";

const kiin = { id: "GEN_TOP", ign: "Kiin", role: "TOP" as const, teamId: "GEN" };

test("prompt + seed ổn định cho cùng tuyển thủ", () => {
  assert.deepEqual(portraitRequest(kiin), portraitRequest(kiin));
  assert.equal(hash32("GEN_TOP"), hash32("GEN_TOP"));
  assert.notEqual(portraitRequest(kiin).seed, portraitRequest({ ...kiin, id: "GEN_JUNGLE", role: "JUNGLE" }).seed);
});

test("cả đội cùng màu áo, mô tả riêng thay cho ngoại hình ngẫu nhiên", () => {
  const r = portraitRequest(kiin, 96, "curly red hair");
  assert.match(r.description, new RegExp(jerseyColors("GEN")));
  assert.match(r.description, /curly red hair/);
  assert.deepEqual(r.image_size, { width: 96, height: 96 });
  assert.ok(r.seed >= 0 && Number.isInteger(r.seed));
});
