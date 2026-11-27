/** OpenAPI 3.0, Production & Batch endpoints. */
export type ProductionList<T> = { count: number; items: T[] };

export interface ProductionLine {
  batch_id: string;
  batch_code: string;
  production_date: string;
  sequence_no: number;
  line_no: number | null;
  production_order_id: string | null;
  finished_sku_id: string | null;
  filling_line_id: string | null;
  aseptic_tank_id: string | null;
  sterilizer_id: string | null;
  target_volume_l: number | null;
  target_packs: number | null;
}

export interface ProductionBatchRow extends ProductionLine {
  batch_status: string;
  product_name: string | null;
  fulfill_status: string | null;
  risk_reason: string | null;
  shortage_l?: number | null;
}

export type ProductionDaily = { production_date: string; count: number; batches: ProductionBatchRow[] };
export type ProductionScheduleRow = ProductionLine & { status: string };
export type ProductionSession = { role: string; permissions: string[] };

export interface ProductionAsset {
  asset_id: string;
  asset_name: string;
  asset_type: string;
  current_status: string | null;
  current_status_reason: string | null;
  current_status_source?: string | null;
  current_status_observed_at: string | null;
}

export interface ProductionCatalog {
  products: { sku_id: string; product_name: string }[];
  finished_skus: { finished_sku_id: string; liquid_sku_id: string }[];
}
