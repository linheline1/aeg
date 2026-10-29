import type { Role, QuoteTaskStatus, CurrencyCode } from './enums.js';

/** ========== 认证 DTO ========== */

export interface LoginDto {
  username: string;
  password: string;
}

export interface TokenResponseDto {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number; // 秒
  user: CurrentUserDto;
}

export interface CurrentUserDto {
  id: string;
  username: string;
  role: Role;
  client_id?: string; // 仅 client 角色有值
  status: 'active' | 'disabled';
}

/** JWT payload（server-side，不对外暴露） */
export interface JwtPayload {
  sub: string; // user id
  username: string;
  role: Role;
  client_id?: string;
  iat: number;
  exp: number;
}

/** ========== 模板相关 DTO ========== */

export interface TemplateCurrentInfoDto {
  version_no: string;
  template_code: string;
  updated_at: string; // ISO
  download_url: string; // client 下载地址（需鉴权）
  description: string; // 填写说明
  data_start_row: number;
  max_rows: number;
}

export interface AdminTemplateListItemDto {
  id: string;
  template_code: string;
  version_no: string;
  status: 'active' | 'inactive';
  field_count: number;
  created_by: string;
  activated_at?: string;
}

/** ========== 客户端任务白名单 DTO ========== */

export interface ClientTaskListItemDto {
  id: string;
  warehouse_code?: string;
  original_filename: string;
  status: QuoteTaskStatus;
  uploaded_at: string;
  published_at?: string;
  version?: number;
}

export interface ClientTaskDetailDto {
  id: string;
  warehouse_code: string;
  original_filename: string;
  status: QuoteTaskStatus;
  uploaded_at: string;
  published_at?: string;
  total_cartons: number;
  total_pcs: number;
  total_nw_kg: number;
  total_cbm: number;
  /** 仅 PUBLISHED 状态有值 */
  quote?: ClientQuoteResultDto;
  /** 需补充资料时的说明 */
  return_note?: string;
}

/** 客户端报价结果 DTO —— 白名单字段 */
export interface ClientQuoteResultDto {
  /** DDP 总价（BRL，已含国际运费） */
  ddp_total_brl: number;
  /** 其中：国际运费（BRL，已含在 DDP 总价内） */
  intl_freight_total_brl: number;
  /** 申报货值合计（RMB，仅供参考） */
  total_goods_value_rmb: number;
  /** 整票 DDP 单价（BRL/件） */
  ddp_unit_price_brl: number;
  currency: 'BRL';
  goods_value_currency: 'RMB';
  fx_locked_at: string;
  quote_valid_until: string;
  quote_published_at: string;
  rows: ClientQuoteRowDto[];
  /** 口径说明（固定文案模板，运行时填充日期） */
  disclaimer: string;
}

/** 客户端行明细 —— 白名单字段 */
export interface ClientQuoteRowDto {
  row_no: number;
  carton_no: string;
  product_cn: string;
  product_en: string;
  brand?: string;
  hs_code: string;
  sku: string;
  cartons: number;
  total_pcs: number;
  total_nw_kg: number;
  total_gw_kg: number;
  total_cbm: number;
  /** 申报货值总价（RMB） */
  total_price_rmb: number;
  /** DDP 单价（BRL/件） */
  ddp_unit_price_brl: number;
  /** DDP 总价（BRL） */
  ddp_total_brl: number;
  /** 其中：国际运费（BRL） */
  intl_freight_brl: number;
}

/** ========== 运营端任务 DTO ========== */

export interface OpsTaskListItemDto {
  id: string;
  client_name: string;
  client_id: string;
  original_filename: string;
  warehouse_code: string;
  row_count: number;
  total_cartons: number;
  total_pcs: number;
  total_nw_kg: number;
  total_cbm: number;
  total_goods_value_rmb: number;
  uploaded_at: string;
  status: QuoteTaskStatus;
}

/** ========== 上传错误 DTO ========== */

export interface ValidationErrorDto {
  scope: 'file' | 'row';
  row_no?: number; // Excel 行号（仅 row 级）
  col_header_cn?: string; // 列中文名
  field_key?: string;
  code: string; // 错误码
  message: string; // 错误原因
  current_value?: string;
  suggestion?: string; // 修正建议
}

export interface UploadResultDto {
  upload_id: string;
  task_id?: string; // 校验通过时才有
  status: QuoteTaskStatus;
  errors: ValidationErrorDto[];
  warnings: ValidationErrorDto[];
}

/** ========== 运营端费用录入 ========== */

export interface OpsFeeInputDto {
  fee_code: string; // CN_LOCAL_MISC / INTL_FREIGHT / BR_CUSTOMS_CLEARANCE / BR_IMPORT_TAX
  original_amount: number;
  original_currency: CurrencyCode;
  exchange_rate: number; // 折算 BRL；币种 BRL 时强制 1
}
