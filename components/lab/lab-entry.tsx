"use client";

import { useState, type FormEvent } from "react";
import { addLabSample, saveLabEntry, useDemo, type DemoState } from "@/lib/demo";
import { newIntakeSample } from "@/lib/lab";
import { applyQueue } from "@/lib/receiving";
import { scenario } from "@/lib/data";
import type { LabParam, LabResult } from "@/mock/ops";
import { API_MODE, apiSend } from "@/lib/api/client";
import { invalidateResources } from "@/lib/api/resource";
import { Modal } from "@/components/ui";
import { Select } from "@/components/ui/fields";

type Verdict = "lulus" | "gagal" | "berjalan";
const toVerdict = (ok: boolean | null): Verdict => (ok === null ? "berjalan" : ok ? "lulus" : "gagal");
const fromVerdict = (v: Verdict) => (v === "berjalan" ? null : v === "lulus");
const VERDICTS: { value: Verdict; label: string }[] = [{ value: "berjalan", label: "Masih berjalan" }, { value: "lulus", label: "Dalam batas" }, { value: "gagal", label: "Di luar batas" }];

/** Masukkan atau perbarui hasil tiap parameter satu sampel. */
export function LabEntryDialog({ sample, role = "lab", onClose }: { sample: LabResult; role?: string; onClose: () => void }) {
  const [rows, setRows] = useState(sample.params.map(p => ({ ...p, verdict: toVerdict(p.ok) })));
  const [retest, setRetest] = useState(sample.status === "uji-ulang");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => { setRows(r => r.map((x, j) => (j === i ? { ...x, ...patch } : x))); setError(null); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const empty = rows.find(r => r.verdict !== "berjalan" && !r.value.trim());
    if (empty) return setError(`Isi nilai ${empty.name} sebelum menyimpan hasilnya.`);
    const params: LabParam[] = rows.map(r => ({ name: r.name, limit: r.limit, value: r.verdict === "berjalan" && !r.value.trim() ? "Berjalan" : r.value.trim(), ok: fromVerdict(r.verdict) }));
    if (!API_MODE) {
      saveLabEntry(sample, params, retest);
      onClose();
      return;
    }
    setSaving(true);
    try {
      await apiSend("PUT", `/lab/results/${encodeURIComponent(sample.id)}`, { params, status: retest ? "uji-ulang" : "" }, role);
      invalidateResources(["/lab/results", "/lab/summary", "/receiving", "/site/status", "/graph", "/audit"]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan hasil uji.");
      setSaving(false);
    }
  }

  return (
    <Modal title={`Hasil uji ${sample.subject}`} onClose={onClose} className="lab-entry-modal">
      <form className="schedule-form" onSubmit={submit} noValidate>
        <p className="muted">{sample.id} · {sample.detail} · diambil {sample.sampled}</p>
        <div className="lab-entry-list">
          {rows.map((r, i) => (
            <fieldset key={r.name} className="lab-entry-row">
              <legend>{r.name} <small>Batas {r.limit}</small></legend>
              <input aria-label={`Nilai ${r.name}`} value={r.value === "Berjalan" ? "" : r.value} placeholder="Nilai hasil uji" onChange={e => set(i, { value: e.target.value })} />
              <Select label={`Hasil ${r.name}`} value={r.verdict} onChange={v => set(i, { verdict: v })} options={VERDICTS} />
            </fieldset>
          ))}
        </div>
        {sample.kind !== "qc-fg" && <label className="check-row"><input type="checkbox" checked={retest} onChange={e => setRetest(e.target.checked)} />Perlu uji ulang sebelum diputuskan QA</label>}
        {error && <p className="small crit-text" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan hasil"}</button>
        </div>
      </form>
    </Modal>
  );
}

/** RT yang sudah tiba tapi belum punya sampel lab. */
export function unsampledRts(samples: LabResult[], demo: Pick<DemoState, "receiving" | "limits">) {
  const sampled = new Set(samples.map(s => s.subject));
  return applyQueue(scenario.tankers, demo.receiving, demo.limits.holdingMin).filter(r => (r.stage === "Sampling" || r.stage === "Lab test") && !sampled.has(r.id));
}

/** Buat sampel baru (RT/Batch atau QC Barang Jadi). */
export function NewSampleDialog({ kind = "penerimaan", samples, role = "lab", onClose }: { kind?: LabResult["kind"]; samples: LabResult[]; role?: string; onClose: () => void }) {
  const waiting = unsampledRts(samples, useDemo());
  const [rt, setRt] = useState(waiting[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = waiting.find(r => r.id === rt);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const targetSubject = kind === "penerimaan" && pick ? pick.id : subject.trim().toUpperCase();
    if (!targetSubject) {
      setError("Isi kode RT, batch, atau lot sampel.");
      return;
    }
    const targetDetail = kind === "penerimaan" && pick
      ? `${pick.farm} · ${new Intl.NumberFormat("id-ID").format(pick.volume)} L`
      : detail.trim() || (kind === "qc-fg" ? "Sampel QC barang jadi" : "Sampel penerimaan");
    const defaultParams = kind === "qc-fg"
      ? [{ name: "Sterilitas", limit: "Negatif", value: "Berjalan", ok: null }, { name: "Brix", limit: "12,0 - 13,0", value: "Berjalan", ok: null }]
      : newIntakeSample("TMP", targetSubject, targetDetail, "14.42", pick?.temperature ?? 4.2).params;

    if (!API_MODE) {
      if (!pick) return;
      const next = Math.max(9100, ...samples.map(s => Number(s.id.replace(/\D/g, "")) || 0)) + 1;
      addLabSample(newIntakeSample(`LAB-${next}`, pick.id, targetDetail, (pick.arrivedAt ?? "14:42").replace(":", "."), pick.temperature));
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiSend("POST", "/lab/results", { kind, subject: targetSubject, detail: targetDetail, params: defaultParams }, role);
      invalidateResources(["/lab/results", "/lab/summary", "/receiving", "/site/status", "/graph", "/audit"]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat sampel.");
      setSaving(false);
    }
  }

  return (
    <Modal title={kind === "qc-fg" ? "Buat sampel QC barang jadi" : "Buat sampel lab"} onClose={onClose}>
      {!API_MODE && !waiting.length ? <><p className="muted">Semua RT di antrean sudah punya sampel.</p><div className="dialog-actions"><button className="button primary" onClick={onClose}>Tutup</button></div></> : (
        <form className="schedule-form" onSubmit={submit} noValidate>
          {kind === "penerimaan" && waiting.length > 0 && (
            <label><span className="field-label">Pilih RT di antrean</span><Select label="RT yang belum disampel" value={rt} onChange={setRt} options={waiting.map(r => ({ value: r.id, label: r.id, hint: `${r.farm}, umur susu ${r.age}` }))} /></label>
          )}
          {API_MODE && (kind === "qc-fg" || waiting.length === 0) && (
            <>
              <label><span className="field-label">{kind === "qc-fg" ? "Kode Lot Barang Jadi" : "Kode RT / Batch"}</span><input value={subject} onChange={e => setSubject(e.target.value)} placeholder={kind === "qc-fg" ? "Contoh: FG-1102-01" : "Contoh: RT-38"} required /></label>
              <label><span className="field-label">Keterangan</span><input value={detail} onChange={e => setDetail(e.target.value)} placeholder="Contoh: UHT Plain 1000 ml" /></label>
            </>
          )}
          <p className="small muted">Semua parameter dimulai dari status berjalan. Isi hasilnya lewat tombol Masukkan/Perbarui hasil.</p>
          {error && <p className="small crit-text" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="button primary" disabled={saving}>{saving ? "Membuat…" : "Buat sampel"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
