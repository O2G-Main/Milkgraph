"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Card, Icon, Modal, PageHeading } from "@/components/ui";
import { DateField } from "@/components/ui/fields";
import { ProductionBatchForm } from "@/components/produksi/production-batch-form";
import { useResource } from "@/lib/api/resource";
import type { PlanningList, WeeklyPlan } from "@/lib/api/planning";
import { plansPath } from "@/lib/api/planning";
import type { ProductionSession } from "@/lib/api/production";
import { dateInWib, completedOnProductionDate } from "@/lib/production-date";
import type { BeTraceHistory } from "@/lib/api/trace-historis";
import { moveDate, scheduledVolume, uniqueSchedule, weeklyTargets } from "@/lib/scheduling";
import { useWeekSchedule } from "./use-week-schedule";
import { DayConditionSummary } from "./day-condition-summary";
import { ProductionCalendar } from "./production-calendar";
import { SchedulingBoard } from "./scheduling-board";
import styles from "./scheduling.module.css";

const liters = (value: number | null) => value === null ? "Belum tersedia" : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)} L`;
const compactLiters = (value: number | null) => value === null ? "Belum tersedia"
  : `${new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(value)} L`;
const weekLabel = (start: string, end: string) => new Intl.DateTimeFormat("id-ID", {
  timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
}).formatRange(new Date(`${start}T00:00:00Z`), new Date(`${end}T00:00:00Z`));
const dayName = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("id-ID", { timeZone: "UTC", weekday: "short" });
const dayNumber = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("id-ID", { timeZone: "UTC", day: "numeric", month: "short" });

export function SchedulingWorkspace({ initialDate, role, tools }: { initialDate: string; role: string; tools: ReactNode }) {
  const [date, setDate] = useState(initialDate);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(initialDate.slice(0, 7));
  const [panel, setPanel] = useState<"batch" | "tools" | "targets" | null>(null);
  const [saved, setSaved] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const calendarReturn = useRef<HTMLDivElement>(null);
  const { days, resources } = useWeekSchedule(date);
  const start = days[0], end = days[6];
  const weekly = useResource<PlanningList<WeeklyPlan>>(plansPath({ from: start, to: start }));
  const history = useResource<BeTraceHistory>("/trace/history");
  const session = useResource<ProductionSession>("/session");
  const canCreate = session.data?.role === role && session.data.permissions.includes("plan.decide");
  // The API filter is the week's start date. Filter again to preserve the displayed calendar.
  const plans = (weekly.data?.items ?? []).filter(row => row.week_start_sunday === start);
  const totals = weeklyTargets(plans);
  const index = days.indexOf(date);
  const selected = resources[index];
  const schedulesReady = resources.every(resource => resource.data && !resource.error && !resource.loading);
  const scheduled = schedulesReady ? scheduledVolume(resources.flatMap(resource => resource.data?.items ?? [])) : null;
  const outputGroups = history.data?.groups.filter(group => days.some(day => completedOnProductionDate(group.jendela_selesai, day)));
  const actual = history.data && !history.error && !history.loading
    ? (outputGroups ?? []).reduce((sum, group) => sum + group.total.pengisian_l, 0) : null;
  const targetsReady = weekly.data && !weekly.error && !weekly.loading;
  const choose = (value: string) => { if (value) { setDate(value); setPreviewDate(null); setCalendarMonth(value.slice(0, 7)); setSaved(false); } };

  const openDay = (day: string) => {
    choose(day); setDetailOpen(true);
    requestAnimationFrame(() => detailHeading.current?.focus());
  };
  const backToCalendar = () => {
    setDetailOpen(false);
    requestAnimationFrame(() => calendarReturn.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus());
  };

  return <div className={`page-enter ${styles.page}`}>
    <PageHeading title="Penjadwalan" subtitle="Susun batch per hari dan pantau alokasi rencana mingguan.">
      <div className={styles.actions}>
        <button className="button secondary" onClick={() => setPanel("tools")}>PO & versi jadwal</button>
        {canCreate && <button className="button primary" onClick={() => { setPanel("batch"); setSaved(false); }}><Icon icon={Plus} size={16} />Susun jadwal</button>}
      </div>
    </PageHeading>
    <div className={styles.toolbar}>
      <div className={styles.dateFilter} role="group" aria-label="Filter tanggal">
        <span className={styles.filterLabel}>Filter tanggal</span>
        <DateField label="Tanggal penjadwalan" value={date} onChange={choose} clearable={false}
          weekNavigation={{ label: weekLabel(start, end), onShift: weeks => { const next = moveDate(date, weeks * 7); choose(next); return next; }, onToday: () => choose(dateInWib()) }} />
      </div>
    </div>
    {saved && <p className="ok-text" role="status">Batch tersimpan. Jadwal diperbarui dari server.</p>}
    <div className={styles.metrics}>
      {([
        ["Target mingguan", targetsReady ? totals.target : null, "Target usulan unik pada minggu ini"],
        ["Terjadwal", scheduled, "Target batch pada tujuh hari terpilih"],
        ["Hasil pengisian", actual, "Kelompok historis yang selesai minggu ini"],
        ["Belum terhubung", targetsReady ? totals.unlinked : null, "Target usulan tanpa batch terhubung"],
      ] as [string, number | null, string][]).map(([label, value, detail]) => <Card key={label}><span className={styles.metricLabel}>{label}</span><strong title={liters(value)} aria-label={liters(value)}><span className={styles.metricFull}>{liters(value)}</span><span className={styles.metricCompact} aria-hidden="true">{compactLiters(value)}</span></strong><span className={styles.metricNote}>{detail}</span></Card>)}
    </div>
    {(weekly.error || history.error || resources.some(resource => resource.error)) && <div role="alert" className={styles.warning}>
      <p>Sebagian ringkasan minggu belum dapat dimuat. Nilai terkait ditampilkan sebagai belum tersedia.</p>
      <button className="text-link" onClick={() => {
        void weekly.reload(); void history.reload(); resources.forEach(resource => { void resource.reload(); });
      }}><Icon icon={RefreshCw} size={14} />Coba lagi</button>
    </div>}
    <div className={styles.planSummary}>
      {targetsReady ? <strong><span>{new Intl.NumberFormat("id-ID").format(totals.proposals.length)}</span> usulan mingguan</strong>
        : <span role="status">Memuat usulan mingguan…</span>}
      <button className="text-link" onClick={() => setPanel("targets")}>Lihat target & alokasi</button>
    </div>
    {detailOpen ? <>
      <div className={styles.dayHeading}>
        <button className="text-link" onClick={backToCalendar}><Icon icon={ArrowLeft} size={16} />Kembali ke kalender</button>
        <h2 tabIndex={-1} ref={detailHeading}>Produksi {new Date(`${date}T00:00:00Z`).toLocaleDateString("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
      </div>
      <Card><h3>Kondisi produksi harian</h3><DayConditionSummary date={date} detailed fetchOnMount /></Card>
      <SchedulingBoard key={date} role={role} rows={selected.data?.items ?? []} date={date} error={selected.error}
        loading={selected.loading || !selected.data} onRetry={() => void selected.reload()} />
    </> : <div className={styles.calendarPanel}>
      <div className={styles.calendarColumn}>
        <Card>
          <div ref={calendarReturn}>
            <ProductionCalendar date={date} month={calendarMonth} today={dateInWib()} onMonthChange={choose} onSelect={choose}
              onPreview={setPreviewDate} />
          </div>
        </Card>
        <Card className={styles.selectedCondition} aria-label={previewDate ? "Pratinjau kondisi tanggal" : "Kondisi tanggal terpilih"} aria-live="polite">
          <h3>{dayName(previewDate ?? date)}, {dayNumber(previewDate ?? date)}</h3>
          <DayConditionSummary date={previewDate ?? date} detailed />
        </Card>
      </div>
      <Card className={styles.weekOverview}>
      <h2>Pratinjau jadwal mingguan</h2>
      <p className="small muted">{weekLabel(start, end)}</p>
      <nav className={styles.days} aria-label="Hari produksi">
      {days.map((day, dayIndex) => {
        const resource = resources[dayIndex];
        const volume = resource.data && !resource.error && !resource.loading ? scheduledVolume(resource.data.items) : null;
        return <button key={day} className={day === date ? styles.selected : ""} aria-current={day === date ? "date" : undefined}
          onClick={() => openDay(day)}><span>{dayName(day)}</span><strong>{dayNumber(day)}</strong>
          <span className={styles.rowSummary}><small>{!resource.loading && !resource.error && resource.data ? `${new Set(uniqueSchedule(resource.data.items).map(row => row.batch_id)).size} batch · ` : ""}{resource.error ? "Gagal dimuat" : resource.loading ? "Memuat…" : liters(volume)}</small><DayConditionSummary date={day} /></span><span className={styles.detailLink}>Detail<Icon icon={ChevronRight} size={14} /></span></button>;
      })}
      </nav>
      </Card>
    </div>}
    <p className={styles.footnote}>Jam produksi dan kapasitas tersisa belum tersedia untuk jadwal batch ini. Sisa realisasi dan pemindahan target ke hari berikutnya mengikuti perhitungan serta dukungan penyimpanan dari layanan penjadwalan.</p>

    {panel === "batch" && canCreate && <ProductionBatchForm date={date} role={role} onClose={() => setPanel(null)}
      onSaved={() => { setPanel(null); setSaved(true); setDetailOpen(true); requestAnimationFrame(() => detailHeading.current?.focus()); }} />}
    {panel === "tools" && <Modal title="PO & versi jadwal" className={styles.toolsDialog} onClose={() => setPanel(null)}>{tools}</Modal>}
    {panel === "targets" && <Modal title="Target & alokasi mingguan" className={styles.targetsDialog} onClose={() => setPanel(null)}>
      {weekly.error ? <p className="crit-text" role="alert">Gagal memuat usulan: {weekly.error.message}</p>
      : !targetsReady ? <p role="status">Memuat usulan…</p>
      : !plans.length ? <p className="muted">Belum ada usulan pada minggu ini.</p>
      : <ul className={styles.targets}>{totals.proposals.map(plan => {
        const linked = plans.filter(row => row.proposal_id === plan.proposal_id && row.batch_id);
        return <li key={plan.proposal_id}><strong>{plan.product_name || plan.finished_sku_id}</strong>
          <p className="small muted">{plan.proposal_id} · {liters(plan.target_volume_l)}</p>
          {linked.length ? linked.map(row => <p key={`${row.batch_id}:${row.production_date}`}>
            {row.batch_code || row.batch_id}{row.production_date && <button className="text-link" onClick={() => {
              openDay(row.production_date!); setPanel(null);
            }}>Lihat {row.production_date}</button>}
          </p>) : <span className="small muted">Belum terhubung ke batch</span>}
        </li>;
      })}</ul>}
    </Modal>}
  </div>;
}
