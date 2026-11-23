import fs from 'node:fs';
import path from 'node:path';
import { Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { repoRoot } from '../common/mock-db';
import { QuoteTask } from './quote-task.types';

@Injectable()
export class QuoteTaskStore {
  private readonly filename = path.join(repoRoot(), 'apps/api/data/quote-ai-tasks.json');

  constructor(@Optional() private readonly db?: DataSource) {}

  private read(): Record<string, QuoteTask> {
    try {
      return JSON.parse(fs.readFileSync(this.filename, 'utf8'));
    } catch (error: any) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }

  async get(key: string): Promise<QuoteTask | null> {
    if (!this.db) return this.read()[key] ?? null;
    const [row] = await this.db.query('SELECT state FROM quote_ai_task WHERE key = $1', [key]);
    return row?.state ?? null;
  }

  async save(task: QuoteTask, expected: number | null): Promise<boolean> {
    const next = { ...task, revision: (expected ?? 0) + 1, updatedAt: Date.now() };
    if (this.db) {
      const query = expected == null
        ? 'INSERT INTO quote_ai_task(key, revision, state) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING key'
        : 'INSERT INTO quote_ai_task(key, revision, state) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET revision = EXCLUDED.revision, state = EXCLUDED.state WHERE quote_ai_task.revision = $4 RETURNING key';
      const result = await this.db.query(query, expected == null
        ? [next.key, next.revision, JSON.stringify(next)]
        : [next.key, next.revision, JSON.stringify(next), expected]);
      return result.length === 1;
    }
    // The JSON backend is a single-process local development store.
    const tasks = this.read();
    if ((tasks[next.key]?.revision ?? null) !== expected) return false;
    tasks[next.key] = next;
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const temporary = this.filename + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(tasks));
    fs.renameSync(temporary, this.filename);
    return true;
  }

  async due(now: number, limit: number): Promise<QuoteTask[]> {
    if (this.db) {
      const rows = await this.db.query(`SELECT state FROM quote_ai_task
        WHERE state->>'status' = 'queued'
          OR (state->>'status' = 'running' AND (state->>'leaseUntil')::bigint <= $1)
        ORDER BY (state->>'updatedAt')::bigint LIMIT $2`, [now, limit]);
      return rows.map((row: any) => row.state);
    }
    return Object.values(this.read())
      .filter(task => task.status === 'queued' || (task.status === 'running' && (task.leaseUntil ?? 0) <= now))
      .sort((a, b) => a.updatedAt - b.updatedAt).slice(0, limit);
  }

  async counts(): Promise<Record<string, number>> {
    if (this.db) {
      const rows = await this.db.query(`SELECT state->>'status' AS status, count(*)::integer AS count
        FROM quote_ai_task GROUP BY 1
        UNION ALL SELECT 'billing', count(*)::integer FROM quote_ai_task WHERE state->'error'->>'code' = 'billing'`);
      return Object.fromEntries(rows.map((row: any) => [row.status, row.count]));
    }
    const counts: Record<string, number> = {};
    for (const task of Object.values(this.read())) {
      counts[task.status] = (counts[task.status] ?? 0) + 1;
      if (task.error?.code === 'billing') counts.billing = (counts.billing ?? 0) + 1;
    }
    return counts;
  }
}
