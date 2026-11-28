"use client";

import Link from "next/link";
import { Button, buttonClass } from "@/components/ui";
import type { DayCondition } from "@/lib/production-condition";
import { useDayCondition } from "./use-day-condition";
import { ConditionIndicator } from "./condition-indicator";
import styles from "./scheduling.module.css";

export function needsUpgradeRecommendation(condition: Pick<DayCondition, "kind" | "shortageL">) {
  return condition.kind === "risk" || condition.kind === "action" || (condition.shortageL ?? 0) > 0;
}

export function DayConditionSummary({ date, detailed = false, fetchOnMount = false }: { date: string; detailed?: boolean; fetchOnMount?: boolean }) {
  // Calendar cells own the reads; standalone daily detail opts into fetching.
  const { condition, reload } = useDayCondition(date, fetchOnMount);
  const shortage = condition.shortageL;
  const showUpgrade = needsUpgradeRecommendation(condition);
  return <span className={styles.dayCondition} data-condition={condition.kind}>
    <span className={styles.conditionLabel}><ConditionIndicator kind={condition.kind} />{condition.label}</span>
    {detailed && <>
      {condition.reasons.map(reason => <span className={styles.conditionReason} key={reason}>{reason}</span>)}
      {shortage !== null && <span className={styles.conditionReason}>Kekurangan terprediksi{condition.shortagePartial ? " minimal" : ""}: {new Intl.NumberFormat("id-ID").format(shortage)} L</span>}
      {(shortage ?? 0) > 0 && <span className={styles.conditionReason}>Status pemindahan target dan referensi jadwal tujuan belum tersedia dari BE.</span>}
      {showUpgrade && <Link className={buttonClass("secondary", false, styles.conditionAction)} href={`/rencana/upgrade?date=${date}`}>Buka rekomendasi upgrade</Link>}
      {condition.kind === "error" && <Button variant="text" onClick={() => void reload()}>Muat ulang status</Button>}
    </>}
  </span>;
}
