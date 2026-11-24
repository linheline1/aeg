import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Optional, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import fs from 'node:fs';
import path from 'node:path';
import { AuthGuard, Roles, RolesGuard } from '../common/guards/auth.guard';
import { QuotesRepo, repoRoot } from '../common/mock-db';
import type { PublishedQuote } from './quote-publication';
import { notificationQuery } from './notification-query';
import type { OrderDocument } from './order-document';

type ExceptionNotice = { status: 'open' | 'resolved'; message: string; updated_at: string };

type Notification = {
  id: string;
  type: 'published' | 'accepted' | 'rejected' | 'shipment' | 'exception_open' | 'exception_resolved' | 'document_requested' | 'document_rejected';
  quoteId: string;
  quoteNo: string;
  at: string;
  version?: number;
  stage?: string;
  message?: string;
};
type SourceQuote = {
  id: string;
  quote_no: string;
  quote_versions?: PublishedQuote[] | null;
  document_requests?: OrderDocument[] | null;
  shipment?: {
    events?: Array<{ id: string; stage: string; created_at?: string; happened_at?: string }>;
    exception?: ExceptionNotice;
    exception_updates?: ExceptionNotice[];
  } | null;
};
type CustomerRequest = Request & { user?: { client_id?: string; sub?: string } };

export function notificationEvents(orders: SourceQuote[]): Notification[] {
  const events = new Map<string, Notification>();
  const add = (order: SourceQuote, key: string, type: Notification['type'], time?: string,
    detail?: Pick<Notification, 'version' | 'stage' | 'message'>) => {
    if (!time || !Number.isFinite(Date.parse(time))) return;
    const id = order.id + ':' + key;
    events.set(id, { id, type, quoteId: order.id, quoteNo: order.quote_no, at: new Date(time).toISOString(), ...detail });
  };
  for (const order of orders) {
    for (const document of order.document_requests ?? []) {
      add(order, 'document-request:' + document.id, 'document_requested', document.requested_at, { stage: document.type, message: document.title ?? undefined });
      for (const version of document.versions) {
        if (version.review?.status === 'rejected') {
          add(order, 'document-rejected:' + version.id, 'document_rejected', version.review.at, {
            stage: document.type, message: version.review.reason ?? undefined
          });
        }
      }
    }
    for (const version of order.quote_versions ?? []) {
      add(order, 'published:' + version.version, 'published', version.published_at, { version: version.version });
      if (version.decision) add(order, 'decision:' + version.version, version.decision.value, version.decision.at, { version: version.version });
    }
    const shipment = order.shipment;
    for (const event of shipment?.events ?? []) {
      if (event.id) add(order, 'shipment:' + event.id, 'shipment', event.created_at ?? event.happened_at, { stage: event.stage });
    }
    for (const update of shipment?.exception_updates ?? (shipment?.exception ? [shipment.exception] : [])) {
      if (update.status === 'open' || update.status === 'resolved') {
        add(order, 'exception:' + update.updated_at, `exception_${update.status}`, update.updated_at, { message: update.message });
      }
    }
  }
  return [...events.values()].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}

@Controller('client/notifications')
@UseGuards(AuthGuard, RolesGuard)
@Roles('client')
export class ClientNotificationsController {
  private readonly receiptsFile = path.join(repoRoot(), 'apps/api/data/client-notification-reads.json');

  constructor(@Inject('QuotesRepo') private readonly quotes: QuotesRepo, @Optional() private readonly db?: DataSource) {}

  private account(req: CustomerRequest) {
    const client = req.user?.client_id;
    const user = req.user?.sub;
    if (!client || !user) throw new BadRequestException('Customer account is required.');
    return { client, user };
  }

  private async events(client: string) {
    return notificationEvents(await this.quotes.find({ where: { client_id: client } }));
  }

  private mockReceipts(): Record<string, string[]> {
    try { return JSON.parse(fs.readFileSync(this.receiptsFile, 'utf8')); }
    catch (error: any) { if (error.code === 'ENOENT') return {}; throw error; }
  }

  @Get()
  async list(@Req() req: CustomerRequest, @Query('page') value?: string) {
    const { client, user } = this.account(req);
    const page = Math.max(1, Math.min(100000, Math.floor(Number(value)) || 1));
    if (this.db) {
      const [result] = await this.db.query(`${notificationQuery}
        SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT read)::int AS unread,
          (SELECT COALESCE(jsonb_agg(page ORDER BY page.at DESC, page.id DESC), '[]'::jsonb)
           FROM (SELECT * FROM inbox ORDER BY at DESC, id DESC LIMIT 20 OFFSET $3) page) AS items
        FROM inbox`, [client, user, (page - 1) * 20]);
      return result;
    }
    const events = await this.events(client);
    const read = new Set(this.mockReceipts()[client + ':' + user] ?? []);
    return {
      items: events.slice((page - 1) * 20, page * 20).map(event => ({ ...event, read: read.has(event.id) })),
      unread: events.filter(event => !read.has(event.id)).length,
      total: events.length
    };
  }

  @Get('unread')
  async unread(@Req() req: CustomerRequest) {
    const { client, user } = this.account(req);
    if (this.db) {
      const [result] = await this.db.query(`${notificationQuery}
        SELECT count(*)::int AS unread FROM inbox WHERE NOT read`, [client, user]);
      return result as { unread: number };
    }
    const read = new Set(this.mockReceipts()[client + ':' + user] ?? []);
    return { unread: (await this.events(client)).filter(event => !read.has(event.id)).length };
  }

  @Post('read')
  async markRead(@Req() req: CustomerRequest, @Body() body: { ids?: string[] }) {
    const { client, user } = this.account(req);
    const ids = body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 20 || ids.some(id => typeof id !== 'string' || id.length > 150)) {
      throw new BadRequestException('Invalid notification selection.');
    }
    if (this.db) {
      const requested = [...new Set(ids)];
      const [result] = await this.db.query(`${notificationQuery},
        selected AS (SELECT id FROM notices WHERE id = ANY($3::text[])),
        validation AS (SELECT count(*) = cardinality($3::text[]) AS valid FROM selected),
        receipts AS (
          INSERT INTO client_notification_read (client_id, user_id, event_key)
          SELECT $1, $2, id FROM selected WHERE (SELECT valid FROM validation) ON CONFLICT DO NOTHING
        )
        SELECT valid FROM validation`, [client, user, requested]);
      if (!result.valid) throw new NotFoundException('Notification not found.');
    } else {
      const allowed = new Set((await this.events(client)).map(event => event.id));
      if (ids.some(id => !allowed.has(id))) throw new NotFoundException('Notification not found.');
      const data = this.mockReceipts();
      const key = client + ':' + user;
      data[key] = [...new Set([...(data[key] ?? []), ...ids])];
      fs.mkdirSync(path.dirname(this.receiptsFile), { recursive: true });
      const temporary = this.receiptsFile + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(data));
      fs.renameSync(temporary, this.receiptsFile);
    }
    return { ok: true };
  }
}
