# 客户通知中心（邮件 / 可选 WhatsApp）—— 实施计划

日期：2026-11-17
关联文档：`docs/AEG-功能建议与优化规划.md` F-1（P1，成本 M）
状态：待评审

---

## 1. 目标与非目标

**目标**
1. 客户在关键业务节点收到主动通知（邮件），不再需要反复登录查看：报价核算完成、物流节点更新、交付文件上传。
2. 通知双语（中文 / 巴西葡萄牙语），与四端现有 i18n 口径一致。
3. 通知可配置：客户可改即时/摘要/关闭；运营/管理端可查每票发了什么。
4. 通知失败可重试、可追溯，全部写日志。

**非目标（本期不做）**
- 不做站内信 UI（客户端现有"报价详情"已承载信息本体，通知只做引流）。
- 不做营销群发 / 邮件订阅内容运营（只做事务性通知，降低 LGPD 与反垃圾风险）。
- 不做短信。
- WhatsApp 仅做三期预研与决策材料，不在 P1/P2 交付。

---

## 2. 现状盘点与三个前置发现

### 2.1 已具备的基础

| 基础 | 位置 |
|---|---|
| 事件源已存在（见第 4 节） | 报价核算、物流节点、交付文件三个写入口都已落库并有审计 |
| 双语词条机制 | `web-client/src/locales/{zh,pt}.ts`，656 条已对齐 |
| 审计模式可复用 | `auditRepo.entry({ actor, action, target_type, target_id, detail })` |
| 仓储注入模式 | `@Inject('XxxRepo')` + `mock-db.ts` / `pg-repos.ts` 双实现 |
| 环境配置分节管理 | `.env.example` 已按模块分节 |

### 2.2 前置发现（必须先解决，否则通知无从发起）

**发现一：系统里没有邮箱。** `user.entity.ts` 与 `client.entity.ts` 均无 email 字段，注册接口只收 `username + password`。**邮箱采集是本功能的第一块地基**，没有它任何通知都发不出去。

**发现二：服务端不知道客户语言。** 语言偏好只存在前端 localStorage，登录后服务端无感知。邮件必须由服务端渲染，需要一个可信的语言来源。

**发现三：无任何邮件基础设施。** 依赖里无 nodemailer/SMTP 配置；VPS（Hostinger）自带企业邮箱 SMTP，可直接复用，无需第三方付费服务即可启动。

### 2.3 事件触发点（已逐一核实）

| 事件 | 触发位置 | 说明 |
|---|---|---|
| 报价核算完成 | `upload/quote.service.ts:198 / 439 / 509`（status → `'done'`） | 三处都会置 done，埋点需覆盖全部三处或收敛到 update 后统一判断 |
| 物流节点新增 | `order/ops-order.controller.ts:519`（`POST :id/shipment/events`） | 已有 status='done' 前置校验，节点即业务事实 |
| 交付文件上传 | `order/order-files.controller.ts:43`（`POST orders/:id/files`） | kind ∈ clearance_shot / invoice / other |
| （二期）回款登记 | `finance/finance.controller.ts:95`（`POST quotes/:id/payments`） | "款项已确认"对客户价值高，放 P2 |

---

## 3. 总体设计

### 3.1 链路

```
业务写入口（报价核算 / 节点 / 文件 / 回款）
        │  同步调用（不阻塞业务：仅入库，异常吞掉记 warn）
        ▼
NotificationService.enqueue(event_type, order_id, payload)
        │  渲染模板（按客户语言）→ 解析收件人 → 去重/聚合判断
        ▼
notification_log（即队列：status=pending）
        │  Worker 每 30s 扫 pending（next_retry_at <= now）
        ▼
EmailProvider（nodemailer + Hostinger SMTP）
        │  成功 → sent；失败 → retry_count+1，指数退避，5 次后 failed
        ▼
notification_log.status = sent / failed（管理端可查、可手动重发）
```

**设计原则**
1. **通知绝不阻塞业务**：enqueue 只写库，业务事务不依赖通知结果；发送 worker 独立。
2. **先落库后发送**：日志表即队列，崩溃不丢通知（与 AIS 轨迹的落盘思路一致）。
3. **默认安全**：`NODE_ENV !== 'production'` 或 `NOTIFICATION_DRY_RUN=true` 时只落库不真发（status=`skipped`），杜绝测试环境给客户发真邮件。
4. **可整体关闭**：未配 SMTP 时模块自检不通过，事件照常入库、状态置 `skipped: no_provider`，业务零影响。

### 3.2 模块结构

```
apps/api/src/notification/
  notification.module.ts        # 提供 NotificationService，注册 Repo
  notification.service.ts       # enqueue + 模板渲染 + 收件人解析
  notification.worker.ts        # 定时扫描 pending → 调 provider 发送 → 状态机流转
  email.provider.ts             # nodemailer 封装（transport 单例、失败分类）
  templates/                    # 纯函数：(event, ctx, lang) => { subject, html, text }
```

---

## 4. 数据模型

### 4.1 新表 `notification_log`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| event_type | varchar(40) | `quote.computed` / `shipment.node_added` / `order.file_uploaded` / `finance.payment_recorded` |
| order_id / quote_no | uuid / varchar(40) | 冗余 quote_no 便于检索展示 |
| client_id | uuid | 收件客户 |
| recipient | varchar(255) | 实际收件邮箱（快照，客户改邮箱不影响历史） |
| channel | varchar(10) | `email`（二期 `whatsapp`） |
| language | varchar(2) | 渲染所用语言快照 |
| subject | varchar(200) | 渲染结果快照（排查争议用） |
| status | varchar(12) | `pending / sending / sent / failed / skipped` |
| retry_count | int default 0 | |
| next_retry_at | timestamp | 指数退避：1m/5m/15m/1h/4h，5 次转 failed |
| error | text | 最后一次失败原因 |
| dedupe_key | varchar(120) | 唯一索引，见 5.2 防轰炸 |
| payload | jsonb | 事件快照（节点阶段、文件名、金额等） |
| created_at / sent_at | timestamp | |

索引：`(status, next_retry_at)`（worker 扫描）、`(client_id, created_at)`、`unique(dedupe_key)`。

迁移命名沿用现有时序：`1763xxxxxxx-NotificationLog.ts`；**注意规划文档 R7 的教训——先检查时间戳不与现有迁移冲突**。

### 4.2 现有表加列

| 表 | 新列 | 说明 |
|---|---|---|
| `user` | `email varchar(255) null` | 客户账号邮箱（注册必填、个人中心可改） |
| `user` | `email_verified boolean default false` | P2 加验证流程前先占位 |
| `user` | `preferred_language varchar(2) null` | `'zh' / 'pt'`；null 时按 4.3 兜底 |
| `user` | `notify_mode varchar(10) default 'instant'` | `instant / digest / off` |
| `client` | `contact_email varchar(255) null` | 客户级兜底邮箱（运营代填） |

mock 模式：`mock-db.ts` 增加 `NotificationLogRepo` 与对应 user/client 字段，保持双轨一致（与规划文档 T-1 的收敛方向不冲突——新模块按 Repository 接口写，将来收敛时只需换实现）。

### 4.3 收件人与语言解析规则

```
收件人 = user.email（客户名下任一 active 账号，取最近登录）
       ?? client.contact_email
       ?? （都没有 → 落库 status=skipped: no_recipient，运营端可见"该客户无邮箱"）
语言   = user.preferred_language
       ?? （client 端登录成功后自动 PATCH /api/auth/me {language: 前端当前语言}，逐步补齐）
       ?? 按 china_company_name 有无判断（有中文名 → zh，否则 pt）
       ?? 'pt'   // 巴西客户业务，默认葡语
```

---

## 5. 事件设计

### 5.1 事件清单

| # | event_type | 触发 | 模板要点 | 阶段 |
|---|---|---|---|---|
| E1 | `quote.computed` | 三处 status→done | 报价号、总金额（币种+精度）、明细入口链接 | P1 |
| E2 | `shipment.node_added` | 新增物流节点 | 节点名称+时间；30 分钟内多节点合并为一封 | P1 |
| E3 | `order.file_uploaded` | kind=clearance_shot/invoice | 文件类型名称、下载入口 | P1 |
| E4 | `finance.payment_recorded` | 登记回款 | 金额、剩余应收（结合 finance summary） | P2 |
| E5 | `customs.di_reviewed` | DI 审核有结论 | 视业务确认是否对客户可见 | P3 待定 |

### 5.2 防轰炸（去重与聚合）

- `dedupe_key = event_type:order_id:自然小时窗`，唯一索引兜底：同一事件同一订单一小时窗内只发一封。
- E2 特殊处理：运营连录 3 个节点（比如补录历史）应合并——`dedupe_key` 用 `shipment.node_added:order_id:当日 00:00 所在时区桶`，标题写"物流更新（3 个新节点）"。
- `notify_mode='digest'` 的客户：事件只落库不渲染，每日 08:00-03（巴西时区）汇总一封；`off` 则 enqueue 直接 skipped: user_off。

---

## 6. 接口设计

### 6.1 业务侧（内部调用，不新增对客户端暴露的写接口）

```ts
// notification.service.ts
enqueue(event: {
  type: NotificationEventType;
  orderId: string;
  actor?: { username: string; role: string };   // 记审计
  payload?: Record<string, unknown>;            // 节点阶段 / 文件名 / 金额等
}): Promise<void>   // 永不抛错（内部 try/catch + Logger.warn）
```

三个业务端点在**写库成功后**调用：`quote.service`（三处 done）、`ops-order.controller:519`、`order-files.controller:43`。调用点加注释 `// M-NOTIFY`，与现有 `// M7` 注释风格一致。

### 6.2 客户端（web-client）

| 端点 | 说明 |
|---|---|
| `GET /api/client/notification-prefs` | 返回 email、email_verified、notify_mode、preferred_language |
| `PATCH /api/client/notification-prefs` | 改 notify_mode / language；email 修改走独立接口并发验证邮件 |
| `PATCH /api/client/notification-prefs/email` | 改邮箱（P2：发验证链接） |

页面：客户端"个人中心"新增"通知设置"卡片（复用现有表单样式）。

### 6.3 运营 / 管理端（P2）

| 端点 | 说明 |
|---|---|
| `GET /api/ops/orders/:id/notifications` | 本票通知历史（发送状态、失败原因、重发按钮） |
| `POST /api/ops/notifications/:id/resend` | 手动重发（写审计） |
| `GET /api/admin/notifications` | 全局通知日志：按客户/事件/状态筛选，失败率统计 |

运营价值：客服回答"客户说没收到邮件"时，一眼看到是没邮箱、被去重还是进了垃圾箱（发送成功）。

---

## 7. 邮件模板（P1 三套，中葡对照）

模板为纯函数渲染，不引入模板引擎依赖；样式用内联 table 布局（邮件客户端兼容），主题色与四端一致。

**E1 报价核算完成**

- 主题（zh）：`【AEG】您的报价 ${quote_no} 已完成`
- 主题（pt）：`【AEG】Sua cotação ${quote_no} está pronta`
- 正文要点：报价号、总金额（BRL/USD，保留现有精度口径）、"查看详情"按钮（`https://app.aeglogistics.com.br/orders/{id}`）、免责声明（参考报价，非最终合同——沿用 PRD 4.4"金额显示币种和精度"要求）。

**E2 物流节点更新**

- 主题（zh）：`【AEG】订单 ${quote_no} 物流更新：${节点名}`
- 主题（pt）：`【AEG】Atualização de embarque ${quote_no}: ${etapa}`
- 正文要点：节点中文名/葡语名（复用四端 `shipStage.*` 词条）、时间（客户时区 pt-BR/zh-CN）、一句话说明该节点含义。

**E3 交付文件上传**

- 主题（zh）：`【AEG】订单 ${quote_no} 有新文件：放行截图 / 发票`
- 主题（pt）：`【AEG】${quote_no}: novo documento disponível`
- 正文要点：文件名、类型说明、登录下载提示。

所有模板页脚：公司签名、本邮件由系统发送（事务性通知，不提供退订——营销邮件才有退订，LGPD 口径见第 10 节）。

---

## 8. 配置项

`.env.example` 新增一节：

```ini
# ========== Notification ==========
# 未配置 SMTP_* 时：事件照常入库但标记 skipped，业务不受影响
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@aeglogistics.com.br
SMTP_PASS=
SMTP_FROM="AEG Logistics <no-reply@aeglogistics.com.br>"
# 每分钟最多发送封数（Hostinger SMTP 限额保护）
NOTIFY_RATE_PER_MIN=12
# 本地/测试环境设为 true：只落库不真发
NOTIFICATION_DRY_RUN=true
```

密钥管理遵循 PRD 7.2："AI 密钥不得在页面明文回显或写入文档、日志"——SMTP 凭证同样只进 `.env`，不进前端包与日志。

---

## 9. WhatsApp 预研（P3，本节为决策材料）

| 维度 | 结论 |
|---|---|
| 通道 | Meta WhatsApp Cloud API（官方 BSP，无需中间商） |
| 成本 | 会话按类型计费（巴西市场营销类最贵，事务性通知 utility 较低）；需要 Meta Business 验证 |
| 前提 | 客户手机号（`user` 表同样缺 `phone`，需与 email 一起加列） |
| 模板 | 必须预先在 Meta 后台登记并通过审核，中葡各一套；不支持任意自由文本 |
| 建议 | 巴西客户日常沟通强依赖 WhatsApp，值得做；但**先跑邮件 P1/P2 验证事件选择与文案**，WhatsApp 直接复用同一套事件与队列，只换 Provider。P3 启动前用 1-2 周做 Meta 商业验证 + 模板审批 |

架构上本期已为其留位：`notification_log.channel` 字段、Provider 接口化（`send(msg): Promise<void>`），三期加 `whatsapp.provider.ts` 即可，不动存量。

---

## 10. 安全与合规（LGPD）

1. **只发事务性通知**：内容限于该客户自己的业务事实，不做营销 → 无需同意前置，但仍要遵守 LGPD 目的限制原则。
2. **数据最小化**：邮件正文不含 CNPJ、证件号、完整地址等敏感字段，只含报价号/节点/金额与登录链接。
3. **保留与删除**：`notification_log` 属客户个人数据处理记录，保留 12 个月后归档；客户行使删除权时同步清理（呼应规划 T-11）。
4. **防泄露**：发送日志记录 subject 与收件人，但**不落正文全文**（payload 只存渲染所需最小字段）。
5. **审计**：手动重发、偏好修改走 `auditRepo.entry`。

---

## 11. 分阶段实施计划

### P1 · 邮件 MVP（约 4-5 人日）

| 步骤 | 内容 | 涉及文件 |
|---|---|---|
| 1 | 加列 + 新表迁移 | `user/client` 实体、新迁移、`mock-db.ts` 同步 |
| 2 | 注册表单收邮箱；个人中心展示 | `web-client` 注册/个人中心页、`auth.service.register` |
| 3 | NotificationModule（service + worker + email.provider + 3 模板） | `apps/api/src/notification/*`（新） |
| 4 | 三处事件埋点 | `quote.service.ts` ×3、`ops-order.controller.ts:519`、`order-files.controller.ts:43` |
| 5 | `.env.example` + VPS `.env` 配 SMTP；DRY_RUN 开关验证 | 部署文档 |
| 6 | 验收：本地 DRY_RUN 全链路 + 生产首封真邮件 | 第 12 节用例 |

### P2 · 偏好与可观测（约 3-4 人日）

- 客户通知偏好接口 + 个人中心卡片（instant/digest/off + 语言）
- 每日摘要 worker（E1-E3 聚合 + E4 回款事件上线）
- 运营端订单通知历史 + 手动重发；管理端全局日志页
- 邮箱验证流程（验证链接，`email_verified` 生效；未验证邮箱仍可发，标记降权）

### P3 · WhatsApp（约 3-4 人日 + Meta 审批等待）

- `whatsapp.provider.ts`、`user.phone` 加列、客户中心补手机号
- Meta 模板登记（中葡 ×4 事件）、channel 选择逻辑（有 WhatsApp 优先）

**依赖与顺序**：P1 依赖"邮箱采集"先行落地；与规划文档 T-4（可观测性）协同——worker 失败率应进日志告警；若 T-1（数据层收敛）先完成，则 mock 侧工作量减少约 1 人日。

---

## 12. 测试与验收用例

| # | 场景 | 期望 |
|---|---|---|
| N1 | 运营对 done 报价录入新节点 | 30 秒内 worker 消费，日志 status=sent（DRY_RUN 下 skipped），客户端语言正确 |
| N2 | 同一订单 1 小时内录 3 个节点 | 只产生 1 条 pending（同日桶合并），标题含"3 个新节点" |
| N3 | 客户无邮箱（存量账号） | 事件入库 status=skipped: no_recipient；运营端可见原因 |
| N4 | SMTP 密码错误 | 重试 5 次指数退避后 failed，error 分类清晰；业务接口不受影响、响应时间不变（<50ms 增量） |
| N5 | `NOTIFICATION_DRY_RUN=true` | 永不真发，状态可区分，便于回归 |
| N6 | 客户 notify_mode=off | enqueue 即 skipped: user_off，不再进队列 |
| N7 | 葡语客户（preferred_language=pt） | 模板全葡语，日期 pt-BR 格式，金额 R$ 格式 |
| N8 | 节点新增接口在通知模块抛异常时 | 业务写库成功、响应 200，日志 warn——通知永不阻塞业务 |
| N9 | 中葡邮件在 Gmail/Outlook 预览 | 无乱码、按钮链接正确跳登录态 |

---

## 13. 风险与对策

| 风险 | 概率 | 对策 |
|---|---|---|
| Hostinger SMTP 每日发信限额/被判垃圾邮件 | 中 | `NOTIFY_RATE_PER_MIN` 限速；SPF/DKIM/DMARC 三件套在域名 DNS 配置；`From` 用企业域名子地址 |
| 存量客户无邮箱，通知覆盖率低 | 高 | 注册即收邮箱；运营端客户列表加"无邮箱"黄标提醒补录；client.contact_email 兜底 |
| 语言判断错（给巴西客户发中文） | 中 | 登录自动上报语言持续修正；email 正文顶部放"Português | 中文"切换链接（渲染时首选另一语言） |
| 测试环境误发真邮件 | 中 | 默认 DRY_RUN=true，生产显式关闭才真发 |
| worker 单点（进程挂了通知延迟） | 低 | 状态机幂等（pending 可重扫），pm2 拉起后自动恢复；与 T-8 状态外置方案兼容 |
| 通知反而打扰客户 | 中 | 默认即时但强去重 + 摘要选项 + 客户可自关闭 |

---

## 14. 附录

### 14.1 事件埋点位置索引（实施时直接对照）

| 事件 | 文件:行 |
|---|---|
| E1 报价核算完成 | `apps/api/src/upload/quote.service.ts:198`、`:439`、`:509` |
| E2 物流节点新增 | `apps/api/src/order/ops-order.controller.ts:519` |
| E3 交付文件上传 | `apps/api/src/order/order-files.controller.ts:43` |
| E4 回款登记（P2） | `apps/api/src/finance/finance.controller.ts:95` |

### 14.2 涉及文件清单（P1 全量）

```
apps/api/src/entities/user.entity.ts                 # +email +preferred_language +notify_mode
apps/api/src/entities/client.entity.ts               # +contact_email
apps/api/src/migrations/1763x-NotificationLog.ts     # 新表 + 加列（新）
apps/api/src/notification/*                          # 新模块（4 文件）
apps/api/src/common/mock-db.ts                       # NotificationLogRepo + 字段
apps/api/src/common/pg-repos.ts                      # NotificationLogRepo 实现
apps/api/src/upload/quote.service.ts                  # 3 处埋点
apps/api/src/order/ops-order.controller.ts            # 1 处埋点
apps/api/src/order/order-files.controller.ts         # 1 处埋点
apps/api/src/auth/auth.service.ts                    # 注册收 email
apps/web-client/src/pages/Register.tsx                # 邮箱输入
apps/web-client/src/pages/Profile.tsx                 # 邮箱展示/修改入口
apps/web-client/src/locales/{zh,pt}.ts                # 新词条
.env.example                                          # SMTP/通知配置节
deploy/hostinger/update.sh 相关文档                    # 生产配置说明
```

### 14.3 与规划文档的呼应

- 事件 worker 属"进程内定时任务"，扩容时纳入 T-8（状态外置）统一处理。
- 通知日志页属新增管理端页面，实现时注意 T-9（索引）：`(status, next_retry_at)` 必建。
- 模板文案入 i18n 词条时，避免四端复制（T-6 方向）：邮件模板词条只放 api 侧常量文件，不放前端 locales。
