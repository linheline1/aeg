import type { FieldDataType } from './enums.js';
/**
 * 模板字段 schema（对应 PRD §7 字段字典）
 * 列字母、表头、字段键、类型、必填、公式字符串、客户端/运营端可见性
 */
export interface TemplateFieldDef {
    col_letter: string;
    header_cn: string;
    field_key: string;
    data_type: FieldDataType;
    required: boolean;
    editable: boolean;
    formula?: string;
    enum_values?: string[];
    validation_pattern?: string;
    validation_max?: number;
    validation_min?: number;
    visible_client: boolean;
    visible_operator: boolean;
    sort_order: number;
    remark?: string;
}
/** PRD §7 完整字段字典（27 列，A–Z 26 列 + AA 1 列） */
export declare const FIELD_DICTIONARY: TemplateFieldDef[];
/** 公式列字母集合（J/M/N/R/S/U） */
export declare const FORMULA_COLUMNS: string[];
/** 合计行需要校验的列（H、I、J、K、L、M、N、R、S、U） */
export declare const SUMMARY_CHECK_COLUMNS: string[];
/** 数据区起始行（Excel 第 5 行起） */
export declare const DATA_START_ROW = 5;
/** 模板最大数据行数 */
export declare const TEMPLATE_MAX_ROWS = 100;
//# sourceMappingURL=field-schema.d.ts.map