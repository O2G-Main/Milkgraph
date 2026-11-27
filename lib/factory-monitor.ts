import type { ProductionAsset, ProductionScheduleRow } from "./api/production.ts";
import { uniqueSchedule } from "./scheduling.ts";

export function validProductionDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Only exact backend asset identifiers join assignments; no name/position inference. */
export function assetAssignments(rows: ProductionScheduleRow[], date: string) {
  const result = new Map<string, ProductionScheduleRow[]>();
  for (const row of uniqueSchedule(rows.filter(row => row.production_date === date))) {
    for (const id of new Set([row.filling_line_id, row.aseptic_tank_id, row.sterilizer_id].filter((id): id is string => !!id))) {
      result.set(id, [...(result.get(id) ?? []), row]);
    }
  }
  return result;
}
export function assignedBatchCount(rows: ProductionScheduleRow[]) { return new Set(rows.map(row => row.batch_id)).size; }

const clean = (value: string) => value.trim().toLowerCase().replace(/[ _-]+/g, " ");
/** Status vocabulary is free text. Unknown strings remain neutral, never assumed normal. */
export function assetStatusTone(value: string | null | undefined): "neutral" | "ok" | "warn" | "crit" {
  if (!value?.trim()) return "neutral";
  const status = clean(value);
  if (["breakdown", "fault", "failed", "rusak", "gagal", "terblokir", "blocked", "stopped", "berhenti", "down", "out of service"].includes(status)) return "crit";
  if (["maintenance", "planned maintenance", "cip", "cleaning", "pembersihan", "perawatan", "hold", "tertahan"].includes(status)) return "warn";
  if (["available", "ready", "siap", "empty clean ready", "running", "berjalan", "in production"].includes(status)) return "ok";
  return "neutral";
}
export function recordedStatusTime(value: string | null | undefined, short = false): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Waktu belum tercatat";
  return `${new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}${short ? "" : " WIB"}`;
}
export function assignedAttention(assets: ProductionAsset[], assignments: Map<string, ProductionScheduleRow[]>) {
  return assets.filter(asset => assignments.has(asset.asset_id) && ["warn", "crit"].includes(assetStatusTone(asset.current_status)));
}
