"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Card, SectionTitle, Toggle } from "@/components/ui";
import { Select } from "@/components/ui/fields";
import { API_MODE } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";
import { equipmentSpecs } from "@/lib/api/equipment";
import { connectedRoutes, type PlantTopologyData } from "@/lib/api/topology";
import { canSee, type RoleId } from "@/lib/roles";
import { ProductionSettings } from "./production-settings";
import { ProductionLines } from "./production-lines";
import styles from "./process-management.module.css";

type View = "limits" | "equipment" | "lines";
export function ProcessManagement({ role }: { role: RoleId }) {
  const [view, setView] = useState<View>("limits");
  return <>
    <Card>
      <SectionTitle title="Manajemen proses" subtitle={API_MODE ? "Kelola batas operasional dan periksa konfigurasi alat yang digunakan produksi." : "Mode demo · pengaturan hanya memengaruhi simulasi lokal."} />
      <Toggle label="Cakupan manajemen proses" value={view} onChange={setView} options={[
        { value: "limits", label: "Batas operasional" },
        ...(API_MODE ? [{ value: "equipment" as const, label: "Alat & rute" }, { value: "lines" as const, label: "Lini & kompatibilitas" }] : []),
      ]} />
      <p className={`small muted ${styles.scope}`}>{view === "limits"
        ? "Perubahan berlaku global untuk perencanaan, bukan untuk satu alat atau tanggal tertentu. Jadwal yang sudah dibuat tidak otomatis berubah."
        : "Konfigurasi master hanya dapat dibaca. Backend belum menyediakan penyimpanan perubahan kapasitas, kecepatan per alat, dedikasi lini, atau koneksi rute."}</p>
    </Card>
    {view === "limits" && <ProductionSettings role={role} showTools={false} origin="Produksi · Manajemen proses" />}
    {view === "equipment" && API_MODE && <ProcessEquipment role={role} />}
    {view === "lines" && API_MODE && <ProductionLines />}
  </>;
}

function ProcessEquipment({ role }: { role: RoleId }) {
  const topology = useResource<PlantTopologyData>("/master/topology");
  const [selected, setSelected] = useState("");
  const nodes = topology.data?.nodes ?? [];
  const asset = nodes.find(node => node.asset_id === selected) ?? (!selected ? nodes[0] : undefined);
  const specs = asset ? equipmentSpecs(asset.asset_id, nodes.map(node => ({ ...node }))) : null;
  const routes = asset && topology.data ? connectedRoutes(topology.data, asset.asset_id) : [];
  return <Card>
    <SectionTitle title="Konfigurasi alat & rute" subtitle="Spesifikasi dan koneksi fisik dari master pabrik. Rute konfigurasi tidak menandakan aliran susu sedang berjalan."
      action={<button className="button secondary" disabled={topology.loading} onClick={() => void topology.reload()}>Muat ulang konfigurasi</button>} />
    {topology.error ? <div role="alert"><p className="crit-text">Konfigurasi gagal dimuat: {topology.error.message}</p><button className="button secondary" onClick={() => void topology.reload()}>Coba lagi</button></div>
    : !topology.data ? <p role="status" className="muted">Memuat konfigurasi alat…</p>
    : !nodes.length ? <p className="muted">Belum ada konfigurasi alat di backend.</p>
    : <>
      <label className={`schedule-form ${styles.picker}`}><span className="field-label">Pilih alat</span><Select label="Pilih alat proses" value={asset?.asset_id ?? ""} onChange={setSelected} options={[
        ...(!asset ? [{ value: "", label: "Pilih alat yang tersedia" }] : []),
        ...nodes.map(node => ({ value: node.asset_id, label: `${node.asset_id} · ${node.asset_name}` })),
      ]} /></label>
      {!asset ? <p role="status">Alat yang dipilih sudah tidak ada pada konfigurasi terbaru. Pilih alat lain.</p> : <>
        <div className={styles.identity}><h3>{asset.asset_id} · {asset.asset_name}</h3><Badge tone="neutral">{asset.asset_type}</Badge></div>
        <dl className={styles.specs}>{specs?.map(spec => <div key={spec.key}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>)}</dl>
        <h3 className={styles.routeHeading}>Rute terhubung <span className="small muted">({routes.length})</span></h3>
        {!routes.length ? <p className="muted">Tidak ada rute yang mencantumkan ID alat ini.</p>
        : <div className="table-wrap"><table className="schedule-table"><thead><tr><th>Dari</th><th>Ke</th><th>Melalui</th><th>Batas aliran (L/jam)</th></tr></thead><tbody>{routes.map(route => <tr key={route.connection_id}>
          <td>{route.source_asset_id}</td><td>{route.destination_asset_id}</td><td>{route.via_asset_id || "Tidak dicantumkan"}</td><td>{route.max_flow_lph || "Belum tersedia"}</td>
        </tr>)}</tbody></table></div>}
      </>}
      <div className={styles.links}>
        {canSee(role, "/alat") && <Link className="button secondary" href="/alat">Buka katalog & pencatatan status</Link>}
        {canSee(role, "/kondisi-pabrik") && <Link className="button secondary" href="/kondisi-pabrik">Pantau kondisi & penugasan</Link>}
      </div>
    </>}
  </Card>;
}
