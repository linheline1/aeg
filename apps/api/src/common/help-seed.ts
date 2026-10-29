export const HELP_CATEGORIES = {
  client: ['start', 'guide', 'invoice', 'faq'],
  ops: ['start', 'guide', 'invoice', 'faq']
} as const;

export interface HelpArticleSeed {
  app: 'client' | 'ops';
  category: 'start' | 'guide' | 'invoice' | 'faq';
  slug: string;
  title: string;
  summary: string;
  content: string;
  published: boolean;
  featured: boolean;
  sort_order: number;
}

const text = (...lines: string[]) => lines.join('\n');
const published = true;

export const HELP_ARTICLE_SEED: HelpArticleSeed[] = [
  { app: 'client', category: 'start', slug: 'enterprise-registration', title: '企业注册与营业执照认证', summary: '了解企业资料填写、执照要求和认证审核流程。', published, featured: true, sort_order: 10, content: text(
    '## 注册前准备', '请准备中国境内公司的营业执照，以及与公司全称对应的 18 位统一社会信用代码。', '- 公司全称必须与营业执照一致。', '- 营业执照支持 JPG、PNG、PDF，单个文件不超过 10MB。', '- 准备 3-32 位登录账号和至少 6 位密码。',
    '## 提交企业认证', '1. 打开注册页，填写国内公司全称和统一社会信用代码。', '2. 上传清晰的营业执照并设置登录账号、密码。', '3. 提交后系统自动创建企业账号，认证状态为“待认证”。',
    '## 查看审核结果', '进入「用户中心」即可查看认证状态、审核意见、审核人和审核时间。', '> 如果认证被驳回，请根据审核意见重新上传执照；重新提交后会再次进入待审核状态。'
  ) },
  { app: 'client', category: 'start', slug: 'profile-and-verification', title: '用户中心与认证进度', summary: '查看账户、企业资料、审核意见并更新营业执照。', published, featured: true, sort_order: 20, content: text(
    '## 账户与企业信息', '「用户中心」集中展示登录账号、账号状态、注册时间、公司全称和统一社会信用代码。企业名称或信用代码需要更正时，请联系我司工作人员。',
    '## 认证状态说明', '- 待认证：资料已提交，正在等待或进行人工审核。', '- 已认证：企业资料与营业执照已审核通过。', '- 已驳回：资料需要补充或更正，请查看审核意见。',
    '## 更新营业执照', '1. 在企业认证区域选择新的 JPG、PNG 或 PDF 文件。', '2. 点击“上传并提交审核”。', '3. 提交成功后，认证状态会变为“待认证”，上次审核结果将被清除。'
  ) },
  { app: 'client', category: 'start', slug: 'account-security', title: '修改密码与账户安全', summary: '定期更新密码并保护企业账号。', published, featured: false, sort_order: 30, content: text(
    '## 修改密码', '1. 进入「用户中心 → 修改密码」。', '2. 输入当前密码和至少 6 位的新密码。', '3. 确认两次新密码一致后提交，下次登录使用新密码。',
    '## 安全建议', '- 不要与他人共用账号。', '- 不要向任何人透露密码或登录令牌。', '- 怀疑账号泄露时，请立即修改密码并联系我司。'
  ) },
  { app: 'client', category: 'guide', slug: 'excel-and-quotation', title: '上传装箱清单并获取参考报价', summary: '从下载模板到查看 BRL DDP 参考预估的完整流程。', published, featured: false, sort_order: 40, content: text(
    '## 填写装箱清单', '1. 在「工作台」下载当前启用的 Excel 模板。', '2. 按实际情况填写品名、HS Code、箱数、尺寸、重量等字段，不要修改模板列名。', '3. 保存文件后上传，需要时一并上传明细截图。',
    '## 系统校验', '系统会校验清单并重算相关公式。出现错误时，请根据行号和字段提示修改后重新上传。',
    '## 查看参考报价', '我司完成核算并发布后，在「我的报价」中打开订单，即可查看参考 DDP 总价、费用分项、AI DI 及后续物流信息。页面金额为参考预估，不构成最终报价或锁价承诺。'
  ) },
  { app: 'client', category: 'faq', slug: 'ddp-reference-price', title: '参考 DDP 价格如何计算？', summary: '了解 AI DI、销售税务、综合运营费用与最终确认之间的关系。', published, featured: true, sort_order: 45, content: text(
    '## 公开费用项', '国际海运费会单独列示；DDP 总价还会包含其他成本、AI DI、销售环节税费及综合运营费用。',
    '## 参考价组成', '参考 DDP 总价包含国际海运费、其他成本、AI DI、销售环节税费及综合运营费用；国际海运费会单独列示，内部运营成本不向客户拆分。',
    '## 为什么是参考价', 'AI 根据产品描述建议 NCM 和税率，系统再按当前汇率、费率及贸易条件估算。NCM、税率、汇率、附加费用和海关认定可能变化，因此页面金额不是最终账单。',
    '## 最终确认', '最终价格以我司书面确认、正式报价单及实际清关和账单文件为准。对金额有疑问时，请提供报价号联系运营人员。'
  ) },
  { app: 'client', category: 'guide', slug: 'shipment-and-files', title: '查看国际物流与交付文件', summary: '跟踪物流节点，查看放行证明和发票等交付文件。', published, featured: false, sort_order: 50, content: text(
    '## 物流信息', '订单成交走柜后，我司会维护船名、航次、提单号、柜号、ETD、ETA 和物流节点。打开订单详情即可查看当前进度。',
    '## 交付文件', '- 放行截图：用于查看清关放行证明。', '- 发票 PDF：用于查看或下载相关发票。', '- 其他文件：以我司上传的文件和备注为准。',
    '## 文件无法查看时', '请确认网络正常后重新打开页面。如果文件已被删除或仍无法下载，请提供报价号联系我司。'
  ) },
  { app: 'client', category: 'invoice', slug: 'cnpj-ie-invoice', title: 'CNPJ、IE 与巴西公司开票资料', summary: '了解 NF 受票公司资料和订单开票抬头的设置方法。', published, featured: false, sort_order: 60, content: text(
    '## 三项资料分别是什么？', '- CNPJ：巴西公司的联邦税号。', '- IE（Inscrição Estadual）：巴西州税登记号；免州税登记的企业可填写 ISENTO。', '- Razão Social：巴西公司的法定公司名称。', '> 这些资料用于我司向您的巴西公司开具 NF，必须属于同一家公司。',
    '## 维护开票资料', '1. 进入「工作台 → 巴西公司开票信息」。', '2. 填写 CNPJ、IE 和法定公司名称后添加。', '3. 有多个抬头时，可将常用抬头设为默认。',
    '## 绑定订单', '打开已发布订单，在“开票信息”中选择本订单的抬头。系统会保存快照，之后删除工作台中的抬头不会影响已绑定订单。'
  ) },
  { app: 'client', category: 'faq', slug: 'quote-not-visible', title: '为什么上传清单后还看不到参考报价？', summary: '了解清单上传、AI DI、运营核算和参考报价发布之间的关系。', published, featured: false, sort_order: 70, content: text(
    '## 原因与处理', '清单上传成功不代表参考报价已经生成。系统先进行 AI NCM/DI 核算，我司核对资料和费用后才能发布参考报价。', '1. 先在「我的报价」查看订单当前状态和 AI DI 进度。', '2. 如果上传时提示数据错误，请修改后重新上传。', '3. 长时间未更新时，请提供报价号联系我司。'
  ) },
  { app: 'client', category: 'faq', slug: 'verification-rejected', title: '企业认证被驳回怎么办？', summary: '根据审核意见重新准备并提交营业执照。', published, featured: false, sort_order: 80, content: text(
    '## 重新提交认证', '1. 进入「用户中心」，查看驳回原因。', '2. 检查公司全称、信用代码和执照是否一致，文件是否清晰完整。', '3. 重新上传营业执照并提交，状态会变为“待认证”。', '> 如果审核意见要求更正企业名称或信用代码，请先联系我司工作人员。'
  ) },
  { app: 'client', category: 'faq', slug: 'ie-isento', title: 'IE 可以填写 ISENTO 吗？', summary: '只有符合免州税登记条件的巴西企业才使用 ISENTO。', published, featured: false, sort_order: 90, content: text(
    '## 适用情况', 'ISENTO 表示免 IE。只有确实免州税登记的巴西企业才能这样填写，其他企业必须提供真实 IE。', '> 不确定时，请向巴西公司的会计师核实，不要随意填写。'
  ) },
  { app: 'ops', category: 'start', slug: 'order-review-and-publish', title: '订单核对、费用核算与报价发布', summary: '从客户清单检查到发布 done 订单的标准处理流程。', published, featured: true, sort_order: 10, content: text(
    '## 检查客户资料', '- 核对 Excel 明细、品名、HS Code、箱数、重量和体积。', '- 查看客户上传的明细截图与异常信息。', '- 确认订单模板版本及数据校验结果。',
    '## 核算并重新计算', '1. 确认费率来源是客户覆盖还是全局默认。', '2. 核对 AI NCM/DI，设置海运费、起运港杂费、汇率、20% 税基加成、销售税务和每票利润。', '3. 销售税基 =（DI + 货值）×1.20 + 国际运费；参考 DDP = 税基×6.5% + DI + 国际运费 + 其他成本 + 利润；修改后重新计算并核对分项。',
    '## 发布或标记异常', '确认无误后将订单发布为 done，客户端随后可查看参考预估。资料或价格存在问题时不要盲目发布；使用失败状态并填写清晰原因。', '> 客户侧金额始终标注为参考价，不能承诺锁价；最终以书面确认和正式账单为准。'
  ) },
  { app: 'ops', category: 'start', slug: 'rates-and-template', title: '费率表与清单模板管理', summary: '理解客户覆盖优先级，并核对当前启用的清单模板。', published, featured: true, sort_order: 20, content: text(
    '## 费率解析规则', '报价计算按“客户覆盖 > 全局默认”解析。全局调整会影响未设置覆盖的客户，客户覆盖只影响指定客户。',
    '## 修改前检查', '- 确认修改对象和影响范围。', '- 核对海运费、港杂费、汇率、20% 税基加成、销售税务和每票利润。', '- 税基加成默认 20%，销售税务默认 6.5%，利润默认 R$30,000；客户覆盖优先于全局默认。', '- 保留准确的调整备注，便于审计追踪。',
    '## 模板核对', '模板预览用于确认当前启用版本及客户清单字段。核算时不要混用不同版本的列名和数据结构。'
  ) },
  { app: 'ops', category: 'guide', slug: 'deal-follow-up', title: '报价跟进、改派与成交统计', summary: '及时跟进已发布报价，准确记录成交结果和负责人。', published, featured: false, sort_order: 30, content: text(
    '## 跟进报价', '- 优先跟进归属自己的已发布报价。', '- 根据实际情况标记跟进中、已成交或未成交。', '- 未成交时填写真实原因，便于后续复盘。',
    '## 改派业务员', '需要改派时，先确认后续跟进责任人。未指定订单改派时，会回退到客户默认归属业务员。',
    '## 成交统计', '成交统计以已核算发布的报价为口径，可按月份、客户和业务员查看发布、成交和未成交情况。'
  ) },
  { app: 'ops', category: 'guide', slug: 'shipment-events', title: '维护国际物流与节点时间线', summary: '准确维护船期、柜号和客户可见的物流节点。', published, featured: false, sort_order: 40, content: text(
    '## 维护物流信息', '成交走柜后，维护船名、航次、提单号、柜号、起运港、目的港、ETD、ETA 和必要备注。',
    '## 新增物流节点', '1. 按真实业务进度选择对应节点。', '2. 填写准确的实际发生时间。', '3. 补充客户需要知道的备注并保存。',
    '## 客户可见检查', '节点按时间正序向客户展示。保存前请避免内部措辞、未经确认的日期和敏感信息。'
  ) },
  { app: 'ops', category: 'guide', slug: 'finance-and-permissions', title: '财务应收与角色权限', summary: '准确登记回款，并按报价员、业务员职责使用系统。', published, featured: false, sort_order: 50, content: text(
    '## 财务应收', '- 按已发布订单核对应收、已收和未收金额。', '- 登记回款时填写真实金额、日期和必要备注。', '- 删除错误回款记录前，先核对订单和金额。',
    '## 角色分工', '报价员负责订单、费率、图片、模板和运营处理；业务员主要负责报价跟进、成交和应收查看。页面功能以账号权限为准。',
    '## 账号使用', '不要共用账号或代替他人审核、登记。需要调整权限时，请联系管理员。'
  ) },
  { app: 'ops', category: 'invoice', slug: 'nf-cnpj-ie', title: 'NF 开票前核对 CNPJ 与 IE', summary: '使用订单指定的巴西公司资料，避免错误发票抬头。', published, featured: false, sort_order: 60, content: text(
    '## 必须核对的资料', '- Razão Social：巴西公司法定名称。', '- CNPJ：巴西公司联邦税号。', '- IE：州税登记号；客户申报免税时显示 ISENTO。', '> 必须使用订单中的客户指定资料，不要仅按客户中文名称或历史发票判断。',
    '## 资料不完整时', 'IE 显示“未登记”或订单未指定抬头时，先要求客户补全并绑定资料，再进行开票。',
    '## 订单快照', '订单绑定的是开票快照，客户之后修改或删除其他抬头，不会自动改变已绑定订单。开票前仍应检查快照内容。'
  ) },
  { app: 'ops', category: 'invoice', slug: 'delivery-and-images', title: '客户图片与交付文件管理', summary: '核对客户图片，向客户交付放行截图和发票 PDF。', published, featured: false, sort_order: 70, content: text(
    '## 客户图片', '客户图片用于核对清单和货物明细，可按客户筛选，并查看关联报价号及明细行号。',
    '## 上传交付文件', '- 支持放行截图、发票 PDF 和其他文件。', '- 单个文件不超过 10MB，一次最多 9 个。', '- 备注对客户可见，不要写入内部敏感信息。',
    '## 删除文件', '文件上传后客户可以查看或下载，删除后客户将无法继续访问。删除前请确认文件不再需要。'
  ) },
  { app: 'ops', category: 'faq', slug: 'amount-not-updated', title: '修改费用后金额为什么没有更新？', summary: '检查重新计算、订单状态和客户端展示口径。', published, featured: false, sort_order: 80, content: text(
    '## 排查步骤', '1. 确认修改费用后已执行重新计算。', '2. 核对新的 BRL、USD 合计和费用分项。', '3. 确认订单已发布为 done，再检查客户端可见金额。', '> 不要只保存页面输入而不重新计算，否则订单合计可能保持不变。'
  ) },
  { app: 'ops', category: 'faq', slug: 'missing-invoice-ie', title: '订单缺少 IE 可以直接开票吗？', summary: '缺少开票资料时应先补全，而不是沿用历史发票。', published, featured: false, sort_order: 90, content: text(
    '## 处理建议', '不建议在 IE 未登记或订单未指定抬头时直接开票。请先要求客户补全 CNPJ、IE 和法定公司名称，并重新绑定订单资料。', '> 如果客户填写 ISENTO，请确认其确实符合免州税登记条件。'
  ) },
  { app: 'ops', category: 'faq', slug: 'delete-delivery-file', title: '删除交付文件会有什么影响？', summary: '了解文件删除对客户查看和下载的影响。', published, featured: false, sort_order: 100, content: text(
    '## 删除前确认', '删除交付文件后，客户将无法继续查看或下载该文件。上传错误文件时，请先准备正确文件，再按业务流程替换并核对客户侧结果。'
  ) }
];
