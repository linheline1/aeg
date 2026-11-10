/**
 * 极简内存数据库：进程内 Map 存数据 + 可选 JSON 持久化。
 * 本地预览用；VPS 部署到 PostgreSQL 时切回 TypeORM。
 * 依赖：零（仅 Node 内置 fs + path）
 */
import fs from 'fs';
import path from 'path';
import * as crypto from 'crypto';

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: 'admin' | 'operator' | 'sales' | 'customs' | 'client';
  client_id?: string;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

export interface ClientRow {
  id: string;
  name: string;
  china_company_name?: string | null;
  china_uscc?: string | null;
  verification_status?: 'pending' | 'approved' | 'rejected';
  verification_note?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  license_file_path?: string | null;
  license_file_name?: string | null;
  license_mime_type?: string | null;
  license_size_bytes?: number | null;
  status: 'active' | 'disabled';
  /** 归属业务员（M4：客户维度默认业务员，该客户新报价自动继承） */
  salesperson_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateRow {
  id: string;
  template_code: string;
  version_no: string;
  file_path: string;
  file_hash: string;
  schema_json: Record<string, any>;
  meta_json: Record<string, any>;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface QuoteOrderRow {
  id: string;
  quote_no: string;
  client_id: string;
  template_code: string;
  template_version: string;
  status: 'uploaded' | 'validating' | 'pending_fee' | 'computing' | 'done' | 'failed';
  total_amount_brl: number | null;
  total_amount_usd: number | null;
  input_file_name: string | null;
  input_file_path?: string | null;
  total_cbm?: number | null;
  total_gw_kg?: number | null;
  total_amount_rmb?: number | null;
  total_rows?: number | null;
  valid_rows?: number | null;
  /** 结构化 DDP 费用分项（运营端看报价体系） */
  pricing_breakdown?: {
    currency: 'USD' | 'BRL';
    fx_rate?: number;
    items: { code: string; name: string; amount: number; note?: string }[];
    total: number;
    is_reference?: boolean;
    calculation_version?: string;
    merchandise_brl?: number;
    di_brl?: number;
    di_review_version?: number | null;
    sales_markup_rate?: number;
    sales_markup_brl?: number;
    tax_base_brl?: number;
    sales_tax_rate?: number;
    sales_tax_brl?: number;
    profit_brl?: number;
    ocean_freight_brl?: number;
    port_fee_brl?: number;
    brazil_total_brl?: number;
    generated_at?: string;
  } | null;
  /** 解析后的 Excel 行数据（运营端看客户填写内容） */
  line_items?: any[] | null;
  /** 归属业务员（上传时从客户维度继承，运营端可改派；null=未分配） */
  salesperson_id?: string | null;
  /** 成交状态（M4）：null=未标记 open=跟进中 won=已成交 lost=未成交，仅 done 报价可标记 */
  deal_status?: 'open' | 'won' | 'lost' | null;
  /** 成交/未成交备注（如未成交原因） */
  deal_note?: string | null;
  /** 成交标记时间 */
  deal_closed_at?: string | null;
  shipment?: {
    vessel?: string | null;
    voyage?: string | null;
    bill_no?: string | null;
    container_no?: string | null;
    pol?: string | null;
    pod?: string | null;
    etd?: string | null;
    eta?: string | null;
    remark?: string | null;
    events?: { id: string; stage: string; note?: string | null; happened_at: string; created_by?: string }[];
    updated_by?: string;
    updated_at?: string;
  } | null;
  converted_by_ai?: boolean;
  declared_currency?: 'RMB' | 'USD';
  ai_notes?: string | null;
  di_analysis?: Record<string, any> | null;
  /** DI 复核的完整不可变版本快照 */
  di_review_versions?: Record<string, any>[] | null;
  customs_review?: {
    status: 'pending' | 'approved' | 'changes_requested';
    di_review_version?: number | null;
    total_di_brl?: number | null;
    note?: string | null;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
  } | null;
  /** M9：开票 CNPJ 快照（客户在订单上选择的开票抬头，删除 CNPJ 不影响已绑定订单） */
  invoice_cnpj?: { id: string; cnpj: string; company_name: string; ie?: string | null } | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** 费率表：全局默认 + 按客户覆盖（M2） */
export interface FeeRateRow {
  id: string;
  scope: 'global' | 'client';
  client_id: string | null;
  ocean_freight_usd: number;
  port_fee_usd: number;
  br_clearance_brl: number;
  fx_rate: number;
  sales_tax_rate: number;
  sales_markup_rate: number;
  profit_brl: number;
  updated_by: string;
  updated_at: string;
}

/** 客户上传图片（货物照片等资料，M5；M6 关联订单 = Excel 明细截图） */
export interface ClientImageRow {
  id: string;
  client_id: string;
  /** 关联报价订单（客户填写明细的截图）；null=未关联 */
  quote_id?: string | null;
  /** 关联明细行号（quote.line_items[].row_no）；null=未关联到行（整单维度） */
  row_no?: number | null;
  file_name: string;
  /** 相对仓库根的存储路径 apps/api/uploads/images/xxx.ext */
  file_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

/** 客户开票 CNPJ（M9：一个客户可维护多个巴西公司税号，订单绑定其一开票） */
export interface ClientCnpjRow {
  id: string;
  client_id: string;
  /** 14 位税号（格式化 xx.xxx.xxx/xxxx-xx） */
  cnpj: string;
  /** 公司名称（发票抬头） */
  company_name: string;
  ie?: string | null;
  nome_fantasia?: string | null;
  situacao_cadastral?: string | null;
  endereco?: {
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    municipio?: string | null;
    uf?: string | null;
    cep?: string | null;
  } | null;
  registry_snapshot?: Record<string, any> | null;
  queried_at?: string | null;
  /** 是否默认开票抬头 */
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomsCnpjRow {
  id: string;
  cnpj: string;
  company_name: string;
  status: 'active' | 'disabled';
  quota_limit_usd: number;
  quota_used_usd: number;
  cert_a1_file_path?: string | null;
  cert_a1_file_name?: string | null;
  cert_a1_mime_type?: string | null;
  cert_a1_size_bytes?: number | null;
  cert_a1_uploaded_at?: string | null;
  ecpf_file_path?: string | null;
  ecpf_file_name?: string | null;
  ecpf_mime_type?: string | null;
  ecpf_size_bytes?: number | null;
  ecpf_uploaded_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** 订单交付文件（M8：运营上传的放行截图 / 发票 PDF，客户查看下载） */
export interface OrderFileRow {
  id: string;
  quote_id: string;
  kind: 'clearance_shot' | 'invoice' | 'other';
  file_name: string;
  /** 相对仓库根的存储路径 apps/api/uploads/orderfiles/xxx.ext */
  file_path: string;
  mime_type: string;
  size_bytes: number;
  note: string | null;
  uploaded_by: string;
  created_at: string;
}

/** 审计日志（M2） */
export interface AuditLogRow {
  id: string;
  ts: string;
  actor_username: string;
  actor_role: string;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  detail?: any;
}

/** 回款记录（M10 财务：done 订单的应收分期回款登记） */
export interface PaymentRow {
  id: string;
  quote_id: string;
  /** 回款金额（BRL） */
  amount_brl: number;
  /** 回款日期（YYYY-MM-DD） */
  paid_at: string;
  note: string | null;
  /** 登记人用户名 */
  created_by: string;
  created_at: string;
}

export interface HelpArticleRow {
  id: string;
  app: 'client' | 'ops';
  category: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  published: boolean;
  featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** AI 模型 API 配置（单行，管理端运行时维护，环境变量兜底） */
export interface AiConfigRow {
  id: string;
  /** 配置名称（如「生产 Key」「备用线路」），供管理端多配置选择 */
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  timeout_ms: number;
  /** 是否为当前启用的配置（同一时刻最多一条 active） */
  active: boolean;
  updated_by: string;
  updated_at: string;
}

/** 服务实际使用的解析后配置 */
export interface ResolvedAiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  source: 'db' | 'env' | 'default';
}

/** 配置解析：数据库行 > 环境变量 > 内置默认 */
export function resolveAiConfig(
  row: AiConfigRow | null,
  env: NodeJS.ProcessEnv,
  defaultModel: string,
  defaultTimeoutMs: number
): ResolvedAiConfig {
  const baseUrl = (row?.base_url || env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey = row?.api_key || env.AI_API_KEY || '';
  let model = row?.model || env.AI_MODEL || defaultModel;
  if (model === 'deepseek' || model === 'deepseek-chat') model = 'deepseek-flash';
  const rowTimeout = Number(row?.timeout_ms);
  const timeoutMs = Number.isFinite(rowTimeout) && rowTimeout > 0
    ? rowTimeout
    : (Number(env.AI_TIMEOUT_MS) || defaultTimeoutMs);
  const source = row && (row.base_url || row.api_key || row.model)
    ? 'db'
    : (env.AI_API_KEY || env.AI_BASE_URL || env.AI_MODEL ? 'env' : 'default');
  return { baseUrl, apiKey, model, timeoutMs, source };
}

/** 产品目录（按 SKU 归档 AI 识别结果与 NCM 复核） */
export interface ProductCatalogRow {
  id: string;
  sku_key: string;
  sku: string;
  product_cn?: string | null;
  product_en?: string | null;
  description?: string | null;
  material?: string | null;
  base_unit_price_rmb?: number | null;
  ncm?: string | null;
  ncm_confidence?: number | null;
  ncm_rationale?: string | null;
  ncm_sources: string[];
  tax_rates?: {
    ii_rate?: number | null;
    ipi_rate?: number | null;
    pis_rate?: number | null;
    cofins_rate?: number | null;
  } | null;
  image_ids: string[];
  last_quote_id?: string | null;
  last_client_id?: string | null;
  ncm_reviewed_by?: string | null;
  ncm_reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerRow {
  id: string;
  /** 分类：carrier=海运承运商；ecosystem=生态合作伙伴 */
  category: 'carrier' | 'ecosystem';
  name: string;
  /** 相对仓库根的 logo 存储路径 apps/api/uploads/partners/xxx.svg */
  logo_file_path: string;
  logo_mime_type: string;
  logo_size_bytes: number;
  /** 官网链接（落地页点击 logo 跳转；空串表示未设置） */
  website_url: string;
  created_at: string;
}

interface DBSnapshot {
  users: UserRow[];
  clients: ClientRow[];
  templates: TemplateRow[];
  quotes: QuoteOrderRow[];
  fee_rates: FeeRateRow[];
  audit_logs: AuditLogRow[];
  client_images?: ClientImageRow[];
  client_cnpjs?: ClientCnpjRow[];
  customs_cnpjs?: CustomsCnpjRow[];
  order_files?: OrderFileRow[];
  payments?: PaymentRow[];
  help_articles?: HelpArticleRow[];
  ai_config?: AiConfigRow[];
  product_catalog?: ProductCatalogRow[];
  partners?: PartnerRow[];
}

/** 仓库根目录（以 pnpm-workspace.yaml 为标记向上查找，不依赖 process.cwd()） */
export function repoRoot(): string {
  let dir = path.resolve(__dirname);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..', '..', '..');
}

const DB_PATH = path.join(repoRoot(), 'apps/api/data/dev.json');

function load(): DBSnapshot {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    return {
      users: [], clients: [], templates: [], quotes: [],
      fee_rates: [], audit_logs: [], ...raw,
      client_images: (raw as any).client_images || [],
      client_cnpjs: (raw as any).client_cnpjs || [],
      customs_cnpjs: ((raw as any).customs_cnpjs || []).map((row: any) => ({
        ...row,
        quota_limit_usd: row.quota_limit_usd ?? row.quota_limit_brl ?? 0,
        quota_used_usd: row.quota_used_usd ?? row.quota_used_brl ?? 0
      })),
      order_files: (raw as any).order_files || [],
      payments: (raw as any).payments || [],
      ai_config: ((raw as any).ai_config || []).map((row: any, i: number) => ({
        ...row,
        name: row.name || (i === 0 ? '默认配置' : `配置 ${i + 1}`),
        active: row.active ?? i === 0
      }))
    };
  } catch {
    return { users: [], clients: [], templates: [], quotes: [], fee_rates: [], audit_logs: [], client_images: [], client_cnpjs: [], customs_cnpjs: [], order_files: [], payments: [], ai_config: [] };
  }
}

function save(db: DBSnapshot) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function uid() {
  return crypto.randomUUID();
}

// === seed ===
import * as bcrypt from 'bcrypt';
import { HELP_ARTICLE_SEED } from './help-seed';

export async function seedIfEmpty() {
  const db = load();
  let changed = false;

  if (db.clients.length === 0) {
    db.clients.push({
      id: uid(),
      name: '示例客户 A',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    changed = true;
  }
  const clientId = db.clients[0].id;

  if (db.users.length === 0) {
    const mk = async (u: string, p: string, r: 'admin' | 'operator' | 'client', cid?: string) => ({
      id: uid(),
      username: u,
      password_hash: await bcrypt.hash(p, 12),
      role: r,
      client_id: cid,
      status: 'active' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    db.users.push(await mk('admin', 'admin123', 'admin'));
    db.users.push(await mk('operator', 'operator123', 'operator'));
    db.users.push(await mk('client_a', 'client123', 'client', clientId));
    changed = true;
  }

  // === M4：业务员账号（sales01）—— 老库也自动补齐，不重置已有业务员 ===
  if (db.users.filter(u => u.role === 'sales').length === 0) {
    db.users.push({
      id: uid(),
      username: 'sales01',
      password_hash: await bcrypt.hash('sales123', 12),
      role: 'sales',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    changed = true;
  }
  if (db.users.filter(u => u.role === 'customs').length === 0) {
    db.users.push({
      id: uid(),
      username: 'customs01',
      password_hash: await bcrypt.hash('customs123', 12),
      role: 'customs',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    changed = true;
  }

  // 示例客户默认归属 sales01（仅当未设置时）
  const salesUser = db.users.find(u => u.role === 'sales');
  if (salesUser && db.clients.length > 0 && !db.clients[0].salesperson_id) {
    db.clients[0].salesperson_id = salesUser.id;
    changed = true;
  }

  if (db.templates.filter(t => t.version_no === '2.0').length === 0) {
    let fileHash = '';
    const tplPath = path.join(
      repoRoot(),
      'apps/api/uploads/templates/巴西整柜装箱清单_模板_v2.0.xlsx'
    );
    if (fs.existsSync(tplPath)) {
      fileHash = crypto.createHash('sha256').update(fs.readFileSync(tplPath)).digest('hex');
    }
    db.templates.push({
      id: uid(),
      template_code: 'BR_FCL',
      version_no: '2.0',
      file_path: 'apps/api/uploads/templates/巴西整柜装箱清单_模板_v2.0.xlsx',
      file_hash: fileHash,
      schema_json: {},
      meta_json: {
        template_id: 'BR_FCL',
        version: '2.0',
        schema_hash: '',
        published_at: new Date().toISOString(),
        min_rows: 1,
        max_rows: 100
      },
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    changed = true;
  }

  // === quotes: 给 client_a 造几个示范订单 ===
  if (db.quotes.filter(q => q.client_id === clientId).length === 0) {
    const now = () => new Date().toISOString();
    db.quotes.push(
      {
        id: uid(),
        quote_no: 'Q-2026-0915-001',
        client_id: clientId,
        template_code: 'BR_FCL',
        template_version: '2.0',
        status: 'done',
        total_amount_brl: 187420.55,
        total_amount_usd: 37484.11,
        input_file_name: '装箱清单_A_0912.xlsx',
        error_message: null,
        created_at: new Date(Date.now() - 7 * 864e5).toISOString(),
        updated_at: new Date(Date.now() - 6 * 864e5).toISOString()
      },
      {
        id: uid(),
        quote_no: 'Q-2026-1003-002',
        client_id: clientId,
        template_code: 'BR_FCL',
        template_version: '2.0',
        status: 'computing',
        total_amount_brl: null,
        total_amount_usd: null,
        input_file_name: '装箱清单_B_1001.xlsx',
        error_message: null,
        created_at: new Date(Date.now() - 2 * 864e5).toISOString(),
        updated_at: now()
      },
      {
        id: uid(),
        quote_no: 'Q-2026-1020-003',
        client_id: clientId,
        template_code: 'BR_FCL',
        template_version: '2.0',
        status: 'pending_fee',
        total_amount_brl: null,
        total_amount_usd: null,
        input_file_name: '装箱清单_C_1018.xlsx',
        error_message: '缺少部分目的地费用行，请在运营端补充',
        created_at: new Date(Date.now() - 1 * 864e5).toISOString(),
        updated_at: now()
      }
    );
    changed = true;
  }

  // === 费率表：全局默认（M2） ===
  if (db.fee_rates.filter(r => r.scope === 'global').length === 0) {
    db.fee_rates.push({
      id: uid(),
      scope: 'global',
      client_id: null,
      ocean_freight_usd: 1200,
      port_fee_usd: 130,
      br_clearance_brl: 0,
      fx_rate: 5.0,
      sales_tax_rate: 0.065,
      sales_markup_rate: 0.20,
      profit_brl: 30000,
      updated_by: 'system',
      updated_at: new Date().toISOString()
    });
    changed = true;
  }

  if (!db.help_articles) db.help_articles = [];
  for (const article of HELP_ARTICLE_SEED) {
    const existing = db.help_articles.find(row => row.app === article.app && row.slug === article.slug);
    if (existing) {
      const corpus = `${existing.title}\n${existing.summary}\n${existing.content}`;
      const obsoletePriceWording = /最终报价|巴西清关价格/.test(corpus)
        || (article.slug === 'ddp-reference-price' && /固定利润|20% 税基利润加成/.test(corpus))
        || ([
          'order-review-and-publish', 'rates-and-template'
        ].includes(article.slug) && !corpus.includes('20%'));
      if (obsoletePriceWording) {
        Object.assign(existing, {
          title: article.title,
          summary: article.summary,
          content: article.content,
          updated_at: new Date().toISOString()
        });
        changed = true;
      }
      continue;
    }
    const now = new Date().toISOString();
    db.help_articles.push({ ...article, id: uid(), created_at: now, updated_at: now });
    changed = true;
  }

  if (changed) save(db);
  console.log(`📦 MockDB loaded: ${DB_PATH}`);
  console.log(`   users=${db.users.length} clients=${db.clients.length} templates=${db.templates.length} fee_rates=${db.fee_rates.length}`);
}

// === repositories (minimal) ===
export class UserRepo {
  findOne(opts: { where?: { username?: string; id?: string; client_id?: string } }) {
    const db = load();
    if (opts.where?.username) return Promise.resolve(db.users.find(u => u.username === opts.where!.username) || null);
    if (opts.where?.id) return Promise.resolve(db.users.find(u => u.id === opts.where!.id) || null);
    if (opts.where?.client_id) return Promise.resolve(db.users.find(u => u.client_id === opts.where!.client_id) || null);
    return Promise.resolve(null);
  }
  findAll() {
    const db = load();
    return Promise.resolve(db.users.slice());
  }
  insert(row: Omit<UserRow, 'id' | 'created_at' | 'updated_at'>) {
    const db = load();
    const now = new Date().toISOString();
    const full: UserRow = { ...row, id: uid(), created_at: now, updated_at: now };
    db.users.push(full);
    save(db);
    return Promise.resolve(full);
  }
  update(id: string, patch: Partial<UserRow>) {
    const db = load();
    const idx = db.users.findIndex(u => u.id === id);
    if (idx < 0) return Promise.resolve(null);
    db.users[idx] = { ...db.users[idx], ...patch, updated_at: new Date().toISOString() };
    save(db);
    return Promise.resolve(db.users[idx]);
  }
}

export class ClientRepo {
  findOne(opts: { where?: { id?: string } }) {
    const db = load();
    return Promise.resolve(db.clients.find(c => c.id === opts.where?.id) || null);
  }
  findAll() {
    const db = load();
    return Promise.resolve(db.clients.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }
  insert(row: Omit<ClientRow, 'id' | 'created_at' | 'updated_at'>) {
    const db = load();
    const now = new Date().toISOString();
    const full: ClientRow = { ...row, id: uid(), created_at: now, updated_at: now };
    db.clients.push(full);
    save(db);
    return Promise.resolve(full);
  }
  update(id: string, patch: Partial<ClientRow>) {
    const db = load();
    const idx = db.clients.findIndex(c => c.id === id);
    if (idx < 0) return Promise.resolve(null);
    db.clients[idx] = { ...db.clients[idx], ...patch, updated_at: new Date().toISOString() };
    save(db);
    return Promise.resolve(db.clients[idx]);
  }
}

export class TemplateRepo {
  findOne(opts: { where?: { status?: string; version_no?: string; id?: string } }) {
    const db = load();
    const { where } = opts;
    if (where?.status === 'active') return Promise.resolve(db.templates.find(t => t.status === 'active') || null);
    if (where?.version_no) return Promise.resolve(db.templates.find(t => t.version_no === where!.version_no) || null);
    if (where?.id) return Promise.resolve(db.templates.find(t => t.id === where!.id) || null);
    return Promise.resolve(null);
  }
  find() {
    const db = load();
    return Promise.resolve(db.templates.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }
}

export class AuditRepo {
  /** 写入审计日志。兼容旧签名 log(action, payload, user_id)；推荐用 entry() */
  async log(action: string, payload?: any, user_id?: string) {
    const db = load();
    const u = user_id ? db.users.find(x => x.id === user_id) : null;
    db.audit_logs.push({
      id: uid(),
      ts: new Date().toISOString(),
      actor_username: u?.username || 'system',
      actor_role: u?.role || 'system',
      action,
      target_type: null,
      target_id: null,
      detail: payload ?? null
    });
    if (db.audit_logs.length > 2000) db.audit_logs = db.audit_logs.slice(-2000);
    save(db);
  }

  /** 结构化写入（M2 费率/订单/状态变更） */
  async entry(e: {
    actor_username: string;
    actor_role: string;
    action: string;
    target_type?: string;
    target_id?: string;
    detail?: any;
  }) {
    const db = load();
    db.audit_logs.push({
      id: uid(),
      ts: new Date().toISOString(),
      actor_username: e.actor_username || 'system',
      actor_role: e.actor_role || 'system',
      action: e.action,
      target_type: e.target_type || null,
      target_id: e.target_id || null,
      detail: e.detail ?? null
    });
    if (db.audit_logs.length > 2000) db.audit_logs = db.audit_logs.slice(-2000);
    save(db);
  }

  /** 倒序分页读取 */
  async list(limit = 200) {
    const db = load();
    return db.audit_logs
      .slice()
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, Math.min(limit, 1000));
  }

  /** 服务端分页 + 筛选（action 精确；q 匹配操作人/对象/详情） */
  listPaged(opts: { action?: string; q?: string; page?: number; pageSize?: number } = {}): Promise<{ items: AuditLogRow[]; total: number }> {
    const db = load();
    const kw = opts.q?.trim().toLowerCase();
    let rows = db.audit_logs.slice();
    if (opts.action) rows = rows.filter(a => a.action === opts.action);
    if (kw) {
      rows = rows.filter(a =>
        JSON.stringify([a.actor_username, a.target_id, a.detail]).toLowerCase().includes(kw));
    }
    rows.sort((a, b) => b.ts.localeCompare(a.ts));
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize || 50));
    return Promise.resolve({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length });
  }
}

const FEE_RATE_FALLBACK = {
  ocean_freight_usd: 1200,
  port_fee_usd: 130,
  br_clearance_brl: 0,
  fx_rate: 5.0,
  sales_tax_rate: 0.065,
  sales_markup_rate: 0.20,
  profit_brl: 30000
};

function normalizeFeeRate(row: FeeRateRow): FeeRateRow {
  return {
    ...row,
    sales_tax_rate: Number.isFinite(Number(row.sales_tax_rate)) ? Number(row.sales_tax_rate) : FEE_RATE_FALLBACK.sales_tax_rate,
    sales_markup_rate: Number.isFinite(Number(row.sales_markup_rate)) ? Number(row.sales_markup_rate) : FEE_RATE_FALLBACK.sales_markup_rate,
    profit_brl: Number.isFinite(Number(row.profit_brl)) ? Number(row.profit_brl) : FEE_RATE_FALLBACK.profit_brl
  };
}

export class FeeRatesRepo {
  findGlobal(): Promise<FeeRateRow | null> {
    const db = load();
    const row = db.fee_rates.find(r => r.scope === 'global');
    return Promise.resolve(row ? normalizeFeeRate(row) : null);
  }
  findClient(clientId: string): Promise<FeeRateRow | null> {
    const db = load();
    const row = db.fee_rates.find(r => r.scope === 'client' && r.client_id === clientId);
    return Promise.resolve(row ? normalizeFeeRate(row) : null);
  }
  findAll(): Promise<FeeRateRow[]> {
    const db = load();
    return Promise.resolve(db.fee_rates.map(normalizeFeeRate));
  }
  private upsert(scope: 'global' | 'client', clientId: string | null, values: {
    ocean_freight_usd: number; port_fee_usd: number; br_clearance_brl: number; fx_rate: number;
    sales_tax_rate: number; sales_markup_rate: number; profit_brl: number;
  }, updatedBy: string): Promise<FeeRateRow> {
    const db = load();
    const row = db.fee_rates.find(r => r.scope === scope && r.client_id === clientId);
    const now = new Date().toISOString();
    if (row) {
      Object.assign(row, values, { updated_by: updatedBy, updated_at: now });
      save(db);
      return Promise.resolve(row);
    }
    const full: FeeRateRow = { id: uid(), scope, client_id: clientId, ...values, updated_by: updatedBy, updated_at: now };
    db.fee_rates.push(full);
    save(db);
    return Promise.resolve(full);
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
    const db = load();
    const idx = db.fee_rates.findIndex(r => r.scope === 'client' && r.client_id === clientId);
    if (idx < 0) return false;
    db.fee_rates.splice(idx, 1);
    save(db);
    return true;
  }
  /** 费率解析：客户覆盖 > 全局默认 */
  async resolve(clientId?: string | null): Promise<{
    source: 'client' | 'global' | 'default';
    rates: {
      ocean_freight_usd: number; port_fee_usd: number; br_clearance_brl: number; fx_rate: number;
      sales_tax_rate: number; sales_markup_rate: number; profit_brl: number;
    };
  }> {
    if (clientId) {
      const c = await this.findClient(clientId);
      if (c) return {
        source: 'client',
        rates: {
          ocean_freight_usd: c.ocean_freight_usd, port_fee_usd: c.port_fee_usd,
          br_clearance_brl: c.br_clearance_brl, fx_rate: c.fx_rate,
          sales_tax_rate: c.sales_tax_rate, sales_markup_rate: c.sales_markup_rate, profit_brl: c.profit_brl
        }
      };
    }
    const g = await this.findGlobal();
    if (g) return {
      source: 'global',
      rates: {
        ocean_freight_usd: g.ocean_freight_usd, port_fee_usd: g.port_fee_usd,
        br_clearance_brl: g.br_clearance_brl, fx_rate: g.fx_rate,
        sales_tax_rate: g.sales_tax_rate, sales_markup_rate: g.sales_markup_rate, profit_brl: g.profit_brl
      }
    };
    return { source: 'default', rates: FEE_RATE_FALLBACK };
  }
}

export class QuotesRepo {
  find(opts: { where?: { client_id?: string; salesperson_id?: string } } = {}) {
    const db = load();
    let rows = db.quotes.slice();
    if (opts.where?.client_id) rows = rows.filter(q => q.client_id === opts.where!.client_id);
    if (opts.where?.salesperson_id) rows = rows.filter(q => q.salesperson_id === opts.where!.salesperson_id);
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return Promise.resolve(rows);
  }
  findById(id: string) {
    const db = load();
    return Promise.resolve(db.quotes.find(q => q.id === id) || null);
  }

  /** 服务端分页 + 筛选（status/client_id 精确；q 匹配报价号/文件名；sales 归属过滤） */
  findPaged(opts: {
    where?: { client_id?: string; salesperson_id?: string; status?: string };
    q?: string;
    sales?: { me: string; fallbackClientIds: string[] };
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ items: QuoteOrderRow[]; total: number }> {
    const db = load();
    let rows = db.quotes.slice();
    if (opts.where?.client_id) rows = rows.filter(q => q.client_id === opts.where!.client_id);
    if (opts.where?.salesperson_id) rows = rows.filter(q => q.salesperson_id === opts.where!.salesperson_id);
    if (opts.where?.status) rows = rows.filter(q => q.status === opts.where!.status);
    const kw = opts.q?.trim().toLowerCase();
    if (kw) {
      rows = rows.filter(q =>
        q.quote_no.toLowerCase().includes(kw) || (q.input_file_name || '').toLowerCase().includes(kw));
    }
    if (opts.sales) {
      const { me, fallbackClientIds } = opts.sales;
      rows = rows.filter(q =>
        q.salesperson_id === me || (!q.salesperson_id && fallbackClientIds.includes(q.client_id)));
    }
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize || 20));
    return Promise.resolve({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length });
  }
  insert(row: Omit<QuoteOrderRow, 'id' | 'created_at' | 'updated_at'>) {
    const db = load();
    const now = new Date().toISOString();
    const full: QuoteOrderRow = { ...row, id: crypto.randomUUID(), created_at: now, updated_at: now };
    db.quotes.unshift(full);
    save(db);
    return Promise.resolve(full);
  }
  update(id: string, patch: Partial<QuoteOrderRow>) {
    const db = load();
    const idx = db.quotes.findIndex(q => q.id === id);
    if (idx < 0) return Promise.resolve(null);
    db.quotes[idx] = { ...db.quotes[idx], ...patch, updated_at: new Date().toISOString() };
    save(db);
    return Promise.resolve(db.quotes[idx]);
  }
}

export class ImageRepo {
  /** 某客户全部图片（倒序） */
  findByClient(clientId: string): Promise<ClientImageRow[]> {
    const db = load();
    return Promise.resolve(
      (db.client_images || []).filter(i => i.client_id === clientId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    );
  }
  /** 某订单的图片（倒序） */
  findByQuote(quoteId: string): Promise<ClientImageRow[]> {
    const db = load();
    return Promise.resolve(
      (db.client_images || []).filter(i => i.quote_id === quoteId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    );
  }
  /** 全部图片（倒序），可选按客户/订单过滤 */
  findAll(opts?: { client_id?: string; quote_id?: string }): Promise<ClientImageRow[]> {
    const db = load();
    let rows = (db.client_images || []).slice();
    if (opts?.client_id) rows = rows.filter(i => i.client_id === opts.client_id);
    if (opts?.quote_id) rows = rows.filter(i => i.quote_id === opts.quote_id);
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return Promise.resolve(rows);
  }
  findById(id: string): Promise<ClientImageRow | null> {
    const db = load();
    return Promise.resolve((db.client_images || []).find(i => i.id === id) || null);
  }

  /** 服务端分页 + 筛选（client_id/quote_id 精确，按创建时间倒序） */
  findPaged(opts: { client_id?: string; quote_id?: string; page?: number; pageSize?: number } = {}): Promise<{ items: ClientImageRow[]; total: number }> {
    const db = load();
    let rows = (db.client_images || []).slice();
    if (opts.client_id) rows = rows.filter(i => i.client_id === opts.client_id);
    if (opts.quote_id) rows = rows.filter(i => i.quote_id === opts.quote_id);
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize || 24));
    return Promise.resolve({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length });
  }
  insertMany(rows: Omit<ClientImageRow, 'id' | 'created_at'>[]): Promise<ClientImageRow[]> {
    const db = load();
    const full = rows.map(r => ({ ...r, id: crypto.randomUUID(), created_at: new Date().toISOString() }));
    db.client_images = [...(db.client_images || []), ...full];
    save(db);
    return Promise.resolve(full);
  }
  /** 删除某订单全部图片（返回被删记录，便于清理物理文件） */
  deleteByQuote(quoteId: string): Promise<ClientImageRow[]> {
    const db = load();
    const removed = (db.client_images || []).filter(i => i.quote_id === quoteId);
    db.client_images = (db.client_images || []).filter(i => i.quote_id !== quoteId);
    save(db);
    return Promise.resolve(removed);
  }
}

/** 合作伙伴（海运承运商 / 生态合作伙伴）：管理端增删，logo 必传 */
export class PartnerRepo {
  /** 全部合作伙伴（分类内按创建时间正序，新增的排在后面） */
  listAll(): Promise<PartnerRow[]> {
    const db = load();
    const rows = (db.partners || []).slice();
    rows.sort((a, b) => a.category.localeCompare(b.category) || a.created_at.localeCompare(b.created_at));
    return Promise.resolve(rows);
  }
  findByCategory(category: 'carrier' | 'ecosystem'): Promise<PartnerRow[]> {
    const db = load();
    const rows = (db.partners || []).filter(p => p.category === category);
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return Promise.resolve(rows);
  }
  findById(id: string): Promise<PartnerRow | null> {
    const db = load();
    return Promise.resolve((db.partners || []).find(p => p.id === id) || null);
  }
  insert(row: Omit<PartnerRow, 'id' | 'created_at'>): Promise<PartnerRow> {
    const db = load();
    const full: PartnerRow = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    db.partners = [...(db.partners || []), full];
    save(db);
    return Promise.resolve(full);
  }
  /** 更新官网链接；找不到返回 null */
  updateWebsite(id: string, websiteUrl: string): Promise<PartnerRow | null> {
    const db = load();
    const target = (db.partners || []).find(p => p.id === id);
    if (!target) return Promise.resolve(null);
    target.website_url = websiteUrl;
    save(db);
    return Promise.resolve(target);
  }
  /** 删除（返回被删记录，便于清理物理文件） */
  remove(id: string): Promise<PartnerRow | null> {
    const db = load();
    const removed = (db.partners || []).find(p => p.id === id) || null;
    db.partners = (db.partners || []).filter(p => p.id !== id);
    save(db);
    return Promise.resolve(removed);
  }
}

/** M9：客户开票 CNPJ 仓库 */
export class ClientCnpjsRepo {
  /** 某客户全部 CNPJ（默认在前，其余按创建时间） */
  findByClient(clientId: string): Promise<ClientCnpjRow[]> {
    const db = load();
    const rows = (db.client_cnpjs || []).filter(c => c.client_id === clientId);
    rows.sort((a, b) =>
      (Number(b.is_default) - Number(a.is_default)) || a.created_at.localeCompare(b.created_at)
    );
    return Promise.resolve(rows);
  }
  findById(id: string): Promise<ClientCnpjRow | null> {
    const db = load();
    return Promise.resolve((db.client_cnpjs || []).find(c => c.id === id) || null);
  }
  /** 新增：首条自动默认；指定默认时取消同客户其他默认 */
  insert(row: Omit<ClientCnpjRow, 'id' | 'created_at' | 'updated_at'>): Promise<ClientCnpjRow> {
    const db = load();
    const now = new Date().toISOString();
    const others = (db.client_cnpjs || []).filter(c => c.client_id === row.client_id);
    const isDefault = others.length === 0 ? true : row.is_default === true;
    if (isDefault) others.forEach(c => { c.is_default = false; c.updated_at = now; });
    const full: ClientCnpjRow = { ...row, is_default: isDefault, id: uid(), created_at: now, updated_at: now };
    db.client_cnpjs = [...(db.client_cnpjs || []), full];
    save(db);
    return Promise.resolve(full);
  }
  /** 设为默认开票抬头（同客户其余全部取消默认）；找不到返回 null */
  setDefault(clientId: string, id: string): Promise<ClientCnpjRow | null> {
    const db = load();
    const rows = (db.client_cnpjs || []).filter(c => c.client_id === clientId);
    const target = rows.find(c => c.id === id);
    if (!target) return Promise.resolve(null);
    const now = new Date().toISOString();
    rows.forEach(c => {
      const nd = c.id === id;
      if (c.is_default !== nd) { c.is_default = nd; c.updated_at = now; }
    });
    save(db);
    return Promise.resolve(target);
  }
  /** 删除；删除的是默认时自动把剩余第一条设为默认（已绑定订单的开票快照不受影响） */
  deleteById(id: string): Promise<boolean> {
    const db = load();
    const idx = (db.client_cnpjs || []).findIndex(c => c.id === id);
    if (idx < 0) return Promise.resolve(false);
    const [removed] = db.client_cnpjs!.splice(idx, 1);
    if (removed.is_default) {
      const next = db.client_cnpjs!.find(c => c.client_id === removed.client_id);
      if (next) { next.is_default = true; next.updated_at = new Date().toISOString(); }
    }
    save(db);
    return Promise.resolve(true);
  }
}

export class CustomsCnpjsRepo {
  findAll(): Promise<CustomsCnpjRow[]> {
    const db = load();
    const rows = (db.customs_cnpjs || []).slice();
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return Promise.resolve(rows);
  }
  findById(id: string): Promise<CustomsCnpjRow | null> {
    const db = load();
    return Promise.resolve((db.customs_cnpjs || []).find(c => c.id === id) || null);
  }
  findByCnpj(cnpj: string): Promise<CustomsCnpjRow | null> {
    const db = load();
    return Promise.resolve((db.customs_cnpjs || []).find(c => c.cnpj === cnpj) || null);
  }
  insert(row: Omit<CustomsCnpjRow, 'id' | 'created_at' | 'updated_at'>): Promise<CustomsCnpjRow> {
    const db = load();
    const now = new Date().toISOString();
    const full: CustomsCnpjRow = { ...row, id: uid(), created_at: now, updated_at: now };
    db.customs_cnpjs = [...(db.customs_cnpjs || []), full];
    save(db);
    return Promise.resolve(full);
  }
  update(id: string, patch: Partial<CustomsCnpjRow>): Promise<CustomsCnpjRow | null> {
    const db = load();
    const idx = (db.customs_cnpjs || []).findIndex(c => c.id === id);
    if (idx < 0) return Promise.resolve(null);
    db.customs_cnpjs![idx] = { ...db.customs_cnpjs![idx], ...patch, updated_at: new Date().toISOString() };
    save(db);
    return Promise.resolve(db.customs_cnpjs![idx]);
  }
}

/** M8：订单交付文件仓库 */
export class OrderFilesRepo {
  /** 某订单的交付文件（倒序） */
  findByQuote(quoteId: string): Promise<OrderFileRow[]> {
    const db = load();
    const rows = (db.order_files || []).filter(f => f.quote_id === quoteId);
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return Promise.resolve(rows);
  }
  findById(id: string): Promise<OrderFileRow | null> {
    const db = load();
    return Promise.resolve((db.order_files || []).find(f => f.id === id) || null);
  }
  insertMany(rows: Omit<OrderFileRow, 'id' | 'created_at'>[]): Promise<OrderFileRow[]> {
    const db = load();
    const full = rows.map(r => ({ ...r, id: uid(), created_at: new Date().toISOString() }));
    db.order_files = [...(db.order_files || []), ...full];
    save(db);
    return Promise.resolve(full);
  }
  deleteById(id: string): Promise<boolean> {
    const db = load();
    const idx = (db.order_files || []).findIndex(f => f.id === id);
    if (idx < 0) return Promise.resolve(false);
    db.order_files!.splice(idx, 1);
    save(db);
    return Promise.resolve(true);
  }
}

/** M10：回款记录仓库 */
export class PaymentsRepo {
  /** 全部回款（按回款日期倒序） */
  findAll(): Promise<PaymentRow[]> {
    const db = load();
    const rows = (db.payments || []).slice();
    rows.sort((a, b) => b.paid_at.localeCompare(a.paid_at));
    return Promise.resolve(rows);
  }
  /** 某订单的回款（按回款日期倒序） */
  findByQuote(quoteId: string): Promise<PaymentRow[]> {
    const db = load();
    const rows = (db.payments || []).filter(p => p.quote_id === quoteId);
    rows.sort((a, b) => b.paid_at.localeCompare(a.paid_at));
    return Promise.resolve(rows);
  }
  insert(row: Omit<PaymentRow, 'id' | 'created_at'>): Promise<PaymentRow> {
    const db = load();
    const full: PaymentRow = { ...row, id: uid(), created_at: new Date().toISOString() };
    db.payments = [...(db.payments || []), full];
    save(db);
    return Promise.resolve(full);
  }
  deleteById(id: string): Promise<boolean> {
    const db = load();
    const idx = (db.payments || []).findIndex(p => p.id === id);
    if (idx < 0) return Promise.resolve(false);
    db.payments!.splice(idx, 1);
    save(db);
    return Promise.resolve(true);
  }
}

export class AiConfigRepo {
  /** 当前启用的配置（active 行，兜底第一条） */
  get(): Promise<AiConfigRow | null> {
    const db = load();
    const rows = db.ai_config || [];
    return Promise.resolve(rows.find(r => r.active) || rows[0] || null);
  }
  /** 全部配置（启用中的排最前，其余按更新时间倒序） */
  listAll(): Promise<AiConfigRow[]> {
    const db = load();
    const rows = (db.ai_config || []).slice();
    rows.sort((a, b) => Number(b.active) - Number(a.active) || b.updated_at.localeCompare(a.updated_at));
    return Promise.resolve(rows);
  }
  findById(id: string): Promise<AiConfigRow | null> {
    const db = load();
    return Promise.resolve((db.ai_config || []).find(r => r.id === id) || null);
  }
  /** 新建或更新配置；首个配置自动启用 */
  upsertProfile(values: { id?: string; name: string; base_url: string; api_key?: string; model: string; timeout_ms: number }, updatedBy: string): Promise<AiConfigRow> {
    const db = load();
    const now = new Date().toISOString();
    db.ai_config = db.ai_config || [];
    let row: AiConfigRow;
    if (values.id) {
      const existing = db.ai_config.find(r => r.id === values.id);
      if (!existing) throw new Error('配置不存在');
      row = {
        ...existing,
        name: values.name,
        base_url: values.base_url,
        api_key: values.api_key ? values.api_key : existing.api_key,
        model: values.model,
        timeout_ms: values.timeout_ms,
        updated_by: updatedBy,
        updated_at: now
      };
      db.ai_config[db.ai_config.indexOf(existing)] = row;
    } else {
      row = {
        id: uid(),
        name: values.name,
        base_url: values.base_url,
        api_key: values.api_key || '',
        model: values.model,
        timeout_ms: values.timeout_ms,
        active: db.ai_config.length === 0,
        updated_by: updatedBy,
        updated_at: now
      };
      db.ai_config.push(row);
    }
    save(db);
    return Promise.resolve(row);
  }
  /** 切换启用中的配置 */
  async activate(id: string, updatedBy: string): Promise<AiConfigRow | null> {
    const db = load();
    const target = (db.ai_config || []).find(r => r.id === id);
    if (!target) return null;
    const now = new Date().toISOString();
    db.ai_config!.forEach(r => { r.active = r.id === id; });
    target.updated_by = updatedBy;
    target.updated_at = now;
    save(db);
    return target;
  }
  /** 删除配置（返回 false 表示不存在） */
  remove(id: string): Promise<boolean> {
    const db = load();
    const rows = db.ai_config || [];
    const idx = rows.findIndex(r => r.id === id);
    if (idx < 0) return Promise.resolve(false);
    rows.splice(idx, 1);
    save(db);
    return Promise.resolve(true);
  }
  async resolve(defaultModel: string, defaultTimeoutMs: number): Promise<ResolvedAiConfig> {
    return resolveAiConfig(await this.get(), process.env, defaultModel, defaultTimeoutMs);
  }
}

export class HelpArticlesRepo {
  findAll(app?: 'client' | 'ops'): Promise<HelpArticleRow[]> {
    const db = load();
    const rows = (db.help_articles || []).filter(a => !app || a.app === app);
    rows.sort((a, b) => a.app.localeCompare(b.app) || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
    return Promise.resolve(rows);
  }
  findPublished(app: 'client' | 'ops'): Promise<HelpArticleRow[]> {
    const db = load();
    const rows = (db.help_articles || []).filter(a => a.app === app && a.published);
    rows.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
    return Promise.resolve(rows);
  }
  findById(id: string): Promise<HelpArticleRow | null> {
    const db = load();
    return Promise.resolve((db.help_articles || []).find(a => a.id === id) || null);
  }
  findBySlug(app: 'client' | 'ops', slug: string): Promise<HelpArticleRow | null> {
    const db = load();
    return Promise.resolve((db.help_articles || []).find(a => a.app === app && a.slug === slug) || null);
  }
  insert(row: Omit<HelpArticleRow, 'id' | 'created_at' | 'updated_at'>): Promise<HelpArticleRow> {
    const db = load();
    const now = new Date().toISOString();
    const full: HelpArticleRow = { ...row, id: uid(), created_at: now, updated_at: now };
    db.help_articles = [...(db.help_articles || []), full];
    save(db);
    return Promise.resolve(full);
  }
  update(id: string, patch: Partial<HelpArticleRow>): Promise<HelpArticleRow | null> {
    const db = load();
    const idx = (db.help_articles || []).findIndex(a => a.id === id);
    if (idx < 0) return Promise.resolve(null);
    db.help_articles![idx] = { ...db.help_articles![idx], ...patch, updated_at: new Date().toISOString() };
    save(db);
    return Promise.resolve(db.help_articles![idx]);
  }
  deleteById(id: string): Promise<boolean> {
    const db = load();
    const idx = (db.help_articles || []).findIndex(a => a.id === id);
    if (idx < 0) return Promise.resolve(false);
    db.help_articles!.splice(idx, 1);
    save(db);
    return Promise.resolve(true);
  }
}

/** 产品目录仓库（mock：JSON 表，方法与 PgProductCatalogRepo 对齐） */
export class ProductCatalogRepo {
  findBySku(skuKey: string): Promise<ProductCatalogRow | null> {
    const db = load();
    return Promise.resolve((db.product_catalog || []).find(p => p.sku_key === skuKey) || null);
  }
  findById(id: string): Promise<ProductCatalogRow | null> {
    const db = load();
    return Promise.resolve((db.product_catalog || []).find(p => p.id === id) || null);
  }
  upsertBySku(skuKey: string, patch: Partial<ProductCatalogRow>): Promise<ProductCatalogRow> {
    const db = load();
    const now = new Date().toISOString();
    let row = (db.product_catalog || []).find(p => p.sku_key === skuKey);
    if (row) {
      const { id, created_at } = row;
      row = { ...row, ...stripUndefinedPatch(patch), id, sku_key: skuKey, created_at, updated_at: now };
      const idx = db.product_catalog!.findIndex(p => p.sku_key === skuKey);
      db.product_catalog![idx] = row;
    } else {
      row = {
        ...patch,
        id: uid(),
        sku_key: skuKey,
        sku: patch.sku ?? skuKey,
        ncm_sources: patch.ncm_sources ?? [],
        image_ids: patch.image_ids ?? [],
        created_at: now,
        updated_at: now
      } as ProductCatalogRow;
      db.product_catalog = [...(db.product_catalog || []), row];
    }
    save(db);
    return Promise.resolve(row);
  }
  list(opts: { q?: string; page?: number; pageSize?: number } = {}): Promise<{
    items: ProductCatalogRow[]; total: number; page: number; pageSize: number;
  }> {
    const db = load();
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize || 20));
    const kw = opts.q?.trim().toLowerCase();
    let rows = (db.product_catalog || []).slice();
    if (kw) {
      rows = rows.filter(p =>
        `${p.sku} ${p.product_cn || ''} ${p.product_en || ''} ${p.ncm || ''}`.toLowerCase().includes(kw)
      );
    }
    rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return Promise.resolve({
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length, page, pageSize
    });
  }
  update(id: string, patch: Partial<ProductCatalogRow>): Promise<ProductCatalogRow | null> {
    const db = load();
    const idx = (db.product_catalog || []).findIndex(p => p.id === id);
    if (idx < 0) return Promise.resolve(null);
    db.product_catalog![idx] = { ...db.product_catalog![idx], ...stripUndefinedPatch(patch), updated_at: new Date().toISOString() };
    save(db);
    return Promise.resolve(db.product_catalog![idx]);
  }
}

/** 同 pg 侧 stripUndefined：undefined 字段不覆盖已有值 */
function stripUndefinedPatch<T extends object>(patch: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(patch) as (keyof T)[]) {
    if (patch[k] !== undefined) out[k] = patch[k];
  }
  return out;
}
