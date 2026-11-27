"use client";

import { useState } from "react";
import { Alur } from "@/components/alur/alur";
import { DateField } from "@/components/ui/fields";
import { Card, PageHeading, Toggle } from "@/components/ui";
import { API_MODE } from "@/lib/api/client";
import { useDemo } from "@/lib/demo";
import { dateInWib } from "@/lib/production-date";
import { DemoProductionDay } from "./production-day";
import { ProductionDayApi } from "./production-day-api";
import { ProcessManagement } from "./process-management";
import { PlantTopology } from "./plant-topology";

type View = "daily" | "flow" | "process";

export function ProductionPage({ initialDate }: { initialDate: string }) {
  const { role } = useDemo();
  const [date, setDate] = useState(initialDate);
  const [view, setView] = useState<View>("daily");
  return <div className="page-enter">
    <PageHeading title="Produksi" subtitle={API_MODE ? "Periksa kecukupan volume susu per batch, tinjau alur pabrik, dan kelola batas operasional produksi." : "Tinjau produksi harian dan alur pabrik menggunakan data simulasi lokal."} />
    <div className="page-tabs production-tabs">
      <Toggle label="Bagian Produksi" value={view} onChange={setView} options={[
        { value: "daily", label: API_MODE ? "Prediksi pemenuhan" : "Produksi harian (demo)" },
        { value: "flow", label: "Alur pabrik" },
        { value: "process", label: "Manajemen proses" },
      ]} />
    </div>
    <div className="production-stack">
      {view === "daily" && <>
        <Card className="production-date">
          <label className="schedule-form">
            <span className="field-label">{API_MODE ? "Tanggal produksi yang dinilai (WIB)" : "Tanggal produksi simulasi (WIB)"}</span>
            <DateField label="Pilih tanggal produksi" value={date} onChange={setDate} />
          </label>
          <button className="button secondary" onClick={() => setDate(dateInWib())}>Hari ini</button>
          <p id="production-date-hint" className="small muted">{API_MODE ? "Filter tanggal ini berlaku untuk prediksi. Alur pabrik menampilkan konfigurasi alat saat ini." : "Data pada halaman ini merupakan simulasi lokal."}</p>
        </Card>
        {!date ? <p className="muted">Pilih tanggal produksi untuk melihat hasil prediksi.</p>
          : API_MODE ? <ProductionDayApi key={date} date={date} role={role} />
          : <DemoProductionDay date={date} role={role} />}
      </>}
      {view === "process" && <ProcessManagement role={role} />}
      {view === "flow" && (API_MODE ? <PlantTopology /> : <Alur />)}
    </div>
  </div>;
}
