/**
 * DDP 报价系统枚举定义（as const 对象 + 类型别名，允许字符串字面量直接赋值）
 */
/** 用户角色 */
export declare const Role: {
    readonly ADMIN: "admin";
    readonly OPERATOR: "operator";
    readonly CLIENT: "client";
};
export type Role = (typeof Role)[keyof typeof Role];
/** 任务状态 */
export declare const QuoteTaskStatus: {
    readonly PENDING_OPERATOR: "PENDING_OPERATOR";
    readonly OPERATOR_QUOTING: "OPERATOR_QUOTING";
    readonly PUBLISHED: "PUBLISHED";
    readonly NEED_INFO: "NEED_INFO";
    readonly WITHDRAWN: "WITHDRAWN";
    readonly VALIDATION_FAILED: "VALIDATION_FAILED";
};
export type QuoteTaskStatus = (typeof QuoteTaskStatus)[keyof typeof QuoteTaskStatus];
/** 费用项编码 */
export declare const FeeCode: {
    readonly CN_LOCAL_MISC: "CN_LOCAL_MISC";
    readonly INTL_FREIGHT: "INTL_FREIGHT";
    readonly BR_CUSTOMS_CLEARANCE: "BR_CUSTOMS_CLEARANCE";
    readonly BR_IMPORT_TAX: "BR_IMPORT_TAX";
};
export type FeeCode = (typeof FeeCode)[keyof typeof FeeCode];
/** 分摊方式 */
export declare const AllocationMethod: {
    readonly TOTAL_GW: "TOTAL_GW";
    readonly TOTAL_CBM: "TOTAL_CBM";
    readonly TOTAL_PCS: "TOTAL_PCS";
    readonly GOODS_VALUE: "GOODS_VALUE";
};
export type AllocationMethod = (typeof AllocationMethod)[keyof typeof AllocationMethod];
/** 模板字段数据类型 */
export declare const FieldDataType: {
    readonly TEXT: "TEXT";
    readonly INTEGER: "INTEGER";
    readonly DECIMAL: "DECIMAL";
    readonly ENUM: "ENUM";
    readonly FORMULA: "FORMULA";
    readonly IMAGE: "IMAGE";
};
export type FieldDataType = (typeof FieldDataType)[keyof typeof FieldDataType];
/** 币种 */
export declare const CurrencyCode: {
    readonly CNY: "CNY";
    readonly USD: "USD";
    readonly BRL: "BRL";
};
export type CurrencyCode = (typeof CurrencyCode)[keyof typeof CurrencyCode];
/** 汇率来源 */
export declare const RateSource: {
    readonly MANUAL: "MANUAL";
    readonly SERPAPI: "SERPAPI";
    readonly OPENEXCHANGERATE: "OPENEXCHANGERATE";
};
export type RateSource = (typeof RateSource)[keyof typeof RateSource];
/** 审计日志动作 */
export declare const AuditAction: {
    readonly LOGIN: "LOGIN";
    readonly TEMPLATE_ACTIVATE: "TEMPLATE_ACTIVATE";
    readonly TEMPLATE_DEACTIVATE: "TEMPLATE_DEACTIVATE";
    readonly TEMPLATE_DOWNLOAD: "TEMPLATE_DOWNLOAD";
    readonly FIELD_UPDATE: "FIELD_UPDATE";
    readonly CLIENT_CREATE: "CLIENT_CREATE";
    readonly CLIENT_DISABLE: "CLIENT_DISABLE";
    readonly QUOTE_PUBLISH: "QUOTE_PUBLISH";
    readonly QUOTE_WITHDRAW: "QUOTE_WITHDRAW";
    readonly QUOTE_RETURN: "QUOTE_RETURN";
    readonly FEE_OVERRIDE: "FEE_OVERRIDE";
};
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
//# sourceMappingURL=enums.d.ts.map