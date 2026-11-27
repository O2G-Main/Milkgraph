"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CalendarRange, ChevronRight, Container, Droplets, Factory, FlaskConical, Hourglass, PackageX, Send, ShieldAlert, TriangleAlert, Truck, Wrench, type LucideIcon } from "lucide-react";
import { applyQueue, clock, tankRoom } from "@/lib/receiving";
import { applySpecs, mergeLab } from "@/lib/lab";
import { MACHINE_STATE, attainment, downtimeMinutes, isLate, mayHandle, runState } from "@/lib/operation";
import { scenario } from "@/lib/data";
import { duration } from "@/lib/format";
import { assignedAssets, useDemo } from "@/lib/demo";
import { findNav, visibleNav } from "@/lib/nav";
import { ROLES, canOpen, canSee } from "@/lib/roles";
import { holdingLeft, instructions, violations } from "@/lib/rules";
import { checkSchedule } from "@/lib/production";
import { PROCESS_LOSS, UNIT_STATE, dataSources, demandPlan, farms, fillers, labResults, pastLog } from "@/mock/ops";
import { BOTTLENECKS } from "@/mock/site";
import type { Tone } from "@/mock/types";
import { Badge, Card, Icon, PageHeading, SectionTitle, SourceModal } from "@/components/ui";
import { MetricGrid } from "@/components/receiving/metric-grid";
import { ASSETS } from "@/lib/assets";
import { ExecKpis, MachineCard, ScheduleCard, SupplyCard, TargetCard, type ExecKpi, type StateSlice } from "./executive";
import { API_MODE } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";
import { ExecutiveDashboardApi, ExecutiveKpis } from "./executive-api";
import { BerandaApiAttention, BerandaApiHero, BerandaApiMenus } from "./beranda-api";
import { ROLE_DASHBOARD_API } from "./role-api";

type Item = { icon: LucideIcon; title: string; meta: string; tone: Tone; href: string };
const plan = scenario.plans[0];
const forward = scenario.answers.find(a => a.id === "forward")!;


/** Beranda: KPI, hal yang perlu ditangani, lalu satu baris ringkasan per menu. Setiap baris membawa ke halaman detailnya. */
export function Beranda() {
  const [source, setSource] = useState<string | null>(null);
  const demo = useDemo();
  const metaRes = useResource<{ date?: string; now?: string }>(API_MODE ? "/meta" : null);
  const dateLabel = API_MODE ? (metaRes.data?.date ?? "Hari ini") : scenario.date;
  const nowLabel = API_MODE ? (metaRes.data?.now ? `${metaRes.data.now} WIB` : "data server") : `snapshot ${scenario.now}`;
  const me = { ...(ROLES[demo.role] ?? { label: demo.role, user: "", initials: "", focus: "" }), user: demo.users.find(u => u.id === demo.account)?.name ?? ROLES[demo.role]?.user ?? "" };
  const broken = violations(plan, "before", demo.limits);
  const after = violations(plan, "after", demo.limits);
  const approved = demo.decisions.find(d => d.plan === "current" && d.status === "approved");
  const left = Math.max(0, holdingLeft(demo.limits));
  const hold = demo.holds.find(h => h.trigger === scenario.qcEvent.lot && h.status !== "ditolak");
  const labPending = labResults.filter(r => r.kind === "penerimaan" && (r.status === "hasil-siap" || r.status === "uji-ulang") && !demo.labs[r.id]).length;
  const broke = fillers.filter(f => f.state === "breakdown");
  const bottlenecks = BOTTLENECKS[approved ? "after" : "before"];
  const arrived = farms.reduce((s, f) => s + f.arrived, 0);
  const plannedRt = farms.reduce((s, f) => s + f.plannedRt, 0);
  const connected = dataSources.filter(d => d.status === "terhubung").length;
  const bay = scenario.metrics[3];
  const lab = scenario.metrics[2];

  const isPlanner = demo.role === "planner";
  // Angka khusus Planner: jadwal, kecukupan susu, dan lini yang memotong kapasitas.
  const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);
  const checks = checkSchedule(demo.schedule, Object.fromEntries(fillers.map(f => [f.id, f.target])), demo.rules);
  const badOrders = demo.schedule.filter(i => checks[i.id].issues.some(x => x.tone !== "neutral"));
  const targetPacks = demo.schedule.reduce((sum, i) => sum + i.packs, 0);
  const milkNeed = Math.round(demandPlan.reduce((sum, d) => sum + d.packs * d.litresPerPack * d.milk, 0) / (1 - PROCESS_LOSS));
  const milkPlanned = farms.reduce((sum, f) => sum + f.plannedL, 0);
  const cover = Math.round(milkPlanned / milkNeed * 100);
  const demandSent = demo.log.some(e => e.title === "Kebutuhan susu dikirim ke farm");
  const running = fillers.filter(f => f.state === "jalan").length;
  const stopped = fillers.filter(f => f.state === "cip" || f.state === "ganti-format");

  const watch = ASSETS.filter(a => a.tone === "crit" || a.tone === "warn").length;
  const summary: Record<string, { text: string; tone: Tone }> = {
    "Simulasi 3D": { text: `${bottlenecks.length} titik bottleneck di tata letak plant`, tone: bottlenecks.some(b => b.tone === "crit") ? "crit" : "neutral" },
    Penerimaan: { text: `${scenario.tankers.length} RT di plant, ${labPending} hasil lab menunggu QA, tiba ${arrived} dari ${plannedRt} RT`, tone: labPending ? "warn" : "neutral" },
    Operasional: { text: `${watch} alat perlu diperhatikan${broke.length ? `, ${broke.map(f => f.id).join(", ")} breakdown` : ""}`, tone: broke.length ? "crit" : watch ? "warn" : "neutral" },
    Rencana: isPlanner
      ? { text: `${badOrders.length} order jadwal perlu dicek, ${broken} constraint dilanggar di rencana awal`, tone: broken || badOrders.length ? "crit" : "neutral" }
      : { text: `${broken} constraint dilanggar, ${after} dengan rekomendasi solver`, tone: broken ? "crit" : "neutral" },
    Traceability: { text: `${scenario.qcEvent.lot} out-of-spec, ${forward.lots!.length} lot terdampak, ${hold ? hold.id : "hold belum diajukan"}`, tone: hold ? "warn" : "crit" },
    Pengaturan: { text: `${connected} dari ${dataSources.length} sumber data terhubung`, tone: connected < dataSources.length ? "warn" : "neutral" },
  };

  const plannerKpis: { icon: LucideIcon; label: string; value: string; unit: string; note: string; tone: Tone; href: string }[] = [
    { icon: TriangleAlert, label: "Kelayakan rencana", value: approved ? "Disetujui" : String(broken), unit: approved ? "" : "constraint dilanggar", note: approved ? `Oleh ${approved.by}, ${approved.at}` : `${after} dengan rekomendasi solver`, tone: approved ? "ok" : broken ? "crit" : "ok", href: "/rencana" },
    { icon: CalendarRange, label: "Jadwal shift", value: String(badOrders.length), unit: `dari ${demo.schedule.length} order perlu dicek`, note: `Target ${fmt(targetPacks)} pak`, tone: badOrders.length ? "warn" : "ok", href: "/penjadwalan" },
    { icon: Droplets, label: "Kecukupan susu segar", value: `${cover}%`, unit: "dari kebutuhan", note: `Rencana kirim farm ${fmt(milkPlanned)} L, butuh ${fmt(milkNeed)} L`, tone: cover < 100 ? "crit" : cover < 105 ? "warn" : "ok", href: "/pasokan" },
    { icon: Factory, label: "Lini filling jalan", value: `${running}/${fillers.length}`, unit: "lini", note: `${broke.length} breakdown, ${stopped.length} CIP atau ganti format`, tone: broke.length ? "crit" : stopped.length ? "warn" : "ok", href: "/kondisi-alat" },
  ];
  // Urutan urgensi PPIC: rencana yang tidak layak, bahan baku yang bisa terbuang, jadwal bermasalah, kapasitas yang hilang, pasokan, lalu dampak kualitas ke stok.
  const proposalsWaiting = demo.proposals.filter(p => p.status === "diajukan");
  const plannerAttention: Item[] = [
    ...(!approved ? [{ icon: TriangleAlert, title: `Rencana shift tidak layak, ${broken} constraint dilanggar`, meta: "Bandingkan rekomendasi solver, lalu setujui atau tolak", tone: "crit" as Tone, href: "/rencana" }] : []),
    ...proposalsWaiting.map(p => ({ icon: Send, title: `Usulan simulasi dari ${p.by.split(" ")[0]}`, meta: `${p.title}: ${p.detail}`, tone: "warn" as Tone, href: "/rencana" })),
    ...(!approved ? [{ icon: Hourglass, title: "RT-26 mendekati batas holding time", meta: `Sisa ${duration(left)}. Susu berisiko dibuang kalau urutan bongkar tidak berubah`, tone: "crit" as Tone, href: "/receiving" }] : []),
    ...badOrders.slice(0, 3).map(i => ({ icon: CalendarRange, title: `Jadwal ${i.line} ${i.sku} perlu dicek`, meta: checks[i.id].issues.filter(x => x.tone !== "neutral").map(x => x.text).join(" "), tone: (checks[i.id].issues.some(x => x.tone === "crit") ? "crit" : "warn") as Tone, href: "/penjadwalan" })),
    ...broke.map(f => ({ icon: Wrench, title: `${f.id} breakdown, kapasitas ${f.product} turun`, meta: f.note, tone: "crit" as Tone, href: "/kondisi-alat" })),
    ...(stopped.length ? [{ icon: Factory, title: `${stopped.map(f => f.id).join(", ")} belum jalan`, meta: stopped.map(f => f.note).filter((n, i, a) => a.indexOf(n) === i).join(" "), tone: "warn" as Tone, href: "/kondisi-alat" }] : []),
    ...(!demandSent ? [{ icon: Send, title: "Kebutuhan susu belum dikirim ke farm", meta: `Butuh ${fmt(milkNeed)} L untuk ${demandPlan.length} SKU`, tone: "warn" as Tone, href: "/pasokan" }] : []),
    { icon: ShieldAlert, title: `${scenario.qcEvent.lot} out-of-spec`, meta: `${forward.lots!.length} lot terdampak${hold ? `, ${hold.id} ${hold.status}` : ""}. Cek dampaknya ke stok barang jadi`, tone: "neutral", href: "/trace" },
  ];
  const attention: Item[] = [
    ...(!approved ? [{ icon: Hourglass, title: "RT-26 mendekati batas holding time", meta: `Sisa ${duration(left)}, masih menunggu bay`, tone: "crit" as Tone, href: "/receiving" }] : []),
    hold ? { icon: PackageX, title: `${hold.id} ${hold.status === "diajukan" ? "menunggu keputusan QA" : hold.status === "aktif" ? "hold aktif" : "hold dilepas"}`, meta: `${hold.lots.length} lot dari ${scenario.qcEvent.lot}`, tone: hold.status === "diajukan" ? "warn" : "neutral", href: "/hold" }
      : { icon: FlaskConical, title: `${scenario.qcEvent.lot} QC out-of-spec`, meta: `${scenario.qcEvent.test}, perlu ditelusuri`, tone: "crit", href: "/trace" },
    ...broke.map(f => ({ icon: Wrench, title: `${f.id} breakdown`, meta: f.note, tone: "crit" as Tone, href: "/filling" })),
    ...(labPending ? [{ icon: FlaskConical, title: `${labPending} hasil lab menunggu rilis QA`, meta: "RT baru bisa antre bongkar setelah dirilis lab", tone: "warn" as Tone, href: "/lab" }] : []),
    { icon: Container, title: "Bay 2 sedang CIP", meta: bay.delta, tone: "warn", href: "/tangki" },
  ];

  // Koordinator receiving: urutan urgensi = susu yang bisa terbuang (holding time), bay dan tangki yang menahan bongkar, lalu RT berikutnya.
  const isReceiving = demo.role === "receiving";
  const queue = applyQueue(scenario.tankers, demo.receiving, demo.limits.holdingMin);
  const inPlant = queue.filter(r => r.stage !== "Selesai bongkar");
  const urgent = [...inPlant].sort((a, b) => b.ageMin - a.ageMin);
  const worst = urgent[0];
  const occupied = new Set(queue.flatMap(r => r.stage === "Unloading" ? [r.bay ?? scenario.assets.find(a => a.kind === "Bay" && a.status.includes(r.id))?.id] : []));
  const bays = scenario.assets.filter(a => a.kind === "Bay");
  const freeBays = bays.filter(b => !occupied.has(b.id) && b.status !== "CIP");
  const tanks = scenario.assets.filter(a => a.kind === "Buffer").map(a => ({ id: a.id, fill: a.fill, capacity: a.capacity }));
  const room = tankRoom(tanks, demo.receiving.transfers);
  const freeL = tanks.reduce((s, t) => s + Math.max(0, room[t.id].free), 0);
  const fullest = tanks.reduce((a, b) => (room[b.id].fill / b.capacity > room[a.id].fill / a.capacity ? b : a));
  const fullPct = Math.round(room[fullest.id].fill / fullest.capacity * 100);
  const coming = demo.receiving.arrivals.filter(a => a.status === "perjalanan").sort((a, b) => a.eta.localeCompare(b.eta));
  const moved = new Set(demo.receiving.transfers.map(t => t.rt));
  const unmoved = queue.filter(r => r.stage === "Selesai bongkar" && !moved.has(r.id));
  const bayAcks = approved ? instructions(plan).filter(i => i.role === "receiving" && !demo.acks.includes(i.id)) : [];
  const receivingKpis: typeof plannerKpis = [
    { icon: Truck, label: "RT di plant", value: String(inPlant.length), unit: "RT", note: `${inPlant.filter(r => r.stage === "Sampling" || r.stage === "Lab test").length} menunggu lab, ${inPlant.filter(r => r.stage === "Released").length} siap bongkar`, tone: "neutral", href: "/receiving" },
    { icon: Hourglass, label: "Holding paling mendesak", value: worst ? duration(Math.max(0, demo.limits.holdingMin - worst.ageMin)) : "-", unit: "", note: worst ? `${worst.id}, umur susu ${worst.age}` : "Tidak ada RT di plant", tone: worst?.tone ?? "ok", href: "/receiving" },
    { icon: Container, label: "Bay siap", value: `${freeBays.length}/${bays.length}`, unit: "bay", note: bays.filter(b => b.status === "CIP").map(b => `${b.id} CIP, ${b.info.toLowerCase()}`).join(". ") || "Tidak ada bay CIP", tone: freeBays.length ? "ok" : "warn", href: "/tangki" },
    { icon: Droplets, label: "Ruang tangki penerimaan", value: `${fmt(freeL)}`, unit: "L", note: `${fullest.id} ${fullPct}% penuh`, tone: fullPct >= 95 ? "crit" : fullPct >= 85 ? "warn" : "ok", href: "/transfer" },
  ];
  const receivingAttention: Item[] = [
    ...urgent.filter(r => r.tone !== "ok").slice(0, 2).map(r => ({ icon: Hourglass, title: `${r.id} sisa holding ${duration(Math.max(0, demo.limits.holdingMin - r.ageMin))}`, meta: `${r.stage}${r.stage === "Released" ? `, sudah dirilis lab dan menunggu bay ${r.wait} menit` : ""}. Umur susu ${r.age}`, tone: r.tone as Tone, href: "/receiving" })),
    ...bayAcks.map(i => ({ icon: Container, title: "Instruksi bay dari rencana belum dikonfirmasi", meta: i.text, tone: "warn" as Tone, href: "/tangki" })),
    ...bays.filter(b => b.status === "CIP").map(b => ({ icon: Container, title: `${b.id} sedang CIP`, meta: `${b.info}. Bongkar berikutnya pakai bay lain`, tone: "warn" as Tone, href: "/tangki" })),
    ...(fullPct >= 85 ? [{ icon: Droplets, title: `${fullest.id} ${fullPct}% penuh`, meta: `Arahkan transfer berikutnya ke tangki lain. Sisa total ${fmt(freeL)} L`, tone: (fullPct >= 95 ? "crit" : "warn") as Tone, href: "/transfer" }] : []),
    ...unmoved.map(r => ({ icon: Droplets, title: `${r.id} selesai bongkar, transfer belum dicatat`, meta: `${fmt(r.volume)} L perlu dicatat ke tangki penerimaan`, tone: "warn" as Tone, href: "/transfer" })),
    ...inPlant.filter(r => r.stage === "Lab test" && r.wait >= 60).map(r => ({ icon: FlaskConical, title: `${r.id} menunggu lab ${r.wait} menit`, meta: "Belum bisa dibongkar sebelum dirilis QA", tone: "neutral" as Tone, href: "/lab" })),
    ...coming.slice(0, 2).map(a => ({ icon: Truck, title: `${a.id} tiba pukul ${clock(a.eta)}`, meta: `${a.farm}, ${fmt(a.volume)} L. Siapkan sampling`, tone: "neutral" as Tone, href: "/kedatangan" })),
  ];
  // Lab: urutan urgensi = hasil out-of-spec yang harus diteruskan ke QA, RT yang umur susunya paling tua, RT yang belum disampel, lalu batch proses yang tertahan.
  const isLab = demo.role === "lab";
  const samples = mergeLab(labResults, demo.lab).filter(s => s.kind !== "qc-fg" && !demo.labs[s.id]);
  const rtLab = queue.filter(r => r.stage === "Sampling" || r.stage === "Lab test").sort((a, b) => b.ageMin - a.ageMin);
  const sampleOf = (rt: string) => samples.find(s => s.subject === rt);
  const rtPending = rtLab.filter(r => { const s = sampleOf(r.id); return !s || s.status === "dalam-uji" || s.status === "uji-ulang"; });
  const batchPending = samples.filter(s => s.kind === "batch" && (s.status === "dalam-uji" || s.status === "uji-ulang"));
  const outOfSpec = samples.filter(s => s.status === "positif" && s.kind !== "qc-fg");
  const readyForQa = samples.filter(s => s.status === "hasil-siap");
  const oldest = rtLab[0];
  const labKpis: typeof plannerKpis = [
    { icon: FlaskConical, label: "Perlu diperiksa", value: String(rtPending.length + batchPending.length), unit: "sampel", note: `${rtPending.length} RT, ${batchPending.length} batch tangki`, tone: rtPending.length + batchPending.length ? "warn" : "ok", href: "/lab" },
    { icon: Hourglass, label: "RT tertua di lab", value: oldest ? duration(Math.max(0, demo.limits.holdingMin - oldest.ageMin)) : "-", unit: oldest ? "sisa holding" : "", note: oldest ? `${oldest.id}, umur susu ${oldest.age}` : "Tidak ada RT di lab", tone: oldest?.tone ?? "ok", href: "/receiving" },
    { icon: ShieldAlert, label: "Out-of-spec", value: String(outOfSpec.length), unit: "sampel", note: outOfSpec.length ? "Teruskan ke QA untuk diputuskan" : "Belum ada hasil di luar batas", tone: outOfSpec.length ? "crit" : "ok", href: "/lab" },
    { icon: Container, label: "Menunggu keputusan QA", value: String(readyForQa.length), unit: "sampel", note: `Rata-rata tunggu lab ${lab.value} ${lab.unit}`, tone: "neutral", href: "/lab" },
  ];
  const labAttention: Item[] = [
    ...outOfSpec.map(s => ({ icon: ShieldAlert, title: `${s.subject} out-of-spec`, meta: `${s.params.filter(p => p.ok === false).map(p => `${p.name} ${p.value}`).join(", ")}. Teruskan ke QA`, tone: "crit" as Tone, href: `/lab?sampel=${s.id}` })),
    ...rtPending.map(r => {
      const s = sampleOf(r.id);
      return { icon: Truck, title: s ? `${r.id} ${s.status === "uji-ulang" ? "perlu uji ulang" : "dalam uji"}` : `${r.id} belum disampel`, meta: `Sisa holding ${duration(Math.max(0, demo.limits.holdingMin - r.ageMin))}${s ? `, ${s.params.filter(p => p.ok !== null).length} dari ${s.params.length} parameter selesai` : ". Buat sampel di Tes Lab"}`, tone: r.tone as Tone, href: s ? `/lab?sampel=${s.id}` : "/lab" };
    }),
    ...batchPending.map(s => ({ icon: FlaskConical, title: `Batch ${s.subject} menunggu uji`, meta: `${s.detail}. ${s.params.filter(p => p.ok === null).map(p => p.name).join(", ")} belum selesai`, tone: "warn" as Tone, href: `/lab?sampel=${s.id}` })),
    ...readyForQa.slice(0, 2).map(s => ({ icon: Container, title: `${s.subject} hasil lengkap`, meta: "Semua parameter dalam batas, menunggu keputusan QA", tone: "neutral" as Tone, href: `/lab?sampel=${s.id}` })),
  ];
  // Operator produksi: urutan urgensi = mesin yang berhenti, alat ditugaskan yang bermasalah, order terlambat mulai, instruksi filling, lalu order berikutnya.
  const isOperator = demo.role === "operator";
  const assigned = assignedAssets(demo);
  const myAssets = ASSETS.filter(a => mayHandle(assigned, a.id)).map(a => { const u = demo.operation.machines[a.id]; return u ? { ...a, status: MACHINE_STATE[u.state].label, tone: MACHINE_STATE[u.state].tone as Tone } : a; });
  const myOrders = demo.schedule.filter(i => mayHandle(assigned, i.line)).sort((a, b) => a.start.localeCompare(b.start));
  const runs = demo.operation.runs;
  const myDone = myOrders.filter(i => runState(runs[i.id]) === "selesai");
  const myRunning = myOrders.filter(i => runState(runs[i.id]) === "jalan");
  const late = myOrders.filter(i => isLate(i.start, runs[i.id]));
  const myDown = demo.operation.downtime.filter(d => mayHandle(assigned, d.asset));
  const openDown = myDown.filter(d => !d.end);
  const troubled = myAssets.filter(a => a.tone === "crit" || a.tone === "warn");
  const fillAcks = approved ? instructions(plan).filter(i => i.role === "supervisor" && !demo.acks.includes(i.id)) : [];
  const operatorKpis: typeof plannerKpis = [
    { icon: Factory, label: "Order lini saya", value: `${myRunning.length}/${myOrders.length}`, unit: "jalan", note: `${myDone.length} selesai, ${myOrders.length - myDone.length - myRunning.length} belum mulai`, tone: late.length ? "warn" : "ok", href: "/penjadwalan" },
    { icon: CalendarRange, label: "Hasil baik order selesai", value: myDone.length ? `${attainment(myDone.reduce((s, i) => s + (runs[i.id]?.output ?? 0), 0), myDone.reduce((s, i) => s + i.packs, 0))}%` : "-", unit: myDone.length ? "dari target" : "", note: myDone.length ? `${myDone.length} order selesai` : "Belum ada order yang selesai", tone: "neutral", href: "/penjadwalan" },
    { icon: Wrench, label: "Alat bermasalah", value: String(troubled.length), unit: `dari ${myAssets.length} alat`, note: troubled.map(a => `${a.id} ${a.status.toLowerCase()}`).join(", ") || "Semua alat yang ditugaskan normal", tone: troubled.some(a => a.tone === "crit") ? "crit" : troubled.length ? "warn" : "ok", href: "/kondisi-alat" },
    { icon: TriangleAlert, label: "Downtime alat saya", value: `${myDown.reduce((s, d) => s + downtimeMinutes(d), 0)}`, unit: "menit", note: openDown.length ? `${openDown.length} masih berlangsung` : "Tidak ada yang berlangsung", tone: openDown.length ? "crit" : "ok", href: "/kondisi-alat" },
  ];
  const operatorAttention: Item[] = [
    ...openDown.map(d => ({ icon: Wrench, title: `${d.asset} berhenti: ${d.cause.toLowerCase()}`, meta: `Sejak pukul ${clock(d.start)}, ${downtimeMinutes(d)} menit. ${d.note}`, tone: "crit" as Tone, href: "/kondisi-alat" })),
    ...troubled.filter(a => !openDown.some(d => d.asset === a.id)).map(a => ({ icon: Container, title: `${a.id} ${a.status.toLowerCase()}`, meta: a.note, tone: a.tone, href: "/kondisi-alat" })),
    ...late.map(i => ({ icon: CalendarRange, title: `${i.line} belum dicatat mulai`, meta: `${i.sku}, jadwal mulai pukul ${clock(i.start)}`, tone: "warn" as Tone, href: "/penjadwalan" })),
    ...fillAcks.map(i => ({ icon: Factory, title: "Instruksi filling belum dikonfirmasi", meta: i.text, tone: "warn" as Tone, href: "/filling" })),
    ...myOrders.filter(i => runState(runs[i.id]) === "belum" && !isLate(i.start, runs[i.id])).slice(0, 2).map(i => ({ icon: CalendarRange, title: `${i.line} mulai pukul ${clock(i.start)}`, meta: `${i.sku}, target ${fmt(i.packs)} pak`, tone: "neutral" as Tone, href: "/penjadwalan" })),
  ];
  // QA/QC: urutan urgensi = RT out-of-spec yang harus ditolak, RT siap rilis (umur susu tertua dulu), lot barang jadi gagal tanpa hold, hold yang menunggu persetujuan, lalu selisih bahan.
  const isQa = demo.role === "qa";
  const qaSamples = applySpecs(mergeLab(labResults, demo.lab), demo.quality).filter(s => !demo.labs[s.id]);
  const ageOf = (rt: string) => queue.find(r => r.id === rt);
  const rtReject = qaSamples.filter(s => s.kind === "penerimaan" && s.status === "positif");
  const rtReady = qaSamples.filter(s => s.kind === "penerimaan" && s.status === "hasil-siap").sort((a, b) => (ageOf(b.subject)?.ageMin ?? 0) - (ageOf(a.subject)?.ageMin ?? 0));
  const batchReady = qaSamples.filter(s => s.kind === "batch" && s.status === "hasil-siap");
  const fgFail = qaSamples.filter(s => s.kind === "qc-fg" && s.status === "positif");
  const heldLots = new Set(demo.holds.filter(h => h.status !== "ditolak").map(h => h.trigger));
  const holdsWaiting = demo.holds.filter(h => h.status === "diajukan");
  const holdsActive = demo.holds.filter(h => h.status === "aktif");
  const gaps = demo.receiving.transfers.filter(t => !t.counted).flatMap(t => { const rt = queue.find(r => r.id === t.rt); return rt && Math.abs(t.volume - rt.volume) / rt.volume > 0.005 ? [{ t, diff: t.volume - rt.volume }] : []; });
  const qaKpis: typeof plannerKpis = [
    { icon: FlaskConical, label: "Menunggu keputusan rilis", value: String(rtReady.length + rtReject.length), unit: "RT", note: `${rtReady.length} siap rilis, ${rtReject.length} out-of-spec`, tone: rtReject.length ? "crit" : rtReady.length ? "warn" : "ok", href: "/lab" },
    { icon: ShieldAlert, label: "Lot barang jadi gagal QC", value: String(fgFail.length), unit: "lot", note: fgFail.map(s => s.subject).join(", ") || "Semua lot yang diuji lulus", tone: fgFail.length ? "crit" : "ok", href: "/qc-produk" },
    { icon: PackageX, label: "Hold produk", value: String(holdsActive.length), unit: "aktif", note: holdsWaiting.length ? `${holdsWaiting.length} pengajuan menunggu persetujuan` : "Tidak ada pengajuan baru", tone: holdsWaiting.length ? "warn" : "neutral", href: "/hold" },
    { icon: Droplets, label: "Selisih bahan", value: String(gaps.length), unit: "transfer", note: gaps.length ? "Di luar toleransi timbangan 0,5%" : "Semua transfer dalam toleransi", tone: gaps.length ? "warn" : "ok", href: "/transfer" },
  ];
  const qaAttention: Item[] = [
    ...rtReject.map(s => ({ icon: ShieldAlert, title: `${s.subject} out-of-spec, putuskan penolakan`, meta: `${s.params.filter(p => p.ok === false).map(p => `${p.name} ${p.value}`).join(", ")}`, tone: "crit" as Tone, href: `/lab?sampel=${s.id}` })),
    ...rtReady.map(s => { const r = ageOf(s.subject); return { icon: FlaskConical, title: `${s.subject} siap dirilis`, meta: r ? `Semua parameter dalam batas. Sisa holding ${duration(Math.max(0, demo.limits.holdingMin - r.ageMin))}` : "Semua parameter dalam batas", tone: (r?.tone ?? "warn") as Tone, href: `/lab?sampel=${s.id}` }; }),
    ...fgFail.filter(s => !heldLots.has(s.subject)).map(s => ({ icon: PackageX, title: `${s.subject} gagal QC, belum di-hold`, meta: `${s.detail}. Telusuri asalnya lalu ajukan hold`, tone: "crit" as Tone, href: "/trace" })),
    ...holdsWaiting.map(h => ({ icon: PackageX, title: `${h.id} menunggu persetujuan hold`, meta: `${h.lots.length} lot dari ${h.trigger}, diajukan ${h.by}`, tone: "warn" as Tone, href: "/hold" })),
    ...batchReady.map(s => ({ icon: Container, title: `Batch ${s.subject} siap dirilis`, meta: `${s.detail}. Semua parameter dalam batas`, tone: "neutral" as Tone, href: `/lab?sampel=${s.id}` })),
    ...gaps.map(g => ({ icon: Droplets, title: `Selisih ${fmt(g.diff)} L pada ${g.t.rt}`, meta: `Transfer ke ${g.t.tank} dibanding timbangan RT`, tone: "warn" as Tone, href: "/transfer" })),
  ];
  // Supervisor/Manager: Executive Dashboard = pasokan, penggunaan mesin, jadwal, dan pencapaian target per lini.
  const isManager = demo.role === "manager";
  const lineState = (id: string) => {
    const f = fillers.find(x => x.id === id);
    const open = demo.operation.downtime.find(d => d.asset === id && !d.end);
    const u = demo.operation.machines[id];
    return { f, running: !open && (u ? u.state === "jalan" : f?.state === "jalan"), label: open ? open.cause : u ? MACHINE_STATE[u.state].label : f ? UNIT_STATE[f.state].label : "-" };
  };
  const lines = [...new Set(demo.schedule.map(i => i.line))].sort((a, b) => a.localeCompare(b, "id", { numeric: true })).map(line => {
    const orders = demo.schedule.filter(i => i.line === line).sort((a, b) => a.start.localeCompare(b.start));
    const done = orders.filter(i => runState(runs[i.id]) === "selesai");
    const current = orders.find(i => runState(runs[i.id]) === "jalan") ?? orders.find(i => runState(runs[i.id]) === "belum");
    const st = lineState(line);
    const pace = st.f && st.running ? Math.round(st.f.speed / st.f.target * 100) : null;
    return { line, orders, done, current, st, pace, target: orders.reduce((s, i) => s + i.packs, 0), output: done.reduce((s, i) => s + (runs[i.id]?.output ?? 0), 0) };
  });
  const runningLines = fillers.filter(f => lineState(f.id).running);
  const pacing = lines.filter(l => l.pace !== null);
  const avgPace = pacing.length ? Math.round(pacing.reduce((s, l) => s + l.st.f!.speed, 0) / pacing.reduce((s, l) => s + l.st.f!.target, 0) * 100) : 0;
  const behind = pacing.filter(l => l.pace! < 90);
  const downAll = demo.operation.downtime.reduce((s, d) => s + downtimeMinutes(d), 0);
  const lateAll = demo.schedule.filter(i => isLate(i.start, runs[i.id]));
  const managerKpis: typeof plannerKpis = [
    { icon: Droplets, label: "Pasokan susu", value: `${cover}%`, unit: "dari kebutuhan", note: `${queue.filter(r => r.stage !== "Selesai bongkar").length} RT di plant, ${demo.receiving.arrivals.filter(a => a.status === "perjalanan").length} dalam perjalanan`, tone: cover < 100 ? "crit" : cover < 105 ? "warn" : "ok", href: "/pasokan" },
    { icon: Factory, label: "Penggunaan mesin", value: `${runningLines.length}/${fillers.length}`, unit: "lini jalan", note: `Downtime ${downAll} menit, ${demo.operation.downtime.filter(d => !d.end).length} masih berlangsung`, tone: runningLines.length < fillers.length / 2 ? "crit" : "warn", href: "/kondisi-alat" },
    { icon: CalendarRange, label: "Jadwal", value: approved ? "Disetujui" : String(broken), unit: approved ? "" : "constraint dilanggar", note: `${demo.schedule.length} order, ${lateAll.length} terlambat mulai`, tone: approved ? "ok" : broken ? "crit" : "ok", href: "/rencana" },
    { icon: TriangleAlert, label: "Pencapaian target", value: `${avgPace}%`, unit: "laju terhadap target", note: behind.length ? `${behind.map(l => l.line).join(", ")} di bawah 90%` : "Semua lini jalan sesuai laju", tone: avgPace < 85 ? "crit" : avgPace < 95 ? "warn" : "ok", href: "/penjadwalan" },
  ];
  // Infografis Executive Dashboard (masukan dosen): angka besar dan grafik, kalimat seperlunya.
  const lineKey = (id: string) => {
    const open = demo.operation.downtime.find(d => d.asset === id && !d.end);
    if (open) return ({ Breakdown: "breakdown", CIP: "cip", "Ganti format": "ganti-format", Maintenance: "maintenance" } as Record<string, string>)[open.cause] ?? "siaga";
    return demo.operation.machines[id]?.state ?? fillers.find(f => f.id === id)?.state ?? "siaga";
  };
  // Empat kelompok supaya warnanya tetap bisa dibedakan (palet divalidasi); rinciannya ada di tooltip.
  const STATE_GROUPS = [
    { key: "jalan", label: "Jalan", color: "var(--color-primary)", of: ["jalan"] },
    { key: "berhenti", label: "CIP, ganti format, maintenance", color: "#B7791F", of: ["cip", "ganti-format", "maintenance"] },
    { key: "siaga", label: "Siaga", color: "#CBD3CD", of: ["siaga"] },
    { key: "breakdown", label: "Breakdown", color: "var(--color-status-crit)", of: ["breakdown"] },
  ];
  const states: StateSlice[] = STATE_GROUPS.map(g => {
    const ids = fillers.filter(f => g.of.includes(lineKey(f.id))).map(f => `${f.id} ${MACHINE_STATE[lineKey(f.id) as keyof typeof MACHINE_STATE]?.label.toLowerCase() ?? ""}`.trim());
    return { key: g.key, label: g.label, count: ids.length, color: g.color, lines: ids };
  });
  const downByCause = Object.entries(demo.operation.downtime.reduce<Record<string, number>>((m, d) => ({ ...m, [d.cause]: (m[d.cause] ?? 0) + downtimeMinutes(d) }), {})).map(([cause, minutes]) => ({ cause, minutes })).sort((a, b) => b.minutes - a.minutes);
  const paceRows = [...fillers].sort((a, b) => a.id.localeCompare(b.id, "id", { numeric: true })).map(f => { const st = lineState(f.id); return { line: f.id, pace: Math.round(f.speed / f.target * 100), running: st.running && f.speed > 0, state: st.label, product: f.product }; });
  const orderState = demo.schedule.map(i => isLate(i.start, runs[i.id]) ? "terlambat" : runState(runs[i.id]));
  const orderSegs = [
    { key: "selesai", label: "Selesai", color: "var(--color-primary)" },
    { key: "jalan", label: "Berjalan", color: "#6FBF8B" },
    { key: "belum", label: "Belum mulai", color: "var(--color-neutral-fill)" },
    { key: "terlambat", label: "Terlambat mulai", color: "var(--color-status-warn)" },
  ].map(s => ({ ...s, count: orderState.filter(o => o === s.key).length }));
  const execKpis: ExecKpi[] = [
    { icon: Droplets, label: "Pasokan susu", value: cover, suffix: "%", of: "dari kebutuhan", progress: cover, note: `${fmt(milkPlanned)} dari ${fmt(milkNeed)} L`, tone: cover < 100 ? "crit" : cover < 105 ? "warn" : "ok", href: "/pasokan" },
    { icon: Factory, label: "Lini jalan", value: runningLines.length, of: `dari ${fillers.length}`, progress: runningLines.length / fillers.length * 100, note: `Downtime ${downAll} menit`, tone: runningLines.length < fillers.length / 2 ? "crit" : "warn", href: "/kondisi-alat" },
    { icon: CalendarRange, label: "Order selesai", value: orderSegs[0].count, of: `dari ${demo.schedule.length}`, progress: demo.schedule.length ? orderSegs[0].count / demo.schedule.length * 100 : 0, note: approved ? "Rencana disetujui" : `${broken} constraint dilanggar`, tone: approved ? "ok" : broken ? "crit" : "ok", href: "/rencana" },
    { icon: TriangleAlert, label: "Laju terhadap target", value: avgPace, suffix: "%", progress: avgPace, note: behind.length ? `${behind.length} lini di bawah 90%` : "Semua lini sesuai laju", tone: avgPace < 85 ? "crit" : avgPace < 95 ? "warn" : "ok", href: "/penjadwalan" },
  ];
  const managerAttention: Item[] = [
    ...(!approved ? [{ icon: TriangleAlert, title: `Rencana shift tidak layak, ${broken} constraint dilanggar`, meta: "Bandingkan alternatif di Rencana sebelum Planner memutuskan", tone: "crit" as Tone, href: "/rencana" }] : []),
    ...attention,
    ...behind.map(l => ({ icon: Factory, title: `${l.line} jalan ${l.pace}% dari laju target`, meta: `${l.current?.sku ?? l.st.f?.product}. ${l.st.f?.note ?? ""}`, tone: "warn" as Tone, href: "/kondisi-alat" })),
    ...demo.proposals.filter(p => p.by === me.user).slice(0, 3).map(p => ({ icon: Send, title: `Usulan ${p.id} ${p.status === "diajukan" ? "menunggu Planner" : p.status}`, meta: `${p.title}: ${p.detail}${p.review?.note ? `. ${p.review.note}` : ""}`, tone: (p.status === "ditolak" ? "warn" : p.status === "diterapkan" ? "ok" : "neutral") as Tone, href: "/rencana" })),
    ...(cover < 105 ? [{ icon: Droplets, title: `Pasokan susu ${cover}% dari kebutuhan`, meta: `Rencana kirim farm ${fmt(milkPlanned)} L, butuh ${fmt(milkNeed)} L`, tone: (cover < 100 ? "crit" : "warn") as Tone, href: "/pasokan" }] : []),
  ];
  // Hanya hal yang halamannya terbuka untuk peran ini (penting untuk role buatan Superadmin).
  const shown = (isPlanner ? plannerAttention : isReceiving ? receivingAttention : isLab ? labAttention : isOperator ? operatorAttention : isQa ? qaAttention : isManager ? managerAttention : attention).filter(a => canOpen(demo.role, a.href.split("?")[0], findNav(a.href.split("?")[0]).tab.href));
  const attentionTitle = isPlanner ? "Perlu keputusan Planner" : isReceiving ? "Perlu ditangani receiving" : isLab ? "Perlu diperiksa lab" : isOperator ? "Perlu ditangani di lini" : isQa ? "Perlu keputusan QA" : isManager ? "Perlu perhatian manajemen" : "Perlu perhatian";
  const attentionSubtitle = isPlanner || isReceiving || isLab || isOperator || isQa || isManager ? "Diurutkan dari yang paling mendesak." : undefined;
  const activity = (API_MODE ? demo.log : [...demo.log, ...pastLog]).slice(0, 3);
  const kpis = isPlanner ? plannerKpis : isReceiving ? receivingKpis : isLab ? labKpis : isOperator ? operatorKpis : isQa ? qaKpis : isManager ? managerKpis : null;
  const seePlan = canSee(demo.role, "/rencana");
  const heroHref = seePlan ? "/rencana" : isLab || isQa ? "/lab" : isOperator ? "/penjadwalan" : "/receiving";

  // Mode API: tiap role punya infografis sendiri dari endpoint urusannya (role buatan Superadmin memakai versi umum).
  const RoleDashboard = ROLE_DASHBOARD_API[demo.role];

  return <div className="page-enter">
    <PageHeading title={isManager ? "Executive Dashboard" : "Beranda"} subtitle={isManager
      ? `Halo, ${me.user.split(" ")[0]}. Ringkasan pasokan, penggunaan mesin, jadwal, dan pencapaian target Shift Siang, ${dateLabel}, ${nowLabel}.`
      : isPlanner
      ? `Halo, ${me.user.split(" ")[0]}. Kelayakan rencana, jadwal, dan pasokan Shift Siang, ${dateLabel}, ${nowLabel}.`
      : isReceiving ? `Halo, ${me.user.split(" ")[0]}. RT di plant, bay, tangki, dan kedatangan berikutnya Shift Siang, ${dateLabel}, ${nowLabel}.`
      : isLab ? `Halo, ${me.user.split(" ")[0]}. Sampel RT dan batch yang perlu diperiksa Shift Siang, ${dateLabel}, ${nowLabel}.`
      : isQa ? `Halo, ${me.user.split(" ")[0]}. Keputusan rilis susu, mutu barang jadi, hold, dan selisih bahan Shift Siang, ${dateLabel}, ${nowLabel}.`
      : isOperator ? `Halo, ${me.user.split(" ")[0]}. Order, mesin, dan downtime di lini ${(assigned ?? []).filter(a => a.startsWith("F")).join(", ")} Shift Siang, ${dateLabel}, ${nowLabel}.`
      : `Halo, ${me.user.split(" ")[0]}. Ringkasan Shift Siang, ${dateLabel}, ${nowLabel}.`} />
    {/* Manager: infografis. Mode API sepenuhnya dari GET /dashboard/executive, mode lokal dari data demo. */}
    {isManager && API_MODE ? <ExecutiveDashboardApi attention={<BerandaApiAttention role={demo.role} title="Perlu perhatian" />} />
    : API_MODE && RoleDashboard ? <RoleDashboard attention={<BerandaApiAttention role={demo.role} title={attentionTitle} subtitle={attentionSubtitle} />} />
    : isManager ? <>
      <ExecKpis items={execKpis} />
      <div className="exec-grid">
        <SupplyCard cover={cover} planned={milkPlanned} need={milkNeed} farms={farms.map(f => ({ name: f.name, tiba: f.arrived, jalan: f.onTheWay, belum: Math.max(0, f.plannedRt - f.arrived - f.onTheWay), plannedL: f.plannedL }))} />
        <MachineCard states={states} total={fillers.length} running={states[0].count} downtime={downByCause} />
        <TargetCard rows={paceRows} />
        <div className="exec-side">
          <ScheduleCard segs={orderSegs} total={demo.schedule.length} plan={{ ok: !!approved, text: approved ? `Rencana disetujui ${approved.by}` : `Rencana tidak layak, ${broken} constraint dilanggar` }} />
          <Card className="exec-card"><SectionTitle title="Perlu perhatian" action={<Badge tone="crit">{shown.filter(a => a.tone === "crit").length} kritis</Badge>} />
            <ul className="attention-list exec-attention">{shown.slice(0, 4).map(a => <li key={a.title}><Link href={a.href} className={`attention-item ${a.tone}`}><span className="attention-icon"><Icon icon={a.icon} size={16} /></span><span className="attention-copy"><strong>{a.title}</strong></span><Icon icon={ChevronRight} size={16} /></Link></li>)}</ul>
            {shown.length > 4 && <p className="small muted">{shown.length - 4} hal lain di halaman masing-masing.</p>}
          </Card>
        </div>
      </div>
    </> : <>
    {API_MODE
      ? <ExecutiveKpis />
      : kpis
      ? <div className="schedule-stats planner-kpis">{kpis.map(k => <Link key={k.label} href={k.href} className={`card planner-kpi ${k.tone}`}><span className="planner-kpi-label"><Icon icon={k.icon} size={16} />{k.label}<Icon icon={ArrowUpRight} size={15} className="planner-kpi-go" /></span><strong>{k.value}{k.unit && <small> {k.unit}</small>}</strong><span className="small muted">{k.note}</span></Link>)}</div>
      : <MetricGrid onSource={setSource} />}

    <div className="home-top">
      {API_MODE
      ? <><BerandaApiHero role={demo.role} /><BerandaApiAttention role={demo.role} title={attentionTitle} subtitle={attentionSubtitle} /></>
      : <><section className="incident-card home-plan"><div className="incident-top"><span className="incident-status"><Icon icon={TriangleAlert} size={17} />Rencana shift</span><span className="mono">PLAN-FIFO</span></div>
        <h2>{approved ? <>Rekomendasi disetujui,<br />RT-26 pindah ke Bay 1.</> : <>Rencana tidak layak,<br />{broken} constraint dilanggar.</>}</h2>
        <div className="incident-time"><span><Icon icon={Hourglass} size={15} />Sisa holding time RT-26</span><strong>{duration(left)}</strong></div>
        <p className="inverse-muted">{approved ? `Disetujui ${approved.by}, ${approved.at}.` : `Lab test butuh ${lab.value} ${lab.unit}, dan ${bay.delta}.`}</p>
        {canSee(demo.role, findNav(heroHref).tab.href) && <Link href={heroHref} className="button inverse">{seePlan ? (approved ? "Lihat rencana" : "Periksa rencana") : isLab ? "Buka Tes Lab" : isOperator ? "Buka jadwal lini" : isQa ? "Buka Tes Lab" : "Buka antrean truk"}<span className="button-circle"><Icon icon={ArrowUpRight} /></span></Link>}
      </section>
      <Card className="home-attention"><SectionTitle title={attentionTitle} subtitle={attentionSubtitle} action={<Badge tone="crit">{shown.filter(a => a.tone === "crit").length} kritis</Badge>} />
        <ul className="attention-list">{shown.map(a => <li key={a.title}><Link href={a.href} className={`attention-item ${a.tone}`}><span className="attention-icon"><Icon icon={a.icon} size={18} /></span><span className="attention-copy"><strong>{a.title}</strong><span>{a.meta}</span></span><Icon icon={ChevronRight} size={18} /></Link></li>)}</ul>
      </Card></>}
    </div>

    {/* Isi tiap menu diringkas jadi satu baris (poin 7): detailnya ada di halaman menu masing-masing. */}
    {API_MODE
    ? <BerandaApiMenus role={demo.role} />
    : <Card className="home-menus"><SectionTitle title="Semua menu" subtitle="Satu baris per menu. Klik untuk membuka halamannya." />
      <ul className="attention-list menu-list">{visibleNav(demo.role).filter(n => summary[n.label]).map(n => { const m = summary[n.label]; return <li key={n.label}><Link href={n.tabs[0].href} className={`attention-item ${m.tone}`}><span className="attention-icon"><Icon icon={n.icon} size={18} /></span><span className="attention-copy"><strong>{n.label}</strong><span>{m.text}</span></span><Icon icon={ChevronRight} size={18} /></Link></li>; })}</ul>
    </Card>}

    <Card className="home-activity"><SectionTitle title="Aktivitas terbaru" action={<Link className="text-link" href="/persetujuan">Semua riwayat<Icon icon={ChevronRight} size={14} /></Link>} />
      {activity.length
      ? <ul className="activity-list">{activity.map(e => <li key={e.id}><span className={`status-dot tone-${e.tone}`} aria-hidden="true" /><span><strong>{e.title}</strong><span>{e.detail}</span><span>{e.by} · {e.at}</span></span></li>)}</ul>
      : <p className="small muted">Belum ada aktivitas tercatat.</p>}
    </Card>
    </>}
    <SourceModal id={source} onClose={() => setSource(null)} />
  </div>;
}
