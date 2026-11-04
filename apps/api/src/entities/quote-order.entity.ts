import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index, BeforeInsert
} from 'typeorm';
import * as crypto from 'crypto';

export type QuoteStatus = 'uploaded' | 'validating' | 'pending_fee' | 'computing' | 'done' | 'failed';

/** 报价订单（核心业务表：客户上传清单 → 运营核算 → 发布 → 成交/物流/交付文件） */
@Entity('quote_order')
export class QuoteOrderEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  quote_no!: string;

  @Index()
  @Column({ type: 'uuid' })
  client_id!: string;

  @Column({ type: 'varchar', length: 50 })
  template_code!: string;

  @Column({ type: 'varchar', length: 20 })
  template_version!: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'uploaded' })
  status!: QuoteStatus;

  @Column({ type: 'double precision', nullable: true })
  total_amount_brl!: number | null;

  @Column({ type: 'double precision', nullable: true })
  total_amount_usd!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  input_file_name!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  input_file_path?: string | null;

  @Column({ type: 'double precision', nullable: true })
  total_cbm?: number | null;

  @Column({ type: 'double precision', nullable: true })
  total_gw_kg?: number | null;

  @Column({ type: 'double precision', nullable: true })
  total_amount_rmb?: number | null;

  @Column({ type: 'int', nullable: true })
  total_rows?: number | null;

  @Column({ type: 'int', nullable: true })
  valid_rows?: number | null;

  /** 结构化 DDP 费用分项 */
  @Column({ type: 'jsonb', nullable: true })
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

  /** 解析后的 Excel 行数据 */
  @Column({ type: 'jsonb', nullable: true })
  line_items?: any[] | null;

  /** 归属业务员（上传时从客户维度继承，运营端可改派；null=未分配） */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  salesperson_id?: string | null;

  /** 成交状态（M4）：null=未标记 open=跟进中 won=已成交 lost=未成交 */
  @Column({ type: 'varchar', length: 10, nullable: true })
  deal_status?: 'open' | 'won' | 'lost' | null;

  @Column({ type: 'text', nullable: true })
  deal_note?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  deal_closed_at?: Date | null;

  /** M7：国际物流（船名/航次/提单/柜号 + 10 节点事件时间线） */
  @Column({ type: 'jsonb', nullable: true })
  shipment?: Record<string, any> | null;

  @Column({ type: 'boolean', default: false })
  converted_by_ai!: boolean;

  @Column({ type: 'varchar', length: 3, default: 'RMB' })
  declared_currency!: 'RMB' | 'USD';

  @Column({ type: 'text', nullable: true })
  ai_notes?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  di_analysis?: Record<string, any> | null;

  /** DI 复核的完整不可变版本快照 */
  @Column({ type: 'jsonb', nullable: true })
  di_review_versions?: Record<string, any>[] | null;

  @Column({ type: 'jsonb', nullable: true })
  customs_review?: {
    status: 'pending' | 'approved' | 'changes_requested';
    di_review_version?: number | null;
    total_di_brl?: number | null;
    note?: string | null;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
  } | null;

  /** M9：开票 CNPJ 快照 */
  @Column({ type: 'jsonb', nullable: true })
  invoice_cnpj?: { id: string; cnpj: string; company_name: string; ie?: string | null } | null;

  @Column({ type: 'text', nullable: true })
  error_message!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
