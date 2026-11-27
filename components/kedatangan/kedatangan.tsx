"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Pencil, Plus } from "lucide-react";
import { saveArrival, useDemo } from "@/lib/demo";
import { can } from "@/lib/roles";
import { ARRIVAL_STATUS, ageText, ageTone, arrivalAge, clock, toMin, type ArrivalStatus } from "@/lib/receiving";
import { duration } from "@/lib/format";
import { farms } from "@/mock/ops";
import { API_MODE, apiSend } from "@/lib/api/client";
import { invalidateResources, useResource } from "@/lib/api/resource";
import { RT_IMPORT_TEMPLATE, arrivalCreateBody, arrivalFromApi, arrivalUpdateBody, toHHMM, type ArrivalRow, type BeArrival } from "@/lib/api/contract";
import { ImportCsvCard } from "@/components/import-csv-card";
import { Badge, Card, Icon, Modal, PageHeading, PageLink, SectionTitle } from "@/components/ui";
import { Select, TimeField } from "@/components/ui/fields";

const number = (n: number) => new Intl.NumberFormat("id-ID").format(n);
/** Di mode lokal, RT yang tiba dicatat lewat Antrean Truk; di mode API status Sudah Tiba bisa diatur di sini (PUT actual_arrival). */
const EDITABLE: ArrivalStatus[] = API_MODE ? ["loading", "perjalanan", "tiba", "batal"] : ["loading", "perjalanan", "batal"];
const PATH = "/supply/rt-arrivals";

/** Keterlambatan dari late_minutes server (mode API) atau eta - target (mode lokal). Negatif berarti lebih awal. */
function Late({ minutes }: { minutes: number }) {
  if (!minutes) return <Badge tone="ok">Tepat waktu</Badge>;
  return minutes > 0 ? <Badge tone={minutes >= 30 ? "crit" : "warn"}>Terlambat {minutes} mnt</Badge> : <Badge tone="ok">Lebih awal {-minutes} mnt</Badge>;
}

export function Kedatangan() {
  const demo = useDemo();
  const allowed = can(demo.role, "arrival.edit");
  const holding = demo.limits.holdingMin;
  const res = useResource<BeArrival[]>(API_MODE ? PATH : null);
  const [editing, setEditing] = useState<{ item: ArrivalRow; isNew: boolean } | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (API_MODE && !res.data) {
    return <div className="page-enter">
      <PageHeading title="Jadwal Kedatangan RT" subtitle="Road tanker yang dijadwalkan, dalam perjalanan, dan sudah tiba." />
      {res.error ? <p className="crit-text" role="alert">Gagal memuat jadwal kedatangan: {res.error.message}</p> : <p className="muted" role="status">Memuat jadwal kedatangan…</p>}
    </div>;
  }

  const list: ArrivalRow[] = API_MODE
    ? (res.data ?? []).map(arrivalFromApi)
    : [...demo.receiving.arrivals].sort((a, b) => toMin(a.eta) - toMin(b.eta)).map(a => ({ ...a, target: a.target ?? a.eta, late: toMin(a.eta) - toMin(a.target ?? a.eta) }));
  const visibleRows = showAll ? list : list.slice(0, 10);
  const active = list.filter(a => a.status === "perjalanan" || a.status === "loading");
  const onRoad = list.filter(a => a.status === "perjalanan");
  const lateRows = active.filter(a => a.late > 0);
  // Umur susu saat tiba hanya tersedia di data lokal (awal umur susu dicatat di Antrean Truk).
  const showAge = !API_MODE;
  const risky = showAge ? active.filter(a => ageTone(arrivalAge(a), holding) !== "ok") : [];
  const nextId = `RT-${Math.max(37, ...list.map(a => Number(a.id.replace(/\D/g, "")) || 0)) + 1}`;
  const farmOptions = API_MODE
    ? [...new Map(list.map(a => [a.farmId ?? a.farm, { value: a.farmId ?? a.farm, label: a.farm }])).values()]
    : farms.map(f => ({ value: f.name, label: f.name }));
  const blank: ArrivalRow = { id: nextId, farm: farmOptions[0]?.label ?? "", farmId: API_MODE ? farmOptions[0]?.value : undefined, volume: 0, depart: "15:00", target: "16:30", eta: "16:30", milkStart: "09:00", status: "loading", note: "", late: 0 };

  return (
    <div className="page-enter kedatangan-page">
      <PageHeading title="Jadwal Kedatangan RT" subtitle="Road tanker yang dijadwalkan, dalam perjalanan, dan sudah tiba. Keterlambatan = estimasi tiba dibanding target tiba.">
        {allowed && <button className="button primary" onClick={() => setEditing({ isNew: true, item: blank })}><Icon icon={Plus} size={16} />Tambah jadwal RT</button>}
      </PageHeading>
      <div className="schedule-stats">
        <Card><span className="small muted">Dalam perjalanan</span><strong>{onRoad.length} <small>RT</small></strong><span className="small muted">{onRoad[0] ? `Berikutnya ${onRoad[0].id} pukul ${clock(onRoad[0].eta)}` : "Tidak ada RT di jalan"}</span></Card>
        <Card><span className="small muted">Terlambat dari target</span><strong className={lateRows.length ? "warn-text" : "ok-text"}>{lateRows.length} <small>RT</small></strong><span className="small muted">{lateRows.length ? lateRows.map(a => `${a.id} ${a.late} mnt`).join(", ") : "Semua sesuai target"}</span></Card>
        {showAge
          ? <Card><span className="small muted">Berisiko holding time</span><strong className={risky.length ? "warn-text" : "ok-text"}>{risky.length}</strong><span className="small muted">Sisa kurang dari 3 jam saat tiba, batas {duration(holding)}</span></Card>
          : <Card><span className="small muted">Akan masuk</span><strong>{number(active.reduce((s, a) => s + a.volume, 0))} <small>L</small></strong><span className="small muted">{active.length} RT belum tiba</span></Card>}
      </div>
      <Card>
        <SectionTitle title="Jadwal kedatangan" subtitle="Urut menurut target tiba." action={<PageLink className="text-link" href="/receiving">Buka antrean truk<Icon icon={ArrowRight} size={14} /></PageLink>} />
        <div className="table-wrap">
          <table className="schedule-table">
            <thead><tr><th>RT / Farm</th><th className="numeric">Volume</th><th>Berangkat</th><th>Target tiba</th><th>Estimasi tiba</th><th>Keterlambatan</th>{showAge && <th>Umur saat tiba</th>}<th>Status</th>{allowed && <th><span className="sr-only">Aksi</span></th>}</tr></thead>
            <tbody>
              {visibleRows.map(a => {
                const age = arrivalAge(a), tone = a.status === "batal" ? "neutral" : ageTone(age, holding);
                return (
                  <tr key={a.apiId ?? a.id}>
                    <td><strong className="mono">{a.id}</strong><span className="table-sub">{a.farm}{a.note ? `. ${a.note}` : ""}</span></td>
                    <td data-label="Volume" className="numeric">{number(a.volume)} L</td>
                    <td data-label="Berangkat" className="schedule-time">{clock(a.depart)}</td>
                    <td data-label="Target tiba" className="schedule-time">{clock(a.target)}</td>
                    <td data-label="Estimasi tiba" className="schedule-time">{clock(a.eta)}{a.actual && <span className="table-sub">Tiba {clock(a.actual)}</span>}</td>
                    <td data-label="Keterlambatan">{a.status === "batal" ? <span className="small muted">-</span> : <Late minutes={a.late} />}</td>
                    {showAge && <td data-label="Umur saat tiba" className={`schedule-time ${tone === "crit" ? "crit-text" : tone === "warn" ? "warn-text" : ""}`}>{ageText(age)}<span className="table-sub">awal {clock(a.milkStart)}</span></td>}
                    <td data-label="Status"><Badge tone={ARRIVAL_STATUS[a.status].tone}>{ARRIVAL_STATUS[a.status].label}</Badge></td>
                    {allowed && (
                      <td className="table-action">
                        {a.status === "tiba" && !API_MODE
                          ? <PageLink className="text-link" href="/receiving">Di antrean</PageLink>
                          : <button className="icon-button" aria-label={`Ubah jadwal ${a.id}`} onClick={() => setEditing({ isNew: false, item: { ...a } })}><Icon icon={Pencil} size={16} /></button>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.length > 10 && (
          <p className="small"><button type="button" className="text-link" onClick={() => setShowAll(v => !v)}>{showAll ? "Tampilkan lebih sedikit" : `Tampilkan semua ${list.length} kedatangan`}</button></p>
        )}
      </Card>
      {API_MODE && (
        <ImportCsvCard<BeArrival>
          title="Import CSV jadwal kedatangan"
          subtitle="Satu baris CSV adalah satu kedatangan RT. Waktu boleh ditulis jam saja (HH:MM, digabung tanggal demo oleh server) atau datetime penuh. RT yang sudah ada tidak ditimpa."
          templateCsv={RT_IMPORT_TEMPLATE}
          templateName="template-kedatangan-rt.csv"
          importPath="/supply/rt-arrivals/import"
          role={demo.role}
          canImport={["planner", "receiving", "supervisor", "manager", "superadmin"].includes(demo.role)}
          gateNote="Import jadwal kedatangan untuk Planner, Manager, Supervisor, dan Receiving (khusus RT) lewat permission rt.manage atau import.csv di server, dengan Superadmin sebagai cadangan. Role lain cukup membaca jadwal di atas."
          invalidate={[PATH, "/audit", "/dashboard/executive"]}
          rowKey={r => r.id}
          columns={[
            { header: "RT", cell: r => <strong className="mono">{r.rt_id}</strong> },
            { header: "Farm", cell: r => r.farm_name },
            { header: "Volume", numeric: true, cell: r => `${number(r.volume_l)} L` },
            { header: "Target tiba", cell: r => toHHMM(r.target_arrival) },
            { header: "Status", cell: r => r.status },
          ]}
        />
      )}
      {editing && <ArrivalForm value={editing.item} isNew={editing.isNew} taken={list.map(a => a.id)} farmOptions={farmOptions} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ArrivalForm({ value, isNew, taken, farmOptions, onClose }: { value: ArrivalRow; isNew: boolean; taken: string[]; farmOptions: { value: string; label: string }[]; onClose: () => void }) {
  const { role } = useDemo();
  const [form, setForm] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ArrivalRow>(key: K, v: ArrivalRow[K]) => { setForm(f => ({ ...f, [key]: v })); setError(null); };
  // Mode API: PUT hanya menerima estimasi tiba, status, dan tiba aktual.
  const locked = API_MODE && !isNew;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const id = form.id.trim().toUpperCase();
    if (!/^RT-\d+$/.test(id)) return setError("Nomor RT ditulis seperti RT-38.");
    if (isNew && taken.includes(id)) return setError(`${id} sudah ada di jadwal.`);
    if (!(form.volume > 0)) return setError("Isi volume rencana lebih dari 0 L.");
    if (toMin(form.eta) <= toMin(form.depart) || toMin(form.target) <= toMin(form.depart)) return setError("Target dan estimasi tiba harus setelah jam berangkat.");
    if (form.status === "tiba" && API_MODE && !form.actual) return setError("Isi jam tiba aktual untuk status Sudah Tiba.");
    const row = { ...form, id, note: form.note.trim() };
    if (!API_MODE) { saveArrival({ ...row, target: row.target }, isNew); onClose(); return; }
    setSaving(true);
    try {
      if (isNew) await apiSend("POST", PATH, arrivalCreateBody(row), role);
      else await apiSend("PUT", `${PATH}/${encodeURIComponent(value.apiId ?? id)}`, arrivalUpdateBody(row), role);
      invalidateResources([PATH, "/dashboard/executive", "/site/bottlenecks", "/audit"]);
      onClose();
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(status === 404 ? "Jadwal ini sudah tidak ada di server. Muat ulang halaman." : err instanceof Error ? err.message : "Gagal menyimpan jadwal.");
      setSaving(false);
    }
  }

  return (
    <Modal title={isNew ? "Tambah jadwal kedatangan RT" : `Ubah jadwal ${value.id}`} onClose={onClose}>
      <form className="schedule-form" onSubmit={submit} noValidate>
        <div className="schedule-form-row">
          <label><span className="field-label">Nomor RT</span><span className="field-static mono">{form.id}</span><span className="small muted">Dibuat otomatis dari jadwal terakhir</span></label>
          <label><span className="field-label">Volume rencana (L)</span><input type="number" inputMode="numeric" min={1} step={100} value={form.volume || ""} readOnly={locked} onChange={e => set("volume", Number(e.target.value))} placeholder="Contoh: 9800" /></label>
        </div>
        <label><span className="field-label">Farm asal</span><Select label="Farm asal" value={API_MODE ? form.farmId ?? "" : form.farm} disabled={locked} onChange={v => { const f = farmOptions.find(o => o.value === v); setForm(x => ({ ...x, farm: f?.label ?? v, farmId: API_MODE ? v : x.farmId })); }} options={farmOptions} /></label>
        <div className="schedule-form-row">
          <label><span className="field-label">Berangkat</span>{locked ? <input value={clock(form.depart)} readOnly /> : <TimeField label="Jam berangkat" value={form.depart} onChange={v => set("depart", v)} minuteStep={5} />}</label>
          <label><span className="field-label">Target tiba</span>{locked ? <input value={clock(form.target)} readOnly /> : <TimeField label="Target tiba" value={form.target} onChange={v => set("target", v)} minuteStep={5} />}</label>
        </div>
        <div className="schedule-form-row">
          <label><span className="field-label">Estimasi tiba</span><TimeField label="Estimasi tiba" value={form.eta} onChange={v => set("eta", v)} minuteStep={5} /></label>
          <label><span className="field-label">Status perjalanan</span><Select label="Status perjalanan" value={form.status} onChange={v => set("status", v)} options={EDITABLE.map(s => ({ value: s, label: ARRIVAL_STATUS[s].label }))} /></label>
        </div>
        {API_MODE && form.status === "tiba" && <label><span className="field-label">Tiba aktual</span><TimeField label="Jam tiba aktual" value={form.actual ?? ""} onChange={v => set("actual", v)} minuteStep={5} /></label>}
        {!API_MODE && <>
          <label><span className="field-label">Awal umur susu</span><TimeField label="Awal umur susu" value={form.milkStart} onChange={v => set("milkStart", v)} minuteStep={5} /></label>
          <label><span className="field-label">Catatan (opsional)</span><textarea value={form.note} onChange={e => set("note", e.target.value)} maxLength={200} rows={2} placeholder="Contoh: jalan Pujon macet, ETA mundur 20 menit" /></label>
          <p className="small muted">Perkiraan umur susu saat tiba {ageText(arrivalAge(form))}. Kedatangan aktual dicatat di Antrean Truk.</p>
        </>}
        {API_MODE && <p className="small muted">Keterlambatan dihitung server dari estimasi dan target tiba.</p>}
        {error && <p className="small crit-text" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? "Menyimpan…" : isNew ? "Tambah jadwal" : "Simpan perubahan"}</button>
        </div>
      </form>
    </Modal>
  );
}
