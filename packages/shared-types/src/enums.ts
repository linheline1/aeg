/**
 * DDP 报价系统枚举定义（as const 对象 + 类型别名，允许字符串字面量直接赋值）
 */

/** 用户角色（sales = 业务员，运营端登录，负责跟进成交，与报价员 operator 职责分离） */
export const Role = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  SALES: 'sales',
  CLIENT: 'client'
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** 任务状态 */
export const QuoteTaskStatus = {
  PENDING_OPERATOR: 'PENDING_OPERATOR',
  OPERATOR_QUOTING: 'OPERATOR_QUOTING',
  PUBLISHED: 'PUBLISHED',
  NEED_INFO: 'NEED_INFO',
  WITHDRAWN: 'WITHDRAWN',
  VALIDATION_FAILED: 'VALIDATION_FAILED'
} as const;
export type QuoteTaskStatus = (typeof QuoteTaskStatus)[keyof typeof QuoteTaskStatus];

/** 费用项编码 */
export const FeeCode = {
  CN_LOCAL_MISC: 'CN_LOCAL_MISC',
  INTL_FREIGHT: 'INTL_FREIGHT',
  BR_CUSTOMS_CLEARANCE: 'BR_CUSTOMS_CLEARANCE',
  BR_IMPORT_TAX: 'BR_IMPORT_TAX'
} as const;
export type FeeCode = (typeof FeeCode)[keyof typeof FeeCode];

/** 分摊方式 */
export const AllocationMethod = {
  TOTAL_GW: 'TOTAL_GW',
  TOTAL_CBM: 'TOTAL_CBM',
  TOTAL_PCS: 'TOTAL_PCS',
  GOODS_VALUE: 'GOODS_VALUE'
} as const;
export type AllocationMethod = (typeof AllocationMethod)[keyof typeof AllocationMethod];

/** 模板字段数据类型 */
export const FieldDataType = {
  TEXT: 'TEXT',
  INTEGER: 'INTEGER',
  DECIMAL: 'DECIMAL',
  ENUM: 'ENUM',
  FORMULA: 'FORMULA',
  IMAGE: 'IMAGE'
} as const;
export type FieldDataType = (typeof FieldDataType)[keyof typeof FieldDataType];

/** 币种 */
export const CurrencyCode = {
  CNY: 'CNY',
  USD: 'USD',
  BRL: 'BRL'
} as const;
export type CurrencyCode = (typeof CurrencyCode)[keyof typeof CurrencyCode];

/** 汇率来源 */
export const RateSource = {
  MANUAL: 'MANUAL',
  SERPAPI: 'SERPAPI',
  OPENEXCHANGERATE: 'OPENEXCHANGERATE'
} as const;
export type RateSource = (typeof RateSource)[keyof typeof RateSource];

/** 审计日志动作 */
export const AuditAction = {
  LOGIN: 'LOGIN',
  TEMPLATE_ACTIVATE: 'TEMPLATE_ACTIVATE',
  TEMPLATE_DEACTIVATE: 'TEMPLATE_DEACTIVATE',
  TEMPLATE_DOWNLOAD: 'TEMPLATE_DOWNLOAD',
  FIELD_UPDATE: 'FIELD_UPDATE',
  CLIENT_CREATE: 'CLIENT_CREATE',
  CLIENT_DISABLE: 'CLIENT_DISABLE',
  QUOTE_PUBLISH: 'QUOTE_PUBLISH',
  QUOTE_WITHDRAW: 'QUOTE_WITHDRAW',
  QUOTE_RETURN: 'QUOTE_RETURN',
  FEE_OVERRIDE: 'FEE_OVERRIDE'
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
