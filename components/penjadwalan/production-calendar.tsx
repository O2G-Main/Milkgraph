"use client";

// Adapted from Wensity Calendar on 21st.dev (MIT).
// Source: https://github.com/ksparth12/wensity-shadcn-registry/blob/37e75764e2326eeda9533a73bb7434edb7374e82/calendar.json
// Original license: docs/licenses/wensity-calendar-LICENSE.txt.
// Single-date selection, MilkGraph tokens, WIB dates, and production-week indicators.
import { useEffect, useRef, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Icon } from "@/components/ui";
import { moveDate, productionWeek } from "@/lib/scheduling";
import { CalendarDate } from "./calendar-date";
import { ConditionIndicator } from "./condition-indicator";
import { conditionLabels, type DayConditionKind } from "@/lib/production-condition";
import styles from "./scheduling.module.css";

const asDate = (value: string) => new Date(`${value}T00:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);


export function ProductionCalendar({ date, month, today, onMonthChange, onSelect, onPreview }: {
  date: string; month: string; today: string;
  onMonthChange: (date: string) => void; onSelect: (date: string) => void; onPreview: (date: string | null) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPreview = () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = null;
  };
  useEffect(() => () => { if (previewTimer.current) clearTimeout(previewTimer.current); }, []);
  const first = `${month}-01`;
  // Wensity's fixed six-week grid keeps month transitions stable.
  const start = productionWeek(first)[0];
  const cells = Array.from({ length: 42 }, (_, index) => moveDate(start, index));
  const selectedWeek = productionWeek(date);
  const monthLabel = asDate(first).toLocaleDateString("id-ID", { timeZone: "UTC", month: "long", year: "numeric" });
  function nextMonth(delta: number) {
    const target = asDate(first);
    target.setUTCMonth(target.getUTCMonth() + delta);
    onMonthChange(iso(target));
  }
  function focusDay(target: string) {
    if (target.slice(0, 7) !== month) onMonthChange(target);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)?.focus());
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const current = (event.target as HTMLElement).dataset.date;
    if (!current) return;
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let target: string;
    if (event.key in deltas) target = moveDate(current, deltas[event.key]);
    else if (event.key === "Home" || event.key === "End") target = productionWeek(current)[event.key === "Home" ? 0 : 6];
    else if (event.key === "PageUp" || event.key === "PageDown") {
      const next = asDate(current), day = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + (event.key === "PageUp" ? -1 : 1));
      const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(day, last));
      target = iso(next);
    } else return;
    event.preventDefault();
    focusDay(target);
  }
  return <div className={styles.calendar}>
    <header className={styles.calendarHeader}>
      <h2 aria-live="polite">{monthLabel}</h2>
      <div className={styles.actions}>
        <button className="icon-button" aria-label="Bulan sebelumnya" onClick={() => nextMonth(-1)}><Icon icon={ChevronLeft} /></button>
        <button className="icon-button" aria-label="Bulan berikutnya" onClick={() => nextMonth(1)}><Icon icon={ChevronRight} /></button>
      </div>
    </header>
    <div className={styles.weekdays} aria-hidden="true">{["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map(day => <span key={day}>{day}</span>)}</div>
    <motion.div key={month} initial={{ opacity: reducedMotion ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
      <div role="grid" aria-label={monthLabel} ref={grid} onKeyDown={navigate}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onPreview(null); }}>
        {Array.from({ length: 6 }, (_, week) => <div key={week} role="row" className={styles.calendarWeek}>
          {cells.slice(week * 7, week * 7 + 7).map(day => <div role="gridcell" key={day} aria-selected={day === date}>
            <CalendarDate date={day} type="button" tabIndex={day === date ? 0 : -1}
              aria-current={day === today ? "date" : undefined}
              className={`${styles.calendarDay} ${day.slice(0, 7) !== month ? styles.outside : ""} ${selectedWeek.includes(day) ? styles.activeWeek : ""} ${day === date ? styles.activeDay : ""}`}
              onPointerEnter={event => {
                if (event.pointerType !== "mouse") return;
                clearPreview();
                previewTimer.current = setTimeout(() => onPreview(day), 200);
              }}
              onPointerLeave={() => { clearPreview(); onPreview(null); }}
              onFocus={() => { clearPreview(); onPreview(day); }}
              onClick={() => { clearPreview(); onPreview(null); onSelect(day); }} />
          </div>)}
        </div>)}
      </div>
    </motion.div>
    <ul className={styles.conditionLegend} aria-label="Arti penanda tanggal">
      {(["complete", "scheduled", "risk", "action", "empty", "unknown", "error"] as DayConditionKind[]).map(kind => <li key={kind} className={styles.legendItem} data-condition={kind}><ConditionIndicator kind={kind} />{conditionLabels[kind]}</li>)}
    </ul>
    <p className="small muted">Arahkan kursor untuk melihat kondisi tanggal. Pilih tanggal untuk mengubah minggu, atau buka detail melalui daftar jadwal.</p>
  </div>;
}
