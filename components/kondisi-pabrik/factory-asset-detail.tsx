"use client";

import Link from "next/link";
import { Badge, Modal, SectionTitle } from "@/components/ui";
import type { ProductionAsset, ProductionScheduleRow } from "@/lib/api/production";
import type { BeDowntimeEvent } from "@/lib/api/contract";
import { DOWNTIME_SOURCE_LABEL, DOWNTIME_TYPE_LABEL } from "@/lib/api/contract";
import { assetStatusTone, recordedStatusTime } from "@/lib/factory-monitor";
import { canSee, type RoleId } from "@/lib/roles";
import { scheduledVolume } from "@/lib/scheduling";
import styles from "./factory-monitor.module.css";

type DowntimeState = { data: BeDowntimeEvent[] | null; loading: boolean; error: Error | null };
export function FactoryAssetDetail({ id, asset, nodeName, date, assignments, scheduleReady, assetReady, downtime, role, onClose }: {
  id: string; asset?: ProductionAsset; nodeName?: string; date: string; assignments: ProductionScheduleRow[];
  scheduleReady: boolean; assetReady: boolean; downtime: DowntimeState; role: RoleId; onClose: () => void;
}) {
  const batches = [...new Set(assignments.map(row => row.batch_id))].map(batch => assignments.filter(row => row.batch_id === batch));
  const events = (Array.isArray(downtime.data) ? downtime.data : []).filter(row => row.resource_id === id)
    .sort((a, b) => (Date.parse(b.start) || 0) - (Date.parse(a.start) || 0));
  return <Modal title={`${id}${asset?.asset_name || nodeName ? ` · ${asset?.asset_name || nodeName}` : ""}`} onClose={onClose} className={styles.detail}>
    <div className={styles.detailBody}>
      {asset ? <>
        <Badge tone={assetStatusTone(asset.current_status)}>{asset.current_status?.trim() || "Belum tercatat"}</Badge>
        <dl className={styles.facts}>
          <div><dt>Waktu catatan status</dt><dd>{recordedStatusTime(asset.current_status_observed_at)}</dd></div>
          <div><dt>Sumber status</dt><dd>{asset.current_status_source || "Belum disertakan"}</dd></div>
          <div><dt>Alasan / keterangan</dt><dd>{asset.current_status_reason || "Tidak ada keterangan pada catatan ini"}</dd></div>
        </dl>
      </> : <p className="muted">{assetReady ? "ID ini tidak tercantum di katalog alat operasional. Node konfigurasi dapat tetap memiliki koneksi." : "Data status alat belum tersedia. Kondisi alat belum dapat dipastikan."}</p>}
      <section>
        <SectionTitle title={date ? `Penugasan pada ${date}` : "Penugasan alat"} subtitle="Daftar berikut adalah jadwal penggunaan alat; tidak membuktikan batch sedang berjalan." />
        {!scheduleReady ? <p className="muted">Jadwal belum dapat dibaca. Penugasan alat belum dapat dipastikan.</p>
        : !batches.length ? <p className="muted">Tidak ada batch yang mencantumkan ID alat ini pada tanggal tersebut.</p>
        : <ul className={styles.list}>{batches.map(rows => {
          const volume = scheduledVolume(rows);
          return <li key={rows[0].batch_id}><strong>{rows[0].batch_code || rows[0].batch_id}</strong>
            <p>Urutan {rows[0].sequence_no} · {rows.length} baris produksi terkait alat ini</p>
            <p className="small muted">Target baris terkait: {volume === null ? "Belum tersedia" : `${new Intl.NumberFormat("id-ID").format(volume)} L`}</p>
            <p className="small muted">{[...new Set(rows.map(row => row.status))].join(" · ")}</p>
          </li>;
        })}</ul>}
      </section>
      <section>
        <SectionTitle title="Catatan downtime & perawatan" subtitle="Semua tanggal, sesuai ID alat yang sama. Kejadian, rencana, dan prediksi mengikuti sumber catatan." />
        {downtime.error || (downtime.data && !Array.isArray(downtime.data)) ? <p role="alert" className="crit-text">Riwayat downtime belum dapat dimuat.</p>
        : downtime.loading || !downtime.data ? <p role="status">Memuat catatan downtime…</p>
        : !events.length ? <p className="muted">Belum ada catatan downtime dengan ID alat ini.</p>
        : <><p className="small muted">Menampilkan {Math.min(events.length, 5)} dari {events.length} catatan terbaru.</p><ul className={styles.list}>{events.slice(0, 5).map(event => <li key={event.event_id}>
          <strong>{DOWNTIME_TYPE_LABEL[event.type] || event.type}</strong>
          <p>{recordedStatusTime(event.start)} — {recordedStatusTime(event.end)}</p>
          <p className="small muted">{DOWNTIME_SOURCE_LABEL[event.source] || event.source}</p>
        </li>)}</ul></>}
      </section>
      <div className={styles.actions}>
        {date && canSee(role, "/penjadwalan") && <Link className="button secondary" href={`/penjadwalan?date=${date}`}>Buka Penjadwalan tanggal ini</Link>}
        {canSee(role, "/alat") && <Link className="button secondary" href="/alat">Buka katalog alat</Link>}
      </div>
    </div>
  </Modal>;
}
