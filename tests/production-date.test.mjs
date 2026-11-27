import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRODUCTION_DATE, completedOnProductionDate, dateInWib } from "../lib/production-date.ts";

test("tanggal Produksi berganti pada tengah malam WIB", () => {
  assert.equal(dateInWib(new Date("2026-11-27T16:59:59Z")), "2026-11-27");
  assert.equal(dateInWib(new Date("2026-11-27T17:00:00Z")), "2026-11-28");
});

test("tanggal awal Produksi memakai tanggal skenario berdata", () => {
  assert.equal(DEFAULT_PRODUCTION_DATE, "2026-11-01");
});

test("hasil historis mengikuti tanggal selesai WIB", () => {
  assert.equal(completedOnProductionDate("2026-11-27T17:00:00Z", "2026-11-28"), true);
  assert.equal(completedOnProductionDate("2026-11-27 23:59:59", "2026-11-27"), true);
  assert.equal(completedOnProductionDate("2026-11-28T00:00:00+07:00", "2026-11-27"), false);
  assert.equal(completedOnProductionDate("invalid", "2026-11-27"), false);
});
