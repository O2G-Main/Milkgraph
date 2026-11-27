"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { Tone } from "@/mock/types";
import styles from "./plant-topology.module.css";
import { Equipment } from "@/components/trace/equipment";

export type PlantNode = Node<{ id: string; kind: string; status: string; selected: boolean; focused: boolean; tone?: Tone; statusTime?: string; assignmentCount?: number; onPick: (id: string) => void }, "plant-asset">;
export function PlantAssetNode({ data }: NodeProps<PlantNode>) {
  return <>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <button data-asset-id={data.id} type="button" className={`flow-node nodrag nopan ${data.statusTime !== undefined ? styles.monitoredNode : ""} ${data.selected || data.focused ? "is-selected" : ""}`} aria-label={data.statusTime === undefined ? `Lihat alat ${data.id}` : `Lihat alat ${data.id}. ${data.status}. ${data.statusTime}. ${data.assignmentCount ?? 0} batch dijadwalkan pada tanggal terpilih.`} aria-pressed={data.selected} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); }} onClick={event => { event.stopPropagation(); data.onPick(data.id); }}>
      <Equipment kind={data.kind} size={data.statusTime !== undefined ? 36 : 48} />
      <strong>{data.id}</strong>
      <span className={`mini-status ${data.tone || "neutral"} ${styles.statusText}`} title={data.status}>{data.status}</span>
      {data.statusTime !== undefined && <span className={styles.nodeTime} title="Waktu catatan status terakhir (WIB)">{data.statusTime}</span>}
      {!!data.assignmentCount && <span className={styles.assignmentTag} title="Jumlah batch pada jadwal tanggal terpilih">{data.assignmentCount} batch</span>}
    </button>
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </>;
}
export function equipmentKind(type: string): string {
  const types: Record<string, string> = { "Unloading Bay": "Bay", "Raw Milk Tank": "Buffer", "Thermizer": "Thermal", "Separator": "Separator", "Separation / Standardization": "Separator", "Transfer Tank": "Storage", "SFP Storage Tank": "Storage", "Finished Goods Batch Boundary": "Lot", "Cream Tank": "Cream", "Premix Tank": "Premix", "Mixing Tank": "Mixing", "Sterilizer": "Sterilisasi", "Aseptic Tank": "Aseptic", "Filling Machine": "Filling", "Filling Line": "Filling", "Farm Supply Boundary": "Farm", "Road Tanker Delivery Boundary": "RT" };
  return types[type] || type;
}

export function equipmentStage(type: string): string {
  const stages: Record<string, string> = { Farm: "Penerimaan", RT: "Penerimaan", Bay: "Penerimaan", Buffer: "Susu mentah", Thermal: "Susu mentah", Separator: "Susu mentah", Storage: "Penyimpanan", Cream: "Penyimpanan", Premix: "Penyimpanan", Mixing: "Mixing", Sterilisasi: "Sterilisasi", Aseptic: "Tangki aseptik", Filling: "Filling", Lot: "Barang jadi" };
  return stages[equipmentKind(type)] || type;
}
