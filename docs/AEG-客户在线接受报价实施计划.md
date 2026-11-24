# 客户在线接受 / 拒绝报价 —— 实施计划

日期：2026-11-17
关联文档：`docs/AEG-功能建议与优化规划.md` F-3（P1，成本 S，约 2-3 人日）
状态：待评审

---

## 1. 目标与非目标

**目标**
1. 客户在客户端报价详情页一键"接受报价 / 拒绝报价（必填原因）"，成交数据从"运营听到电话后手工回填的推测"变成"客户的在线确认"。
2. 客户确认与运营手工标记可区分、可追溯：谁在什么时间、基于哪个版本的价格做的决定，全部留痕。
3. 运营端实时可见客户决策（含拒绝原因），并保留纠错能力——运营覆盖客户决策需显式确认且写审计。
4. 拒绝原因沉淀为可复盘的产品/价格反馈，为后续 F-10 转化漏斗提供真实数据。

**非目标（本期不做）**
- 不做电子合同 / 数字签名（"在线接受"是业务确认，不构成合同要件；法务口径沿用现有免责声明）。
- 不做报价有效期（`valid_until`）与到期自动失效——作为二期候选，见第 11 节。
- 不做客户自助"撤销决策"——拒绝后反悔走人工路径（运营 reopen），避免状态抖动。
- 不做议价 / 还价工作流（客户提交目标价 → 运营改价）——先验证"确认"这个最小闭环。

---

## 2. 现状盘点

### 2.1 已具备的基础（改动量小的原因）

| 基础 | 位置 | 说明 |
|---|---|---|
| 成交状态三列已存在 | `quote-order.entity.ts:96-104` | `deal_status`('open'/'won'/'lost')、`deal_note`、`deal_closed_at`，**无需改状态语义，客户决策直接复用** |
| 运营端成交标记链路完整 | `ops-order.controller.ts:337-375`（`PATCH :id/deal`） | 校验（仅 done 可标记 / 业务员只能标记归属自己的单）+ 审计写法可直接照抄 |
| 物流闸门已挂在 won 上 | `ops-order.controller.ts:476`、`:548` | `deal_status !== 'won'` 时拒绝维护海运信息与物流节点——**客户在线接受后，运营的物流流程零改动自动解锁** |
| 删除保护已挂 won 上 | `client-order.controller.ts:19`、`ops-order.controller.ts:57` | 已成交报价不可删除，客户端决策后自动受保护 |
| 客户端写操作先例 | `cnpj.controller.ts:256`（`PATCH orders/:id/invoice-cnpj`） | 归属校验（`client_id` 比对）+ 快照写入 + 审计的模式，决策接口完全同构 |
| 客户端详情页已有决策场景挂载点 | `web-client/pages/OrderDetail.tsx:277-315`（金额卡） | `status === 'done'` 时已有开票 CNPJ 卡，决策卡插在金额卡之后即可 |
| 运营端已有成交工作条 | `web-ops/pages/OrderDetail.tsx:869-904` | `visibleSection === 'deal'` 工作条已有"当前状态 / 标记时间 / 备注 / 三个按钮"，只需增客户决策展示与覆盖确认 |

### 2.2 关键缺口（本计划要补的）

| 缺口 | 依据 |
|---|---|
| 客户端对报价唯一的写操作是删除 | `client-order.controller.ts:15`（`@Delete(':id')`），无任何决策入口 |
| 无法区分"客户在线确认"与"运营手工标记" | `deal_status` 只有值没有来源；两处写入口（ops `markDeal`）共用同一字段 |
| 接受时无价格快照 | 后续运营改价/重算（`quote.service.ts` 三处可置 done）会覆盖 `total_amount_brl`，"客户当时接受的是哪个数"无从对证 |
| 拒绝无原因字段 | `deal_note` 是运营备注，语义混用会导致客户原因与运营复盘混在一起 |

---

## 3. 总体设计

### 3.1 交互链路

```
客户端详情页（status=done 且未被终态锁定）
        │  「接受报价」 / 「拒绝报价」
        ▼
POST /api/client/orders/:id/decision   { decision: 'accept' | 'reject', reason? }
        │  归属校验 → done 校验 → 幂等/冲突校验 → 价格快照
        ▼
quote_order 更新：
  deal_status      = 'won' / 'lost'          （复用现有列，物流/删除闸门零改动生效）
  deal_closed_at   = now
  client_decision  = { decision, reason, decided_at, decided_by, quote_snapshot }   （新增 jsonb）
        │  审计 action='order.client_decision'
        ▼
运营端成交工作条实时可见：
  「客户已于 2026-11-17 14:30 在线接受（基于报价 $12,345.67）」
  「客户已于 2026-11-17 14:30 在线拒绝：原因 xxx」
        │  运营如需纠正（如客户误点）：
  markDeal 覆盖须带 force_overwrite_client=true，前端二次确认，审计记录双向 diff
        ▼
（联动）F-1 通知中心落地后：决策事件入队 → 通知归属业务员
```

### 3.2 设计原则

1. **只加一层"来源"，不动状态机**：`deal_status` 的取值与全部现有闸门（物流维护、删除保护、列表筛选）保持不变，客户决策只是新增一个写入口 + 来源快照。回归风险最小化。
2. **客户决策不可被静默覆盖**：`client_decision` 是不可变事实，运营改 `deal_status` 不清除它；页面明确展示"运营已于 X 覆盖为 Y（客户原决策：Z）"。
3. **接受即锁价**：决策时把金额与费用快照固化进 `client_decision.quote_snapshot`，杜绝"客户说当时报价不是这个数"的争议（呼应规划 F-2 的价格版本可追溯目标）。
4. **幂等友好**：同一决策重复提交返回成功（幂等）；反向冲突（已 accept 再 reject）返回 409 并提示联系运营。

---

## 4. 数据模型

### 4.1 新增列（`quote_order` 表，1 个迁移）

| 列 | 类型 | 说明 |
|---|---|---|
| `client_decision` | `jsonb null` | 客户决策快照，结构见下；运营覆盖 `deal_status` 时**不修改**此列 |

```jsonc
// client_decision 结构
{
  "decision": "accept" | "reject",
  "reason": string | null,          // reject 必填（10-500 字符）；accept 可为空
  "decided_at": "ISO-8601",
  "decided_by": "客户账号 username", // 客户名下多账号时区分是谁点的
  "quote_snapshot": {               // 决策时刻的报价事实
    "total_amount_brl": 12345.67,
    "total_amount_usd": 2345.67,
    "total_amount_rmb": 16800.00,
    "template_version": "v3",
    "fx_rate": 5.42,                // pricing_breakdown.fx_rate，可能为空
    "breakdown_total": 12345.67     // pricing_breakdown.total，可能为空
  }
}
```

迁移命名沿用现有时序（`1763x-ClientDecision.ts`），**先核对时间戳不与现有 26 个迁移冲突**（规划 R7 教训）。

### 4.2 不新增的内容

- **不新增状态枚举**：`deal_status` 仍是 `open/won/lost`。
- **不新增表**：决策频次低（一票最多一次），不值得独立表；审计与快照已覆盖追溯需求。
- **mock 侧**：`mock-db.ts` 的 QuotesRepo 存整对象，新字段零适配（pg-repos 的 update 传白名单需加 `client_decision`，实施时核对 `pg-repos.ts` 的 update 实现）。

---

## 5. 接口设计

### 5.1 客户端决策接口（新增）

`POST /api/client/orders/:id/decision`（`client-order.controller.ts`）

```ts
@Post(':id/decision')
async decide(
  @Param('id') id: string,
  @Body() body: { decision: 'accept' | 'reject'; reason?: string },
  @Req() req: Request & { user?: any }
) {
  // 1. 参数校验
  //    decision ∉ ['accept','reject'] → 400
  //    reject 时 reason 必填且 10-500 字符 → 400（拒绝原因太短没有复盘价值）
  //    accept 时 reason 可选，≤500 字符
  // 2. 归属校验：!order || order.client_id !== req.user?.client_id → 404（与 archive 同口径）
  // 3. 状态校验：order.status !== 'done' → 400「报价核算完成后才能操作」
  //    order.status === 'deleted' → 404
  // 4. 幂等：已存在 client_decision 且 decision 相同 → 直接返回当前状态（200，不重复写）
  // 5. 冲突：已存在 client_decision 且 decision 相反 → 409「已提交过相反决策，如需变更请联系业务员」
  // 6. 写入：deal_status / deal_closed_at / client_decision（含 quote_snapshot）
  // 7. 审计：action='order.client_decision'
}
```

返回：`{ ok: true, deal_status, client_decision }`，前端用返回值就地更新详情，不整页刷新。

**校验口径说明**：归属错误返回 404 而非 403，与 `client-order.controller.ts:18`、`cnpj.controller.ts:242` 的现有口径一致（不向无权者确认订单存在）。

### 5.2 运营端成交标记接口（小改，加保护参数）

`PATCH /api/ops/orders/:id/deal`（`ops-order.controller.ts:337`）增加规则：

- 若 `order.client_decision` 存在且目标值与客户决策不一致（含 reopen 为 `open`），要求 `body.force_overwrite_client === true`，否则 `409` 并返回客户决策摘要——防止运营在不知情时顺手覆盖客户在线确认。
- 覆盖成功时审计 detail 增加 `overwritten_client_decision: order.client_decision`，保留双向痕迹。
- 其余逻辑（done 校验、业务员归属校验）不变。

### 5.3 读取侧字段透出

| 接口 | 新增返回 | 说明 |
|---|---|---|
| `GET /api/client/orders/:id`（client-order.controller.ts:88） | `client_decision`、`can_decide`（= `status==='done' && !client_decision`） | 客户端判断按钮显隐；`deal_status` 已存在 |
| `GET /api/client/orders`（list） | `client_decision` 摘要（decision + decided_at，不含 reason 全文，减小载荷） | 列表可加"已接受/已拒绝"角标 |
| `GET /api/ops/orders/:id`（ops-order.controller.ts detail） | `client_decision` 全量 | 运营复盘需要 reason 全文 |

---

## 6. 前端设计

### 6.1 客户端（web-client，主战场）

**详情页决策卡**（`OrderDetail.tsx`，插在金额汇总卡之后、物流卡之前）：

- 显示条件：`can_decide === true`（done 且未决策）。
  - 布局对齐现有 `quote-note` 样式：左侧说明文案（双语，沿用"参考报价，非最终合同"口径的免责声明）+ 右侧两个按钮。
  - 「✅ 接受报价」主按钮（`btn` 主色）；点击弹 `confirm` 对话框，明示金额与"接受后业务员将联系您安排出运"。
  - 「✗ 拒绝报价」次按钮（`btn-ghost`）；点击展开原因输入框（`form-input`）+ 提交按钮；原因不足 10 字时提交按钮禁用并给出计数提示。
- 已决策：`can_decide === false` 且 `client_decision` 存在时，决策卡变为只读状态条：
  - accept → 绿色提示条「您已于 {decided_at} 在线接受此报价，业务员将尽快与您联系」（后端 won 闸门生效，物流/单证后续自动对客户可见）。
  - reject → 中性提示条「您已拒绝此报价」+（可展开自己的原因）；如需重新考虑，提示联系业务员（不提供自助撤销）。
- 已决策时页面顶部报价金额区加 `deal-tag`（复用运营端 `deal-won/deal-lost` 样式口径）。

**列表页**（`Orders.tsx`）：`deal_status` 角标已有展示位的话直接复用；至少在筛选栏保持现状（`deal_status` 筛选属 P2 体验项）。

### 6.2 运营端（web-ops）

**成交工作条**（`OrderDetail.tsx:869-904`）：

- `client_decision` 存在时，当前状态 tag 旁追加来源角标「客户在线确认」/「客户在线拒绝」，并显示 decided_at 与 reason 全文：
  - 「客户已于 2026-11-17 14:30 在线接受（报价 R$ 12,345.67）」
  - 「客户已于 2026-11-17 14:30 在线拒绝：原因……」
- 覆盖保护：当客户已决策且运营点击标记按钮导致不一致时，`confirm` 对话框升级为强提示（「⚠️ 客户已在线接受此报价，确认改为未成交？此操作将记录审计」），确认后请求携带 `force_overwrite_client: true`。
- 409 响应的文案透传：展示后端返回的客户决策摘要，让运营"知道再覆盖"。

### 6.3 双语词条（i18n）

| 端 | 文件 | 新增（zh / pt 各一套） |
|---|---|---|
| web-client | `locales/zh.ts` / `pt.ts` | 决策卡标题/说明、接受/拒绝按钮、确认文案、原因输入提示与计数、已接受/已拒绝状态条、错误码文案（409/400/404）约 10-12 条 |
| web-ops | `locales/zh.ts` / `pt.ts` | 来源角标、客户决策展示、覆盖二次确认文案约 5-6 条 |

注意保持 zh/pt 数量对齐（现状 738×2 / 656×2，不得破坏对齐性）；文案中"接受"用 pt 的"Aceitar cotação / Recusar cotação"，与现有 `orderDetail.*` 词条命名风格一致。

---

## 7. 与其他功能的联动

| 功能 | 联动点 | 本期处理 |
|---|---|---|
| F-1 通知中心 | 客户决策应通知**归属业务员**（方向与 F-1 的"通知客户"相反） | 本期先落审计；F-1 落地后加一个事件类型 `quote.client_decided`（含 decision 与 reason），复用其 enqueue/worker，仅收件人换为业务员邮箱。接口层预留：决策写入后调用点加 `// M-DECIDE-NOTIFY` 注释占位 |
| F-2 报价单 PDF | `client_decision.quote_snapshot` 与 PDF 版本留档互补 | 无代码依赖，实施顺序任意 |
| F-10 转化漏斗 | `deal_status` 有了可信来源后，漏斗数据按 `client_decision` 是否存在区分"确认成交/人工标记" | 仅数据口径约定：漏斗统计时 `client_decision.decision='accept'` 计为"客户确认成交"，纯运营标记计为"人工标记成交" |
| 删除保护 / 物流闸门 | `deal_status='won'` 触发的既有闸门（archive 拒绝、shipment 维护解锁、can_delete=false） | 零改动自动生效 |

---

## 8. 实施步骤（P1，约 2-3 人日）

| 步骤 | 内容 | 涉及文件 |
|---|---|---|
| 1 | 实体加列 `client_decision` + 迁移；核对 `pg-repos.ts` update 白名单 | `quote-order.entity.ts`、`migrations/1763x-ClientDecision.ts`、`common/pg-repos.ts` |
| 2 | 客户端决策接口（校验 + 幂等/冲突 + 快照 + 审计）；detail/list 透出 `can_decide` 与决策摘要 | `order/client-order.controller.ts` |
| 3 | ops `markDeal` 覆盖保护（409 + force_overwrite_client + 审计 diff）；detail 透出 `client_decision` | `order/ops-order.controller.ts:337-375` |
| 4 | 客户端决策卡 + 状态条 + confirm/原因输入 | `web-client/pages/OrderDetail.tsx`、`styles.css` |
| 5 | 运营端来源角标 + 覆盖强提示 | `web-ops/pages/OrderDetail.tsx:869-904` |
| 6 | 双语词条（两端口径对齐） | `web-client/locales/{zh,pt}.ts`、`web-ops/locales/{zh,pt}.ts` |
| 7 | （F-1 已落地时）决策事件埋点；否则留注释占位 | `client-order.controller.ts` |

**依赖**：无外部依赖，可立即启动。若 T-2（测试骨架）先完成，第 12 节用例应转成自动化集成测试。

---

## 9. 并发与幂等细节

| 场景 | 行为 |
|---|---|
| 客户双击「接受」 | 第二次请求命中幂等分支，返回 200 + 当前状态，不重复写库/审计 |
| 客户先 reject 后反悔想 accept | 409 + 文案「已提交拒绝，如需重新考虑请联系业务员」；运营 reopen（`open`）清除锁定后 `client_decision` 保留、`can_decide` 规则变为「done 且 deal_status 由运营恢复为 open」→ 建议运维口径：reopen 时**同时置空 `client_decision` 才允许客户再次决策**——`markDeal` 的 `open` 分支顺带清空 `client_decision` 并审计，这是唯一会清空该列的路径 |
| 运营标记 won 与客户 accept 同时到达 | 两侧都是条件更新，后到者：运营侧走覆盖保护（客户已 accept 则按 force 规则）；客户侧若 deal_status 已 won 且无 client_decision，幂等分支允许补记客户决策（视为对运营标记的追认） |
| 报价在决策后重算（status 离开 done 再回 done） | `deal_status` 不会被 quote.service 改写（其只管 status）；客户已决策的报价不建议重算——在 `quote.service` 重算入口加前置：`deal_status === 'won' || client_decision` 时拒绝重算（一行守卫，防价格与快照脱钩） |

---

## 10. 安全与合规

1. **越权**：归属校验失败返回 404，不泄露订单存在性（现有口径）。
2. **注入/长度**：reason 走纯文本存储与纯文本展示（React 默认转义），限 500 字符。
3. **审计**：`order.client_decision`（客户动作）与 `order.deal`（运营动作，含覆盖 diff）两类审计独立可查；覆盖客户决策属于敏感操作，审计 detail 必须含双方前后值。
4. **法律口径**：接受动作的文案与邮件/页面免责声明一致——"参考报价，最终以合同为准"，在线接受不构成合同承诺（与第 1 节非目标呼应）。
5. **LGPD**：拒绝原因可能含个人信息，仅客户本人与归属业务员可见；不含在客户端列表接口的返回中（只在 detail 返回全文）。

---

## 11. 二期候选（本期不做，记录决策依据）

| 项 | 说明 | 触发条件 |
|---|---|---|
| 报价有效期 `valid_until` | 报价发布时设定有效期，到期后 `can_decide=false` 并标注"已过期，请联系业务员重新报价"；快照口径更完整 | 客户实际使用中出现"隔月旧价还来接受"的争议 |
| 客户议价工作流 | 拒绝原因结构化选项（价格太高/时效/不需要了/其他）+ 客户目标价字段 | 拒绝原因积累到一定量后按数据决定 |
| 决策撤回窗口 | 接受后 30 分钟内可自助撤回一次 | 误点率若显著（运营反馈） |
| 消息渠道确认 | F-1 通知落地后，接受通知走邮件 + 站内双通道 | F-1 P2 完成后 |

---

## 12. 测试与验收用例

| # | 场景 | 期望 |
|---|---|---|
| D1 | 客户对 done 报价点击接受 | deal_status=won、deal_closed_at 写入、client_decision 含金额快照；审计 `order.client_decision`；详情页变绿色状态条；物流卡（原 won 闸门）自动出现 |
| D2 | 拒绝但不填原因 / 原因 9 字 | 前端禁用提交；绕过前端直接调接口返回 400 |
| D3 | 接受后再次点击接受（双击/重进页面） | 200 幂等返回当前状态，无重复审计 |
| D4 | 拒绝后再提交接受 | 409 + 联系业务员文案 |
| D5 | 对 computing / uploaded 状态的报价调 decision | 400「报价核算完成后才能操作」 |
| D6 | 客户 A 对客户 B 的订单调 decision | 404，不提示订单存在 |
| D7 | 运营在客户已 accept 时点「标记未成交」 | 未带 force 时 409 + 客户决策摘要；确认后带 force 成功，审计含 overwritten_client_decision；页面显示"运营已覆盖（客户原决策：接受）" |
| D8 | 运营 reopen（open）被客户拒绝过的单 | client_decision 清空、deal_closed_at 清空；客户详情页决策卡重新出现；审计记录 |
| D9 | 客户 accept 后运营尝试重算报价 | 被 quote.service 前置守卫拒绝，返回明确错误 |
| D10 | 运营端详情在客户决策后 30 秒轮询内 | 来源角标与 reason 展示正确；zh/pt 文案无缺 key |
| D11 | 决策时 pricing_breakdown 为空（理论边界） | quote_snapshot 中可空字段置 null，接口不报错 |
| D12 | 已 won（运营先标记）订单客户提交接受 | 幂等分支补记 client_decision（追认），不产生第二条 deal 审计 |

---

## 13. 风险与对策

| 风险 | 概率 | 对策 |
|---|---|---|
| 客户误点接受（手机端误触） | 中 | 接受前 confirm 对话框明示金额；运营可带 force 覆盖纠错；二期考虑撤回窗口 |
| 运营习惯电话成交，客户在线确认后重复标记造成混乱 | 中 | 覆盖保护 + 来源角标让两个事实并存；上线时同步一句运营口径："客户在线接受的单无需再手工标记" |
| 拒绝原因含情绪化/敏感内容，运营端展示尴尬 | 低 | 纯文本只读展示、不可编辑；列表不展示 reason 全文 |
| 金额快照与后续重算脱钩 | 低 | D9 的重算前置守卫；快照字段允许可空 |
| 客户端词条 zh/pt 不对齐 | 低 | 第 12 节 D10 用例 + 现有词条数量对齐惯例 |
| 与 F-1 的事件类型设计不一致（后补通知） | 低 | 第 7 节已约定 `quote.client_decided` 事件契约，F-1 落地时直接实现 |

---

## 14. 附录：涉及文件清单（P1 全量）

```
apps/api/src/entities/quote-order.entity.ts          # +client_decision jsonb
apps/api/src/migrations/1763x-ClientDecision.ts       # 新迁移（核对时间戳唯一）
apps/api/src/common/pg-repos.ts                       # update 白名单核对（如需）
apps/api/src/order/client-order.controller.ts         # POST :id/decision + detail/list 透出
apps/api/src/order/ops-order.controller.ts            # markDeal 覆盖保护 + detail 透出
apps/api/src/upload/quote.service.ts                  # 重算前置守卫（1 行 + 错误文案）
apps/web-client/src/pages/OrderDetail.tsx             # 决策卡 + 状态条
apps/web-client/src/styles.css                        # 决策卡/状态条样式
apps/web-client/src/locales/{zh,pt}.ts                 # ~10-12 条
apps/web-ops/src/pages/OrderDetail.tsx                 # 来源角标 + 覆盖强提示（869-904 区域）
apps/web-ops/src/locales/{zh,pt}.ts                    # ~5-6 条
```

### 14.1 与规划文档的呼应

- `deal_status` 无索引（规划 R8/T-9）：本功能会让"按成交状态筛选"的使用频率上升，建议 T-9 落地时优先补 `(client_id, deal_status)` 复合索引。
- 决策接口属客户端新写入口：上线前确认 T-5 登录加固已覆盖（本接口受 AuthGuard + RolesGuard('client') 保护，与现有口径一致，无额外暴露面）。
- 审计双写（order.client_decision / order.deal）：如 T-11 审计哈希链落地，覆盖客户决策的记录应纳入防篡改重点。
