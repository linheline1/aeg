export type Lang = 'pt' | 'zh';

export const LANG_KEY = 'aeg_lp_lang';

export interface NavItem {
  label: string;
  href: string;
  /** 锚点 id，与语言无关 */
  id: string;
  /** 下拉子项（如"海外专线"） */
  children?: NavItem[];
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

export interface CompanyValue {
  title: string;
  description: string;
}

export interface CompanyStat {
  /** 大数字（如 "30,000㎡"） */
  value: string;
  label: string;
}

export interface CompanyRegion {
  /** 板块标签（如 "基本盘" / "第二市场"） */
  tag: string;
  name: string;
  /** 板块亮点列表 */
  points: string[];
}

export interface CompanyWarehouse {
  country: string;
  city: string;
  area: string;
}

export interface CompanyContent {
  docTitle: string;
  kicker: string;
  title: string;
  lead: string;
  story: string[];
  heroImgAlt: string;
  statsKicker: string;
  statsTitle: string;
  stats: CompanyStat[];
  regionsKicker: string;
  regionsTitle: string;
  regionsLead: string;
  regions: CompanyRegion[];
  regionsImgAlt: string;
  warehousesKicker: string;
  warehousesTitle: string;
  warehousesLead: string;
  warehouses: CompanyWarehouse[];
  warehouseServices: string[];
  warehousesImgAlt: string;
  servicesKicker: string;
  servicesTitle: string;
  /** 增值服务（复用 title/description 结构） */
  services: CompanyValue[];
  valuesKicker: string;
  valuesTitle: string;
  values: CompanyValue[];
  hqKicker: string;
  hqTitle: string;
  hqAddress: string;
  hqImgAlt: string;
  /** 分公司（杭州） */
  branchKicker: string;
  branchTitle: string;
  branchAddress: string;
  branchImgAlt: string;
}

export interface PartnerLogo {
  /** 船公司标识，对应 assets/partners/ 下的资源文件 */
  id: string;
  /** 合作伙伴名称（瓦片下方文字） */
  name: string;
}

export interface PartnerCategory {
  title: string;
  logos: PartnerLogo[];
}

export interface PartnersContent {
  docTitle: string;
  kicker: string;
  title: string;
  lead: string;
  categories: PartnerCategory[];
  cta: { title: string; description: string; button: string };
}

/** 海外专线页的一个内容区块 */
export interface LineSection {
  /** 区块标题（如"一、DDP 双清包税专线核心优势"） */
  heading: string;
  /** 区块导语段落 */
  intro?: string;
  /** 卡片列表 */
  items?: { title: string; description: string }[];
  /** 要点列表 */
  bullets?: string[];
}

export interface LinePageContent {
  docTitle: string;
  kicker: string;
  title: string;
  lead: string;
  sections: LineSection[];
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
  /** 回到顶部按钮的无障碍标签 */
  backTop: string;
  consultation: { button: string; note: string };
  faq: { kicker: string; title: string; items: { question: string; answer: string }[] };
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
    /** 装饰性竖排提示（aria-hidden） */
    scrollHint: string;
    routes: { from: string; to: string; label: string };
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
  /** 公司介绍页（/company） */
  company: CompanyContent;
  /** 合作伙伴页（/partners） */
  partners: PartnersContent;
  /** 巴西专线（/lines/brazil） */
  lineBrazil: LinePageContent;
  /** 阿根廷专线（/lines/argentina） */
  lineArgentina: LinePageContent;
  /** 南美专线·智利/哥伦比亚/秘鲁（/lines/south-america） */
  lineSouthAmerica: LinePageContent;
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
      { label: 'Início', href: '/', id: 'home' },
      {
        label: 'Linhas internacionais',
        href: '/lines/brazil',
        id: 'lines',
        children: [
          { label: 'Linha Brasil', href: '/lines/brazil', id: 'line-brazil' },
          { label: 'Linha Argentina', href: '/lines/argentina', id: 'line-argentina' },
          { label: 'Linha América do Sul', href: '/lines/south-america', id: 'line-south-america' }
        ]
      },
      { label: 'Sobre nós', href: '/company', id: 'company' },
      { label: 'Parceiros', href: '/partners', id: 'partners' }
    ],
    login: 'Entrar',
    requestAccess: 'Solicitar acesso',
    goPanel: 'Ir para o painel',
    menu: 'Abrir menu',
    closeMenu: 'Fechar menu',
    languageLabel: 'Idioma',
    skipToContent: 'Pular para o conteúdo',
    backTop: 'Voltar ao topo',
    consultation: { button: 'Falar com a equipe por e-mail', note: 'Informe o tipo de mercadoria, a origem e a cidade de entrega. O link abre seu aplicativo de e-mail.' },
    faq: {
      kicker: 'Antes de começar', title: 'Dúvidas sobre a sua estimativa',
      items: [
        { question: 'Como solicito uma estimativa?', answer: 'Crie sua conta, acesse o painel e envie a planilha de empacotamento. Confira os dados identificados antes de confirmar a solicitação. Acompanhe o status no painel.' },
        { question: 'Quais informações devo preparar?', answer: 'Prepare a descrição das mercadorias, quantidades, dimensões, pesos e valores declarados. O modelo disponível no painel orienta o preenchimento da planilha.' },
        { question: 'A estimativa é o preço final?', answer: 'Não. Os valores são referências e podem mudar conforme tributos, câmbio e despesas adicionais. O preço final depende da confirmação por escrito e da fatura oficial.' },
        { question: 'Em qual moeda os valores são apresentados?', answer: 'A estimativa DDP é apresentada em reais (BRL). O frete marítimo é discriminado separadamente; confira a moeda e o câmbio indicados em cada item.' },
        { question: 'Qual é o prazo de transporte?', answer: 'O prazo depende da rota, disponibilidade de embarque, liberação aduaneira e destino da entrega. Consulte a equipe sobre a sua operação antes de planejar o recebimento.' },
        { question: 'Ainda não tenho a planilha pronta. Posso conversar com a equipe?', answer: 'Sim. Use o contato por e-mail para apresentar sua mercadoria, origem e cidade de entrega. Não envie senhas ou documentos pessoais no primeiro contato.' }
      ]
    },
    ticker: ['Xangai → Santos', 'DDP com custos discriminados', 'Shenzhen → Paranaguá', 'FCL com estimativa por contêiner', 'Ningbo → Santos', 'Estimativa de referência em BRL'],
    hero: {
      eyebrow: 'Porta a porta · China → Brasil',
      title: {
        before: 'Seu contêiner chega ao Brasil com ',
        accent: 'custos transparentes',
        after: '.'
      },
      lead: 'Estimativa DDP em reais a partir da sua planilha de empacotamento. Frete marítimo, taxas de origem, DI e tributos discriminados linha a linha. Valores de referência — não é proposta final.',
      ctaStart: 'Solicitar estimativa',
      ctaPanel: 'Abrir meu painel',
      ctaHow: 'Ver como funciona',
      stats: [
        { value: '5', label: 'itens de custo discriminados' },
        { value: 'BRL', label: 'estimativa em reais' },
        { value: 'Online', label: 'acompanhe no painel' }
      ],
      imgAlt: 'Navio porta-contêineres cruzando o oceano',
      badge: 'China → Brasil · FCL',
      scrollHint: 'Role para explorar',
      routes: { from: 'Shenzhen / Ningbo / Xangai', to: 'Santos / Paranaguá + entrega', label: 'DDP porta a porta' }
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
        { title: 'Acompanhamento online', description: 'Envie a planilha e acompanhe a análise e a estimativa no painel.' },
        { title: 'Histórico completo', description: 'Todas as estimativas ficam salvas no seu painel para comparação.' }
      ]
    },
    cta: {
      title: 'Pronto para simular o próximo contêiner?',
      description: 'Envie sua planilha para solicitar uma estimativa. Ainda tem dúvidas? Converse com a equipe.',
      button: 'Acessar o painel'
    },
    footer: {
      brandDescription: 'Logística internacional porta a porta para importadores brasileiros. Estimativa, embarque e despacho em um só lugar.',
      columns: [
        {
          title: 'Produto',
          links: [
            { label: 'Como funciona', href: `/#${SECTION_IDS.steps}` },
            { label: 'O que está incluso', href: `/#${SECTION_IDS.included}` },
            { label: 'Vantagens', href: `/#${SECTION_IDS.advantages}` }
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
      copyright: `© ${new Date().getFullYear()} Shenzhen Jimeitong Supply Chain Co., Ltd. · Todos os direitos reservados`,
      tagline: 'Estimativas DDP em BRL · Frete marítimo FCL'
    },
    estimateNotice: 'Aviso: os valores exibidos são estimativas de referência, calculadas com base em tributos estimados, tarifas e câmbio atuais. Não constituem proposta final. Tributos, câmbio e despesas adicionais podem ser ajustados; o valor válido é o confirmado por escrito pela nossa empresa e na fatura oficial.',
    company: {
      docTitle: 'AEG DDP Brasil · Quem somos',
      kicker: 'Sobre a AEG',
      title: 'Logística cross-border completa: da China e do Sudeste Asiático ao Brasil',
      lead: 'A AEG Express (Shenzhen Jiya Supply Chain) é uma prestadora de serviços logísticos one-stop para e-commerce cross-border, com dois blocos de operação: o Sudeste Asiático como base estratégica e a América do Sul como segundo mercado em expansão acelerada.',
      story: [
        'Nossa origem remonta a 14 anos de atuação no Sudeste Asiático como Shenzhen Longxun Supply Chain. Em agosto de 2020, passamos a nos chamar Shenzhen Jiya Supply Chain (AEG Express), com foco em logística one-stop para o RCEP. Em abril de 2026, criamos a Shenzhen Anyi Zhilian Technology como bloco independente para a América do Sul, consolidando a operação AEG Jiya no continente.',
        'São 9 subsidiárias no exterior — Hong Kong, Vietnã, Tailândia, Singapura, Indonésia, Malásia, Filipinas, Brasil e Argentina — com times próprios de operação, armazéns e despachantes aduaneiros nas duas pontas. O sistema T3, desenvolvido internamente, integra transporte, pedidos e armazenagem, com rastreio atualizado a cada 6 horas e alertas automáticos de exceções.',
        'Para o Brasil, a AEG opera o combo "linha DDP + armazém local": cotação fechada, desembaraço e entrega sob responsabilidade única, com apoio à entrada no Mercado Livre, etiquetagem de inbound e last-mile integrado a 12 operadores locais.'
      ],
      heroImgAlt: 'Mapa global com as rotas da AEG Express entre a China, o Sudeste Asiático e a América do Sul',
      statsKicker: 'Escala da operação',
      statsTitle: 'Uma rede que já opera em escala industrial',
      stats: [
        { value: '14 anos', label: 'de atuação em logística cross-border' },
        { value: '9', label: 'subsidiárias no exterior' },
        { value: '30.000+㎡', label: 'de armazéns em operação' },
        { value: '20+', label: 'armazéns na China e no exterior' },
        { value: '10.000+', label: 'pedidos processados por dia' },
        { value: '1.000+', label: 'clientes atendidos' }
      ],
      regionsKicker: 'Dois blocos de operação',
      regionsTitle: 'Sudeste Asiático como base, América do Sul como fronteira',
      regionsLead: 'Não somos apenas Brasil: o Sudeste Asiático é nosso território de origem, e a América do Sul é o mercado que estamos construindo com a mesma estrutura dedicada.',
      regions: [
        {
          tag: 'Bloco principal',
          name: 'Sudeste Asiático',
          points: [
            'Cobertura em 8 países: Vietnã, Tailândia, Malásia, Singapura, Indonésia, Filipinas, Camboja e Sri Lanka',
            '7 subsidiárias locais e receita de quase RMB 500 milhões em 2024',
            'Linha dedicada de envelopes: 3–7 dias; transporte terrestre via Pingxiang/Dongxing: 3–5 dias para Vietnã e Tailândia',
            'Desembaraço em 1 dia pelo canal dedicado da alfândega de Pingxiang, com atraso inferior a 1% em alta temporada',
            'Suporte completo a COD e a cargas com bateria e magnéticas'
          ]
        },
        {
          tag: 'Segundo mercado',
          name: 'América do Sul · Brasil',
          points: [
            'Linha marítima DDP porta a porta: 28–35 dias, com 3 saídas semanais garantidas por acordo BSA de lock de espaço',
            'Desembaraço de carga geral em cerca de 2,5 dias e first mile aéreo em ~7 dias',
            'Dois armazéns no Brasil somando 6.800㎡, com gestão chinesa e times locais',
            'Inbound e etiquetagem para Mercado Livre, dropshipping, trocas e devoluções',
            'Last-mile integrado a 12 operadores de entrega locais nas principais cidades'
          ]
        }
      ],
      regionsImgAlt: 'Interior do armazém da AEG com estantes e operação de cargas em andamento',
      warehousesKicker: 'Rede de armazéns',
      warehousesTitle: 'Armazéns próprios nas duas pontas da rota',
      warehousesLead: 'Uma rede de 20+ armazéns entre a China e o exterior — recebimento, consolidação e fulfilment com padrão único de operação.',
      warehouses: [
        { country: 'Brasil', city: 'São Paulo', area: '6.800㎡' },
        { country: 'Argentina', city: 'Buenos Aires', area: '3.000㎡' },
        { country: 'Filipinas', city: 'Manila', area: '10.000㎡' },
        { country: 'Tailândia', city: 'Bangkok', area: '5.000㎡' },
        { country: 'Vietnã', city: 'Hanói · Ho Chi Minh', area: '5.000㎡' },
        { country: 'Singapura', city: 'Singapura', area: '5.000㎡' },
        { country: 'Canadá', city: 'Toronto · Vancouver', area: '5.000㎡' },
        { country: 'China', city: 'Shenzhen · Yiwu · Guangzhou · Xangai', area: '4 centros de recebimento' }
      ],
      warehouseServices: [
        'Dropshipping',
        'Trocas e devoluções',
        'Etiquetagem de inbound',
        'Transferência entre armazéns',
        'Separação no mesmo dia (T+1)',
        'Sincronização de estoque'
      ],
      warehousesImgAlt: 'Área de carga e descarga do armazém com contêineres e paletes',
      servicesKicker: 'Além do frete',
      servicesTitle: 'Serviços de valor agregado para operar localmente',
      services: [
        { title: 'Registro de loja local', description: 'Abertura e acompanhamento de lojas locais no Brasil e no Sudeste Asiático para sellers que precisam de presença nativa.' },
        { title: 'Distribuição de lotes', description: 'Divisão e distribuição de lotes de mercadorias entre armazéns e canais, conectando oferta a demanda local.' },
        { title: 'Treinamento de canais', description: 'Capacitação para sellers de e-commerce independente e TikTok, transferindo o conhecimento operacional da nossa rede.' },
        { title: 'Despachante e câmbio', description: 'Despachantes e agentes de aduana próprios nas duas pontas, com liquidação cambial em conformidade.' }
      ],
      valuesKicker: 'Nossos princípios',
      valuesTitle: 'Transparência e especialização em cada embarque',
      values: [
        { title: 'Detalhamento transparente', description: 'Cada item de custo é listado e auditável, sem taxas ocultas.' },
        { title: 'Processo online', description: 'Do upload da planilha à estimativa, tudo acontece no painel e fica registrado.' },
        { title: 'Equipe nos dois lados', description: 'Times locais na China e no Brasil, com cobertura em ambos os fusos horários.' },
        { title: 'Compliance primeiro', description: 'Conhecemos os tributos e o despacho de importação brasileiros e defendemos a declaração correta.' }
      ],
      hqKicker: 'Matriz',
      hqTitle: 'Shenzhen Jiya Supply Chain Co., Ltd.',
      hqAddress: "Sala 612, Fucheng Times Plaza, Rua Xin'an, Distrito de Baoan, Shenzhen, China",
      hqImgAlt: 'Recepção da matriz da AEG em Shenzhen com a marca na parede',
      branchKicker: 'Filial',
      branchTitle: 'Shenzhen Jimeitong Supply Chain Co., Ltd. · Filial de Hangzhou',
      branchAddress: 'Salas 432-434, Edifício 6, Lvcheng Xixi Century Center, Distrito de Xihu, Hangzhou',
      branchImgAlt: 'Entrada da filial em Hangzhou: parede de marca AEG e número 434 na porta'
    },
    partners: {
      docTitle: 'AEG DDP Brasil · Parceiros',
      kicker: 'Rede de parceiros',
      title: 'Uma rede conectada dos dois lados do oceano',
      lead: 'A AEG coordena armadores, terminais, despachantes e redes de entrega para que cada contêiner siga porta a porta sem fricção.',
      categories: [
        {
          title: 'Armadores e rotas',
          logos: [
            { id: 'msc', name: 'MSC' },
            { id: 'maersk', name: 'Maersk' },
            { id: 'cmacgm', name: 'CMA CGM' },
            { id: 'cosco', name: 'COSCO' },
            { id: 'hapaglloyd', name: 'Hapag-Lloyd' },
            { id: 'one', name: 'ONE' },
            { id: 'evergreen', name: 'Evergreen' },
            { id: 'hmm', name: 'HMM' },
            { id: 'yangming', name: 'Yang Ming' },
            { id: 'zim', name: 'ZIM' }
          ]
        },
        {
          title: 'Parceiros do ecossistema',
          logos: [
            { id: 'santosbrasil', name: 'Santos Brasil' },
            { id: 'mercadolibre', name: 'Mercado Livre' }
          ]
        }
      ],
      cta: {
        title: 'Quer se tornar um parceiro AEG?',
        description: 'Se você atua com navegação, armazenagem, despacho aduaneiro ou entrega, fale com a nossa equipe sobre oportunidades na rede.',
        button: 'Falar com a equipe de parcerias'
      }
    },
    lineBrazil: {
      docTitle: 'AEG · Linha Brasil DDP porta a porta',
      kicker: 'Linha Brasil',
      title: 'Linha DDP com desembaraço e tributos inclusos',
      lead: 'Exportação na China, desembaraço no Brasil e pagamento de tributos em um único serviço porta a porta — sem burocracia para o vendedor.',
      sections: [
        {
          heading: 'Vantagens da linha DDP com desembaraço incluso',
          items: [
            { title: 'Desembaraço completo sem preocupação', description: 'Abrange a declaração de exportação na China, o desembaraço de importação no Brasil e o pagamento dos tributos. O vendedor não precisa lidar com trâmites complexos — ideal para pequenas e médias empresas sem experiência em customs.' },
            { title: 'Prazo estável e controlável', description: 'Linha aérea: 10-15 dias de armazém a armazém; cargas urgentes com entrega porta a porta em 8-12 dias. Linha marítima: 50-60 dias no total, com saídas adicionais na alta temporada para garantir continuidade.' },
            { title: '99% de sucesso no desembaraço', description: 'Com equipe local de desembaraço no Brasil, liberação rápida em 1-3 dias, evitando risco de retenção da carga.' }
          ]
        },
        {
          heading: 'Modais flexíveis para cada carga',
          items: [
            { title: 'Aéreo prioritário', description: 'Para cargas de alto valor agregado e sensíveis ao prazo (eletrônicos, amostras): chegada direta aos aeroportos do Brasil em 3-5 dias.' },
            { title: 'Marítimo econômico', description: 'Para cargas volumosas (móveis, equipamentos): recomenda-se FCL (contêiner completo) ou LCL (consolidado), com baixo limiar de embarque e economia significativa de custo.' }
          ]
        },
        {
          heading: 'Ampla compatibilidade de cargas',
          intro: 'Da carga geral às cargas sensíveis, cobertura completa:',
          bullets: [
            'Produtos com bateria',
            'Cosméticos (com laudo de teste)',
            'Equipamentos de grande porte e cargas especiais em pó/líquido',
            'Calçados e bolsas de marca, equipamentos de estética médica e outros itens de alto valor'
          ]
        },
        {
          heading: 'Serviços de valor agregado',
          items: [
            { title: 'Rastreamento completo', description: 'Atualizações em tempo real do embarque à entrega, com integração via API.' },
            { title: 'Gestão de riscos', description: 'Equipe própria de distribuição no Brasil + seguro de carga opcional, com taxa de perda abaixo da média do setor.' },
            { title: 'Soluções personalizadas', description: 'Linha expressa para produtos sujeitos a antidumping, com entrega em 9-16 dias úteis.' }
          ]
        },
        {
          heading: 'As três grandes certificações do Brasil',
          intro: 'INMETRO, ANATEL e ANVISA correspondem respectivamente às áreas de segurança e qualidade, telecomunicações sem fio e saúde sanitária.',
          items: [
            { title: 'INMETRO', description: 'Gerido pelo Instituto Nacional de Metrologia, Qualidade e Tecnologia. Certificação obrigatória para produtos de maior risco de segurança: eletrodomésticos, luminárias, brinquedos, autopeças, plugues e tomadas.' },
            { title: 'ANATEL', description: 'Gerido pela Agência Nacional de Telecomunicações. Destina-se a produtos com função de comunicação sem fio: celulares, dispositivos Bluetooth, roteadores Wi-Fi, smartwatches.' },
            { title: 'ANVISA', description: 'Gerido pela Agência Nacional de Vigilância Sanitária — equivalente ao FDA brasileiro. Abrange produtos ligados à saúde: cosméticos, dispositivos médicos, alimentos e medicamentos. É a certificação mais rigorosa e com o ciclo mais longo das três.' }
          ]
        }
      ]
    },
    lineArgentina: {
      docTitle: 'AEG · Linha Argentina DDP porta a porta',
      kicker: 'Linha Argentina',
      title: 'Desembaraço duplo com entrega na porta',
      lead: 'Nossa equipe cuida de toda a cadeia: coleta, embalagem, transporte, despacho aduaneiro e entrega final no endereço indicado.',
      sections: [
        {
          heading: 'Serviços principais',
          items: [
            { title: 'Desembaraço duplo porta a porta', description: 'A equipe conduz todo o processo: coleta, embalagem, transporte e trâmites aduaneiros — declaração, inspeção e pagamento de tributos — com entrega direta no endereço do destinatário após a liberação.' },
            { title: 'Linha marítima', description: 'Custo mais baixo (a partir de ~US$ 220/m³), ideal para cargas volumosas, com prazo de cerca de 60-70 dias.' },
            { title: 'Linha aérea', description: 'Prazo rápido de 10-15 dias, frete a partir de ~US$ 15/kg.' },
            { title: 'Serviço com tributos inclusos', description: 'Todos os direitos aduaneiros e impostos de importação pagos pelo operador logístico, evitando custos extras por desconhecimento da política tributária.' },
            { title: 'Armazém no exterior', description: 'Fulfillment com envio unitário e serviços de transbordo, etiquetagem e envio a centros FULL.' }
          ]
        },
        {
          heading: 'Vantagens',
          bullets: [
            'Equipe de desembaraço familiarizada com os complexos procedimentos aduaneiros da Argentina (documentos de importação preenchidos com precisão)',
            'Rotas fixas garantem estabilidade; armazém em Buenos Aires aumenta a eficiência de distribuição',
            'Capacidade para categorias especiais, incluindo produtos que exigem certificação IRAM'
          ]
        },
        {
          heading: 'Pontos de atenção',
          bullets: [
            'As informações da carga devem ser declaradas com precisão — a aduana argentina aplica penalidades severas por erros em documentos',
            'Recomenda-se escolher um operador compliance com mais de 10 anos de experiência em desembaraço na Argentina',
            'Produtos têxteis e categorias específicas podem ter condições especiais de frete'
          ]
        }
      ]
    },
    lineSouthAmerica: {
      docTitle: 'AEG · Linhas América do Sul: Chile, Colômbia e Peru',
      kicker: 'Linha América do Sul',
      title: 'Pacotes aéreos de e-commerce para Chile, Colômbia e Peru',
      lead: 'Integração de recursos de ponta a ponta para lançar produtos de pacotes aéreos de e-commerce transfronteiriço da China para os três países.',
      sections: [
        {
          heading: 'Linha Colômbia',
          intro: 'Com cerca de 50 milhões de habitantes e idioma espanhol, a Colômbia é um dos países mais atraentes da América Latina para negócios. Os usuários de internet somam ~35 milhões (~70%). Em 2021 o e-commerce cresceu 40%, e 50% dos compradores online estão em Bogotá. As plataformas mais populares são MercadoLibre e Amazon, além de Falabella, Homecenter, Exito, OLX, Linio e AliExpress; a Shopee também entrou no país em 2021.',
          items: [
            { title: 'Prazo total', description: '9-14 dias.' },
            { title: 'Entrega', description: 'Courier local cobrindo todo o território, sem sobretaxa de área remota.' },
            { title: 'Cargas aceitas', description: 'Carga geral e produtos com bateria de lítio embutida.' },
            { title: 'Isenção fiscal', description: 'Isento para valor CIF até US$ 200.' },
            { title: 'Coleta na China', description: 'Coleta porta a porta disponível na cidade de Shenzhen.' },
            { title: 'Armazenagem', description: 'Centro de armazenagem de 5.000㎡ com nova linha de triagem totalmente automatizada.' },
            { title: 'Linha principal internacional', description: 'Serviço semanal estável de frete aéreo fretado, garantindo espaço e prazo de saída.' },
            { title: 'Alta taxa de entrega', description: 'Duas tentativas gratuitas de entrega no endereço para o mesmo pacote.' }
          ]
        },
        {
          heading: 'Linha Chile',
          intro: 'Conhecido como o "país do fim do mundo", o Chile tem ~18,7 milhões de habitantes, 82% de penetração de internet e 72% de smartphones — o quinto maior mercado de e-commerce da América Latina. Os consumidores são majoritariamente jovens e de meia-idade, com preferência por vestuário, eletrônicos 3C e cuidados pessoais. O Mercado Libre é muito popular, assim como Yapo, Compray e Vende (que exigem empresa chilena ou representação local).',
          items: [
            { title: 'Prazo total', description: 'Desembaraço comercial: 8-15 dias; postal: 9-24 dias.' },
            { title: 'Entrega', description: 'Opção de courier comercial ou correio local, sem sobretaxa de área remota.' },
            { title: 'Cargas aceitas', description: 'Carga geral e produtos com bateria de lítio embutida.' },
            { title: 'Isenção fiscal', description: 'Isento para valor CIF até US$ 30.' },
            { title: 'Coleta na China', description: 'Coleta porta a porta disponível na cidade de Shenzhen.' },
            { title: 'Armazenagem', description: 'Centro de armazenagem de 5.000㎡ com nova linha de triagem totalmente automatizada.' },
            { title: 'Linha principal internacional', description: 'Voo direto de Hong Kong para Santiago, com serviço semanal estável de frete fretado.' },
            { title: 'Alta taxa de entrega', description: 'Duas tentativas gratuitas de entrega no endereço para o mesmo pacote.' }
          ]
        },
        {
          heading: 'Linha Peru',
          intro: 'O Peru tem ~32 milhões de habitantes, idade média de 31 anos, ~24 milhões de internautas e 75% de penetração de rede. Em 2020 o mercado de e-commerce atingiu US$ 4 bilhões, crescimento de 120% ao ano — 72% das compras são de produtos importados e 65% concentram-se em Lima. A plataforma mais popular é o Mercado Libre; as categorias que mais crescem são móveis e eletrodomésticos (23%), games e hobbies (22%) e cuidados pessoais e alimentos (22%).',
          items: [
            { title: 'Prazo total', description: 'Expresso: 9-12 dias; postal: 9-25 dias.' },
            { title: 'Entrega final', description: 'Opção de courier comercial ou correio local, sem sobretaxa de área remota.' },
            { title: 'Cargas aceitas', description: 'Carga geral e produtos com bateria de lítio embutida.' },
            { title: 'Isenção fiscal', description: 'Isento para valor CIF até US$ 200.' },
            { title: 'Coleta na China', description: 'Coleta porta a porta disponível na cidade de Shenzhen.' },
            { title: 'Linha principal internacional', description: 'Serviço semanal estável de frete aéreo fretado, garantindo espaço e prazo de saída.' },
            { title: 'Alta taxa de entrega', description: 'Duas tentativas gratuitas de entrega no endereço para o mesmo pacote.' }
          ]
        }
      ]
    }
  },
  zh: {
    locale: 'zh-CN',
    docTitle: 'AEG DDP · 中国 → 巴西 门到门整柜报价',
    brand: '巴西专线',
    navLabel: '主导航',
    nav: [
      { label: '首页', href: '/', id: 'home' },
      {
        label: '海外专线',
        href: '/lines/brazil',
        id: 'lines',
        children: [
          { label: '巴西专线', href: '/lines/brazil', id: 'line-brazil' },
          { label: '阿根廷专线', href: '/lines/argentina', id: 'line-argentina' },
          { label: '南美专线', href: '/lines/south-america', id: 'line-south-america' }
        ]
      },
      { label: '公司介绍', href: '/company', id: 'company' },
      { label: '合作伙伴', href: '/partners', id: 'partners' }
    ],
    login: '登录',
    requestAccess: '申请开通',
    goPanel: '进入工作台',
    menu: '打开菜单',
    closeMenu: '关闭菜单',
    languageLabel: '语言',
    skipToContent: '跳至主要内容',
    backTop: '回到顶部',
    consultation: { button: '邮件咨询团队', note: '请说明货物类型、起运地与派送城市。点击将打开您的邮件应用。' },
    faq: {
      kicker: '开始前了解', title: '关于参考预估，您可能想问',
      items: [
        { question: '如何申请参考预估？', answer: '注册账号后进入工作台，上传装箱清单，核对识别出的数据后确认申请。您可以在工作台跟进处理状态。' },
        { question: '需要提前准备哪些资料？', answer: '请准备货物名称、数量、尺寸、重量和申报金额。工作台提供的装箱清单模板会引导您填写对应字段。' },
        { question: '参考预估就是最终价格吗？', answer: '不是。税费、汇率及附加费用可能调整，最终价格以我司书面确认及正式账单为准。' },
        { question: '费用使用什么币种展示？', answer: 'DDP 参考预估以巴西雷亚尔（BRL）展示，海运费单独列示。请核对各项费用标注的币种与参考汇率。' },
        { question: '运输需要多长时间？', answer: '运输时间受航线、舱位、清关进度和派送地点影响。安排收货前，请向团队确认您这票货物的具体计划。' },
        { question: '清单尚未准备好，可以先咨询吗？', answer: '可以。您可以通过邮件介绍货物类型、起运地与派送城市，先与团队沟通需求。首次联系请勿发送密码或个人证件。' }
      ]
    },
    ticker: ['上海 → 桑托斯', 'DDP 全链路明细透明', '深圳 → 巴拉那瓜', '整柜海运 · 按柜参考价', '宁波 → 桑托斯', '雷亚尔参考预估'],
    hero: {
      eyebrow: '门到门 · 中国 → 巴西',
      title: {
        before: '您的整柜直达巴西，',
        accent: '明细透明',
        after: '，费用逐项可查。'
      },
      lead: '上传装箱清单即可获得 DDP 雷亚尔参考预估。海运费单独列示，DDP 总价包含税费及综合运营费用。金额为参考预估，不构成最终报价。',
      ctaStart: '申请参考预估',
      ctaPanel: '打开我的工作台',
      ctaHow: '查看操作流程',
      stats: [
        { value: '5', label: '项费用逐项拆解' },
        { value: 'BRL', label: '雷亚尔参考预估' },
        { value: '在线', label: '工作台跟进进度' }
      ],
      imgAlt: '集装箱货轮航行在大海上',
      badge: '中国 → 巴西 · 整柜海运',
      scrollHint: '向下滚动浏览',
      routes: { from: '深圳 / 宁波 / 上海', to: '桑托斯 / 巴拉那瓜 + 派送', label: '门到门 · 双清包税' }
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
        { title: '在线跟进', description: '上传装箱清单，在工作台跟进核算状态与参考预估。' },
        { title: '完整历史', description: '所有报价单保存在工作台，随时对比追溯。' }
      ]
    },
    cta: {
      title: '准备好测算下一个整柜了吗？',
      description: '上传装箱清单，申请参考预估。资料还没准备好？也可以先与团队沟通。',
      button: '进入工作台'
    },
    footer: {
      brandDescription: '面向巴西进口商的门到门国际物流。参考预估、订舱、清关，一个平台完成。',
      columns: [
        {
          title: '产品',
          links: [
            { label: '操作流程', href: `/#${SECTION_IDS.steps}` },
            { label: '费用包含', href: `/#${SECTION_IDS.included}` },
            { label: '平台优势', href: `/#${SECTION_IDS.advantages}` }
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
      copyright: `© ${new Date().getFullYear()} 深圳市吉美通供应链有限公司 · 版权所有`,
      tagline: 'BRL 雷亚尔 DDP 参考预估 · 整柜海运'
    },
    estimateNotice: '免责声明：页面展示金额为参考预估，基于当前税费预估、费率及汇率计算，不构成最终报价。税费、汇率及附加费用可能调整，最终价格以我司书面确认及正式账单为准。',
    company: {
      docTitle: 'AEG DDP · 公司介绍',
      kicker: '关于 AEG',
      title: '从中国与东南亚到巴西的一站式跨境物流',
      lead: '吉亚供应链（AEG Express）是跨境电商物流一站式服务商：以东南亚为基本盘，以南美为重点拓展的第二市场，双板块协同运营。',
      story: [
        '我们的前身深圳龙迅供应链深耕东南亚 14 年。2020 年 8 月更名为深圳吉亚供应链（AEG EXPRESS），专注 RCEP 一站式跨境物流；2026 年 4 月成立深圳安易智链科技，作为南美独立板块，全面承接 AEG 吉亚在南美的业务运营。',
        '公司在海外拥有 9 家子公司——香港、越南、泰国、新加坡、印尼、马来西亚、菲律宾、巴西、阿根廷，两端均有自建业务团队、海外仓与清关团队。自研 T3 系统打通运输、订单、仓储三块，轨迹约 6 小时更新一次，异常自动弹预警。',
        '面向巴西市场，AEG 以「双清包税专线 + 本地海外仓」组合服务卖家：一口价、清关、派送责任唯一，并提供美客多入仓贴标、一件代发与对接 12 家本地派送商的尾程闭环。'
      ],
      heroImgAlt: 'AEG Express 全球航线图：连接中国、东南亚与南美',
      statsKicker: '运营规模',
      statsTitle: '一张已经跑出工业化规模的物流网络',
      stats: [
        { value: '14 年', label: '跨境物流深耕' },
        { value: '9 家', label: '海外子公司' },
        { value: '30,000+㎡', label: '仓储总面积' },
        { value: '20+', label: '海内外仓库' },
        { value: '10,000+', label: '日均处理订单' },
        { value: '1,000+', label: '服务客户' }
      ],
      regionsKicker: '双板块运营',
      regionsTitle: '东南亚是基本盘，南美是第二市场',
      regionsLead: '我们不只是巴西线：东南亚是起家的主场，南美是正在以同等投入建设的增长引擎。',
      regions: [
        {
          tag: '基本盘',
          name: '东南亚',
          points: [
            '覆盖 8 国：越南、泰国、马来西亚、新加坡、印尼、菲律宾、柬埔寨、斯里兰卡',
            '7 家海外分公司，2024 年营收近 5 亿元',
            '小包专线 3–7 天；凭祥/东兴陆运通道，越南、泰国 3–5 天通达',
            '凭祥海关独家分类监管通道，1 天通关，旺季查验延误率低于 1%',
            'COD 专线布局，带电带磁类货物支持全面'
          ]
        },
        {
          tag: '第二市场',
          name: '南美 · 巴西',
          points: [
            '海运双清包税门到门 28–35 天，每周 3 班，BSA 包板锁舱保障大促舱位',
            '普货清关约 2.5 天，空运头程约 7 个自然日',
            '巴西 2 个海外仓合计 6,800㎡，华人管理 + 本地团队',
            '美客多入仓贴标、一件代发、退换货处理',
            '尾程对接 12 家本地派送商，覆盖巴西主要城市'
          ]
        }
      ],
      regionsImgAlt: 'AEG 海外仓内部：货架与货物操作实景',
      warehousesKicker: '仓储网络',
      warehousesTitle: '两端自有仓储，一套运营标准',
      warehousesLead: '海内外 20+ 座仓库：揽收、合箱、一件代发全链路打通，操作标准统一。',
      warehouses: [
        { country: '巴西', city: '圣保罗', area: '6,800㎡' },
        { country: '阿根廷', city: '布宜诺斯艾利斯', area: '3,000㎡' },
        { country: '菲律宾', city: '马尼拉', area: '10,000㎡' },
        { country: '泰国', city: '曼谷', area: '5,000㎡' },
        { country: '越南', city: '河内 · 胡志明', area: '5,000㎡' },
        { country: '新加坡', city: '新加坡', area: '5,000㎡' },
        { country: '加拿大', city: '多伦多 · 温哥华', area: '5,000㎡' },
        { country: '中国', city: '深圳 · 义乌 · 广州 · 上海', area: '4 大揽收仓' }
      ],
      warehouseServices: [
        '一件代发',
        '退换货处理',
        '入仓贴标',
        '多仓互转改标',
        '当日加班处理（T+1）',
        '库存同步店铺'
      ],
      warehousesImgAlt: '海外仓装卸区：集装箱与托盘作业实景',
      servicesKicker: '增值服务',
      servicesTitle: '把运营能力延伸到本地',
      services: [
        { title: '本土店铺注册', description: '巴西与东南亚本土店注册及陪跑，帮助卖家建立本地化经营主体。' },
        { title: '货盘分拨', description: '多仓之间货盘分拨与调拨，把供给精准匹配到本地需求。' },
        { title: '卖家培训', description: '独立站与 TikTok 卖家培训，把我们的运营经验沉淀给客户。' },
        { title: '清关与结汇', description: '两端自有清关行/报关行，配套合规结汇渠道。' }
      ],
      valuesKicker: '我们的坚持',
      valuesTitle: '以透明与专业服务每一次托运',
      values: [
        { title: '明细透明', description: '每项费用单独列示，计算过程可追溯，杜绝隐形收费。' },
        { title: '流程在线', description: '从上传装箱清单到查看参考预估，全部在工作台完成并留痕。' },
        { title: '两端团队', description: '中国与巴西本地团队协同作业，两个时区都有响应。' },
        { title: '合规为先', description: '熟悉巴西进口税务与清关要求，坚持合规申报。' }
      ],
      hqKicker: '公司总部',
      hqTitle: '深圳市吉亚供应链有限公司',
      hqAddress: '深圳市宝安区新安街道福城时代广场 612 室',
      hqImgAlt: '深圳总部前台：品牌形象墙与荣誉墙',
      branchKicker: '分公司',
      branchTitle: '深圳市吉美通供应链有限公司杭州分公司',
      branchAddress: '杭州市西湖区绿城·西溪世纪中心 6 幢 432-434',
      branchImgAlt: '杭州分公司入口：AEG 品牌形象墙与 434 门牌'
    },
    partners: {
      docTitle: 'AEG DDP · 合作伙伴',
      kicker: '合作网络',
      title: '串联两端的服务网络',
      lead: 'AEG 与航线承运商、码头仓储、巴西报关行及末端派送服务商协同作业，让每一个整柜的门到门服务保持连贯。',
      categories: [
        {
          title: '海运承运商',
          logos: [
            { id: 'msc', name: '地中海航运 MSC' },
            { id: 'maersk', name: '马士基 Maersk' },
            { id: 'cmacgm', name: '达飞 CMA CGM' },
            { id: 'cosco', name: '中远海运 COSCO' },
            { id: 'hapaglloyd', name: '赫伯罗特 Hapag-Lloyd' },
            { id: 'one', name: '海洋网联 ONE' },
            { id: 'evergreen', name: '长荣海运 Evergreen' },
            { id: 'hmm', name: '韩新海运 HMM' },
            { id: 'yangming', name: '阳明海运 Yang Ming' },
            { id: 'zim', name: '以星航运 ZIM' }
          ]
        },
        {
          title: '生态合作伙伴',
          logos: [
            { id: 'santosbrasil', name: '桑托斯码头 Santos Brasil' },
            { id: 'mercadolibre', name: '美客多 Mercado Livre' }
          ]
        }
      ],
      cta: {
        title: '希望成为我们的合作伙伴？',
        description: '如果您经营航线、仓储、清关或派送业务，欢迎与我们联系，探讨两端网络的协作机会。',
        button: '邮件联系合作团队'
      }
    },
    lineBrazil: {
      docTitle: 'AEG · 巴西专线 DDP 门到门',
      kicker: '巴西专线',
      title: 'DDP 双清包税专线，门到门一站式交付',
      lead: '中国出口报关、巴西进口清关与关税代缴一站式涵盖，商家无需处理繁琐手续，尤其适合无清关经验的中小企业。',
      sections: [
        {
          heading: '一、DDP 双清包税专线核心优势',
          items: [
            { title: '一站式通关无忧', description: '涵盖中国出口报关、巴西进口清关及关税代缴，商家无需处理繁琐手续，尤其适合无清关经验的中小企业。' },
            { title: '时效稳定可控', description: '空运专线：仓到仓 10-15 天，紧急货物门到门派送仅需 8-12 天；海运专线：全程 50-60 天，旺季加密船期保障物流连续性。' },
            { title: '清关成功率 99%', description: '依托巴西本地清关团队，1-3 天快速放行，规避货物扣押风险。' }
          ]
        },
        {
          heading: '二、运输方案灵活匹配',
          items: [
            { title: '空运优选', description: '适合高附加值、时效敏感货物（如电子产品、样品），3-5 天直达巴西机场。' },
            { title: '海运经济', description: '大宗货物（家具、设备等）推荐整柜（FCL）或拼箱（LCL），拼箱起运门槛低，成本节约显著。' }
          ]
        },
        {
          heading: '三、货物兼容性广泛',
          intro: '从普货到敏感货全覆盖：',
          bullets: [
            '带电产品',
            '化妆品（需检测报告）',
            '超大件设备及粉末/液体类特殊货物',
            '品牌鞋包、医美仪器等高价值商品'
          ]
        },
        {
          heading: '四、增值服务保障',
          items: [
            { title: '全程可视化追踪', description: '从装柜到签收实时更新，支持 API 系统对接。' },
            { title: '风险管控', description: '自有巴西配送团队 + 可选货物保险，丢件率低于行业标准。' },
            { title: '定制化方案', description: '针对反倾销商品提供特快专线，9-16 个工作日妥投。' }
          ]
        },
        {
          heading: '五、三大产品认证',
          intro: '巴西三大产品认证是 INMETRO、ANATEL、ANVISA，分别对应安全质量、无线通信和卫生健康三大领域。',
          items: [
            { title: 'INMETRO 认证', description: '由巴西国家计量、标准化和工业质量研究所管理，主要针对安全风险较高的产品，比如家电、灯具、玩具、汽车配件、插头插座等，属于强制性认证。' },
            { title: 'ANATEL 认证', description: '由巴西国家电信管理局负责，主要针对带无线通信功能的产品，比如手机、蓝牙设备、Wi-Fi 路由器、智能手表等。' },
            { title: 'ANVISA 认证', description: '由巴西国家卫生监督局管理，相当于巴西的 FDA，管的是健康相关产品，包括化妆品、医疗器械、食品、药品等，是三大认证里审核最严、周期最长的。' }
          ]
        }
      ]
    },
    lineArgentina: {
      docTitle: 'AEG · 阿根廷专线 DDP 门到门',
      kicker: '阿根廷专线',
      title: '双清到门，全程代办的阿根廷专线',
      lead: '团队全程负责货物收集、包装、运输及清关手续，货物清关后直接派送至指定收货地址。',
      sections: [
        {
          heading: '核心服务内容',
          items: [
            { title: '双清到门服务', description: '团队全程负责货物收集、包装、运输及清关手续，包含报关、报检、税费代缴等环节，货物清关后直接派送至指定收货地址。' },
            { title: '海运专线', description: '成本较低（约 220 美元/立方米起），适合大宗货物，时效约 60-70 天。' },
            { title: '空运专线', description: '时效快捷（10-15 天），运费约 15 美元/公斤起。' },
            { title: '含税服务', description: '物流商代缴所有关税和进口税，避免因税收政策不熟导致的额外成本。' },
            { title: '海外仓服务', description: '一件代发及 FULL 仓中转贴标送仓服务。' }
          ]
        },
        {
          heading: '显著优势',
          bullets: [
            '清关团队熟悉阿根廷复杂报关程序（需精确填报进口单据）',
            '固定航线保障运输稳定性，海外仓位于布宜诺斯艾利斯提高配送效率',
            '可处理特殊品类，包括需 IRAM 认证的产品'
          ]
        },
        {
          heading: '注意事项',
          bullets: [
            '必须确保货物信息申报准确，阿根廷海关对单证错误处罚严厉',
            '建议选择具备 10 年以上阿根廷清关经验的合规服务商',
            '纺织品等特定商品可享受专项运费优惠'
          ]
        }
      ]
    },
    lineSouthAmerica: {
      docTitle: 'AEG · 南美专线：智利、哥伦比亚、秘鲁',
      kicker: '南美专线',
      title: '中国至智利、哥伦比亚、秘鲁跨境电商空运小包',
      lead: '有效整合多方强势资源，强势推出中国至南美三国的跨境电商空运小包产品。',
      sections: [
        {
          heading: '哥伦比亚专线',
          intro: '哥伦比亚约 5000 万人口，以西班牙语为主要语言，是拉美地区具商业吸引力的国家。截至目前，哥伦比亚互联网用户约 3500 万，约占 70%。2021 年哥伦比亚电商同比增长 40%，50% 的在线购物者居住在波哥大。当地受欢迎的电商平台为 MercadoLibre、Amazon，以及 Falabella、Homecenter、Exito、OLX、Linio、AliExpress，2021 年 Shopee 也已进军该国。Facebook、WhatsApp、Instagram、YouTube 和 Twitter 是受欢迎的社交网络，年轻人更喜欢通过社交媒体购物，其中 Facebook 占比最高；Black Friday（黑五）和 Cyber Monday（免增值税日）是当地最重要的购物节。',
          items: [
            { title: '整体时效', description: '9-14 天。' },
            { title: '派送优势', description: '当地快递派送，覆盖全境，无偏远附加费。' },
            { title: '产品要求', description: '可接普货及内置锂电池产品等。' },
            { title: '免税政策', description: 'CIF 价 200 美元内免税。' },
            { title: '国内揽收', description: '深圳市内支持上门揽收。' },
            { title: '仓储支持', description: '5000㎡ 仓储中心，新上线全自动化分拣设备。' },
            { title: '国际干线', description: '每周稳定包机包板服务，确保舱位及出库时效。' },
            { title: '妥投率高', description: '同一包裹两次免费上门派送服务。' }
          ]
        },
        {
          heading: '智利专线',
          intro: '智利素有"天涯之国"的美誉，人口约 1870 万，互联网普及率为 82%，智能手机普及率为 72%，是拉丁美洲第五大电子商务市场。网购主要消费人群为中青年，男性比重约占 48.8%，女性约占 51.2%；品类方面比较热衷服饰类及 3C 电子、个护用品类，其次是旅游户外出行用品。Mercado Libre 在智利很受欢迎，Yapo、Compray、Vende 也有较高知名度（须智利公司或其代理才能开店）；此外智利消费者还经常选择阿里巴巴、Groupon 等海外零售商城购物。可走商清和邮清两种产品。',
          items: [
            { title: '整体时效', description: '商清 8-15 天，邮清 9-24 天。' },
            { title: '派送优势', description: '可选用商业快递和当地邮政派送，无偏远附加费。' },
            { title: '产品要求', description: '可接普货及内置锂电池产品等。' },
            { title: '免税政策', description: 'CIF 价 30 美元内免税。' },
            { title: '国内揽收', description: '深圳市内支持上门揽收。' },
            { title: '仓储支持', description: '5000㎡ 仓储中心，新上线全自动化分拣设备。' },
            { title: '国际干线', description: '香港直飞智利圣地亚哥，每周稳定包机包板服务。' },
            { title: '妥投率高', description: '同一包裹两次免费上门派送服务。' }
          ]
        },
        {
          heading: '秘鲁专线',
          intro: '秘鲁人口约 3200 万，当地平均年龄 31 岁，互联网网民约 2400 万，网络渗透率为 75%。2020 年秘鲁电商市场规模为 40 亿美元，同比增长 120%，其中 72% 是购买境外产品，65% 集中在首都利马。当地受欢迎的电商平台是 Mercado Libre；增长较快的品类依次是家具和家用电器（23%）、游戏和个人爱好（22%）以及个人护理和食品（22%）。产品分速递和邮派两种。',
          items: [
            { title: '整体时效', description: '速递 9-12 天，邮派 9-25 天。' },
            { title: '尾程派送', description: '可选用商业快递和当地邮政派送，无偏远附加费。' },
            { title: '产品要求', description: '可接普货及内置锂电池产品等。' },
            { title: '免税额度', description: 'CIF 价 200 美元内免税。' },
            { title: '国内揽收', description: '深圳市内支持上门揽收。' },
            { title: '国际干线', description: '每周稳定包机包板服务，确保舱位及出库时效。' },
            { title: '妥投率高', description: '同一包裹两次免费上门派送服务。' }
          ]
        }
      ]
    }
  }
};
