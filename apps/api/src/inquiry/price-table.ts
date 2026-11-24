/**
 * 客户端 AI 询价参考价目表
 * 来源：安易智链巴西/阿根廷报价表 20260924（生效日期 2026-09-01，汇率固定 7.1）
 * 只做「大概参考报价」，最终以正式报价单为准。
 *
 * 数据结构约定：
 * - classes[].prices 与 channel.tiers 一一对应；值为 number=单价，'enquiry'=单询，'rejected'=不收
 * - 海运计费：1CBM = 300KG，最低消费 1CBM
 * - 空运计费：体积重 = 长×宽×高cm / volumetricDivisor，最低起收 minChargeKg
 * - 小包（parcel）：公斤价 + 操作费（按重量段），超段按 overFee 续加
 */

export type CountryCode = 'BR' | 'AR' | 'CL' | 'CO' | 'MX' | 'EC' | 'PE';
export type PriceValue = number | 'enquiry' | 'rejected';

export interface PriceClass {
  /** 分类名（中文，如 普货一类） */
  name: string;
  /** 关键词（中/英/葡），取自报价表品类举例；匹配时取最长命中 */
  keywords: string[];
  /** 各分段单价，顺序与 channel.tiers 对齐 */
  prices: PriceValue[];
}

export interface WeightFeeTier {
  /** 该段上限（kg，含） */
  max: number;
  fee: number;
}

export interface FreightChannel {
  code: string;
  nameZh: string;
  namePt: string;
  country: CountryCode;
  mode: 'sea' | 'air' | 'parcel';
  kind: 'self' | 'agent';
  currency: 'USD' | 'CNY';
  unit: 'CBM' | 'KG';
  /** 分段（按计费重量或方数） */
  tiers: { label: string; max: number | null }[];
  /** 分类计价（海/空运自营渠道） */
  classes: PriceClass[];
  /** 小包固定公斤价 */
  perKg?: number;
  /** 小包按重量段公斤价（墨西哥专线） */
  perKgTiers?: WeightFeeTier[];
  /** 小包操作费（元/票） */
  opFees?: WeightFeeTier[];
  /** 超出最后一段后的续加规则 */
  overFee?: { overKg: number; stepKg: number; fee: number };
  rules: {
    minChargeKg?: number;
    minChargeCbm?: number;
    cbmKgRatio?: number;
    volumetricDivisor?: number;
    maxWeightKg?: number;
    transitZh: string;
    transitPt: string;
  };
  /** 带电接收：none 不收 / builtin 内置电 / pure 纯电也收 */
  battery: 'none' | 'builtin' | 'pure';
}

const brSeaClasses: PriceClass[] = [
  {
    name: '普货一类',
    keywords: ['手机壳', '支架', '塑料收纳盒', '收纳盒', '置物架', '垃圾桶', '挂绳', '刷子', '保鲜膜', '磨刀石', '开瓶器', '指甲钳', '充气垫', '硅胶刀叉勺', '厨具收纳盒', '逗猫棒', '喷瓶', '雨衣', '鞋垫', '梳子', '塑料袋', '文件夹', '地漏', '毛巾架', '钢丝刷', '勾针', '遮阳布', '硅胶手套', '衣架', '清洁刷', '扫把', '鼻毛剪', '挂钩', '防护网', '栅栏', '排水管', '镊子', '呼啦圈', '塑料盆', '鱼线', '马桶刷', '风筝', '浮排', '扎带', '防雨罩', '充气筒', '调料罐', '过滤网', '纸巾架', '硅胶模具', '清缝刷', '泡沫地垫', '隔音垫', '防漏网', '手机支架', 'capinha', 'suporte'],
    prices: [820, 820, 800]
  },
  {
    name: '普货二类',
    keywords: ['玻璃瓶', '宠物梳', '牵引绳', '猫垫', '贴纸', '不锈钢餐具', '钥匙扣', '假发', '坐垫', '钥匙锁', '水龙头', '负重手环', '哑铃', '表带', '工作手套', '3D打印耗材', '一次性塑料杯', '酒店拖鞋', '笔袋', '抹布', '铁锅', '窗帘', '跳绳', '瑜伽垫', '行李箱', '包包', '帐篷', '调料勺', '鱼竿', '马桶坐垫', '自行车前灯', '车衣', '气球', '除尘套', '收纳推车', '干发帽', '防滑胶垫', '海绵座垫', '门锁扣', '卷尺', '保险柜', '拖车', '羽毛球', '凉席', '回形针', '泳镜', '挂皮刀', 'garrafa', 'maçaneta'],
    prices: [930, 930, 900]
  },
  {
    name: '普货三类',
    keywords: ['充电线', '充电头', '计算器', '厨用刀具', '保温杯', '护膝', '铂金首饰', '灯具', '塑料泳池', '宠物玩具', '硅胶胸贴', '沙发巾', '镜子', '计时器', '枕头', '床垫', '滑板', '电焊眼镜', '后视镜', '床笠', '转换插头', '遮光板', '拓展坞', '散热小风扇', '发泡器', '排插', 'cabo de carregamento', 'carregador', 'espelho', 'travesseiro'],
    prices: [1100, 1070, 1050]
  },
  {
    name: '四类（车配）',
    keywords: ['车配件', '汽车排气管', '油门拉线', '机油控制阀', '汽车断电器', '风扇控制模块', '电磁阀', 'autopeça', 'escape'],
    prices: [1300, 1200, 1150]
  },
  {
    name: '五类（小家电）',
    keywords: ['除湿机', '吹风机', '电烙铁', '榨汁机', '遥控器', '电子闹钟', '三明治机', '电容笔', '水泵', '清洁机', '直发器', '打气机', '电动工具', '带线鼠标', '带线键盘', '美甲机', '电子秤', '脱毛仪', '对讲机', '有线麦克风', '小马达', '香薰机', '绞肉机', '烧水壶', '空气炸锅', '过滤器', '筋膜枪', '吸尘器', '真空机', '仪表盘', '灭蚊拍', '封口机', '热熔枪', '点读机', '酸奶机', '烤肠机', 'secador', 'liquidificador', 'ferro de passar'],
    prices: [1250, 1250, 1200]
  },
  {
    name: '六类（蓝牙/电子）',
    keywords: ['蓝牙门锁', '蓝牙音响', '蓝牙鼠标', '蓝牙键盘', '积木', '拳击手套', '沙包', '头盔', '光纤线', '电动牙刷', '按摩仪', '电磁炉', '打印机', '溜冰鞋', '跑步机', '定位器', '车载逆变转换器', '蓝牙钥匙扣', '路由器', 'caixa de som bluetooth', 'roteador', 'escova elétrica'],
    prices: [1400, 1400, 1250]
  },
  {
    name: '七类（高值电子）',
    keywords: ['投影仪', '蓝牙耳机', '摄像头', '光谱机', '电子手表', '机械手表', '逆变器', '车载显示屏', '拍立得相纸', '拍立得', '非侵权玩偶', '刮胡刀', '电动剃须刀', '保暖手套', '电动车', '无度数眼镜', '手机屏', '相机', '雨靴', '雨伞', 'fone bluetooth', 'projetor', 'câmera'],
    prices: [1650, 1550, 1500]
  },
  {
    name: '八类（陶瓷/纺织）',
    keywords: ['马克杯', '餐具', '袜子', 'VR眼镜', 'caneca', 'talheres', 'meias'],
    prices: [2300, 2200, 2100]
  },
  {
    name: '九类（电池类）',
    keywords: ['充电宝', '非侵权电池', '血糖仪', '美容仪', '移动电源', 'power bank', 'bateria', 'powerbank'],
    prices: [2400, 2300, 2100]
  },
  {
    name: '十类（平板）',
    keywords: ['平板电脑', 'tablet', 'ipad'],
    prices: [2600, 2550, 2400]
  },
  {
    name: '十一类（单询）',
    keywords: ['工艺品', '蜡烛', '乐器', '陶瓷材质', '鞋子', 'candle', 'vela', 'tênis', 'sapato', 'instrumento'],
    prices: ['enquiry', 'enquiry', 'enquiry']
  },
  {
    name: '十二类（不收）',
    keywords: ['食品', '军用', '药品', '手机', '无人机', '磁铁', '书籍', '药品类', 'alimento', 'medicamento', 'drone', 'livro', 'celular'],
    prices: ['rejected', 'rejected', 'rejected']
  }
];

const brAirClasses: PriceClass[] = [
  {
    name: '一类',
    keywords: ['手机壳', '塑料手机壳', '玻璃膜', '3D膜', '支架', '塑料衣柜', '鞋架', '衣架', '文具', '笔记本', '包装', '手机支架', '自行车工具', '雨伞', '皮带', '胶带', '氯化钙', '厨房用具', '唇膏盒', '鱼线', '办公桌椅', '装饰玻璃', '马桶坐便器', '狗窝', '铝箔隔热', '玻璃罐', '拖把', '保温杯', '金属杯', '五金工具', '煤油灯', '迎宾毯', '健身器材', '雨衣', '挡泥板', '微型榨汁机', '鼠标', '排插', 'película', 'guarda-chuva', 'ferramenta', 'capinha'],
    prices: [40, 38, 36]
  },
  {
    name: '二类',
    keywords: ['电容笔', '键盘', '遥控', '补光灯', '面板灯', '灯带', '三脚架', '音箱', '麦克风', '手电筒', '汽车诊断工具', '电动工具', '游戏手柄', '剃须刀', '五金饰品', '汽车蓝牙', '天线', '数据线', '打气机', '沙发', '人脸识别器', '轴承', '充电器', '条码扫描仪', '车载定位器', '化油器', '洗牌机', '打气筒', '理发剪', '直发器', '卷发棒', '吹风机', '小风扇', 'LED灯', '监控摄像头', 'teclado', 'mouse', 'caneta', 'lâmpada', 'ventilador'],
    prices: [44, 41, 38]
  },
  {
    name: '三类',
    keywords: ['电子称', '投影仪', '无线耳机', '运动手环', '按摩枪', '对讲机', '万用表', '汽配', '汽车灯', '按摩椅', '小型3D打印机', '电脑主板', '小米款式手环', '行车记录仪', '无线车充', 'U盘', '智慧手表', 'GPS定位器', '摄像头（mini）', 'smartwatch', 'smart band', 'pendrive'],
    prices: [51, 47, 44]
  },
  {
    name: '四类',
    keywords: ['手机屏幕', '总成', '发电机', '大型3D打印机', '激光焊接机', '充电桩', '印刷线路板', '投光灯', '逆变器', '刷卡机', 'telas de celular', 'gerador', 'inversor'],
    prices: [52, 51, 49]
  },
  {
    name: '五类',
    keywords: ['假发', '眼睫毛', 'peruca', 'cílios'],
    prices: [66, 62, 58]
  },
  {
    name: '六类（需资质）',
    keywords: ['无牌口红', '牙贴', '口红', 'batom'],
    prices: ['enquiry', 'enquiry', 'enquiry']
  },
  {
    name: '七类（电池）',
    keywords: ['纯电池移动电源', '移动电源', '充电宝', 'power bank', 'bateria'],
    prices: ['enquiry', 'enquiry', 'enquiry']
  },
  {
    name: '八类（服装）',
    keywords: ['无品牌球衣', '内衣', '运动套装', '球衣', 'camisa', 'roupa esportiva'],
    prices: [59, 44, 41]
  },
  {
    name: '十类（不收）',
    keywords: ['食品', '药物', '军用', 'alimento', 'medicamento'],
    prices: ['rejected', 'rejected', 'rejected']
  }
];

const arSeaClasses: PriceClass[] = [
  {
    name: '一类',
    keywords: ['木制家具', '货架', '皮制家具', '普通塑料', '工艺品', '部分建材', '仿真花', 'móveis de madeira', 'flor artificial'],
    prices: [1000, 975]
  },
  {
    name: '二类',
    keywords: ['箱包背包', '无粉硒鼓', '按摩椅', '非蓝牙音箱', '有线键盘鼠标', '辅料', '鞋材', '玻璃制品', '家具五金', '吉他小提琴', '气模', '硅胶模具', '不锈钢水杯', '丁晴手套', '汽配', '墙纸', '自行车', '电钻', '陶瓷制品', '纯车灯', '有线耳机', '饰品', '帽子', 'mochila', 'boné', 'bicicleta'],
    prices: [1150, 1125]
  },
  {
    name: '三类（布料/塑料）',
    keywords: ['无纺布', '针织布', '布料', '渔网', '纱线', '手机钢化膜', '塑料手机壳', '电子锁', '制氧机', '空气净化器', '手持榨汁机', '体育健身器材', 'tecido', 'malha'],
    prices: [1150, 1125]
  },
  {
    name: '小电器/A/B 类',
    keywords: ['纯灯泡灯管', 'LED灯', 'LED拼接屏', '灯条', '车灯', '智能插头', '智能插座', '电源适配器', '太阳能路灯', '电线线缆', '工业打印机', '智能扫地机', '充电桩', '电动牙刷', '假发', '电动剃须刀', '安防产品', '蓝牙音箱耳机键盘鼠标', '线路板', '热敏打印机', '体重秤', '路由器', '条形码扫描器', '逆变器', '额温枪血氧仪', '激光雕刻机', '面板灯', '成品灯带', '成品服装', '裙子', '羽绒服', '比基尼', '男装', '女装', '童装', '儿童玩具', '厨房用具', '水杯水壶', '食品模具', '电动工具', '激光打印机', '补光灯', '汽摩配件', 'lâmpada', 'tomada', 'roupa'],
    prices: [1450, 1425]
  },
  {
    name: 'C 类（可认证）',
    keywords: ['有原产地证书', '电安认证'],
    prices: [1350, 1325]
  },
  {
    name: '其他（单询）',
    keywords: ['化工', '胶水墨水', '洗护套装', '化妆品', '香水', '激光类', '焊接机', '切割机', '广告机', 'cosmético', 'perfume'],
    prices: ['enquiry', 'enquiry']
  },
  {
    name: '不收',
    keywords: ['摄像头不接', '食品不接', '美容仪器不接', '食品', 'alimento'],
    prices: ['rejected', 'rejected']
  }
];

const arAirClasses: PriceClass[] = [
  {
    name: '一类',
    keywords: ['收纳用品', '装饰品', '塑料家具', '塑料制品', '塑料盒', '塑料桶', '塑料零件', '螺丝', '不带电工具', '手动五金', '建材配件', '厨房用品', '清洁用品', '文具', '玩具非电动', '背包', '手提包', '行李箱', '节日用品', '工艺品', '非电子配件', '服装', '布料', '床品', '毛巾', '袜子', '鞋类无牌', 'roupa', 'tênis', 'mochila', 'organizador'],
    prices: [67, 60]
  },
  {
    name: '二类',
    keywords: ['带电池', '美妆', '电子产品', '手机配件', '摄像头', 'F牌', '高货值', '粉底', '眼影', '口红', '面霜', '护手霜', '精华液', '防晒', '美白', '指甲油', '染发剂', 'bateria', 'cosmético', 'maquiagem'],
    prices: [75, 67]
  },
  {
    name: '三类（单询）',
    keywords: ['未在报表内产品'],
    prices: ['enquiry', 'enquiry']
  },
  {
    name: '四类（不收）',
    keywords: ['食品', '药物', '军用', 'alimento', 'medicamento'],
    prices: ['rejected', 'rejected']
  }
];

export const PRICE_TABLE = {
  version: '20260924',
  effectiveDate: '2026-09-01',
  fxNote: '汇率固定 7.1（CNY/USD）',
  channels: <FreightChannel[]>[
    {
      code: 'AYZL0001', nameZh: '巴西海运双清包税', namePt: 'Marítimo Brasil DDP', country: 'BR', mode: 'sea',
      kind: 'self', currency: 'USD', unit: 'CBM',
      tiers: [{ label: '1-5CBM', max: 5 }, { label: '5-10CBM', max: 10 }, { label: '10+CBM', max: null }],
      classes: brSeaClasses,
      rules: { minChargeCbm: 1, cbmKgRatio: 300, transitZh: '开船后 60-75 天到仓', transitPt: '60-75 dias após embarque' },
      battery: 'builtin'
    },
    {
      code: 'AYZL0002', nameZh: '巴西空运双清包税', namePt: 'Aéreo Brasil DDP', country: 'BR', mode: 'air',
      kind: 'self', currency: 'USD', unit: 'KG',
      tiers: [{ label: '21KG+', max: 50 }, { label: '51KG+', max: 99 }, { label: '100KG+', max: null }],
      classes: brAirClasses,
      rules: { minChargeKg: 31, volumetricDivisor: 6000, transitZh: '15-20 天（到圣保罗市区，邮编 0 开头）', transitPt: '15-20 dias (São Paulo capital, CEP 0)' },
      battery: 'builtin'
    },
    {
      code: 'AYZL0004', nameZh: '阿根廷海运双清包税', namePt: 'Marítimo Argentina DDP', country: 'AR', mode: 'sea',
      kind: 'self', currency: 'USD', unit: 'CBM',
      tiers: [{ label: '1-10CBM', max: 10 }, { label: '10+CBM', max: null }],
      classes: arSeaClasses,
      rules: { minChargeCbm: 1, cbmKgRatio: 300, transitZh: '60-80 天到仓', transitPt: '60-80 dias após embarque' },
      battery: 'builtin'
    },
    {
      code: 'AYZL0005', nameZh: '阿根廷空运双清包税', namePt: 'Aéreo Argentina DDP', country: 'AR', mode: 'air',
      kind: 'self', currency: 'USD', unit: 'KG',
      tiers: [{ label: '21KG+', max: 99 }, { label: '100KG+', max: null }],
      classes: arAirClasses,
      rules: { minChargeKg: 31, volumetricDivisor: 5000, transitZh: '7-12 天（到海外仓，尾程另计）', transitPt: '7-12 dias (armazém, última milha à parte)' },
      battery: 'builtin'
    },
    {
      code: 'AYZL-P01', nameZh: '巴西小包空运（普货·巴西邮政）', namePt: 'Aéreo pequenos volumes Brasil (Correios)', country: 'BR', mode: 'parcel',
      kind: 'self', currency: 'CNY', unit: 'KG',
      tiers: [], classes: [], perKg: 93,
      opFees: [{ max: 0.5, fee: 51 }, { max: 1, fee: 57 }, { max: 1.5, fee: 62 }, { max: 2, fee: 68 }, { max: 2.5, fee: 74 }, { max: 3, fee: 79 }],
      overFee: { overKg: 3, stepKg: 0.5, fee: 5.6 },
      rules: { volumetricDivisor: 6000, maxWeightKg: 30, transitZh: '时效以渠道为准（一票一件）', transitPt: 'Prazo conforme canal (1 volume por envio)' },
      battery: 'none'
    },
    {
      code: 'AYZL-P02', nameZh: '巴西小包空运（带电·巴西邮政）', namePt: 'Aéreo pequenos volumes Brasil c/ bateria (Correios)', country: 'BR', mode: 'parcel',
      kind: 'self', currency: 'CNY', unit: 'KG',
      tiers: [], classes: [], perKg: 96,
      opFees: [{ max: 0.5, fee: 52 }, { max: 1, fee: 57 }, { max: 1.5, fee: 62 }, { max: 2, fee: 68 }, { max: 2.5, fee: 74 }, { max: 3, fee: 79 }],
      overFee: { overKg: 3, stepKg: 0.5, fee: 5.6 },
      rules: { volumetricDivisor: 6000, maxWeightKg: 30, transitZh: '时效以渠道为准（一票一件）', transitPt: 'Prazo conforme canal (1 volume por envio)' },
      battery: 'builtin'
    },
    {
      code: 'AYZL-P03', nameZh: '巴西小包空运（纯电·巴西邮政）', namePt: 'Aéreo pequenos volumes Brasil bateria pura (Correios)', country: 'BR', mode: 'parcel',
      kind: 'self', currency: 'CNY', unit: 'KG',
      tiers: [], classes: [], perKg: 114,
      opFees: [{ max: 0.5, fee: 51 }, { max: 1, fee: 57 }, { max: 1.5, fee: 62 }, { max: 2, fee: 68 }, { max: 2.5, fee: 74 }, { max: 3, fee: 79 }],
      overFee: { overKg: 3, stepKg: 0.5, fee: 5.6 },
      rules: { volumetricDivisor: 6000, maxWeightKg: 30, transitZh: '时效以渠道为准（一票一件，需 MSDS 视产品而定）', transitPt: 'Prazo conforme canal (MSDS conforme produto)' },
      battery: 'pure'
    },
    {
      code: 'AJ-CL', nameZh: '智利专线（安骏 DDP）', namePt: 'Chile expresso (Anjun DDP)', country: 'CL', mode: 'parcel',
      kind: 'agent', currency: 'CNY', unit: 'KG',
      tiers: [], classes: [], perKg: 94,
      opFees: [{ max: 0.5, fee: 22 }, { max: 2, fee: 22 }, { max: 5, fee: 23 }],
      overFee: { overKg: 5, stepKg: 1, fee: 8 },
      rules: { volumetricDivisor: 6000, maxWeightKg: 30, transitZh: '主城区 7-10 天 / 非主城区 12-22 天', transitPt: '7-10 dias (capital) / 12-22 dias (interior)' },
      battery: 'builtin'
    },
    {
      code: 'AJ-CO', nameZh: '哥伦比亚专线（安骏 DDP）', namePt: 'Colômbia expresso (Anjun DDP)', country: 'CO', mode: 'parcel',
      kind: 'agent', currency: 'CNY', unit: 'KG',
      tiers: [], classes: [], perKg: 96,
      opFees: [{ max: 0.1, fee: 41 }, { max: 0.3, fee: 43 }, { max: 0.5, fee: 45 }, { max: 1, fee: 51 }, { max: 1.5, fee: 82 }, { max: 2, fee: 92 }, { max: 2.5, fee: 104 }, { max: 3, fee: 116 }],
      overFee: { overKg: 3, stepKg: 0.5, fee: 15 },
      rules: { volumetricDivisor: 5000, maxWeightKg: 30, transitZh: '主城区 9-12 天 / 偏远 13-18 天', transitPt: '9-12 dias (capital) / 13-18 dias (interior)' },
      battery: 'builtin'
    },
    {
      code: 'AJ-MX', nameZh: '墨西哥专线（安骏 920）', namePt: 'México expresso (Anjun 920)', country: 'MX', mode: 'parcel',
      kind: 'agent', currency: 'CNY', unit: 'KG',
      tiers: [], classes: [],
      perKgTiers: [{ max: 0.2, fee: 93 }, { max: 0.5, fee: 114 }, { max: 1, fee: 121 }, { max: 3, fee: 125 }, { max: 10, fee: 131 }],
      opFees: [{ max: 0.2, fee: 26 }, { max: 0.5, fee: 26 }, { max: 1, fee: 27 }, { max: 3, fee: 28 }, { max: 10, fee: 28 }],
      rules: { volumetricDivisor: 6000, maxWeightKg: 10, transitZh: '全程约 9-16 个工作日（含本地 VAT）', transitPt: '9-16 dias úteis (VAT local incluído)' },
      battery: 'builtin'
    },
    {
      code: 'AJ-EC', nameZh: '厄瓜多尔专线（安骏 DDU）', namePt: 'Equador expresso (Anjun DDU)', country: 'EC', mode: 'parcel',
      kind: 'agent', currency: 'CNY', unit: 'KG',
      tiers: [], classes: [], perKg: 108,
      opFees: [{ max: 1, fee: 37 }, { max: 2, fee: 45 }, { max: 3, fee: 53 }, { max: 3.9, fee: 62 }],
      rules: { volumetricDivisor: 6000, maxWeightKg: 3.9, transitZh: '主要城市 10-15 天（B 类 4KG 内）', transitPt: '10-15 dias (modalidade B, até 4kg)' },
      battery: 'builtin'
    },
    {
      code: 'AJ-PE', nameZh: '秘鲁专线带电（安骏 DDP）', namePt: 'Peru expresso c/ bateria (Anjun DDP)', country: 'PE', mode: 'parcel',
      kind: 'agent', currency: 'CNY', unit: 'KG',
      tiers: [], classes: [], perKg: 108,
      opFees: [{ max: 0.5, fee: 30 }, { max: 2, fee: 30 }, { max: 3, fee: 33 }],
      overFee: { overKg: 3, stepKg: 1, fee: 4 },
      rules: { volumetricDivisor: 6000, maxWeightKg: 30, transitZh: '主要城市 10-15 天（按 1 区计费）', transitPt: '10-15 dias (zona 1)' },
      battery: 'builtin'
    }
  ],
  /** 巴西反倾销提示（报价表「巴西反倾销产品」页） */
  antiDumpingKeywords: ['保温瓶', '保温杯', '鞋类', '无框镜子', '粘胶纤维', '合成纤维毯', '玻璃制品', '陶瓷餐具', '圆珠笔', '马克笔', '轮胎', '注射器', '挂锁', '光缆', '钢瓶', '发刷', '剃须刷', '汽车玻璃', 'PET树脂', '聚氯乙烯', '平轧钢板', '纺织服装', 'garrafa térmica', 'calçado', 'espelho', 'bicicleta pneu']
};

export type PriceTable = typeof PRICE_TABLE;
