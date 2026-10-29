export type Lang = 'pt' | 'zh';

export const LANG_KEY = 'aeg_lp_lang';

export interface NavItem {
  label: string;
  href: string;
  /** 锚点 id，与语言无关 */
  id: string;
}

export interface Stat {
  value: string;
  label: string;
}

export interface Step {
  title: string;
  description: string;
}

export interface CostItem {
  code: string;
  title: string;
  description: string;
  note: string;
}

export interface Advantage {
  title: string;
  description: string;
}

export interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}

export interface LandingContent {
  /** valor para <html lang> */
  locale: string;
  docTitle: string;
  brand: string;
  navLabel: string;
  nav: NavItem[];
  login: string;
  requestAccess: string;
  goPanel: string;
  menu: string;
  closeMenu: string;
  languageLabel: string;
  skipToContent: string;
  ticker: string[];
  hero: {
    eyebrow: string;
    title: { before: string; accent: string; after: string };
    lead: string;
    ctaStart: string;
    ctaPanel: string;
    ctaHow: string;
    stats: Stat[];
    imgAlt: string;
    badge: string;
    routes: { from: string; to: string };
  };
  steps: {
    kicker: string;
    title: string;
    items: Step[];
  };
  included: {
    kicker: string;
    title: string;
    subtitle: string;
    items: CostItem[];
    total: string;
  };
  advantages: {
    kicker: string;
    title: string;
    items: Advantage[];
  };
  cta: {
    title: string;
    description: string;
    button: string;
  };
  footer: {
    brandDescription: string;
    columns: FooterColumn[];
    contactTitle: string;
    contact: { email: string; phone: string; location: string };
    copyright: string;
    tagline: string;
  };
  /** 参考预估免责声明（页面级） */
  estimateNotice: string;
}

const SECTION_IDS = {
  steps: 'como-funciona',
  included: 'incluso',
  advantages: 'vantagens'
} as const;

/** Dicionário completo PT / 中文 */
export const T: Record<Lang, LandingContent> = {
  pt: {
    locale: 'pt-BR',
    docTitle: 'AEG DDP Brasil · Cotação porta a porta China → Brasil',
    brand: 'DDP Brasil',
    navLabel: 'Navegação principal',
    nav: [
      { label: 'Como funciona', href: `#${SECTION_IDS.steps}`, id: SECTION_IDS.steps },
      { label: 'O que está incluso', href: `#${SECTION_IDS.included}`, id: SECTION_IDS.included },
      { label: 'Vantagens', href: `#${SECTION_IDS.advantages}`, id: SECTION_IDS.advantages }
    ],
    login: 'Entrar',
    requestAccess: 'Solicitar acesso',
    goPanel: 'Ir para o painel',
    menu: 'Abrir menu',
    closeMenu: 'Fechar menu',
    languageLabel: 'Idioma',
    skipToContent: 'Pular para o conteúdo',
    ticker: ['Xangai → Santos', 'DDP com custos discriminados', 'Shenzhen → Paranaguá', 'FCL com estimativa por contêiner', 'Ningbo → Santos', 'Estimativa imediata em BRL'],
    hero: {
      eyebrow: 'Porta a porta · China → Brasil',
      title: {
        before: 'Seu contêiner chega ao Brasil com ',
        accent: 'custos transparentes',
        after: '.'
      },
      lead: 'Estimativa DDP em reais a partir da sua planilha de empacotamento. Frete marítimo, taxas de origem, DI e tributos discriminados linha a linha. Valores de referência — não é proposta final.',
      ctaStart: 'Começar agora',
      ctaPanel: 'Abrir meu painel',
      ctaHow: 'Ver como funciona',
      stats: [
        { value: '5', label: 'itens de custo discriminados' },
        { value: 'BRL', label: 'estimativa em reais' },
        { value: '24/7', label: 'cotação automática' }
      ],
      imgAlt: 'Navio porta-contêineres cruzando o oceano',
      badge: 'Estimativa automática · 24/7',
      routes: { from: 'Shenzhen / Ningbo / Xangai', to: 'Santos / Paranaguá + entrega' }
    },
    steps: {
      kicker: 'Fluxo do cliente',
      title: 'Quatro passos até a sua estimativa DDP',
      items: [
        { title: 'Baixe o modelo', description: 'Planilha padronizada de empacotamento (27 colunas) com fórmulas automáticas de volume e peso.' },
        { title: 'Preencha a carga', description: 'Caixas, dimensões, peso bruto e líquido. O sistema recalcula CBM e totais para você.' },
        { title: 'Envie a planilha', description: 'Upload no painel. Validação imediata: erros apontados linha por linha, coluna por coluna.' },
        { title: 'Receba a estimativa DDP', description: 'Estimativa de referência em reais (BRL), com frete marítimo, taxas de origem, DI e tributos discriminados. Não é proposta final.' }
      ]
    },
    included: {
      kicker: 'DDP detalhado',
      title: 'O que a sua estimativa DDP inclui',
      subtitle: 'Cada linha é discriminada e auditável. Tributos, câmbio e despesas adicionais podem mudar até a confirmação — o valor válido é o confirmado por escrito e na fatura oficial.',
      items: [
        { code: 'FRETE MARÍTIMO', title: 'Frete marítimo FCL', description: 'Contêiner completo China → Brasil com estimativa de referência por contêiner, sem variação pelo volume da carga.', note: 'USD / contêiner · conversão BRL no câmbio de referência' },
        { code: 'ORIGEM', title: 'Taxas portuárias de origem', description: 'Documentos, terminal, transporte interno até o porto e manuseio no lado chinês — discriminados numa linha só.', note: 'BL, VGM, documentação e drayage inclusos' },
        { code: 'DESTINO', title: 'Despacho aduaneiro Brasil', description: 'Cálculo discriminado: imposto de importação, ICMS, despachante, taxas do porto de destino e entrega.', note: 'Valores de referência, sujeitos a ajuste' }
      ],
      total: 'Estimativa DDP = Frete marítimo + Taxas de origem + DI e tributos no Brasil'
    },
    advantages: {
      kicker: 'Por que a AEG',
      title: 'Importação sem fricção',
      items: [
        { title: 'Estimativa em reais', description: 'Estimativa em BRL, com câmbio e memória de cálculo transparentes.' },
        { title: 'Detalhamento transparente', description: 'DDP porta a porta: cada item de custo é discriminado e auditável, com valores de referência.' },
        { title: 'Cotação imediata', description: 'Suba a planilha e receba a estimativa em segundos, 24/7.' },
        { title: 'Histórico completo', description: 'Todas as estimativas ficam salvas no seu painel para comparação.' }
      ]
    },
    cta: {
      title: 'Pronto para simular o próximo contêiner?',
      description: 'Envie sua planilha hoje e receba a estimativa DDP de referência em minutos.',
      button: 'Acessar o painel'
    },
    footer: {
      brandDescription: 'Logística internacional porta a porta para importadores brasileiros. Estimativa, embarque e despacho em um só lugar.',
      columns: [
        {
          title: 'Produto',
          links: [
            { label: 'Como funciona', href: `#${SECTION_IDS.steps}` },
            { label: 'O que está incluso', href: `#${SECTION_IDS.included}` },
            { label: 'Vantagens', href: `#${SECTION_IDS.advantages}` }
          ]
        },
        {
          title: 'Acesso',
          links: [
            { label: 'Entrar no painel', href: '/login' },
            { label: 'Solicitar acesso', href: '/register' },
            { label: 'Meus orçamentos', href: '/workbench' }
          ]
        }
      ],
      contactTitle: 'Contato',
      contact: { email: 'comercial@aeg-log.com.br', phone: '+55 11 4002-8922', location: 'São Paulo · SP' },
      copyright: `© ${new Date().getFullYear()} AEG Logística Internacional · Todos os direitos reservados`,
      tagline: 'Estimativas DDP em BRL · Frete marítimo FCL'
    },
    estimateNotice: 'Aviso: os valores exibidos são estimativas de referência, calculadas com base em tributos estimados, tarifas e câmbio atuais. Não constituem proposta final. Tributos, câmbio e despesas adicionais podem ser ajustados; o valor válido é o confirmado por escrito pela nossa empresa e na fatura oficial.'
  },
  zh: {
    locale: 'zh-CN',
    docTitle: 'AEG DDP · 中国 → 巴西 门到门整柜报价',
    brand: '巴西专线',
    navLabel: '主导航',
    nav: [
      { label: '操作流程', href: `#${SECTION_IDS.steps}`, id: SECTION_IDS.steps },
      { label: '费用包含', href: `#${SECTION_IDS.included}`, id: SECTION_IDS.included },
      { label: '平台优势', href: `#${SECTION_IDS.advantages}`, id: SECTION_IDS.advantages }
    ],
    login: '登录',
    requestAccess: '申请开通',
    goPanel: '进入工作台',
    menu: '打开菜单',
    closeMenu: '关闭菜单',
    languageLabel: '语言',
    skipToContent: '跳至主要内容',
    ticker: ['上海 → 桑托斯', 'DDP 全链路明细透明', '深圳 → 巴拉那瓜', '整柜海运 · 按柜参考价', '宁波 → 桑托斯', '雷亚尔即时预估'],
    hero: {
      eyebrow: '门到门 · 中国 → 巴西',
      title: {
        before: '您的整柜直达巴西，',
        accent: '明细透明',
        after: '，费用逐项可查。'
      },
      lead: '上传装箱清单即可获得 DDP 雷亚尔参考预估。海运费单独列示，DDP 总价包含税费及综合运营费用。金额为参考预估，不构成最终报价。',
      ctaStart: '立即开始',
      ctaPanel: '打开我的工作台',
      ctaHow: '查看操作流程',
      stats: [
        { value: '5', label: '项费用逐项拆解' },
        { value: 'BRL', label: '雷亚尔参考预估' },
        { value: '24/7', label: '自动预估' }
      ],
      imgAlt: '集装箱货轮航行在大海上',
      badge: '自动预估 · 24/7',
      routes: { from: '深圳 / 宁波 / 上海', to: '桑托斯 / 巴拉那瓜 + 派送' }
    },
    steps: {
      kicker: '客户流程',
      title: '四步获取 DDP 参考预估',
      items: [
        { title: '下载模板', description: '标准装箱清单模板（27 列），体积与重量公式自动计算。' },
        { title: '填写货物', description: '箱号、尺寸、毛重净重。系统自动重算 CBM 与合计。' },
        { title: '上传 Excel', description: '在工作台上传，即时校验：错误逐行逐列精确定位。' },
        { title: '收到 DDP 参考预估', description: '雷亚尔（BRL）参考预估，逐项列出海运费、起运港杂费、进口税费与销售税务。不构成最终报价。' }
      ]
    },
    included: {
      kicker: 'DDP 费用明细',
      title: 'DDP 参考预估包含哪些费用',
      subtitle: '每项费用单独列明、可逐项核对。税费、汇率及附加费用可能调整，最终价格以我司书面确认及正式账单为准。',
      items: [
        { code: '海运费', title: '整柜海运费（FCL）', description: '中国 → 巴西整柜，按柜给出参考价，不随货量变化。', note: 'USD/柜 · 按参考汇率折算 BRL' },
        { code: '起运港', title: '起运港杂费', description: '单证、码头、港区拖车与操作——合并为一项列明。', note: '含提单、VGM、报关单证与拖车' },
        { code: '目的港', title: '巴西清关费用', description: '费用逐项拆解：进口关税、ICMS、报关、目的港杂费与派送。', note: '金额为参考预估，可能随税率与汇率调整' }
      ],
      total: 'DDP 参考预估 = 海运费 + 起运港杂费 + 巴西 DI 与销售税务'
    },
    advantages: {
      kicker: '为什么选择 AEG',
      title: '进口不再繁琐',
      items: [
        { title: '雷亚尔参考预估', description: '参考预估以 BRL 呈现，汇率与计算明细透明可查。' },
        { title: '明细透明', description: 'DDP 门到门：每项费用单独列出、逐项可核对，均为参考预估。' },
        { title: '即时预估', description: '上传清单，几秒钟出参考预估，全天候可用。' },
        { title: '完整历史', description: '所有报价单保存在工作台，随时对比追溯。' }
      ]
    },
    cta: {
      title: '准备好测算下一个整柜了吗？',
      description: '今天上传装箱清单，几分钟内获得 DDP 参考预估。',
      button: '进入工作台'
    },
    footer: {
      brandDescription: '面向巴西进口商的门到门国际物流。参考预估、订舱、清关，一个平台完成。',
      columns: [
        {
          title: '产品',
          links: [
            { label: '操作流程', href: `#${SECTION_IDS.steps}` },
            { label: '费用包含', href: `#${SECTION_IDS.included}` },
            { label: '平台优势', href: `#${SECTION_IDS.advantages}` }
          ]
        },
        {
          title: '入口',
          links: [
            { label: '登录工作台', href: '/login' },
            { label: '申请开通', href: '/register' },
            { label: '我的报价单', href: '/workbench' }
          ]
        }
      ],
      contactTitle: '联系',
      contact: { email: 'comercial@aeg-log.com.br', phone: '+55 11 4002-8922', location: '圣保罗 · SP' },
      copyright: `© ${new Date().getFullYear()} AEG 国际物流 · 版权所有`,
      tagline: 'BRL 雷亚尔 DDP 参考预估 · 整柜海运'
    },
    estimateNotice: '免责声明：页面展示金额为参考预估，基于当前税费预估、费率及汇率计算，不构成最终报价。税费、汇率及附加费用可能调整，最终价格以我司书面确认及正式账单为准。'
  }
};
