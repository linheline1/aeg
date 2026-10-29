import fs from 'fs';
import path from 'path';
import * as crypto from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { UploadDraftEntity } from '../entities/upload-draft.entity';
import { repoRoot } from '../common/mock-db';

export interface UploadDraftRow {
  id: string;
  client_id: string;
  status: 'preview' | 'confirmed' | 'cancelled';
  file_name: string;
  file_path: string;
  template_version: string;
  rows: any[];
  warehouse_code?: string | null;
  converted_by_ai: boolean;
  ai_notes?: string | null;
  declared_currency: 'RMB' | 'USD';
  screenshots?: any[] | null;
  quote_id?: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

const DB_PATH = path.join(repoRoot(), 'apps/api/data/upload-drafts.json');

function toRow(entity: UploadDraftEntity): UploadDraftRow {
  return {
    ...entity,
    expires_at: entity.expires_at instanceof Date ? entity.expires_at.toISOString() : String(entity.expires_at),
    created_at: entity.created_at instanceof Date ? entity.created_at.toISOString() : String(entity.created_at),
    updated_at: entity.updated_at instanceof Date ? entity.updated_at.toISOString() : String(entity.updated_at)
  } as UploadDraftRow;
}

export class UploadDraftsRepo {
  private repo?: Repository<UploadDraftEntity>;

  constructor(ds?: DataSource) {
    if (ds) this.repo = ds.getRepository(UploadDraftEntity);
  }

  private load(): UploadDraftRow[] {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch { return []; }
  }

  private save(rows: UploadDraftRow[]) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(rows, null, 2));
  }

  async findById(id: string): Promise<UploadDraftRow | null> {
    if (this.repo) {
      const row = await this.repo.findOne({ where: { id } });
      return row ? toRow(row) : null;
    }
    return this.load().find(row => row.id === id) || null;
  }

  async insert(row: Omit<UploadDraftRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<UploadDraftRow> {
    if (this.repo) {
      const entity = this.repo.create();
      Object.assign(entity, row);
      return toRow(await this.repo.save(entity));
    }
    const now = new Date().toISOString();
    const full = { ...row, id: row.id || crypto.randomUUID(), created_at: now, updated_at: now };
    const rows = this.load();
    rows.unshift(full);
    this.save(rows);
    return full;
  }

  async update(id: string, patch: Partial<UploadDraftRow>): Promise<UploadDraftRow | null> {
    if (this.repo) {
      const row = await this.repo.findOne({ where: { id } });
      if (!row) return null;
      Object.assign(row, patch);
      return toRow(await this.repo.save(row));
    }
    const rows = this.load();
    const index = rows.findIndex(row => row.id === id);
    if (index < 0) return null;
    rows[index] = { ...rows[index], ...patch, updated_at: new Date().toISOString() };
    this.save(rows);
    return rows[index];
  }
}
