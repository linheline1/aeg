export const DOCUMENT_TYPES = ['commercial_invoice', 'packing_list', 'bill_of_lading', 'certificate_of_origin', 'other'] as const;
export type DocumentType = typeof DOCUMENT_TYPES[number];
export type DocumentStatus = 'missing' | 'submitted' | 'approved' | 'rejected';

export interface DocumentVersion {
  id: string;
  file_name: string;
  file_path: string;
  size_bytes: number;
  submitted_at: string;
  review?: { status: 'approved' | 'rejected'; reason: string | null; at: string };
}

export interface OrderDocument {
  id: string;
  type: DocumentType;
  title: string | null;
  instructions: string | null;
  requested_at: string;
  status: DocumentStatus;
  revision: number;
  versions: DocumentVersion[];
}
