"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge, Button, buttonClass, Card, EmptyState, Input, Modal, SectionTitle, Table } from "@/components/ui";
import { DateField, Select } from "@/components/ui/fields";
import { PlantTopology, type AssetHighlight } from "@/components/produksi/plant-topology";
import { useResource, invalidateResources } from "@/lib/api/resource";
import type { ProductionDaily, ProductionScheduleRow, ProductionSession } from "@/lib/api/production";
import {
  planningPath, plansPath, canRunPrediction, canDecideRecommendation,
  runPlanningPrediction, decideRecommendation, recommendationStatuses,
  type FulfillmentPrediction, type ProductionRecommendation, type PlanningList,
  type RecommendationStatus, type WeeklyPlan,
} from "@/lib/api/planning";
import { recommendationOrigin } from "@/lib/recommendation-origin";
import { AiRecommendationReview } from "./ai-recommendation-review";
import { EquipmentAdjustmentRules } from "./equipment-adjustment-rules";
import { usePlanningSelection } from "./planning-state";
import styles from "./planning.module.css";

type ResourceState = { loading: boolean; error: Error | null; data: unknown; reload: () => Promise<void> };
const number = (value: number | null | undefined) => value == null ? "Belum tersedia" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
const text = (value: string | null | undefined) => value || "Belum tersedia";
const statusLabels: Record<RecommendationStatus, string> = { draft: "Draft", accepted: "Diterima", rejected: "Ditolak", applied: "Ditandai diterapkan" };
const typeLabels: Record<string, string> = { upgrade_kapasitas: "Upgrade kapasitas", naikkan_speed: "Naikkan speed", pindahkan_alat: "Pindahkan alat", geser_jadwal: "Geser jadwal" };
const fulfillLabels: Record<string, string> = { terpenuhi: "Terpenuhi", berisiko: "Berisiko", tidak_terpenuhi: "Tidak terpenuhi", data_tidak_cukup: "Data tidak cukup" };

function ResourceView({ resource, empty, children }: { resource: ResourceState; empty: boolean; children: ReactNode }) {
  if (resource.error) return <div role="alert" className={styles.state}><p>Gagal memuat data: {resource.error.message}</p><Button variant="secondary" onClick={() => void resource.reload()}>Coba lagi</Button></div>;
  if (resource.loading || resource.data === null) return <p role="status" className={styles.state}>Memuat data produksi…</p>;
  if (empty) return <EmptyState title="Data kosong" description="Belum ada data untuk filter ini." />;
  return children;
}

function Facts({ value, label }: { value: Record<string, unknown> | null; label: string }) {
  return <details className={styles.facts}><summary>{label}</summary>{value && Object.keys(value).length ? <pre>{JSON.stringify(value, null, 2)}</pre> : <p>Fakta pendukung belum tersedia.</p>}</details>;
}

export function ApiPlanning({ page, initial }: { page: "flow" | "recommendations" | "decisions"; initial?: { date: string; batch: string; prediction?: number } }) {
  const sharedSelection = usePlanningSelection();
  const [context,setContext] = useState(initial);
  const selection = context ? { ...context, chooseDate: (date:string) => setContext({date,batch:""}), chooseBatch: (batch:string) => setContext({date:context.date,batch}) } : sharedSelection;
  const session = useResource<ProductionSession>("/session");
  const daily = useResource<ProductionDaily>(planningPath("daily", { date: selection.date }));
  const date = selection.date || daily.data?.production_date || "";
  const rememberSelection = () => { if (date) { sharedSelection.chooseDate(date); sharedSelection.chooseBatch(selection.batch); } };
  const filter = { date, ...(selection.batch ? { batch_id: selection.batch } : {}) };
  const predictionPath = date ? planningPath("predictions", filter) : null;
  const recommendationPath = date ? planningPath("recommendations", filter) : null;
  const predictions = useResource<PlanningList<FulfillmentPrediction>>(predictionPath);
  const recommendations = useResource<PlanningList<ProductionRecommendation>>(recommendationPath);
  const schedule = useResource<PlanningList<ProductionScheduleRow>>(page === "flow" && date ? planningPath("schedule", filter) : null);
  const [week, setWeek] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const weekly = useResource<PlanningList<WeeklyPlan>>(page === "flow" ? plansPath({ week, from, to }) : null);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ row: ProductionRecommendation; status: RecommendationStatus } | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const permissions = session.data?.permissions ?? [];
  const writable = !session.error && !session.loading && Boolean(session.data);
  const batches = [...new Map((daily.data?.batches ?? []).map(row => [row.batch_id, row.batch_code])).entries()];
  const shownRecommendations = (recommendations.data?.items ?? []).filter(row => (row.production_date === date && (!selection.batch || row.batch_id === selection.batch) && (!context?.prediction || row.prediction_id === context.prediction) && (!status || row.status === status)) && (!type || row.recommendation_type === type));
  const shownPredictions = (predictions.data?.items ?? []).filter(row => row.production_date === date && (!selection.batch || row.batch_id === selection.batch) && (!context?.prediction || row.id === context.prediction));
  const shownDaily = (daily.data?.batches ?? []).filter(row => !selection.batch || row.batch_id === selection.batch);
  const focusAssets = [...new Set([
    ...(schedule.data?.items ?? []).flatMap(row => [row.filling_line_id, row.aseptic_tank_id, row.sterilizer_id]),
    ...(predictions.data?.items ?? []).map(row => row.bottleneck_asset_id),
  ].filter((id): id is string => Boolean(id)))];
  const upgradeFocusAssets = [...new Set([
    ...shownRecommendations.map(row => row.target_asset_id),
    ...shownPredictions.map(row => row.bottleneck_asset_id),
  ].filter((id): id is string => Boolean(id)))];
  const assetHighlights: Record<string, AssetHighlight> = {};
  for (const row of shownRecommendations) {
    if (!row.target_asset_id || assetHighlights[row.target_asset_id]) continue;
    assetHighlights[row.target_asset_id] = {
      badge: typeLabels[row.recommendation_type] || row.recommendation_type,
      source: recommendationOrigin(row).label,
      detail: row.expected_gain != null ? `Expected gain: ${number(row.expected_gain)}` : "Tambahan belum dihitung",
    };
  }
  const actionNeededCount = shownPredictions.filter(row => row.fulfill_status === "berisiko" || row.fulfill_status === "tidak_terpenuhi").length;
  const aiRecommendationCount = shownRecommendations.filter(row => recommendationOrigin(row).label === "Dipilih AI").length;
  const selectedRecommendations = selectedAsset ? shownRecommendations.filter(row => row.target_asset_id === selectedAsset) : [];
  const selectedPredictions = selectedAsset ? shownPredictions.filter(row => row.bottleneck_asset_id === selectedAsset) : [];
  const title = page === "flow" ? "Alur rencana" : page === "recommendations" ? "Rekomendasi upgrade" : "Kelayakan & keputusan";

  function clearFeedback() { setMessage(null); setActionError(null); setDecision(null); }
  async function run() {
    if (lock.current || !session.data) return;
    lock.current = true; setBusy(true); clearFeedback();
    try {
      const result = await runPlanningPrediction(filter, session.data.role, permissions);
      invalidateResources([predictionPath!, recommendationPath!, planningPath("daily", { date })]);
      if (context?.prediction) setContext(previous => previous ? {date:previous.date,batch:previous.batch} : previous);
      setMessage(`Pembacaan ulang selesai: ${result.predictions.items.length} prediksi dan ${result.recommendations.items.length} rekomendasi. Jadwal dan kapasitas tidak diubah.`);
    } catch (error) { setActionError(error instanceof Error ? error.message : String(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function submitDecision() {
    if (lock.current || !session.data || !decision) return;
    lock.current = true; setBusy(true); setMessage(null); setActionError(null);
    try {
      await decideRecommendation(decision.row.id, decision.status, filter, session.data.role, permissions);
      invalidateResources([recommendationPath!]);
      setMessage(`Rekomendasi #${decision.row.id}: ${statusLabels[decision.status]}. Status terverifikasi melalui pembacaan ulang. Jadwal dan kapasitas tidak otomatis berubah.`);
      setDecision(null);
    } catch (error) { setActionError(error instanceof Error ? error.message : String(error)); setDecision(null); }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className={`page-enter ${styles.page}`}>
    <div className="page-heading">
      <div><h1>{title}</h1><p>{page === "flow" ? "Usulan mingguan, batch terhubung, dan urutan alat dari data produksi." : page === "recommendations" ? "Rekomendasi berdasarkan prediksi produksi, tanpa simulasi kapasitas lokal." : "Periksa prediksi dan fakta produksi sebelum mencatat keputusan rekomendasi."}</p></div>
      <div className="page-actions">
        <Link className={buttonClass("secondary")} href="/produksi?tab=kondisi">Kembali ke Produksi</Link>
        <Link className={buttonClass("secondary")} href="/produksi?tab=prediksi">Cek Prediksi Produksi</Link>
      </div>
    </div>
    <nav className="plan-links" aria-label="Tahap rencana"><Link href="/rencana/alur" onClick={rememberSelection} aria-current={page === "flow" ? "page" : undefined}>Alur rencana</Link><Link href="/rencana/upgrade" onClick={rememberSelection} aria-current={page === "recommendations" ? "page" : undefined}>Rekomendasi upgrade</Link><Link href="/rencana" onClick={rememberSelection} aria-current={page === "decisions" ? "page" : undefined}>Kelayakan & keputusan</Link></nav>
    <Card>
      <SectionTitle title="Tanggal & batch produksi" subtitle="Tanggal awal mengikuti respons harian server. Pilih tanggal lain untuk melihat data historis." />
      <fieldset disabled={busy} className={styles.filters}><label className={styles.field}>Tanggal produksi<DateField label="Tanggal produksi rencana" value={date} onChange={value => { selection.chooseDate(value); clearFeedback(); }} /></label><label className={styles.field}>Batch<Select label="Batch" disabled={busy} value={selection.batch} onChange={value => { selection.chooseBatch(value); clearFeedback(); }} options={[{ value: "", label: "Semua batch" }, ...(selection.batch && !batches.some(([id]) => id === selection.batch) ? [{ value: selection.batch, label: selection.batch }] : []), ...batches.map(([id, code]) => ({ value: id, label: `${code} (${id})` }))]} /></label><Button variant="secondary" disabled={busy} onClick={() => { clearFeedback(); void daily.reload(); if (predictionPath) void predictions.reload(); if (recommendationPath) void recommendations.reload(); if (page === "flow") { void schedule.reload(); void weekly.reload(); } void session.reload(); }}>Muat ulang</Button>{page !== "flow" && <Button variant="primary" disabled={busy || !date || !writable || !canRunPrediction(permissions)} onClick={() => void run()}>{busy ? "Memproses…" : "Jalankan prediksi"}</Button>}</fieldset>
      {daily.error && <p role="alert">Data harian gagal dimuat: {daily.error.message}. Pilih tanggal lain atau muat ulang.</p>}
      {!date && <p role="status">Tanggal server belum tersedia. Pilih tanggal produksi untuk melanjutkan.</p>}
      {session.error && <p role="alert">Izin sesi gagal dimuat: {session.error.message}. Tindakan dinonaktifkan.</p>}
      {!session.error && session.loading && <p role="status">Memuat izin sesi…</p>}
      {page !== "flow" && writable && !canRunPrediction(permissions) && <p>Anda tidak memiliki izin menjalankan prediksi.</p>}
      {page !== "flow" && writable && !canDecideRecommendation(permissions) && <p>Mode baca saja: izin keputusan rekomendasi tidak tersedia.</p>}
    </Card>
    {context?.prediction && <p className="small muted">Rekomendasi terkait hasil prediksi #{context.prediction}. <Button variant="text" onClick={() => setContext(previous => previous ? {date:previous.date,batch:previous.batch} : previous)}>Lihat semua rekomendasi untuk pilihan ini</Button></p>}
    {actionError && <div className="callout warn" role="alert">{actionError}</div>}
    {message && <div className="callout ok" role="status">{message}</div>}
    {page === "flow" ? <>
      <PlantTopology title="Alur alat produksi" subtitle="Alat pada batch dan bottleneck prediksi menggunakan ID master yang sama." focusAssets={focusAssets} />
      <Card><SectionTitle title="Usulan produksi mingguan" subtitle="Usulan belum tentu memiliki batch atau tanggal produksi. Target bukan realisasi." />
        <div className={styles.filters}><label className={styles.field}>Minggu<Input type="number" min="1" value={week} onChange={event => setWeek(event.target.value)} placeholder="Semua minggu" /></label><label className={styles.field}>Mulai minggu dari<DateField label="Mulai minggu dari" value={from} onChange={setFrom} /></label><label className={styles.field}>Mulai minggu hingga<DateField label="Mulai minggu hingga" value={to} onChange={setTo} /></label><Button variant="secondary" onClick={() => { setWeek(""); setFrom(""); setTo(""); }}>Reset filter usulan</Button></div>
        {from && to && from > to && <p role="alert">Tanggal mulai harus sebelum tanggal akhir.</p>}
        <ResourceView resource={weekly} empty={!weekly.data?.items.length}><Table caption={<span className={styles.caption}>Usulan dari server: {weekly.data?.count ?? 0}</span>}><thead><tr><th>Usulan / minggu</th><th>Produk / SKU</th><th>Target</th><th>Batch terhubung</th></tr></thead><tbody>{weekly.data?.items.map(row => <tr key={row.proposal_id}><td>{row.proposal_id}<p>Minggu {row.week} · {row.week_start_sunday}</p></td><td>{text(row.product_name)}<p>{row.finished_sku_id} · {text(row.market)}</p></td><td>{number(row.target_packs)} pack<p>{number(row.target_volume_l)} L</p></td><td>{row.batch_id ? <><strong>{row.batch_code || row.batch_id}</strong><p>{text(row.production_date)}</p>{row.production_date && <Button variant="text" onClick={() => { selection.chooseDate(row.production_date!); selection.chooseBatch(row.batch_id!); clearFeedback(); }}>Lihat batch</Button>}</> : "Belum terhubung ke batch"}</td></tr>)}</tbody></Table></ResourceView>
      </Card>
      {date && <Card><SectionTitle title="Urutan batch & alat" subtitle={`${date}. Urutan penugasan alat, bukan durasi Gantt atau simulasi perubahan.`} /><ResourceView resource={schedule} empty={!schedule.data?.items.length}><Table><thead><tr><th>Batch / urutan</th><th>SKU</th><th>Jalur alat</th><th>Target / status</th></tr></thead><tbody>{schedule.data?.items.map((row, i) => <tr key={`${row.batch_id}-${row.production_order_id}-${row.line_no}-${i}`}><td>{row.batch_code}<p>Urutan {row.sequence_no} · lini {row.line_no ?? "belum tersedia"}</p></td><td>{text(row.finished_sku_id)}</td><td>{[row.sterilizer_id, row.aseptic_tank_id, row.filling_line_id].map(text).join(" → ")}</td><td>{number(row.target_volume_l)} L<p>{text(row.status)}</p></td></tr>)}</tbody></Table></ResourceView></Card>}
      <Card className="plan-next"><span>Periksa rekomendasi dari prediksi produksi.</span><Link className={buttonClass("primary")} href="/rencana/upgrade">Lanjut ke rekomendasi</Link></Card>
    </> : <>
      {page === "recommendations" && <>
        <Card>
          <SectionTitle title="Ringkasan AI & alat terdampak" subtitle="Ringkasan prediksi dan rekomendasi pada filter aktif. Klik alat untuk menyorotnya pada diagram." />
          <div className={styles.kpiStrip}>
            <div className={styles.kpiItem}><span className={styles.kpiLabel}>Total prediksi</span><strong className={styles.kpiValue}>{shownPredictions.length}</strong><span className={styles.kpiMeta}>{date || "Tanggal belum dipilih"}</span></div>
            <div className={styles.kpiItem}><span className={styles.kpiLabel}>Perlu tindakan</span><strong className={styles.kpiValue}>{actionNeededCount}</strong><span className={styles.kpiMeta}>Berisiko atau tidak terpenuhi</span></div>
            <div className={styles.kpiItem}><span className={styles.kpiLabel}>Rekomendasi AI</span><strong className={styles.kpiValue}>{aiRecommendationCount}</strong><span className={styles.kpiMeta}>Dari {shownRecommendations.length} rekomendasi</span></div>
            <div className={styles.kpiItem}><span className={styles.kpiLabel}>Alat terdampak</span><strong className={styles.kpiValue}>{upgradeFocusAssets.length}</strong><span className={styles.kpiMeta}>Target atau bottleneck</span></div>
          </div>
          {!!upgradeFocusAssets.length && (
            <div className={styles.assetChips} role="group" aria-label="Pilih alat terdampak">
              {upgradeFocusAssets.map(assetId => (
                <button key={assetId} type="button" className={`${styles.assetChip} ${selectedAsset === assetId ? styles.assetChipActive : ""}`} aria-pressed={selectedAsset === assetId} onClick={() => setSelectedAsset(previous => previous === assetId ? null : assetId)}>
                  {assetId}
                </button>
              ))}
            </div>
          )}
        </Card>
        <PlantTopology
          title="Alur alat & rekomendasi AI"
          subtitle="Alat terdampak prediksi dan rekomendasi AI disorot pada diagram. Pilih alat untuk melihat detail rekomendasi."
          focusAssets={upgradeFocusAssets}
          fitFocusedAssets={Boolean(upgradeFocusAssets.length)}
          assetHighlights={assetHighlights}
          selectedAsset={selectedAsset}
          onAssetSelect={setSelectedAsset}
        />
        {selectedAsset && (
          <Card aria-live="polite">
            <SectionTitle title={`Detail rekomendasi alat · ${selectedAsset}`} subtitle="Rekomendasi AI dan bottleneck prediksi untuk alat terpilih." action={<Button variant="secondary" onClick={() => setSelectedAsset(null)}>Tutup pilihan</Button>} />
            {!selectedRecommendations.length && !selectedPredictions.length ? (
              <p className="muted">Belum ada rekomendasi AI atau bottleneck untuk alat ini pada filter aktif.</p>
            ) : (
              <div className={styles.selectedGrid}>
                {selectedRecommendations.map(row => (
                  <div key={row.id} className={styles.selectedItem}>
                    <div className={styles.selectedHeader}>
                      <strong>#{row.id} · {typeLabels[row.recommendation_type] || row.recommendation_type}</strong>
                      <Badge tone={recommendationOrigin(row).tone}>{recommendationOrigin(row).label}</Badge>
                    </div>
                    <div className={styles.selectedMeta}>
                      <span>Batch: {text(row.batch_id)}</span>
                      <span>Status: {statusLabels[row.status] || row.status}</span>
                      <span>{row.expected_gain == null ? "Tambahan belum dihitung" : `Expected gain: ${number(row.expected_gain)}`}</span>
                    </div>
                  </div>
                ))}
                {selectedPredictions.map(row => (
                  <div key={`pred-${row.id}`} className={styles.selectedItem}>
                    <div className={styles.selectedHeader}>
                      <strong>Prediksi #{row.id} · {fulfillLabels[row.fulfill_status] || row.fulfill_status}</strong>
                      <span>Batch: {text(row.batch_id)}</span>
                    </div>
                    <p className="small muted">{row.shortage_l == null ? "Kekurangan belum tersedia" : `Kekurangan: ${number(row.shortage_l)} L`} · {text(row.risk_reason)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </>}
      {date && <Card><SectionTitle title="Prediksi pemenuhan" subtitle={`${date}. Nilai kosong berarti belum dihitung atau belum tersedia, bukan nol.`} /><ResourceView resource={predictions} empty={!shownPredictions.length}><Table><thead><tr><th>Batch / status</th><th>Kekurangan</th><th>Bottleneck / alasan</th><th>Fakta</th></tr></thead><tbody>{shownPredictions.map(row => <tr key={row.id}><td>{text(row.batch_id)}<p>{fulfillLabels[row.fulfill_status] || row.fulfill_status}</p></td><td>{row.shortage_l == null ? "Belum tersedia" : `${number(row.shortage_l)} L`}</td><td>{text(row.bottleneck_asset_id)}<p>{text(row.risk_reason)}</p></td><td><p>{row.calculated_at}</p><Facts label={`Fakta prediksi #${row.id}`} value={row.input_facts} /></td></tr>)}</tbody></Table></ResourceView></Card>}
      {page === "decisions" && date && <Card><SectionTitle title="Batch harian" subtitle="Target dan status produksi dari server, tanpa proyeksi skenario demo." /><ResourceView resource={daily} empty={!shownDaily.length}><Table><thead><tr><th>Batch / produk</th><th>SKU / filling</th><th>Target</th><th>Status</th></tr></thead><tbody>{shownDaily.map((row, i) => <tr key={`${row.batch_id}-${row.production_order_id}-${row.line_no}-${i}`}><td>{row.batch_code}<p>{text(row.product_name)}</p></td><td>{text(row.finished_sku_id)}<p>{text(row.filling_line_id)}</p></td><td>{number(row.target_packs)} pack<p>{number(row.target_volume_l)} L</p></td><td>{text(row.batch_status)}<p>{row.fulfill_status ? fulfillLabels[row.fulfill_status] || row.fulfill_status : "Belum ada prediksi"}</p><p>{row.risk_reason}</p></td></tr>)}</tbody></Table></ResourceView></Card>}
      {date && <Card><SectionTitle title="Rekomendasi & keputusan" subtitle="Mengubah status mencatat keputusan saja. Accepted atau applied tidak otomatis mengubah kapasitas alat atau jadwal." /><div className={styles.filters}><label className={styles.field}>Status rekomendasi<Select label="Status rekomendasi" value={status} onChange={setStatus} options={[{ value: "", label: "Semua status" }, ...recommendationStatuses.map(item => ({ value: item, label: statusLabels[item] }))]} /></label><label className={styles.field}>Jenis rekomendasi<Select label="Jenis rekomendasi" value={type} onChange={setType} options={[{ value: "", label: "Semua jenis" }, ...Object.entries(typeLabels).map(([value, label]) => ({ value, label }))]} /></label></div><ResourceView resource={recommendations} empty={!shownRecommendations.length}><Table><thead><tr><th>Rekomendasi / batch</th><th>Alat / perkiraan tambahan</th><th>Dasar rekomendasi</th><th>Status / keputusan</th></tr></thead><tbody>{shownRecommendations.map(row => <tr key={row.id}><td>#{row.id} · {typeLabels[row.recommendation_type] || row.recommendation_type}<p>{text(row.batch_id)}</p></td><td>{page === "recommendations" && row.target_asset_id ? <Button variant="text" onClick={() => setSelectedAsset(row.target_asset_id)}>{row.target_asset_id}</Button> : text(row.target_asset_id)}<p>{row.expected_gain == null ? "Tambahan belum dihitung" : `Expected gain: ${number(row.expected_gain)} (satuan belum disediakan API)`}</p></td><td><Badge tone={recommendationOrigin(row).tone}>{recommendationOrigin(row).label}</Badge><p>Prediksi: {row.prediction_id == null ? "Belum tersedia" : `#${row.prediction_id}`}</p><Facts label={`Fakta rekomendasi #${row.id}`} value={row.reason_facts} /></td><td><strong>{statusLabels[row.status] || row.status}</strong>{writable && canDecideRecommendation(permissions) && <div className={styles.decisions}>{recommendationStatuses.filter(value => value !== row.status).map(value => <Button variant="secondary" key={value} disabled={busy} onClick={() => { clearFeedback(); setDecision({ row, status: value }); }}>{value === "draft" ? "Kembali ke draft" : value === "accepted" ? "Terima" : value === "rejected" ? "Tolak" : "Tandai applied"}</Button>)}</div>}</td></tr>)}</tbody></Table></ResourceView></Card>}
      {page === "recommendations" && <>
        <AiRecommendationReview />
        <EquipmentAdjustmentRules />
      </>}
      {page === "recommendations" && <Card className="plan-next"><span>Periksa batch dan putuskan rekomendasi.</span><Link className={buttonClass("primary")} href="/rencana" onClick={rememberSelection}>Lanjut ke kelayakan & keputusan</Link></Card>}
    </>}
    {decision && <Modal title={`Ubah status rekomendasi #${decision.row.id}`} onClose={() => { if (!busy) setDecision(null); }}><div className={styles.confirm}><p>Status baru: <strong>{statusLabels[decision.status]}</strong>.</p><p>Keputusan ini tidak otomatis menjalankan perubahan kapasitas, pemindahan alat, atau penjadwalan. Penandaan applied hanya mencatat status.</p><div className={styles.decisions}><Button variant="secondary" disabled={busy} onClick={() => setDecision(null)}>Batal</Button><Button variant="primary" disabled={busy} onClick={() => void submitDecision()}>{busy ? "Menyimpan & memverifikasi…" : "Simpan status"}</Button></div></div></Modal>}
  </div>;
}
