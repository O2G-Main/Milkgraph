"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Badge, Card, Icon, PageHeading, SectionTitle } from "@/components/ui";
import { DateField } from "@/components/ui/fields";
import { PlantTopology } from "@/components/produksi/plant-topology";
import { API_MODE } from "@/lib/api/client";
import { invalidateResources, useResource } from "@/lib/api/resource";
import type { ProductionAsset, ProductionList, ProductionScheduleRow } from "@/lib/api/production";
import type { BeDowntimeEvent } from "@/lib/api/contract";
import type { PlantTopologyData } from "@/lib/api/topology";
import { assetAssignments, assignedAttention, assignedBatchCount, assetStatusTone, recordedStatusTime } from "@/lib/factory-monitor";
import { dateInWib } from "@/lib/production-date";
import { useDemo } from "@/lib/demo";
import { canSee } from "@/lib/roles";
import { FactoryAssetDetail } from "./factory-asset-detail";
import styles from "./factory-monitor.module.css";

type Props = { initialDate: string; initialBatch: string; invalidDate: boolean };
export function FactoryMonitor(props: Props) {
  if (!API_MODE) return <div className={styles.page}><PageHeading title="Kondisi Pabrik" subtitle="Status alat dan penugasan produksi dari backend." /><Card><p>Halaman ini memerlukan mode API. Data simulasi tidak ditampilkan sebagai kondisi alat terkini.</p></Card></div>;
  return <FactoryMonitorApi {...props} />;
}
function FactoryMonitorApi({ initialDate, initialBatch, invalidDate }: Props) {
  const { role } = useDemo();
  const [date, setDate] = useState(initialDate);
  const [batch, setBatch] = useState(initialBatch);
  const [selected, setSelected] = useState<string | null>(null);
  const assets = useResource<ProductionList<ProductionAsset>>("/production/assets");
  const schedule = useResource<ProductionList<ProductionScheduleRow>>(date ? `/production/schedule?date=${date}` : null);
  const downtime = useResource<BeDowntimeEvent[]>("/downtime-events");
  const topology = useResource<PlantTopologyData>("/master/topology", { fetchOnMount: false });
  const assetProblem = assets.error?.message || (assets.data && !Array.isArray(assets.data.items) ? "Format katalog alat belum dapat dibaca." : null);
  const scheduleProblem = schedule.error?.message || (schedule.data && (!Array.isArray(schedule.data.items) || schedule.data.items.some(row => row.production_date !== date)) ? "Jadwal tidak sesuai tanggal yang dipilih." : null);
  const assetReady = !assetProblem && !assets.loading && !!assets.data;
  const scheduleReady = !!date && !scheduleProblem && !schedule.loading && !!schedule.data;
  const assetRows = Array.isArray(assets.data?.items) ? assets.data.items : [];
  const allRows = scheduleReady ? schedule.data!.items : [];
  const chosenRows = batch ? allRows.filter(row => row.batch_id === batch) : allRows;
  const allAssignments = assetAssignments(allRows, date);
  const chosenAssignments = assetAssignments(chosenRows, date);
  const attention = assetReady && scheduleReady ? assignedAttention(assetRows, chosenAssignments) : [];
  const catalogIds = new Set(assetRows.map(asset => asset.asset_id));
  const unmatched = assetReady && scheduleReady ? [...chosenAssignments.keys()].filter(id => !catalogIds.has(id)) : [];
  const batches = [...new Map(allRows.map(row => [row.batch_id, row.batch_code])).entries()];
  const missingBatch = !!batch && scheduleReady && !batches.some(([id]) => id === batch);
  const counts = Object.fromEntries([...allAssignments].map(([id, rows]) => [id, assignedBatchCount(rows)]));
  const sourcePending = assets.loading || schedule.loading || downtime.loading;
  const changeDate = (value: string) => { setDate(value); setBatch(""); setSelected(null); };
  const refresh = () => { void assets.reload(); void schedule.reload(); void downtime.reload(); invalidateResources(["/master/topology"]); };

  const pickAsset = (id: string | null) => setSelected(id);
  const closeDetail = () => setSelected(null);
  return <div className={`page-enter ${styles.page}`}>
    <PageHeading title="Kondisi Pabrik" subtitle="Hubungkan penugasan jadwal dengan catatan kondisi terakhir alat.">
      <button className="button secondary" disabled={sourcePending} onClick={refresh}><Icon icon={RefreshCw} size={16} />Perbarui tampilan</button>
    </PageHeading>
    <Card>
      <div className={styles.filters}>
        <label>Tanggal penugasan (WIB)<DateField label="Tanggal penugasan alat" value={date} onChange={changeDate} /></label>
        <label>Batch yang disorot<select aria-label="Batch yang disorot" value={batch} disabled={!scheduleReady} onChange={event => { setBatch(event.target.value); setSelected(null); }}><option value="">Semua batch pada tanggal ini</option>{missingBatch && <option value={batch}>{batch} (tidak ditemukan)</option>}{batches.map(([id, code]) => <option value={id} key={id}>{code || id}</option>)}</select></label>
        <button className="button secondary" onClick={() => changeDate(dateInWib())}>Hari ini</button>
        {date && canSee(role, "/penjadwalan") && <Link className="button secondary" href={`/penjadwalan?date=${date}`}>Buka Penjadwalan</Link>}
      </div>
      <p className="small muted">Tanggal dan batch mengatur sorotan penugasan. Status selalu memakai catatan terakhir alat, termasuk saat memilih jadwal historis. Semua waktu ditampilkan dalam WIB.</p>
      <p className="small muted">Label batch pada kartu menghitung semua batch yang menjadwalkan alat pada tanggal terpilih. Penugasan belum membuktikan alat atau batch sedang berjalan.</p>
      {invalidDate && <p className="warn-text" role="status">Parameter tanggal tidak valid; tampilan awal menggunakan hari ini.</p>}
    </Card>
    {(assetProblem || scheduleProblem) && <Card><div role="alert"><p className="crit-text">{assetProblem ? `Status alat belum dapat dipastikan: ${assetProblem}` : ""}</p><p className="crit-text">{scheduleProblem ? `Penugasan belum dapat dipastikan: ${scheduleProblem}` : ""}</p><button className="button secondary" onClick={refresh}>Coba lagi</button></div></Card>}
    <div className={styles.metrics}>
      {([
        ["Alat dalam katalog", assetReady ? assetRows.length : null],
        ["Memiliki catatan status", assetReady ? assetRows.filter(asset => asset.current_status?.trim()).length : null],
        ["Alat terjadwal pada pilihan ini", scheduleReady ? chosenAssignments.size : null],
        ["Alat terjadwal perlu ditinjau", assetReady && scheduleReady ? attention.length : null],
      ] as [string, number | null][]).map(([label, value]) => <Card key={label}><span className="small muted">{label}</span><strong>{value === null ? "Belum tersedia" : <>{value} <small>alat</small></>}</strong></Card>)}
    </div>
    {!date && <p role="status" className={styles.notice}>Pilih tanggal untuk melihat penugasan. Catatan status alat tetap dapat dilihat.</p>}
    {assetReady && <p className="small muted">{assetRows.filter(asset => !asset.current_status?.trim()).length} alat belum memiliki catatan status. Status yang tidak dikenal tetap ditampilkan sesuai teks sumber, tanpa dianggap normal.</p>}
    {missingBatch && <p role="status" className={styles.notice}>Batch {batch} tidak ditemukan pada jadwal tanggal {date}. Pilih batch lain atau semua batch.</p>}
    {scheduleReady && !allRows.length && <p role="status" className={styles.notice}>Belum ada jadwal pada tanggal {date}. Catatan status alat tetap dapat dilihat.</p>}
    {unmatched.length > 0 && <p role="status" className={styles.notice}>ID alat pada jadwal belum ditemukan di katalog: {unmatched.join(", ")}. Penugasannya tetap tercantum; kondisi alat belum dapat dipastikan.</p>}
    <PlantTopology showStatusDetails fitFocusedAssets={!!batch} selectedAsset={selected} onAssetSelect={pickAsset} assignmentCounts={counts} focusAssets={[...chosenAssignments.keys()]}
      title="Alur alat & penugasan" subtitle="Visual konfigurasi pabrik dengan status terakhir dan penugasan dari jadwal. Garis antaralat adalah rute konfigurasi."
      focusDescription={`Bingkai hijau menandai alat yang tercantum pada ${batch ? "batch terpilih" : "jadwal"} tanggal ${date}. Sorotan tidak menunjukkan batch sedang berjalan.`} />
    <Card>
      <SectionTitle title="Perhatian pada alat terjadwal" subtitle="Berdasarkan istilah gangguan, berhenti, perawatan, atau CIP yang dikenali pada catatan status. Status lain tetap ditampilkan sesuai catatannya." />
      {!assetReady || !scheduleReady ? <p className="muted">Perhatian operasional belum dapat dinilai sampai status alat dan jadwal selesai dimuat.</p>
      : !attention.length ? <p className="muted">Tidak ada catatan gangguan/perawatan yang dikenali pada alat terjadwal pilihan ini. Ini belum memastikan seluruh alat siap digunakan.</p>
      : <ul className={styles.list}>{attention.map(asset => <li key={asset.asset_id} className={styles.attention}>
        <div><strong>{asset.asset_id} · {asset.asset_name}</strong><p><Badge tone={assetStatusTone(asset.current_status)}>{asset.current_status}</Badge></p><p className="small muted">Catatan: {recordedStatusTime(asset.current_status_observed_at)} · {assignedBatchCount(chosenAssignments.get(asset.asset_id) ?? [])} batch terkait</p></div>
        <button className="button secondary" aria-label={`Detail kondisi ${asset.asset_id}`} onClick={() => pickAsset(asset.asset_id)}>Detail alat</button>
      </li>)}</ul>}
      <div className={styles.legend}><Badge tone="ok">Siap / berjalan (tercatat)</Badge><Badge tone="warn">Perawatan / CIP</Badge><Badge tone="crit">Gangguan / berhenti</Badge><Badge tone="neutral">Belum terklasifikasi</Badge></div>
    </Card>
    {selected && <FactoryAssetDetail id={selected} asset={assetRows.find(asset => asset.asset_id === selected)} nodeName={topology.data?.nodes.find(node => node.asset_id === selected)?.asset_name}
      date={date} assignments={allAssignments.get(selected) ?? []} scheduleReady={scheduleReady} assetReady={assetReady} downtime={downtime} role={role} onClose={closeDetail} />}
  </div>;
}
