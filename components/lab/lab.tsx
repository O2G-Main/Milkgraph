"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CircleCheck, CircleDashed, CircleX, FlaskConical, Pencil, Plus, TriangleAlert, X } from "lucide-react";
import { decideLab, useDemo, type LabDecision } from "@/lib/demo";
import { can } from "@/lib/roles";
import { applySpecs, mergeLab } from "@/lib/lab";
import { LabEntryDialog, NewSampleDialog, unsampledRts } from "./lab-entry";
import { labResults, type LabResult } from "@/mock/ops";
import { OUTPUTS } from "@/mock/outputs";
import { API_MODE } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";
import { Badge, Card, Icon, Modal, PageHeading, PageLink, SectionTitle, SourceButton, SourceModal } from "@/components/ui";
import type { Scenario, Tone } from "@/mock/types";
import { scenario } from "@/lib/data";
import { LabWaitChart } from "./lab-wait-chart";

const STATUS: Record<LabResult["status"], { label: string; tone: Tone }> = {
  "hasil-siap": { label: "Menunggu rilis QA", tone: "warn" },
  "uji-ulang": { label: "Uji ulang", tone: "warn" },
  "dalam-uji": { label: "Dalam uji", tone: "neutral" },
  lulus: { label: "Lulus, dirilis", tone: "ok" },
  positif: { label: "Out-of-spec", tone: "crit" },
};
const decided = (d: LabDecision) => ({ label: d.status === "dirilis" ? "Dirilis QA" : "Ditolak QA", tone: (d.status === "dirilis" ? "ok" : "crit") as Tone });
const decidable = (r: LabResult) => r.kind === "penerimaan" && (r.status === "hasil-siap" || r.status === "uji-ulang" || r.status === "positif");
const pending = (r: LabResult) => r.status === "dalam-uji" || r.status === "uji-ulang";

type LabResultItem = LabResult & { decision?: LabDecision; eta?: string };

/** Satu halaman per jenis uji: Tes Lab penerimaan RT (menu Penerimaan) dan QC barang jadi (menu Operasional). */
/** `lot` dari ?lot=... (tautan dari Riwayat Produksi) langsung membuka sampel lot itu. */
export function Lab({ kind, lot, sample }: { kind: LabResult["kind"]; lot?: string; sample?: string }) {
  const demo = useDemo();
  const [openId, setOpenId] = useState<string | null>(() => sample ?? labResults.find(r => r.kind === kind && r.subject === lot)?.id ?? null);
  const [entry, setEntry] = useState<"hasil" | "sampel" | null>(null);
  const [dialog, setDialog] = useState<"dirilis" | "ditolak" | null>(null);
  const [note, setNote] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resultsRes = useResource<LabResultItem[]>(API_MODE ? `/lab/results?kind=${kind}` : null);
  const summaryRes = useResource<{ waiting: number; released: number; avgWaitMin: number }>(API_MODE && kind === "penerimaan" ? "/lab/summary" : null);
  // Riwayat tunggu lab per jam ikut endpoint receiving (sumber yang sama dengan antrean RT).
  const waitRes = useResource<Pick<Scenario, "labHistory"> & { labSummary: { avgMinutes: number; deltaMinutes: number } }>(API_MODE && kind === "penerimaan" ? "/receiving" : null);

  if (API_MODE && (!resultsRes.data || (kind === "penerimaan" && !summaryRes.data))) {
    if (resultsRes.error || summaryRes.error) {
      const err = resultsRes.error ?? summaryRes.error;
      return (
        <div className="page-enter" role="status">
          <p className="crit-text">Gagal memuat Hasil Lab: {err?.message}</p>
        </div>
      );
    }
    return <div className="page-enter" role="status"><p className="muted">Memuat Hasil Lab…</p></div>;
  }

  const allowed = can(demo.role, "lab.decide");
  // Hasil uji RT dan batch dimasukkan Lab; hasil mutu barang jadi dicatat QA/QC.
  const canRecord = can(demo.role, kind === "qc-fg" ? "qc.record" : "lab.record");
  const intake = kind === "penerimaan";
  // Tes Lab memuat sampel RT dan batch tangki proses; hasil yang dimasukkan Lab menimpa hasil LIMS.
  const merged = applySpecs(mergeLab(labResults, demo.lab), demo.quality);
  const rows: LabResultItem[] = API_MODE ? (resultsRes.data ?? []) : merged.filter(r => intake ? r.kind === "penerimaan" || r.kind === "batch" : r.kind === kind);
  const open = rows.find(r => r.id === openId);
  const badge = (r: LabResultItem) => r.decision ? decided(r.decision) : demo.labs[r.id] ? decided(demo.labs[r.id]) : r.kind === "qc-fg" && r.status === "lulus" ? { label: "Lulus QC", tone: "ok" as Tone } : STATUS[r.status];
  const waiting = API_MODE ? (summaryRes.data?.waiting ?? 0) : rows.filter(r => decidable(r) && r.status !== "positif" && !demo.labs[r.id]).length;
  const avgWait = API_MODE ? (summaryRes.data?.avgWaitMin ?? 0) : 52;
  const unsampled = unsampledRts(rows, demo);
  const toCheck = rows.filter(r => pending(r) && !demo.labs[r.id]).length + unsampled.length;
  const entryOf = open ? demo.lab.entries[open.id] : undefined;
  const editable = !!open && (canRecord || (API_MODE && allowed)) && (open.kind === "qc-fg" || (open.status !== "lulus" && !open.decision && !demo.labs[open.id]));
  const metrics = intake
    ? [{ icon: TriangleAlert, label: "Perlu diperiksa", value: toCheck, unit: "sampel" }, { icon: FlaskConical, label: "Menunggu keputusan QA", value: waiting, unit: "sampel" }, { icon: CircleDashed, label: "Rata-rata tunggu lab", value: avgWait, unit: "menit" }]
    : [{ icon: FlaskConical, label: "Lot diuji", value: rows.length, unit: "lot" }, { icon: CircleX, label: "Out-of-spec", value: rows.filter(r => r.status === "positif").length, unit: "lot" }, { icon: CircleCheck, label: "Lulus", value: rows.filter(r => r.status === "lulus").length, unit: "lot" }];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!open || !dialog || (dialog === "ditolak" && !note.trim())) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await decideLab(open.id, open.subject, dialog, note.trim());
      setDialog(null);
      setNote("");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="page-enter">
    <PageHeading title={intake ? "Tes Lab" : "QC Barang Jadi"} subtitle={intake ? "Sampel road tanker dan batch tangki proses. Lab memasukkan hasil uji tiap parameter; RT baru masuk antrean bongkar setelah dirilis QA." : "Hasil QC lot barang jadi dari LIMS sebelum lot dikirim dari gudang."}>
      {(canRecord || (API_MODE && allowed)) && <button className="button primary" onClick={() => setEntry("sampel")}><Icon icon={Plus} size={16} />Buat sampel{intake && unsampled.length ? ` (${unsampled.length})` : ""}</button>}
    </PageHeading>
    <div className="metrics-grid three">{metrics.map(m => <Card key={m.label} className="metric-card"><span className="metric-label"><Icon icon={m.icon} size={15} />{m.label}</span><p className="metric-value">{m.value}<span>{m.unit}</span></p></Card>)}</div>
    <div className="kg-layout">
      <Card><SectionTitle title={intake ? "Sampel road tanker dan batch" : "Sampel lot barang jadi"} subtitle="Pilih baris untuk melihat parameter dan batasnya." />
        <div className="table-wrap"><table className="select-table"><thead><tr><th>Sampel</th><th>{intake ? "RT / Batch" : "Lot"}</th><th>Diambil</th><th>Status</th></tr></thead><tbody>{rows.map(r => <tr key={r.id} className={openId === r.id ? "selected" : ""} onClick={() => setOpenId(r.id)}><td><button className="row-button" aria-pressed={openId === r.id} onClick={() => setOpenId(r.id)}><strong className="mono">{r.id}</strong></button></td><td data-label={intake ? "RT" : "Lot"}><strong className="mono">{r.subject}</strong><span className="table-sub">{r.detail}</span></td><td data-label="Diambil">{r.sampled}</td><td data-label="Status"><Badge tone={badge(r).tone}>{badge(r).label}</Badge></td></tr>)}</tbody></table></div>
      </Card>
      <aside className="kg-detail" aria-live="polite">{open ? <>
        <div className="kg-detail-top"><Badge tone={badge(open).tone}>{badge(open).label}</Badge><SourceButton id={open.source} onSelect={setSource} compact /></div>
        <h2><span className="mono">{open.subject}</span></h2>
        <p className="small muted">{open.id} · {open.detail} · diambil {open.sampled}</p>
        <ul className="param-list">{open.params.map(p => <li key={p.name}><Icon icon={p.ok === null ? CircleDashed : p.ok ? CircleCheck : CircleX} size={16} className={p.ok === null ? "muted" : p.ok ? "ok-text" : "crit-text"} /><span><strong>{p.name}</strong><small>Batas {p.limit}</small></span><span className="mono">{p.value}</span></li>)}</ul>
        {entryOf && <p className="small muted">Hasil dimasukkan {entryOf.by}, pukul {entryOf.at}.</p>}
        {editable && <div className="page-actions"><button className="button secondary" onClick={() => setEntry("hasil")}><Icon icon={Pencil} size={16} />{open.params.some(p => p.ok === null) ? "Masukkan hasil" : "Perbarui hasil"}</button></div>}
        {open.decision || demo.labs[open.id] ? <p className="small"><strong>{decided((open.decision || demo.labs[open.id])!).label}</strong> oleh {(open.decision || demo.labs[open.id])!.by}, {(open.decision || demo.labs[open.id])!.at}. {(open.decision || demo.labs[open.id])!.note}</p>
          : decidable(open) && allowed ? <><div className="page-actions"><button className="button secondary" disabled={submitting} onClick={() => { setNote(""); setSubmitError(null); setDialog("ditolak"); }}><Icon icon={X} size={16} />Tolak RT</button><button className="button primary" disabled={open.status === "uji-ulang" || open.status === "positif" || submitting} onClick={() => { setNote(""); setSubmitError(null); setDialog("dirilis"); }}><Icon icon={Check} size={16} />Rilis ke receiving</button></div>{open.status === "uji-ulang" && <p className="small muted">Rilis menunggu hasil uji ulang alcohol test, perkiraan keluar pukul {open.eta || "15.30"}. RT ini tetap bisa ditolak sekarang.</p>}</>
          : !intake ? <>
            <p className="small muted">{open.status === "positif" ? "Lot ini gagal QC. Telusuri asalnya, lalu ajukan hold." : open.status === "dalam-uji" ? "Pemeriksaan mutu lot ini belum lengkap." : "Lot ini lulus QC barang jadi."}</p>
            <div className="page-actions">
              {open.status === "positif" && <PageLink className="button primary" href="/trace">Telusuri dan ajukan hold<Icon icon={ArrowRight} size={16} /></PageLink>}
              {OUTPUTS.some(o => o.id === open.subject) && <Link className="button secondary" href={`/riwayat-produksi?lot=${open.subject}`}>Lihat riwayat produksi lot<Icon icon={ArrowRight} size={16} /></Link>}
            </div>
          </>
          : <p className="small muted">{{
              "dalam-uji": "Uji masih berjalan. QA baru bisa memutuskan setelah semua parameter selesai diuji.",
              "uji-ulang": "Menunggu hasil uji ulang sebelum diputuskan QA.",
              "hasil-siap": open.kind === "batch" ? "Semua parameter dalam batas. Batch siap dipakai setelah dirilis QA." : "Semua parameter dalam batas. Menunggu keputusan QA.",
              positif: "Ada parameter di luar batas. QA yang memutuskan tindak lanjutnya.",
              lulus: "RT ini sudah dirilis sebelum snapshot pukul 14.42.",
            }[open.status]}</p>}
      </> : <><p className="small with-icon"><Icon icon={FlaskConical} size={14} />Pilih sampel untuk melihat parameternya.</p><p className="small muted">{intake ? "Lab memasukkan hasil uji tiap parameter. QA merilis RT ke antrean bongkar atau menolaknya, dan setiap perubahan tercatat di Riwayat Persetujuan." : <>Riwayat tiap lot, dari asal susu sampai selesai filling, ada di <PageLink inline href="/riwayat-produksi">Riwayat Produksi</PageLink>. Lot yang out-of-spec bisa ditelusuri lalu diajukan hold.</>}</p></>}</aside>
    </div>
    {dialog && open && <Modal title={dialog === "dirilis" ? `Rilis ${open.subject} ke receiving?` : `Tolak ${open.subject}?`} onClose={() => { setDialog(null); setSubmitError(null); }}><form onSubmit={submit}><Badge>Data simulasi</Badge><p className="dialog-summary">{dialog === "dirilis" ? `${open.subject} akan masuk antrean bongkar. Semua parameternya dalam batas.` : `${open.subject} tidak dibongkar dan dikembalikan ke pemasok. Tulis alasannya supaya keputusan ini bisa ditelusuri nanti.`}</p>{submitError && <p className="crit-text small">{submitError}</p>}<label className="field-label" htmlFor="lab-note">Catatan {dialog === "ditolak" ? "(wajib)" : "(opsional)"}</label><textarea id="lab-note" value={note} onChange={e => setNote(e.target.value)} required={dialog === "ditolak"} maxLength={500} placeholder={dialog === "ditolak" ? "Contoh: alcohol test positif pada uji ulang." : "Contoh: prioritaskan bongkar karena umur susu sudah 7 jam 20 menit."} /><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => { setDialog(null); setSubmitError(null); }} disabled={submitting}>Batal</button><button className="button primary" disabled={submitting || (dialog === "ditolak" && !note.trim())}>{submitting ? "Memproses…" : (dialog === "dirilis" ? "Konfirmasi rilis" : "Konfirmasi penolakan")}<Icon icon={Check} size={16} /></button></div></form></Modal>}
    {intake && <LabWaitChart history={API_MODE ? (waitRes.data?.labHistory ?? []) : scenario.labHistory} avg={API_MODE ? (waitRes.data?.labSummary.avgMinutes ?? avgWait) : 52} delta={API_MODE ? (waitRes.data?.labSummary.deltaMinutes ?? 0) : 14} onSource={setSource} />}
    <SourceModal id={source} onClose={() => setSource(null)} />
    {entry === "hasil" && open && <LabEntryDialog sample={open} role={demo.role} onClose={() => setEntry(null)} />}
    {entry === "sampel" && <NewSampleDialog kind={kind} samples={rows} role={demo.role} onClose={() => setEntry(null)} />}
  </div>;
}
