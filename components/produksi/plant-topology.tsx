"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ReactFlow, Background, Controls, MarkerType, type Node, type Edge, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card, SectionTitle, Toggle } from "@/components/ui";
import { Select } from "@/components/ui/fields";
import { useResource } from "@/lib/api/resource";
import { connectedRoutes, filterPlantTopology, plantGraph, type PlantTopologyData } from "@/lib/api/topology";
import type { ProductionAsset, ProductionList } from "@/lib/api/production";
import { Flow3D } from "@/components/alur/flow-3d";
import { assetStatusTone, recordedStatusTime } from "@/lib/factory-monitor";
import { autoLayout, CARD } from "@/components/alur/graph";
import { nodeTypes as oldNodeTypes } from "@/components/alur/flow-nodes";
import type { Asset } from "@/lib/assets";
import { PlantAssetNode, equipmentKind, equipmentStage } from "./plant-asset-node";
import styles from "./plant-topology.module.css";

const nodeTypes = { "plant-asset": PlantAssetNode, stage: oldNodeTypes.stage };

export function PlantTopology({ assignmentCounts = {}, selectedAsset, onAssetSelect, showStatusDetails = false, fitFocusedAssets = false, focusDescription, focusAssets = [], title = "Alur pabrik", subtitle = "Konfigurasi alat saat ini dari master pabrik. Tampilan ini tidak mengikuti filter tanggal prediksi." }: {
  focusAssets?: string[]; title?: string; subtitle?: string;
  assignmentCounts?: Record<string, number>; selectedAsset?: string | null;
  onAssetSelect?: (id: string | null) => void; showStatusDetails?: boolean; fitFocusedAssets?: boolean; focusDescription?: string;
}) {
  const topology = useResource<PlantTopologyData>("/master/topology");
  const assets = useResource<ProductionList<ProductionAsset>>("/production/assets", { fetchOnMount: !showStatusDetails });
  // Controlled nodes must retain measured dimensions across renders (React Flow 12).
  // Otherwise selecting a node temporarily hides it, which also loses keyboard focus.
  const [measurements, setMeasurements] = useState<Record<string, Node["measured"]>>({});
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const dimensions = changes.filter(change => change.type === "dimensions" && change.dimensions);
    if (!dimensions.length) return;
    setMeasurements(previous => {
      const next = { ...previous };
      let changed = false;
      for (const change of dimensions) {
        if (change.type !== "dimensions" || !change.dimensions) continue;
        const prior = previous[change.id];
        if (prior?.width !== change.dimensions.width || prior?.height !== change.dimensions.height) {
          next[change.id] = change.dimensions;
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, []);
  const [view, setView] = useState<"diagram" | "3d" | "routes">("diagram");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [ownSelected, setOwnSelected] = useState<string | null>(null);
  const selected = selectedAsset !== undefined ? selectedAsset : ownSelected;
  const setSelected = onAssetSelect ?? setOwnSelected;
  const graph = useMemo(() => topology.data ? plantGraph(topology.data) : null, [topology.data]);
  const current = new Map((assets.data?.items ?? []).map(asset => [asset.asset_id, asset]));
  const focus = new Set(focusAssets);
  const { visible, routes } = filterPlantTopology(topology.data ?? { nodes: [], edges: [] }, query, type);
  const statusLabel = (id: string) => assets.error ? "Status tidak tersedia" : !assets.data ? "Memuat status…" : showStatusDetails && !current.has(id) ? "Node konfigurasi" : current.get(id)?.current_status?.trim() || "Belum tercatat";
  const visualAssets: Asset[] = (graph?.nodes ?? []).map(node => ({ id: node.id, group: node.asset.asset_type, stage: equipmentStage(node.asset.asset_type),
    kind: equipmentKind(node.asset.asset_type), status: statusLabel(node.id), tone: showStatusDetails ? assetStatusTone(current.get(node.id)?.current_status) : "neutral", note: node.asset.asset_name, href: "/alat", active: false }));
  const stages = [...new Set([...(graph?.nodes ?? [])].sort((a, b) => a.position.x - b.position.x).map(node => equipmentStage(node.asset.asset_type)))];
  const layout = autoLayout(visualAssets, stages);
  const nodes: Node[] = [
    ...layout.columns.filter(column => visualAssets.some(asset => asset.stage === column.stage && visible.has(asset.id))).map(column => ({
      id: `stage-${column.stage}`, type: "stage", position: { x: column.x, y: 0 }, style: { width: Math.max(column.width, CARD) },
      data: { label: column.stage, unit: showStatusDetails ? "node" : "alat", count: visualAssets.filter(asset => asset.stage === column.stage && visible.has(asset.id)).length }, selectable: false, draggable: false, focusable: false,
    })),
    ...visualAssets.filter(asset => visible.has(asset.id)).map(asset => ({
      id: asset.id, type: "plant-asset", focusable: !showStatusDetails, position: layout.pos[asset.id], style: { width: CARD },
      data: { id: asset.id, kind: asset.kind, status: asset.status, selected: selected === asset.id, focused: focus.has(asset.id), onPick: setSelected, tone: asset.tone, ...(showStatusDetails ? { statusTime: assets.error ? "Status gagal dimuat" : !assets.data ? "Memuat catatan…" : current.has(asset.id) ? recordedStatusTime(current.get(asset.id)?.current_status_observed_at, true) : undefined, assignmentCount: assignmentCounts[asset.id] ?? 0 } : {}) },
    })),
  ];
  const measuredNodes = nodes.map(node => ({ ...node, measured: measurements[node.id] }));
  const focusKey = [...focusAssets].sort().join(",");
  const fitViewOptions = useMemo(() => ({ padding: .15, maxZoom: 1,
    ...(fitFocusedAssets && !type && !query && focusKey ? { nodes: focusKey.split(",").map(id => ({ id })) } : {}),
  }), [fitFocusedAssets, type, query, focusKey]);
  const edges: Edge[] = (graph?.edges ?? []).filter(edge => visible.has(edge.source_asset_id) && visible.has(edge.destination_asset_id)).map(edge => ({
    id: edge.connection_id, source: edge.source_asset_id, target: edge.destination_asset_id,
    type: "smoothstep", label: edge.via_asset_id || undefined,
    style: { stroke: "var(--color-accent-fill)", strokeWidth: 1.6 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-primary)" },
  }));
  const picked = topology.data?.nodes.find(asset => asset.asset_id === selected);
  const pickedRoutes = topology.data && selected ? connectedRoutes(topology.data, selected) : [];

  return <Card data-tour="plant-topology">
    <SectionTitle title={title} subtitle={subtitle} action={<Toggle label="Tampilan topologi" value={view} onChange={setView} options={[{ value: "diagram", label: "Alur 2D" }, { value: "3d", label: "Alur 3D" }, { value: "routes", label: "Daftar rute" }]} />} />
    {topology.error ? <div role="alert"><p className="crit-text">Gagal memuat alur: {topology.error.message}</p><button className="button secondary" onClick={() => void topology.reload()}>Coba lagi</button></div>
    : !topology.data ? <p className="muted" role="status">Memuat alur pabrik…</p>
    : <>
      <div className={styles.toolbar}>
        <label className="schedule-form"><span className="field-label">Cari alat atau rute</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); setSelected(null); }} placeholder="Kode atau nama alat" /></label>
        <label className="schedule-form"><span className="field-label">Jenis alat</span><Select label="Jenis alat pada alur" value={type} onChange={value => { setType(value); setSelected(null); }} options={[{ value: "", label: "Semua jenis" }, ...[...new Set(topology.data.nodes.map(asset => asset.asset_type))].sort().map(value => ({ value, label: value }))]} /></label>
        <span className="small muted">Menampilkan {visible.size} dari {topology.data.nodes.length} {showStatusDetails ? "node konfigurasi" : "alat"} · {routes.length} dari {topology.data.edges.length} rute</span>
      </div>
      {assets.error && <p className="small crit-text" role="alert">Status alat gagal dimuat: {assets.error.message}. Topologi tetap menunjukkan konfigurasi, bukan kondisi berjalan.</p>}
      <p className="small muted">Garis hijau menunjukkan rute yang dikonfigurasi. Status pada kartu adalah catatan terakhir alat; diagram tidak menunjukkan aliran susu secara langsung.</p>
      {!!focusAssets.length && <p className="small muted">{focusDescription || "Alat pada rencana terpilih diberi garis hijau. Koneksi menunjukkan kemampuan rute, bukan bukti aliran yang sedang berjalan."}</p>}
      {graph && graph.missing.length > 0 && <p className="small crit-text" role="status">{graph.missing.length} koneksi memiliki alat yang belum tersedia di katalog. Detail tetap ada di daftar rute.</p>}
      {view !== "routes" ? !visualAssets.some(asset => visible.has(asset.id)) ? <p className="muted">{topology.data.nodes.length ? "Tidak ada alat yang cocok dengan filter." : "Data konfigurasi alat belum tersedia."}</p> : <>
        <div className={`flow-canvas ${styles.canvas}`} role="region" tabIndex={-1} aria-label="Diagram alur alat Greenfields">
          {view === "3d" ? <Flow3D assets={visualAssets.filter(asset => visible.has(asset.id))} edges={edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, kind: "idle" as const }))} pos={layout.pos} columns={layout.columns} badges={showStatusDetails ? Object.fromEntries(Object.entries(assignmentCounts).map(([id, count]) => [id, `${count} batch`])) : {}} picked={selected} onPick={setSelected} onClear={() => setSelected(null)} label="Alur pabrik 3D" />
          : <ReactFlow key={`${type}:${query}:${showStatusDetails && fitFocusedAssets ? [...focusAssets].sort().join(",") : "all"}`} nodeTypes={nodeTypes} nodes={measuredNodes} onNodesChange={onNodesChange} edges={edges} defaultViewport={{ x: 24, y: 24, zoom: .9 }} fitView={showStatusDetails || Boolean(type || query)} fitViewOptions={fitViewOptions} nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, node) => { if (node.type === "plant-asset") setSelected(node.id); }} minZoom={.15} maxZoom={1.8} ariaLabelConfig={{ "controls.zoomIn.ariaLabel": "Perbesar alur", "controls.zoomOut.ariaLabel": "Perkecil alur", "controls.fitView.ariaLabel": "Pas ke layar" }}>
            <Background gap={22} size={1} /><Controls showInteractive={false} />
          </ReactFlow>}
        </div>
        <p className="small muted">Geser dan perbesar diagram untuk melihat detail. Pilih alat untuk melihat spesifikasi dan rute terkait.</p>
      </> : <div className="table-wrap"><table className="schedule-table"><thead><tr><th>Rute</th><th>Dari</th><th>Ke</th><th>Melalui</th><th>Jenis aliran</th><th>Batas aliran (L/jam)</th></tr></thead><tbody>{routes.map(edge => <tr key={edge.connection_id}><td>{edge.connection_id}</td><td><button className="text-link" onClick={() => setSelected(edge.source_asset_id)}>{edge.source_asset_id}</button></td><td><button className="text-link" onClick={() => setSelected(edge.destination_asset_id)}>{edge.destination_asset_id}</button></td><td>{edge.via_asset_id || "Tidak dicantumkan"}</td><td>{edge.flow_type}</td><td>{edge.max_flow_lph || "Belum tersedia"}</td></tr>)}</tbody></table>{!routes.length && <p className="muted">Tidak ada rute yang cocok.</p>}</div>}
      {picked && !onAssetSelect && <div className={styles.inspector} aria-live="polite">
        <SectionTitle title={`${picked.asset_id} · ${picked.asset_name}`} subtitle={picked.asset_type} action={<button className="button secondary" onClick={() => setSelected(null)}>Tutup detail</button>} />
        <dl className={styles.details}><div><dt>Status terakhir</dt><dd>{statusLabel(picked.asset_id)}</dd></div><div><dt>Kapasitas (L)</dt><dd>{picked.capacity_l || "Belum tersedia"}</dd></div><div><dt>Kecepatan proses (L/jam)</dt><dd>{picked.process_speed_lph || "Belum tersedia"}</dd></div><div><dt>Rute terkait</dt><dd>{pickedRoutes.length} rute</dd></div></dl>
        <p className="small muted">{pickedRoutes.map(edge => `${edge.source_asset_id} → ${edge.destination_asset_id}`).join(" · ") || "Belum ada koneksi tercatat."}</p>
        <Link className="text-link" href="/alat">Buka daftar dan status alat</Link>
      </div>}
    </>}
  </Card>;
}
