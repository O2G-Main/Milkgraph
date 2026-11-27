"use client";

import Link from "next/link";
import { canSee } from "@/lib/roles";
import { Card, Modal, SectionTitle } from "@/components/ui";
import { useResource } from "@/lib/api/resource";
import type { PlanningList, FulfillmentPrediction } from "@/lib/api/planning";
import { planningPath } from "@/lib/api/planning";
import type { ProductionScheduleRow } from "@/lib/api/production";
import { usePlanningSelection } from "@/components/rencana/planning-state";
import styles from "./scheduling.module.css";

export function SchedulingDetail({ row, role, onClose }: { row: ProductionScheduleRow; role: string; onClose: () => void }) {
  const predictions = useResource<PlanningList<FulfillmentPrediction>>(planningPath("predictions", { date: row.production_date, batch_id: row.batch_id }));
  const planning = usePlanningSelection();
  return <Modal title={row.batch_code} onClose={onClose} className={`schedule-detail ${styles.detailDialog}`}>
    <p className="small muted">{row.production_date} WIB · Urutan {row.sequence_no} · {row.status}</p>
    <dl className="scheduling-facts">
      {[["Produk", row.finished_sku_id], ["PO", row.production_order_id], ["Lini filling", row.filling_line_id],
        ["Tangki aseptik", row.aseptic_tank_id], ["Sterilizer", row.sterilizer_id],
        ["Target", row.target_volume_l === null ? null : `${new Intl.NumberFormat("id-ID").format(row.target_volume_l)} L`]]
        .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Belum tersedia"}</dd></div>)}
    </dl>
    <Card>
      <SectionTitle title="Pemenuhan & sisa target" />
      {predictions.error ? <p className="crit-text" role="alert">Gagal memuat prediksi: {predictions.error.message}</p>
      : !predictions.data ? <p role="status" className="muted">Memuat prediksi…</p>
      : !predictions.data.items.length ? <p className="muted">Belum ada perhitungan sisa target untuk batch ini.</p>
      : <ul className="attention-list">{predictions.data.items.map(prediction => <li key={prediction.id}>
        <strong>{prediction.fulfill_status.replaceAll("_", " ")}</strong>
        <p>{prediction.shortage_l === null ? "Sisa belum dihitung" : `Kekurangan ${new Intl.NumberFormat("id-ID").format(prediction.shortage_l)} L`}</p>
        <p className="small muted">{prediction.risk_reason}</p>
      </li>)}</ul>}
    </Card>
    <p className="small muted scheduling-note">Perubahan batch tersimpan dan pemindahan sisa target tersedia setelah layanan penjadwalan mendukung penyimpanan perubahan tersebut.</p>
    {canSee(role, "/kondisi-pabrik") && <Link href={`/kondisi-pabrik?date=${row.production_date}&batch=${encodeURIComponent(row.batch_id)}`} className="button secondary" onClick={onClose}>Lihat kondisi alat batch</Link>}
    {canSee(role, "/rencana") && <Link href="/rencana" className="button primary" onClick={() => {
      planning.chooseDate(row.production_date); planning.chooseBatch(row.batch_id); onClose();
    }}>Periksa kelayakan & rekomendasi</Link>}
  </Modal>;
}
