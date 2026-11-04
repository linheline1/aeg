/**
 * PostgreSQL 版仓储：与 mock-db.ts 中 9 个 Repo 的公开方法签名逐一相同，
 * 由 DatabaseModule 按 APP_MODULE_MODE=postgres 时通过 DI token 注入。
 * 输出行的 Date 字段统一转 ISO 字符串，与 mock 行形状保持一致。
 */
import { DataSource, DeepPartial, Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { ClientEntity } from '../entities/client.entity';
import { TemplateVersionEntity } from '../entities/template-version.entity';
import { AuditLogEntity } from '../entities/audit-log.entity';
import { QuoteOrderEntity } from '../entities/quote-order.entity';
import { FeeRateEntity } from '../entities/fee-rate.entity';
import { ClientImageEntity } from '../entities/client-image.entity';
import { ClientCnpjEntity } from '../entities/client-cnpj.entity';
import { CustomsCnpjEntity } from '../entities/customs-cnpj.entity';
import { ProductCatalogEntity } from '../entities/product-catalog.entity';
import { OrderFileEntity } from '../entities/order-file.entity';
import { PaymentRecordEntity } from '../entities/payment-record.entity';
import { HelpArticleEntity } from '../entities/help-article.entity';
import { AiConfigEntity } from '../entities/ai-config.entity';
import type {
  UserRow, ClientRow, TemplateRow, QuoteOrderRow, FeeRateRow,
  ClientImageRow, ClientCnpjRow, CustomsCnpjRow, ProductCatalogRow, OrderFileRow, AuditLogRow, PaymentRow, HelpArticleRow,
  AiConfigRow, ResolvedAiConfig
} from './mock-db';
import { resolveAiConfig } from './mock-db';

/** 实体 → mock 行形状：Date 转 ISO 字符串 */
function toRow<R = unknown>(entity: unknown): R {
  const out: any = {};
  for (const [k, v] of Object.entries(entity as any)) {
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

function stripUndefined<T extends Record<string, any>>(patch: T): Partial<T> {
  const out: any = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export class PgUserRepo {
  private repo: Repository<UserEntity>;
  constructor(ds: DataSource) { this.repo = ds.getRepository(UserEntity); }

  async findOne(opts: { where?: { username?: string; id?: string; client_id?: string } }): Promise<UserRow | null> {
    const w = opts.where;
    let e: UserEntity | null = null;
    if (w?.username) e = await this.repo.findOne({ where: { username: w.username } });
    else if (w?.id) e = await this.repo.findOne({ where: { id: w.id } });
    else if (w?.client_id) e = await this.repo.findOne({ where: { client_id: w.client_id } });
    return e ? (toRow(e) as UserRow) : null;
  }
  async findAll(): Promise<UserRow[]> {
    return (await this.repo.find()).map(e => toRow(e) as UserRow);
  }
  async insert(row: Omit<UserRow, 'id' | 'created_at' | 'updated_at'>): Promise<UserRow> {
    const e = await this.repo.save(this.repo.create(stripUndefined(row) as any));
    return toRow(e) as UserRow;
  }
  async update(id: string, patch: Partial<UserRow>): Promise<UserRow | null> {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) return null;
    Object.assign(e, stripUndefined(patch));
    return toRow(await this.repo.save(e)) as UserRow;
  }
}

export class PgClientRepo {
  private repo: Repository<ClientEntity>;
  constructor(ds: DataSource) { this.repo = ds.getRepository(ClientEntity); }

  async findOne(opts: { where?: { id?: string } }): Promise<ClientRow | null> {
    if (!opts.where?.id) return null;
    const e = await this.repo.findOne({ where: { id: opts.where.id } });
    return e ? (toRow(e) as ClientRow) : null;
  }
  async findAll(): Promise<ClientRow[]> {
    const rows = await this.repo.find({ order: { created_at: 'DESC' } });
    return rows.map(e => toRow(e) as ClientRow);
  }
  async insert(row: Omit<ClientRow, 'id' | 'created_at' | 'updated_at'>): Promise<ClientRow> {
    const e = await this.repo.save(this.repo.create(stripUndefined(row) as any));
    return toRow(e) as ClientRow;
  }
  async update(id: string, patch: Partial<ClientRow>): Promise<ClientRow | null> {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) return null;
    Object.assign(e, stripUndefined(patch));
    return toRow(await this.repo.save(e)) as ClientRow;
  }
}

export class PgTemplateRepo {
  private repo: Repository<TemplateVersionEntity>;
  constructor(ds: DataSource) { this.repo = ds.getRepository(TemplateVersionEntity); }

  async findOne(opts: { where?: { status?: string; version_no?: string; id?: string } }): Promise<TemplateRow | null> {
    const w = opts.where;
    let e: TemplateVersionEntity | null = null;
    if (w?.status === 'active') e = await this.repo.findOne({ where: { status: 'active' } });
    else if (w?.version_no) e = await this.repo.findOne({ where: { version_no: w.version_no } });
    else if (w?.id) e = await this.repo.findOne({ where: { id: w.id } });
    return e ? (toRow(e) as TemplateRow) : null;
  }
  async find(): Promise<TemplateRow[]> {
    const rows = await this.repo.find({ order: { created_at: 'DESC' } });
    return rows.map(e => toRow(e) as TemplateRow);
  }
}

export class PgAuditRepo {
  private repo: Repository<AuditLogEntity>;
  private users: Repository<UserEntity>;
  constructor(ds: DataSource) {
    this.repo = ds.getRepository(AuditLogEntity);
    this.users = ds.getRepository(UserEntity);
  }

  /** 兼容旧签名 log(action, payload, user_id) */
  async log(action: string, payload?: any, user_id?: string): Promise<void> {
    const u = user_id ? await this.users.findOne({ where: { id: user_id } }) : null;
    await this.repo.save(this.repo.create({
      actor_username: u?.username || 'system',
      actor_role: u?.role || 'system',
      action,
      target_type: null,
      target_id: null,
      detail: payload ?? null
    }));
  }

  async entry(e: {
    actor_username: string;
    actor_role: string;
    action: string;
    target_type?: string;
    target_id?: string;
    detail?: any;
  }): Promise<void> {
    await this.repo.save(this.repo.create({
      actor_username: e.actor_username || 'system',
      actor_role: e.actor_role || 'system',
      action: e.action,
      target_type: e.target_type || null,
      target_id: e.target_id || null,
      detail: e.detail ?? null
    }));
  }

  /** 倒序分页读取（PG 模式不做条数截断） */
  async list(limit = 200): Promise<AuditLogRow[]> {
    const rows = await this.repo.find({ order: { ts: 'DESC' }, take: Math.min(limit, 1000) });
    return rows.map(e => toRow(e) as AuditLogRow);
  }

  /** 服务端分页 + 筛选（action 精确；q 匹配操作人/对象/详情） */
  async listPaged(opts: { action?: string; q?: string; page?: number; pageSize?: number } = {}): Promise<{ items: AuditLogRow[]; total: number }> {
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize || 50));
    const qb = this.repo.createQueryBuilder('a').orderBy('a.ts', 'DESC');
    if (opts.action) qb.andWhere('a.action = :action', { action: opts.action });
    const kw = opts.q?.trim();
    if (kw) {
      qb.andWhere(
        '(a.actor_username ILIKE :kw OR a.target_id ILIKE :kw OR CAST(a.detail AS TEXT) ILIKE :kw)',
        { kw: `%${kw}%` }
      );
    }
    const [rows, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items: rows.map(e => toRow(e) as AuditLogRow), total };
  }
}

export class PgFeeRatesRepo {
  private repo: Repository<FeeRateEntity>;
  constructor(ds: DataSource) { this.repo = ds.getRepository(FeeRateEntity); }

  async findGlobal(): Promise<FeeRateRow | null> {
    const e = await this.repo.findOne({ where: { scope: 'global' } });
    return e ? (toRow(e) as FeeRateRow) : null;
  }
  async findClient(clientId: string): Promise<FeeRateRow | null> {
    const e = await this.repo.findOne({ where: { scope: 'client', client_id: clientId } });
    return e ? (toRow(e) as FeeRateRow) : null;
  }
  async findAll(): Promise<FeeRateRow[]> {
    return (await this.repo.find()).map(e => toRow(e) as FeeRateRow);
  }
  private async upsert(scope: 'global' | 'client', clientId: string | null, values: {
    ocean_freight_usd: number; port_fee_usd: number; br_clearance_brl: number; fx_rate: number;
    sales_tax_rate: number; sales_markup_rate: number; profit_brl: number;
  }, updatedBy: string): Promise<FeeRateRow> {
    let e = await this.repo.findOne({ where: { scope, client_id: clientId } as any });
    if (e) {
      Object.assign(e, values, { updated_by: updatedBy, updated_at: new Date() });
    } else {
      e = this.repo.create({ scope, client_id: clientId, ...values, updated_by: updatedBy, updated_at: new Date() });
    }
    return toRow(await this.repo.save(e)) as FeeRateRow;
  }
  upsertGlobal(values: {
    ocean_freight_usd: number; port_fee_usd: number; br_clearance_brl: number; fx_rate: number;
    sales_tax_rate: number; sales_markup_rate: number; profit_brl: number;
  }, updatedBy: string) {
    return this.upsert('global', null, values, updatedBy);
  }
  upsertClient(clientId: string, values: {
    ocean_freight_usd: number; port_fee_usd: number; br_clearance_brl: number; fx_rate: number;
    sales_tax_rate: number; sales_markup_rate: number; profit_brl: number;
  }, updatedBy: string) {
    return this.upsert('client', clientId, values, updatedBy);
  }
  async deleteClient(clientId: string): Promise<boolean> {
    const res = await this.repo.delete({ scope: 'client', client_id: clientId });
    return (res.affected ?? 0) > 0;
  }
  /** 费率解析：客户覆盖 > 全局默认 > 兜底 */
  async resolve(clientId?: string | null): Promise<{
    source: 'client' | 'global' | 'default';
    rates: {
      ocean_freight_usd: number; port_fee_usd: number; br_clearance_brl: number; fx_rate: number;
      sales_tax_rate: number; sales_markup_rate: number; profit_brl: number;
    };
  }> {
    const FALLBACK = {
      ocean_freight_usd: 1200, port_fee_usd: 130, br_clearance_brl: 0, fx_rate: 5.0,
      sales_tax_rate: 0.065, sales_markup_rate: 0.20, profit_brl: 30000
    };
    const rowRates = (row: FeeRateRow) => ({
      ocean_freight_usd: row.ocean_freight_usd, port_fee_usd: row.port_fee_usd,
      br_clearance_brl: row.br_clearance_brl, fx_rate: row.fx_rate,
      sales_tax_rate: Number(row.sales_tax_rate ?? 0.065),
      sales_markup_rate: Number(row.sales_markup_rate ?? 0.20),
      profit_brl: Number(row.profit_brl ?? 30000)
    });
    if (clientId) {
      const c = await this.findClient(clientId);
      if (c) return { source: 'client', rates: rowRates(c) };
    }
    const g = await this.findGlobal();
    if (g) return { source: 'global', rates: rowRates(g) };
    return { source: 'default', rates: FALLBACK };
  }
}

export class PgQuotesRepo {
  private repo: Repository<QuoteOrderEntity>;
  constructor(ds: DataSource) { this.repo = ds.getRepository(QuoteOrderEntity); }

  async find(opts: { where?: { client_id?: string; salesperson_id?: string } } = {}): Promise<QuoteOrderRow[]> {
    const where: any = {};
    if (opts.where?.client_id) where.client_id = opts.where.client_id;
    if (opts.where?.salesperson_id) where.salesperson_id = opts.where.salesperson_id;
    const rows = await this.repo.find({ where, order: { created_at: 'DESC' } });
    return rows.map(e => toRow(e) as QuoteOrderRow);
  }
  async findById(id: string): Promise<QuoteOrderRow | null> {
    const e = await this.repo.findOne({ where: { id } });
    return e ? (toRow(e) as QuoteOrderRow) : null;
  }

  /** 服务端分页 + 筛选（status/client_id 精确；q 匹配报价号/文件名；sales 归属过滤） */
  async findPaged(opts: {
    where?: { client_id?: string; salesperson_id?: string; status?: string };
    q?: string;
    sales?: { me: string; fallbackClientIds: string[] };
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ items: QuoteOrderRow[]; total: number }> {
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize || 20));
    const qb = this.repo.createQueryBuilder('q').orderBy('q.created_at', 'DESC');
    if (opts.where?.client_id) qb.andWhere('q.client_id = :cid', { cid: opts.where.client_id });
    if (opts.where?.salesperson_id) qb.andWhere('q.salesperson_id = :sid', { sid: opts.where.salesperson_id });
    if (opts.where?.status) qb.andWhere('q.status = :status', { status: opts.where.status });
    const kw = opts.q?.trim();
    if (kw) {
      qb.andWhere('(q.quote_no ILIKE :kw OR q.input_file_name ILIKE :kw)', { kw: `%${kw}%` });
    }
    if (opts.sales) {
      const { me, fallbackClientIds } = opts.sales;
      if (fallbackClientIds.length > 0) {
        qb.andWhere(
          '(q.salesperson_id = :me OR (q.salesperson_id IS NULL AND q.client_id IN (:...fallbackIds)))',
          { me, fallbackIds: fallbackClientIds }
        );
      } else {
        qb.andWhere('q.salesperson_id = :me', { me });
      }
    }
    const [rows, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items: rows.map(e => toRow(e) as QuoteOrderRow), total };
  }
  async insert(row: Omit<QuoteOrderRow, 'id' | 'created_at' | 'updated_at'>): Promise<QuoteOrderRow> {
    const e = await this.repo.save(this.repo.create(stripUndefined(row) as any));
    return toRow(e) as QuoteOrderRow;
  }
  async update(id: string, patch: Partial<QuoteOrderRow>): Promise<QuoteOrderRow | null> {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) return null;
    Object.assign(e, stripUndefined(patch));
    return toRow(await this.repo.save(e)) as QuoteOrderRow;
  }
}

export class PgImageRepo {
  private repo: Repository<ClientImageEntity>;
  constructor(ds: DataSource) { this.repo = ds.getRepository(ClientImageEntity); }

  async findByClient(clientId: string): Promise<ClientImageRow[]> {
    const rows = await this.repo.find({ where: { client_id: clientId }, order: { created_at: 'DESC' } });
    return rows.map(e => toRow(e) as ClientImageRow);
  }
  async findByQuote(quoteId: string): Promise<ClientImageRow[]> {
    const rows = await this.repo.find({ where: { quote_id: quoteId }, order: { created_at: 'DESC' } });
    return rows.map(e => toRow(e) as ClientImageRow);
  }
  async findAll(opts?: { client_id?: string; quote_id?: string }): Promise<ClientImageRow[]> {
    const where: any = {};
    if (opts?.client_id) where.client_id = opts.client_id;
    if (opts?.quote_id) where.quote_id = opts.quote_id;
    const rows = await this.repo.find({ where, order: { created_at: 'DESC' } });
    return rows.map(e => toRow(e) as ClientImageRow);
  }
  async findById(id: string): Promise<ClientImageRow | null> {
    const e = await this.repo.findOne({ where: { id } });
    return e ? (toRow(e) as ClientImageRow) : null;
  }

  /** 服务端分页 + 筛选（client_id/quote_id 精确，按创建时间倒序） */
  async findPaged(opts: { client_id?: string; quote_id?: string; page?: number; pageSize?: number } = {}): Promise<{ items: ClientImageRow[]; total: number }> {
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize || 24));
    const where: any = {};
    if (opts.client_id) where.client_id = opts.client_id;
    if (opts.quote_id) where.quote_id = opts.quote_id;
    const [rows, total] = await this.repo.findAndCount({
      where, order: { created_at: 'DESC' },
      skip: (page - 1) * pageSize, take: pageSize
    });
    return { items: rows.map(e => toRow(e) as ClientImageRow), total };
  }
  async insertMany(rows: Omit<ClientImageRow, 'id' | 'created_at'>[]): Promise<ClientImageRow[]> {
    const saved = await this.repo.save(rows.map(r => this.repo.create(stripUndefined(r) as DeepPartial<ClientImageEntity>)));
    return saved.map(e => toRow(e) as ClientImageRow);
  }
}

export class PgClientCnpjsRepo {
  private ds: DataSource;
  private repo: Repository<ClientCnpjEntity>;
  constructor(ds: DataSource) {
    this.ds = ds;
    this.repo = ds.getRepository(ClientCnpjEntity);
  }

  /** 某客户全部 CNPJ（默认在前，其余按创建时间） */
  async findByClient(clientId: string): Promise<ClientCnpjRow[]> {
    const rows = await this.repo.find({ where: { client_id: clientId }, order: { created_at: 'ASC' } });
    return rows
      .sort((a, b) => Number(b.is_default) - Number(a.is_default))
      .map(e => toRow(e) as ClientCnpjRow);
  }
  async findById(id: string): Promise<ClientCnpjRow | null> {
    const e = await this.repo.findOne({ where: { id } });
    return e ? (toRow(e) as ClientCnpjRow) : null;
  }
  /** 新增：首条自动默认；指定默认时取消同客户其他默认 */
  async insert(row: Omit<ClientCnpjRow, 'id' | 'created_at' | 'updated_at'>): Promise<ClientCnpjRow> {
    return this.ds.transaction(async (em) => {
      const repo = em.getRepository(ClientCnpjEntity);
      const others = await repo.find({ where: { client_id: row.client_id } });
      const isDefault = others.length === 0 ? true : row.is_default === true;
      if (isDefault) {
        for (const c of others) {
          if (c.is_default) { c.is_default = false; await repo.save(c); }
        }
      }
      const full = await repo.save(repo.create({ ...stripUndefined(row), is_default: isDefault } as any));
      return toRow(full) as ClientCnpjRow;
    });
  }
  /** 设为默认开票抬头（同客户其余全部取消默认）；找不到返回 null */
  async setDefault(clientId: string, id: string): Promise<ClientCnpjRow | null> {
    return this.ds.transaction(async (em) => {
      const repo = em.getRepository(ClientCnpjEntity);
      const rows = await repo.find({ where: { client_id: clientId } });
      const target = rows.find(c => c.id === id);
      if (!target) return null;
      for (const c of rows) {
        const nd = c.id === id;
        if (c.is_default !== nd) { c.is_default = nd; await repo.save(c); }
      }
      return toRow(target) as ClientCnpjRow;
    });
  }
  /** 删除；删除的是默认时自动把剩余第一条设为默认 */
  async deleteById(id: string): Promise<boolean> {
    return this.ds.transaction(async (em) => {
      const repo = em.getRepository(ClientCnpjEntity);
      const removed = await repo.findOne({ where: { id } });
      if (!removed) return false;
      await repo.remove(removed);
      if (removed.is_default) {
        const next = await repo.findOne({ where: { client_id: removed.client_id }, order: { created_at: 'ASC' } });
        if (next) { next.is_default = true; await repo.save(next); }
      }
      return true;
    });
  }
}

export class PgCustomsCnpjsRepo {
  private repo: Repository<CustomsCnpjEntity>;
  constructor(ds: DataSource) { this.repo = ds.getRepository(CustomsCnpjEntity); }

  async findAll(): Promise<CustomsCnpjRow[]> {
    const rows = await this.repo.find({ order: { created_at: 'DESC' } });
    return rows.map(e => toRow(e) as CustomsCnpjRow);
  }
  async findById(id: string): Promise<CustomsCnpjRow | null> {
    const e = await this.repo.findOne({ where: { id } });
    return e ? (toRow(e) as CustomsCnpjRow) : null;
  }
  async findByCnpj(cnpj: string): Promise<CustomsCnpjRow | null> {
    const e = await this.repo.findOne({ where: { cnpj } });
    return e ? (toRow(e) as CustomsCnpjRow) : null;
  }
  async insert(row: Omit<CustomsCnpjRow, 'id' | 'created_at' | 'updated_at'>): Promise<CustomsCnpjRow> {
    const e = await this.repo.save(this.repo.create(stripUndefined(row) as any));
    return toRow(e) as CustomsCnpjRow;
  }
  async update(id: string, patch: Partial<CustomsCnpjRow>): Promise<CustomsCnpjRow | null> {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) return null;
    Object.assign(e, stripUndefined(patch));
    return toRow(await this.repo.save(e)) as CustomsCnpjRow;
  }
}

export class PgProductCatalogRepo {
  private repo: Repository<ProductCatalogEntity>;
  constructor(ds: DataSource) { this.repo = ds.getRepository(ProductCatalogEntity); }

  async findBySku(skuKey: string): Promise<ProductCatalogRow | null> {
    const e = await this.repo.findOne({ where: { sku_key: skuKey } });
    return e ? (toRow(e) as ProductCatalogRow) : null;
  }
  async findById(id: string): Promise<ProductCatalogRow | null> {
    const e = await this.repo.findOne({ where: { id } });
    return e ? (toRow(e) as ProductCatalogRow) : null;
  }
  async upsertBySku(skuKey: string, patch: Partial<ProductCatalogRow>): Promise<ProductCatalogRow> {
    let e = await this.repo.findOne({ where: { sku_key: skuKey } });
    if (e) {
      const { id, created_at } = e;
      Object.assign(e, stripUndefined(patch), { id, sku_key: skuKey, created_at });
    } else {
      e = this.repo.create({
        ...stripUndefined(patch),
        sku_key: skuKey,
        sku: patch.sku ?? skuKey,
        ncm_sources: patch.ncm_sources ?? [],
        image_ids: patch.image_ids ?? []
      } as DeepPartial<ProductCatalogEntity>);
    }
    return toRow(await this.repo.save(e)) as ProductCatalogRow;
  }
  async list(opts: { q?: string; page?: number; pageSize?: number } = {}): Promise<{
    items: ProductCatalogRow[]; total: number; page: number; pageSize: number;
  }> {
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize || 20));
    const qb = this.repo.createQueryBuilder('p').orderBy('p.updated_at', 'DESC');
    const kw = opts.q?.trim();
    if (kw) {
      qb.andWhere('(p.sku ILIKE :kw OR p.product_cn ILIKE :kw OR p.product_en ILIKE :kw OR p.ncm ILIKE :kw)', { kw: `%${kw}%` });
    }
    const [rows, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items: rows.map(e => toRow(e) as ProductCatalogRow), total, page, pageSize };
  }
  async update(id: string, patch: Partial<ProductCatalogRow>): Promise<ProductCatalogRow | null> {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) return null;
    Object.assign(e, stripUndefined(patch));
    return toRow(await this.repo.save(e)) as ProductCatalogRow;
  }
}

export class PgOrderFilesRepo {
  private repo: Repository<OrderFileEntity>;
  constructor(ds: DataSource) { this.repo = ds.getRepository(OrderFileEntity); }

  async findByQuote(quoteId: string): Promise<OrderFileRow[]> {
    const rows = await this.repo.find({ where: { quote_id: quoteId }, order: { created_at: 'DESC' } });
    return rows.map(e => toRow(e) as OrderFileRow);
  }
  async findById(id: string): Promise<OrderFileRow | null> {
    const e = await this.repo.findOne({ where: { id } });
    return e ? (toRow(e) as OrderFileRow) : null;
  }
  async insertMany(rows: Omit<OrderFileRow, 'id' | 'created_at'>[]): Promise<OrderFileRow[]> {
    const saved = await this.repo.save(rows.map(r => this.repo.create(stripUndefined(r) as DeepPartial<OrderFileEntity>)));
    return saved.map(e => toRow(e) as OrderFileRow);
  }
  async deleteById(id: string): Promise<boolean> {
    const res = await this.repo.delete({ id });
    return (res.affected ?? 0) > 0;
  }
}

export class PgPaymentsRepo {
  private repo: Repository<PaymentRecordEntity>;
  constructor(ds: DataSource) { this.repo = ds.getRepository(PaymentRecordEntity); }

  async findAll(): Promise<PaymentRow[]> {
    const rows = await this.repo.find({ order: { paid_at: 'DESC' } });
    return rows.map(e => toRow(e) as PaymentRow);
  }
  async findByQuote(quoteId: string): Promise<PaymentRow[]> {
    const rows = await this.repo.find({ where: { quote_id: quoteId }, order: { paid_at: 'DESC' } });
    return rows.map(e => toRow(e) as PaymentRow);
  }
  async insert(row: Omit<PaymentRow, 'id' | 'created_at'>): Promise<PaymentRow> {
    const e = await this.repo.save(this.repo.create(stripUndefined(row) as DeepPartial<PaymentRecordEntity>));
    return toRow(e) as PaymentRow;
  }
  async deleteById(id: string): Promise<boolean> {
    const res = await this.repo.delete({ id });
    return (res.affected ?? 0) > 0;
  }
}

export class PgAiConfigRepo {
  private repo: Repository<AiConfigEntity>;
  constructor(ds: DataSource) { this.repo = ds.getRepository(AiConfigEntity); }

  async get(): Promise<AiConfigRow | null> {
    const e = await this.repo.findOne({ where: { id: 'default' } });
    return e ? (toRow(e) as AiConfigRow) : null;
  }
  async upsert(values: { base_url: string; api_key?: string; model: string; timeout_ms: number }, updatedBy: string): Promise<AiConfigRow> {
    let e = await this.repo.findOne({ where: { id: 'default' } });
    if (e) {
      e.base_url = values.base_url;
      if (values.api_key) e.api_key = values.api_key;
      e.model = values.model;
      e.timeout_ms = values.timeout_ms;
      e.updated_by = updatedBy;
      e.updated_at = new Date();
    } else {
      e = this.repo.create({
        id: 'default',
        base_url: values.base_url,
        api_key: values.api_key || '',
        model: values.model,
        timeout_ms: values.timeout_ms,
        updated_by: updatedBy,
        updated_at: new Date()
      });
    }
    return toRow(await this.repo.save(e)) as AiConfigRow;
  }
  async resolve(defaultModel: string, defaultTimeoutMs: number): Promise<ResolvedAiConfig> {
    return resolveAiConfig(await this.get(), process.env, defaultModel, defaultTimeoutMs);
  }
}

export class PgHelpArticlesRepo {
  private repo: Repository<HelpArticleEntity>;
  constructor(ds: DataSource) { this.repo = ds.getRepository(HelpArticleEntity); }

  async findAll(app?: 'client' | 'ops'): Promise<HelpArticleRow[]> {
    const rows = await this.repo.find({ where: app ? { app } : {}, order: { app: 'ASC', sort_order: 'ASC', created_at: 'ASC' } });
    return rows.map(e => toRow(e) as HelpArticleRow);
  }
  async findPublished(app: 'client' | 'ops'): Promise<HelpArticleRow[]> {
    const rows = await this.repo.find({ where: { app, published: true }, order: { sort_order: 'ASC', created_at: 'ASC' } });
    return rows.map(e => toRow(e) as HelpArticleRow);
  }
  async findById(id: string): Promise<HelpArticleRow | null> {
    const e = await this.repo.findOne({ where: { id } });
    return e ? (toRow(e) as HelpArticleRow) : null;
  }
  async findBySlug(app: 'client' | 'ops', slug: string): Promise<HelpArticleRow | null> {
    const e = await this.repo.findOne({ where: { app, slug } });
    return e ? (toRow(e) as HelpArticleRow) : null;
  }
  async insert(row: Omit<HelpArticleRow, 'id' | 'created_at' | 'updated_at'>): Promise<HelpArticleRow> {
    const e = await this.repo.save(this.repo.create(stripUndefined(row) as any));
    return toRow(e) as HelpArticleRow;
  }
  async update(id: string, patch: Partial<HelpArticleRow>): Promise<HelpArticleRow | null> {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) return null;
    Object.assign(e, stripUndefined(patch));
    return toRow(await this.repo.save(e)) as HelpArticleRow;
  }
  async deleteById(id: string): Promise<boolean> {
    const res = await this.repo.delete({ id });
    return (res.affected ?? 0) > 0;
  }
}
