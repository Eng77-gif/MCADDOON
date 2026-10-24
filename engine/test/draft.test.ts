import { test } from "node:test";
import assert from "node:assert/strict";
import { draftScore, draftWinProbability, matchup, DRAFT } from "../src/index.ts";
import { BLUE_PICKS, PATCH, RED_PICKS, db, teams } from "./fixtures.ts";

test("khắc chế tự suy ra chiều ngược lại", () => {
  assert.equal(matchup(db, "AHRI", "AZIR"), 2);
  assert.equal(matchup(db, "AZIR", "AHRI"), -2);
});

test("xác suất draft đối xứng và bị chặn trong [pMin, pMax]", () => {
  assert.equal(draftWinProbability(10, 10), 0.5);
  assert.ok(Math.abs(draftWinProbability(20, 5) + draftWinProbability(5, 20) - 1) < 1e-12);
  assert.equal(draftWinProbability(1000, 0), DRAFT.pMax);
  assert.equal(draftWinProbability(0, 1000), DRAFT.pMin);
});

test("pick ngoài bể tướng bị phạt so với tướng tủ", () => {
  const signature = draftScore(db, PATCH, teams[0], BLUE_PICKS, RED_PICKS, "PICK_OFF");
  const offPool = draftScore(db, PATCH, teams[0], { ...BLUE_PICKS, MID: "LEBLANC" }, RED_PICKS, "PICK_OFF");
  assert.ok(signature.mastery - offPool.mastery > 5);
});
