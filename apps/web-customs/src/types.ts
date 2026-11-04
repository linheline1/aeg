export type ReviewStatus = 'pending' | 'approved' | 'changes_requested';
export type ProgressStage = 'customs_br' | 'duty_paid' | 'cleared';

export interface CustomsUser {
  id: string;
  username: string;
  role: string;
}

export interface Review {
  status: ReviewStatus;
  di_review_version: number | null;
  total_di_brl: number | null;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface OrderRow {
  id: string;
  quote_no: string;
  status: string;
  created_at: string;
  updated_at: string;
  total_cbm: number | null;
  total_gw_kg: number | null;
  total_amount_rmb: number | null;
  total_amount_brl: number | null;
  di_total_brl: number | null;
  customs_review: Review | null;
  shipment_stage: string | null;
}

export interface DiParameters {
  rmb_brl: number;
  insurance_brl: number;
  uf: string;
  icms_rate: number;
  freight_brl: number;
}

export interface DiItem {
  row_no?: number;
  ncm?: string;
  description?: string;
  product_name?: string;
  ii_rate?: number;
  ipi_rate?: number;
  pis_rate?: number;
  cofins_rate?: number;
  cif_brl?: number;
  ii_brl?: number;
  ipi_brl?: number;
  pis_brl?: number;
  cofins_brl?: number;
  icms_brl?: number;
  total_brl?: number;
  [key: string]: unknown;
}

export interface DiAdditionalFee {
  id: string;
  name: string;
  amount_brl: number;
  note?: string | null;
}

export interface DiAnalysis {
  items: DiItem[];
  parameters?: Partial<DiParameters>;
  additional_fees?: DiAdditionalFee[];
  status?: string;
  review_status?: ReviewStatus;
  review_version?: number | null;
  di_review_version?: number | null;
  total_di_brl?: number | null;
  totals?: Record<string, number | null>;
  [key: string]: unknown;
}

export interface OrderImage {
  id: string;
  row_no: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface ShipmentEvent {
  id: string;
  stage: string;
  note: string | null;
  happened_at: string;
  created_by: string | null;
}

export interface OrderDetailData extends OrderRow {
  total_rows: number;
  valid_rows: number;
  invoice_cnpj: { cnpj: string; company_name: string; ie: string | null } | null;
  line_items: Array<Record<string, unknown>>;
  di_analysis: DiAnalysis | null;
  shipment: { events: ShipmentEvent[] } | null;
  images: OrderImage[];
}

export interface DiVersion {
  version: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  analysis: DiAnalysis;
}

export interface CertificateInfo {
  file_name: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface Cnpj {
  id: string;
  cnpj: string;
  company_name: string;
  status: 'active' | 'disabled';
  quota_limit_usd: number;
  quota_used_usd: number;
  quota_available_usd: number;
  quota_used_percent: number;
  certificates: { a1: CertificateInfo | null; ecpf: CertificateInfo | null };
  created_at: string;
  updated_at: string;
}
