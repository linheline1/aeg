"use strict";
/**
 * DDP 报价系统枚举定义（as const 对象 + 类型别名，允许字符串字面量直接赋值）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditAction = exports.RateSource = exports.CurrencyCode = exports.FieldDataType = exports.AllocationMethod = exports.FeeCode = exports.QuoteTaskStatus = exports.Role = void 0;
/** 用户角色 */
exports.Role = {
    ADMIN: 'admin',
    OPERATOR: 'operator',
    CLIENT: 'client'
};
/** 任务状态 */
exports.QuoteTaskStatus = {
    PENDING_OPERATOR: 'PENDING_OPERATOR',
    OPERATOR_QUOTING: 'OPERATOR_QUOTING',
    PUBLISHED: 'PUBLISHED',
    NEED_INFO: 'NEED_INFO',
    WITHDRAWN: 'WITHDRAWN',
    VALIDATION_FAILED: 'VALIDATION_FAILED'
};
/** 费用项编码 */
exports.FeeCode = {
    CN_LOCAL_MISC: 'CN_LOCAL_MISC',
    INTL_FREIGHT: 'INTL_FREIGHT',
    BR_CUSTOMS_CLEARANCE: 'BR_CUSTOMS_CLEARANCE',
    BR_IMPORT_TAX: 'BR_IMPORT_TAX'
};
/** 分摊方式 */
exports.AllocationMethod = {
    TOTAL_GW: 'TOTAL_GW',
    TOTAL_CBM: 'TOTAL_CBM',
    TOTAL_PCS: 'TOTAL_PCS',
    GOODS_VALUE: 'GOODS_VALUE'
};
/** 模板字段数据类型 */
exports.FieldDataType = {
    TEXT: 'TEXT',
    INTEGER: 'INTEGER',
    DECIMAL: 'DECIMAL',
    ENUM: 'ENUM',
    FORMULA: 'FORMULA',
    IMAGE: 'IMAGE'
};
/** 币种 */
exports.CurrencyCode = {
    CNY: 'CNY',
    USD: 'USD',
    BRL: 'BRL'
};
/** 汇率来源 */
exports.RateSource = {
    MANUAL: 'MANUAL',
    SERPAPI: 'SERPAPI',
    OPENEXCHANGERATE: 'OPENEXCHANGERATE'
};
/** 审计日志动作 */
exports.AuditAction = {
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
};
//# sourceMappingURL=enums.js.map