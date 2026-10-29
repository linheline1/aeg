import type { FieldDataType } from './enums.js';

/**
 * 模板字段 schema（对应 PRD §7 字段字典）
 * 列字母、表头、字段键、类型、必填、公式字符串、客户端/运营端可见性
 */
export interface TemplateFieldDef {
  col_letter: string; // 列字母（A, B, ... AA）
  header_cn: string; // 中文表头（Excel 第 3 行）
  field_key: string; // 英文字段键（数据库列）
  data_type: FieldDataType; // 数据类型
  required: boolean; // 必填
  editable: boolean; // 数据填写区是否可编辑
  formula?: string; // 公式字符串（公式列），非公式列为 undefined
  enum_values?: string[]; // 枚举值（V 列材质下拉）
  validation_pattern?: string; // 正则校验（如 HS code、箱号范围）
  validation_max?: number; // 数值上限
  validation_min?: number; // 数值下限
  visible_client: boolean; // 客户端是否可见
  visible_operator: boolean; // 运营端是否可见
  sort_order: number;
  remark?: string;
}

/** PRD §7 完整字段字典（27 列，A–Z 26 列 + AA 1 列） */
export const FIELD_DICTIONARY: TemplateFieldDef[] = [
  {
    col_letter: 'A',
    header_cn: '箱号 Carton No.',
    field_key: 'carton_no',
    data_type: 'TEXT',
    required: false,
    editable: true,
    validation_pattern: '^\\d+(-\\d+)?$',
    visible_client: true,
    visible_operator: true,
    sort_order: 1,
    remark: '如 1-167'
  },
  {
    col_letter: 'B',
    header_cn: '中文品名',
    field_key: 'product_cn',
    data_type: 'TEXT',
    required: true,
    editable: true,
    visible_client: true,
    visible_operator: true,
    sort_order: 2
  },
  {
    col_letter: 'C',
    header_cn: '英文品名',
    field_key: 'product_en',
    data_type: 'TEXT',
    required: true,
    editable: true,
    visible_client: true,
    visible_operator: true,
    sort_order: 3,
    remark: '清关需要'
  },
  {
    col_letter: 'D',
    header_cn: '品牌 LOGO/BAND',
    field_key: 'brand',
    data_type: 'TEXT',
    required: false,
    editable: true,
    visible_client: true,
    visible_operator: true,
    sort_order: 4,
    remark: '可填"无"'
  },
  {
    col_letter: 'E',
    header_cn: '海关编码（HS Code）',
    field_key: 'hs_code',
    data_type: 'TEXT',
    required: false,
    editable: true,
    validation_pattern: '^\\d{8}$',
    visible_client: true,
    visible_operator: true,
    sort_order: 5,
    remark: 'NCM 前 8 位，可留空后用 AI 补全'
  },
  {
    col_letter: 'F',
    header_cn: '入仓号',
    field_key: 'warehouse_code_line',
    data_type: 'TEXT',
    required: false,
    editable: true,
    visible_client: true,
    visible_operator: true,
    sort_order: 6,
    remark: '为空继承 B2；非空且与 B2 不一致报错'
  },
  {
    col_letter: 'G',
    header_cn: '产品型号（SKU）',
    field_key: 'sku',
    data_type: 'TEXT',
    required: true,
    editable: true,
    visible_client: true,
    visible_operator: true,
    sort_order: 7
  },
  {
    col_letter: 'H',
    header_cn: '箱数 Carton',
    field_key: 'cartons',
    data_type: 'INTEGER',
    required: true,
    editable: true,
    validation_min: 1,
    validation_max: 99999,
    visible_client: true,
    visible_operator: true,
    sort_order: 8
  },
  {
    col_letter: 'I',
    header_cn: '单箱件数 pcs/ctn',
    field_key: 'pcs_per_carton',
    data_type: 'INTEGER',
    required: true,
    editable: true,
    validation_min: 1,
    validation_max: 99999,
    visible_client: true,
    visible_operator: true,
    sort_order: 9
  },
  {
    col_letter: 'J',
    header_cn: '总件数',
    field_key: 'total_pcs',
    data_type: 'FORMULA',
    required: false,
    editable: false,
    formula: '=H*I',
    visible_client: true,
    visible_operator: true,
    sort_order: 10,
    remark: '只读，后端重算'
  },
  {
    col_letter: 'K',
    header_cn: '单箱净重（KG）',
    field_key: 'nw_per_carton',
    data_type: 'DECIMAL',
    required: true,
    editable: true,
    validation_min: 0.001,
    validation_max: 99999,
    visible_client: true,
    visible_operator: true,
    sort_order: 11
  },
  {
    col_letter: 'L',
    header_cn: '单箱毛重（KG）',
    field_key: 'gw_per_carton',
    data_type: 'DECIMAL',
    required: true,
    editable: true,
    validation_min: 0.001,
    validation_max: 99999,
    visible_client: true,
    visible_operator: true,
    sort_order: 12,
    remark: '毛重 < 净重报错'
  },
  {
    col_letter: 'M',
    header_cn: '总净重（KG）',
    field_key: 'total_nw',
    data_type: 'FORMULA',
    required: false,
    editable: false,
    formula: '=H*K',
    visible_client: true,
    visible_operator: true,
    sort_order: 13,
    remark: '只读，后端重算'
  },
  {
    col_letter: 'N',
    header_cn: '总毛重（KG）',
    field_key: 'total_gw',
    data_type: 'FORMULA',
    required: false,
    editable: false,
    formula: '=H*L',
    visible_client: true,
    visible_operator: true,
    sort_order: 14,
    remark: '只读，后端重算'
  },
  {
    col_letter: 'O',
    header_cn: '外箱尺寸长（CM）',
    field_key: 'length_cm',
    data_type: 'DECIMAL',
    required: true,
    editable: true,
    validation_min: 0.01,
    validation_max: 9999,
    visible_client: true,
    visible_operator: true,
    sort_order: 15
  },
  {
    col_letter: 'P',
    header_cn: '外箱尺寸宽（CM）',
    field_key: 'width_cm',
    data_type: 'DECIMAL',
    required: true,
    editable: true,
    validation_min: 0.01,
    validation_max: 9999,
    visible_client: true,
    visible_operator: true,
    sort_order: 16
  },
  {
    col_letter: 'Q',
    header_cn: '外箱尺寸高（CM）',
    field_key: 'height_cm',
    data_type: 'DECIMAL',
    required: true,
    editable: true,
    validation_min: 0.01,
    validation_max: 9999,
    visible_client: true,
    visible_operator: true,
    sort_order: 17
  },
  {
    col_letter: 'R',
    header_cn: '单位体积（CBM）',
    field_key: 'unit_cbm',
    data_type: 'FORMULA',
    required: false,
    editable: false,
    formula: '=O*P*Q/1000000',
    visible_client: true,
    visible_operator: true,
    sort_order: 18,
    remark: '只读，后端重算'
  },
  {
    col_letter: 'S',
    header_cn: '总体积（CBM）',
    field_key: 'total_cbm',
    data_type: 'FORMULA',
    required: false,
    editable: false,
    formula: '=R*H',
    visible_client: true,
    visible_operator: true,
    sort_order: 19,
    remark: '只读，后端重算'
  },
  {
    col_letter: 'T',
    header_cn: '单价 Presio(RMB)',
    field_key: 'unit_price',
    data_type: 'DECIMAL',
    required: true,
    editable: true,
    validation_min: 0,
    validation_max: 9999999,
    visible_client: true,
    visible_operator: true,
    sort_order: 20,
    remark: '申报货值，不参与 DDP'
  },
  {
    col_letter: 'U',
    header_cn: '总价 Price (RMB)',
    field_key: 'total_price',
    data_type: 'FORMULA',
    required: false,
    editable: false,
    formula: '=T*J',
    visible_client: true,
    visible_operator: true,
    sort_order: 21,
    remark: '只读，货值合计'
  },
  {
    col_letter: 'V',
    header_cn: '材质（是否带电）',
    field_key: 'material',
    data_type: 'ENUM',
    required: true,
    editable: true,
    enum_values: ['不带电', '带电', '含电池', '其他'],
    visible_client: true,
    visible_operator: true,
    sort_order: 22
  },
  {
    col_letter: 'W',
    header_cn: '产品描述',
    field_key: 'description',
    data_type: 'TEXT',
    required: true,
    editable: true,
    visible_client: true,
    visible_operator: true,
    sort_order: 23,
    remark: '清关需要'
  },
  {
    col_letter: 'X',
    header_cn: '产品图片',
    field_key: 'product_image',
    data_type: 'IMAGE',
    required: false,
    editable: true,
    visible_client: false,
    visible_operator: true,
    sort_order: 24,
    remark: '可选，仅存档'
  },
  {
    col_letter: 'Y',
    header_cn: '外箱图片',
    field_key: 'carton_image',
    data_type: 'IMAGE',
    required: false,
    editable: true,
    visible_client: false,
    visible_operator: true,
    sort_order: 25,
    remark: '可选，仅存档'
  },
  {
    col_letter: 'Z',
    header_cn: '机器条码',
    field_key: 'machine_barcode',
    data_type: 'TEXT',
    required: false,
    editable: true,
    visible_client: true,
    visible_operator: true,
    sort_order: 26
  },
  {
    col_letter: 'AA',
    header_cn: '备注',
    field_key: 'remark',
    data_type: 'TEXT',
    required: false,
    editable: true,
    visible_client: true,
    visible_operator: true,
    sort_order: 27
  }
];

/** 公式列字母集合（J/M/N/R/S/U） */
export const FORMULA_COLUMNS = FIELD_DICTIONARY.filter(f => f.formula).map(f => f.col_letter);

/** 合计行需要校验的列（H、I、J、K、L、M、N、R、S、U） */
export const SUMMARY_CHECK_COLUMNS = ['H', 'I', 'J', 'K', 'L', 'M', 'N', 'R', 'S', 'U'];

/** 数据区起始行（Excel 第 5 行起） */
export const DATA_START_ROW = 5;
/** 模板最大数据行数 */
export const TEMPLATE_MAX_ROWS = 100;
