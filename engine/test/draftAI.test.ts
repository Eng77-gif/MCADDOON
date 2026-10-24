import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAFT_ORDER, ROLES, applyDraft, aiDraftStep, createRng, isDraftDone, newDraft, runAiDraft, suggest } from "../src/index.ts";
import { PATCH, realPack, realTeam } from "./fixtures.ts";

const db = realPack.champions;

test("thứ tự Ban/Pick chuẩn: 10 cấm, 10 chọn, mỗi bên 5 chọn", () => {
  assert.equal(DRAFT_ORDER.length, 20);
  for (const side of [0, 1]) assert.equal(DRAFT_ORDER.filter((s) => s.side === side && s.type === "PICK").length, 5);
});

test("AI hoàn thành draft hợp lệ: đủ 5 vị trí, không trùng, không dùng tướng bị khoá", () => {
  const locked = ["AZIR", "KAISA", "RAKAN"];
  const d = runAiDraft(db, newDraft(PATCH, [realTeam("GEN"), realTeam("T1")], locked), createRng(1));
  assert.ok(isDraftDone(d));
  const all = [...d.bans[0], ...d.bans[1], ...Object.values(d.picks[0]), ...Object.values(d.picks[1])];
  assert.equal(new Set(all).size, all.length);
  for (const side of [0, 1] as const) assert.deepEqual(Object.keys(d.picks[side]).sort(), [...ROLES].sort());
  for (const l of locked) assert.ok(!all.includes(l));
});

test("không cho chọn tướng đã bị cấm", () => {
  const d = applyDraft(db, newDraft(PATCH, [realTeam("GEN"), realTeam("T1")]), "AZIR");
  assert.throws(() => applyDraft(db, d, "AZIR"), /không khả dụng/);
});

test("AI cấm tướng tủ của đối thủ ở lượt cấm đầu", () => {
  const d = newDraft(PATCH, [realTeam("GEN"), realTeam("T1")]);
  const ban = suggest(db, d, 5).map((s) => s.champion);
  const t1Signatures = Object.values(realTeam("T1").roster).flatMap((p) => p.champion_pool.filter((e) => e.is_signature).map((e) => e.champion_id));
  assert.ok(ban.some((b) => t1Signatures.includes(b)), `bans ${ban}`);
});

test("cùng seed => cùng draft", () => {
  const mk = () => aiDraftStep(db, newDraft(PATCH, [realTeam("GEN"), realTeam("T1")]), createRng(9), 0.5);
  assert.deepEqual(mk(), mk());
});
