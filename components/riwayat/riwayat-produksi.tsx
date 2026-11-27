"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Card, Icon, PageHeading, PageLink, SectionTitle, SourceModal } from "@/components/ui";
import { useDemo } from "@/lib/demo";
import { useFlows } from "@/lib/flows";
import { assetsOfStep, flowsFor } from "@/lib/volume";
import { FlowLine } from "@/components/transfer/transfer";
import { Equipment } from "@/components/trace/equipment";
import { number } from "@/lib/format";
import { OUTPUTS, type Output } from "@/mock/outputs";
import { API_MODE } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";
import type { BeTraceBackward, BeTraceHistory } from "@/lib/api/trace-historis";
import { HistorisDetail } from "./historis-detail";
import { EMPTY, OutputPicker, matchOutputs, type Filters } from "./output-picker";
import { ProductionPath, kindOf } from "./production-path";
import { buildSteps, durationText } from "./timeline";
import { QualityCard } from "./quality-card";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const dateText = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

/** Riwayat Produksi: pilih output, lalu ikuti jalurnya dari asal susu sampai produk selesai (poin 8). */
/** `lot` dari ?lot=..., misalnya tautan dari QC Barang Jadi. */
export function RiwayatProduksi({ lot }: { lot?: string }) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [picked, setPicked] = useState(lot ?? "FG-1013-07");
  const [active, setActive] = useState<number | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const demo = useDemo();
  const allFlows = useFlows(demo).flows;

  // Group historis dari GET /trace/history berdampingan dengan lot skenario
  // lama di pemilih output yang sama. Entri pemilihnya hanya membawa
  // identitas group; detailnya dirender HistorisDetail dari respons BE.
  const historyRes = useResource<BeTraceHistory>(API_MODE ? "/trace/history" : null);
  const groups = historyRes.data?.groups ?? [];
  const histOutputs: Output[] = groups.map(g => ({
    id: g.group_id, product: g.product_name, line: g.at_tank_id,
    date: g.jendela_mulai.slice(0, 10), end: g.jendela_selesai.slice(11, 16).replace(":", "."),
    packs: 0, farm: "Prepared Product Release", chain: [], qc: null,
  }));
  const allOutputs = API_MODE ? histOutputs : [...OUTPUTS, ...histOutputs];

  const list = matchOutputs(allOutputs, filters);
  const output = list.find(o => o.id === picked) ?? list[0];
  const histGroup = output ? groups.find(g => g.group_id === output.id) : undefined;
  const backwardRes = useResource<BeTraceBackward>(API_MODE && histGroup ? `/trace/history/backward?groupId=${encodeURIComponent(histGroup.group_id)}` : null);
  const select = (id: string) => { setPicked(id); setActive(null); };
  const update = (f: Filters) => { setFilters(f); setActive(null); };
  const steps = output ? buildSteps(output.chain) : [];
  const step = steps[active ?? steps.length - 1];
  // Transfer dan selisih yang menyentuh alat atau batch di jalur output ini.
  const chainAssets = output ? [...new Set(output.chain.flatMap(h => [...assetsOfStep(h.from), ...assetsOfStep(h.to)]))] : [];
  const chainFlows = output ? flowsFor(allFlows, chainAssets, output.chain.map(h => h.batch)) : [];
  const stepFlows = step ? flowsFor(allFlows, [...assetsOfStep(step.from), ...assetsOfStep(step.to)], [step.batch]) : [];

  return <div className="page-enter">
    <PageHeading title="Riwayat Produksi" subtitle="Pilih hasil produksi, lalu ikuti jalurnya dari asal susu sampai produk selesai.">
      <Link className="button secondary" href="/graph">Context Graph<Icon icon={ArrowRight} size={16} /></Link>
    </PageHeading>
    <OutputPicker outputs={allOutputs} filters={filters} setFilters={update} selected={output?.id ?? ""} onSelect={select}
      onExample={() => { update({ ...EMPTY, product: "UHT Stroberi 200 ml", time: "16:00" }); setPicked("FG-1012-11"); }} />
    {historyRes.error && <p className="small crit-text" role="alert">Gagal memuat daftar group historis: {historyRes.error.message}</p>}

    {!output ? <Card className="rp-empty"><p>Tidak ada output yang cocok dengan pilihan ini.</p><button type="button" className="button secondary" onClick={() => update(EMPTY)}>Reset pilihan</button></Card> : histGroup ? <HistorisDetail group={histGroup} detail={backwardRes.data} loading={backwardRes.loading && !backwardRes.data} error={backwardRes.error} /> : <>
      <Card className="rp-summary">
        <Equipment kind="Lot" size={52} />
        <div className="rp-summary-main"><span>Output terpilih</span><h2>{output.product}</h2><span className="mono">{output.id}</span></div>
        <dl>
          <div><dt>Selesai produksi</dt><dd>{output.end ?? "Belum tercatat"}<small>{dateText(output.date)}</small></dd></div>
          <div><dt>Jumlah output</dt><dd className="rp-big">{number(output.packs)} pak<small>Lini {output.line}</small></dd></div>
          <div><dt>Asal susu</dt><dd>{output.farm}<small>{output.chain[0]?.to}</small></dd></div>
        </dl>
      </Card>

      <div className="rp-layout">
        <ProductionPath output={output} active={active ?? steps.length - 1} onPick={setActive} />
        {step && <aside className="rp-detail" aria-live="polite">
          <span className="small muted">Tahap {step.index + 1} dari {steps.length}</span>
          <header><Equipment kind={kindOf(step.step)} size={48} /><h2>{step.step}</h2></header>
          <dl className="flow-facts">
            <div><dt>Mulai - selesai</dt><dd>{step.window ? `${step.window.day} ${step.window.startText} - ${step.window.endText}` : "Belum tercatat"}</dd></div>
            <div><dt>Durasi tercatat</dt><dd>{step.window ? durationText(step.duration) : "-"}</dd></div>
            <div><dt>Asal</dt><dd>{step.from}</dd></div>
            <div><dt>Tujuan</dt><dd>{step.to}</dd></div>
            <div><dt>Batch / lot</dt><dd className="mono">{step.batch}</dd></div>
            <div><dt>Volume / jumlah</dt><dd>{step.volume}</dd></div>
            <div><dt>Dasar pencatatan</dt><dd>{step.record}</dd></div>
          </dl>
          {stepFlows.length > 0 && <p className="small">{stepFlows.length} transfer tercatat di alat tahap ini, selisih {number(stepFlows.reduce((s, f) => s + f.diff, 0))} L. <PageLink inline className="inline-link" href={`/transfer?alat=${assetsOfStep(step.to)[0] ?? ""}`}>Lihat riwayat transfer</PageLink></p>}
          {step.gap && <p className="small rp-note">Serah-terima di tahap ini tidak tercatat langsung; disambungkan dari irisan waktu dan level tangki.</p>}
          {step.source ? <button type="button" className="button secondary wide" onClick={() => setSource(step.source)}>Lihat bukti proses<Icon icon={ArrowUpRight} size={16} /></button>
            : <p className="small muted">Bukti proses belum tersedia.</p>}
        </aside>}
      </div>

      <QualityCard output={output} onSource={setSource} />
      <Card className="rules-card">
        <SectionTitle title="Transfer & selisih di jalur batch" subtitle={`Transfer yang menyentuh ${chainAssets.join(", ")} atau batch di jalur ini, dari Traceability > Transfer & Volume.`} action={<PageLink className="text-link" href="/transfer">Buka Transfer & Volume<Icon icon={ArrowRight} size={14} /></PageLink>} />
        <div className="table-wrap"><table className="schedule-table flow-table">
          <thead><tr><th>Transfer</th><th>Dari ke</th><th className="numeric">Keluar</th><th className="numeric">Diterima</th><th className="numeric">Selisih</th><th>Waktu</th><th>Sumber</th></tr></thead>
          <tbody>{chainFlows.map(f => <FlowLine key={f.id} f={f} />)}
            {!chainFlows.length && <tr><td colSpan={7} className="muted">Belum ada transfer tercatat di alat jalur ini.</td></tr>}</tbody>
        </table></div>
      </Card>
    </>}
    <SourceModal id={source} onClose={() => setSource(null)} />
  </div>;
}
