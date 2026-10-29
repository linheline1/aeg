# AEG DDP 报价系统 · 测试用例文档

| 项 | 内容 |
|---|---|
| 项目键 | AEG |
| 文档版本 | v1.0 |
| 日期 | 2026-10-23 |
| 合规基线 | ISO/IEC 25010 软件质量模型（功能适合性 / 信息安全性 / 可靠性 / 易用性 / 性能效率 / 兼容性） |
| 覆盖范围 | 全模块：认证、客户管理、费率表（M2）、客户上传、订单状态机（M3）、成交与改派（M4）、权限隔离、审计日志、模板、三端 UI |
| 用例总数 | 180 |
| 用例标题规范 | `AEG-<模块>-<编号>` |

---

## 1. 术语与表述约定

| 术语 | 定义 |
|---|---|
| 客户 | 客户端登录账号（role=client），即上传装箱清单、接收报价的外部客户账号 |
| 用户 | 系统内部账号统称（admin / operator / sales / client 四种角色） |
| 系统 | AEG 整体（前端 + 后端），预期结果主语 |
| API | 后端接口（NestJS，全局前缀 `/api`） |
| 运营端 | web-ops（报价员 operator 与业务员 sales 使用） |
| 管理端 | web-admin（仅 admin） |
| 客户端 | web-client（仅 client） |

- 测试步骤一律使用祈使句（“输入…”“点击…”“发送…”）。
- 预期结果一律以系统行为表述（“系统返回…”“系统显示…”“系统拒绝…”）。
- 状态值显示口径：接口断言使用英文枚举原值（`uploaded` / `pending_fee` / `computing` / `done` / `failed`）；运营端 UI 显示为中文映射。

## 2. 测试环境与基线数据

> 以下全部来自代码与 `apps/api/data/dev.json`，未包含任何推测值。

| 项 | 值 |
|---|---|
| API 地址 | `http://127.0.0.1:5000/api`（仅监听本机，全局前缀 `/api`） |
| 运行模式 | `APP_MODULE_MODE` 默认 `mock`（JSON Mock DB：`apps/api/data/dev.json`） |
| 全局校验 | ValidationPipe（whitelist + forbidNonWhitelisted + transform）；全局 JWT AuthGuard + RolesGuard + ClientScopeInterceptor |
| 前端 | 三个 Vite 应用（web-admin / web-ops / web-client），`/api` 代理到 `127.0.0.1:5000`；开发端口由 Vite 分配 |
| JWT | 签发 `expires_in=43200` 秒；密钥取 `JWT_SECRET`（开发回退值见 `auth.guard.ts`） |

### 2.1 种子账号（dev.json）

| 账号 | 角色 | 初始密码 | 备注 |
|---|---|---|---|
| admin | admin | <测试密码> | 管理端 |
| operator | operator | <测试密码> | 运营端（报价员） |
| client_a | client | <测试密码> | 绑定「示例客户 A」（id `9e6a4401-ad08-41f7-94b5-97e5a023544d`） |
| sales01 | sales | **环境数据，仓库未记录** | id `94febb63-a6b2-4fc8-b5d5-df7b72b4ce80`；管理员可通过 `PATCH /api/admin/staff/:id/password` 直接重置其密码（R-08 复核确认，见 §7） |

### 2.2 基线数据

| 数据 | 值 |
|---|---|
| 全局默认费率 | 整柜海运费 7000 USD / 起运港杂费 500 USD / 汇率 5.23 / 20% 税基利润加成 / 销售税务 6.5% / 每票利润 30000 BRL |
| 费率兜底值（全局费率被删且无客户覆盖时） | 1200 / 130 / 5.0 / 0.20 / 0.065 / 30000，`source='default'`；旧 `br_clearance_brl` 固定 0 且不参与新 DDP |
| 启用模板 | `BR_FCL` v2.0（数据起始行 Row5，最大 100 行，字段字典 27 列 A–AA） |
| 存量订单 | Q-20261023-7922（done/won）、Q-2026-0915-001（done）、Q-2026-1003-002（done）、Q-2026-1020-003（done/lost），均属示例客户 A |
| 销售税基 | （DI + 申报货值 BRL）×（1 + sales_markup_rate）+ 国际海运费 BRL |
| DDP 公式 | 销售税务=销售税基×sales_tax_rate；参考 DDP=销售税务+DI+国际海运费+其他成本（起运港杂费）+profit_brl（各金额保留 2 位小数）；国际海运费 USD=ocean_freight_usd（港杂费计入 DDP，不并入海运费） |
| 客户展示口径 | 所有 BRL DDP 均标注“参考预估”，不构成最终报价、锁价承诺或正式账单；最终以书面确认及正式账单为准 |

### 2.3 测试数据准备（每轮执行前）

1. 还原 `apps/api/data/dev.json` 至基线快照，重启 API。
2. 调用 `POST /api/auth/login` 分别获取 admin / operator / client_a 的 token，记为 `T-admin` / `T-ops` / `T-client`。
3. 需要「未核算订单」时：用 `T-client` 上传一份合法模板文件生成新订单（状态 `uploaded`）。
4. 需要「客户覆盖费率」时：执行 AEG-RATES-008。

---

## 3. ISO/IEC 25010 特性 → 测试组映射

| 质量特性 | 子特性 | 对应测试组 |
|---|---|---|
| 功能适合性 | 功能完备性 / 正确性 / 适合性 | §5.1–§5.9 全部正常流与边界用例 |
| 信息安全性 | 保密性 / 完整性 / 不可否认性 | AEG-SEC（鉴权、越权、隔离、注入）、AEG-AUDIT（审计留痕） |
| 可靠性 | 成熟性 / 容错性 | AEG-ORDER-005/019、AEG-REL（超时/弱网/故障注入） |
| 易用性 | 可学习性 / 用户错误防护 | AEG-UIC / AEG-UIO / AEG-UIA（错误提示、空态、防呆） |
| 性能效率 | 容量 | AEG-UPLOAD-020（20MB 上限）、AEG-AUDIT-004（limit 上限 1000）、AEG-UPLOAD-019（错误回传上限 50 条） |
| 兼容性 | 共存性 / 互操作性 | AEG-UPLOAD-002/004/005/006（模板版本与文件格式兼容）、AEG-TPL |

> 可移植性、可维护性本轮不设计系统级用例（属代码审查与部署验证范畴）。

---

## 4. 错误码显式验证矩阵

| 错误码 | 触发点（代码依据） | 覆盖用例 |
|---|---|---|
| 400 | 登录账号/密码/状态校验、状态机非法流转、费率参数非法（含 fees 端点）、成交标记非法值、上传文件格式与内容校验（含枚举/入仓号）、客户管理字段校验、自由文本长度上限、内部账号参数校验、空 PATCH | AEG-AUTH-002~005/010、AEG-ORDER-003/009~013/016/022、AEG-RATES-003~006/016、AEG-DEAL-004~006/010/015、AEG-UPLOAD-002~004/008~016/024/025/027、AEG-CLIENT-003~007/009/012/014/017/021、AEG-USER-003~007/009/011/012 |
| 401 | 无 token / 格式错误 / 无效或过期 token / 用户名或密码错误（含禁用账号） | AEG-AUTH-002~009、AEG-SEC-001/005/006、AEG-TPL-006、AEG-CLIENT-013 |
| 403 | RolesGuard 角色不符、ClientScopeInterceptor 跨客户参数、sales 标记他人订单、非 admin 访问内部账号管理 | AEG-SEC-002/003、AEG-CLIENT-019、AEG-RATES-015、AEG-ORDER-021、AEG-DEAL-008、AEG-AUDIT-006、AEG-UIO-003/009、AEG-USER-013 |
| 404 | 订单/客户/模板版本/文件/员工不存在、无启用模板、无费率覆盖可删 | AEG-ORDER-004/013/015/018/019、AEG-CLIENT-011/018、AEG-RATES-009/013/014、AEG-TPL-003~005、AEG-DEAL-007、AEG-USER-009/012 |
| 409 | 登录账号重复（客户账号与内部账号） | AEG-CLIENT-008、AEG-USER-006 |
| 413 | 上传文件超过 20MB | AEG-UPLOAD-020 |
| 500 | 存储层故障注入、未捕获异常；断言不泄漏堆栈 | AEG-REL-005、AEG-AUTH-011 |

---

## 5. 测试用例

优先级：P0=阻断发布，P1=高，P2=中。

### 5.1 认证与会话（AEG-AUTH）

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-AUTH-001 | [AEG-AUTH-001] 管理员正确凭据登录 | P0 | 功能适合性 | API 已启动 | 1. 发送 `POST /api/auth/login`，body `{"username":"admin","password":"<测试密码>"}` | 系统返回 200，响应含 `access_token`、`token_type="Bearer"`、`expires_in=43200`、`user.role="admin"`；系统写入一条 `LOGIN` 审计日志 |
| AEG-AUTH-002 | [AEG-AUTH-002] 错误密码登录被拒绝 | P0 | 信息安全性 | 同上 | 1. 发送登录请求，`{"username":"admin","password":"wrong_pass"}` | 系统返回 401，message 为「用户名或密码错误」；系统不返回 token |
| AEG-AUTH-003 | [AEG-AUTH-003] 不存在的用户名登录 | P0 | 信息安全性 | 同上 | 1. 发送登录请求，`{"username":"no_such_user_xyz","password":"whatever1"}` | 系统返回 401，message 与 AEG-AUTH-002 完全一致（不可通过文案区分用户是否存在） |
| AEG-AUTH-004 | [AEG-AUTH-004] 空用户名空密码登录 | P1 | 信息安全性 | 同上 | 1. 发送登录请求，`{"username":"","password":""}` | 系统返回 401，不返回 token |
| AEG-AUTH-005 | [AEG-AUTH-005] 禁用账号登录被拒绝 | P0 | 信息安全性 | 用 T-admin 将某客户账号 PATCH 为 `disabled` | 1. 用该账号发送登录请求 | 系统返回 401「用户名或密码错误」；系统不暴露禁用状态 |
| AEG-AUTH-006 | [AEG-AUTH-006] 缺少 Authorization 头访问受保护接口 | P0 | 信息安全性 | 无 | 1. 不带任何 Authorization 头发送 `GET /api/auth/me` | 系统返回 401，message 为「Missing Bearer token」 |
| AEG-AUTH-007 | [AEG-AUTH-007] Authorization 头格式错误 | P1 | 信息安全性 | 持有有效 token | 1. 发送 `GET /api/auth/me`，头设为 `Authorization: <token>`（无 `Bearer ` 前缀） | 系统返回 401「Missing Bearer token」 |
| AEG-AUTH-008 | [AEG-AUTH-008] 无效/篡改 token 被拒绝 | P0 | 信息安全性 | 持有有效 token | 1. 将 token 末段任意改动 1 个字符；2. 用改动后的 token 发送 `GET /api/auth/me` | 系统返回 401「Invalid or expired token」 |
| AEG-AUTH-009 | [AEG-AUTH-009] 过期 token 被拒绝 | P0 | 信息安全性 | 用与 API 相同的 JWT 密钥签发 `expiresIn:-1s` 的 token | 1. 用该过期 token 发送 `GET /api/auth/me` | 系统返回 401「Invalid or expired token」 |
| AEG-AUTH-010 | [AEG-AUTH-010] 缺失 password 字段登录 | P1 | 功能适合性 | 同上 | 1. 发送登录请求，body 仅 `{"username":"admin"}` | 系统拒绝登录，返回 401 或 400；系统不返回 token、不返回 200 |
| AEG-AUTH-011 | [AEG-AUTH-011] password 传非字符串类型 | P2 | 可靠性 | 同上 | 1. 发送登录请求，`{"username":"admin","password":["<测试密码>"]}` | 系统返回 4xx/5xx 且不含数据库堆栈明文；系统不返回 200、不返回 token（若返回 500，响应体不得泄漏源码路径） |

### 5.2 客户管理 · 管理端（AEG-CLIENT）

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-CLIENT-001 | [AEG-CLIENT-001] 查询客户列表 | P0 | 功能适合性 | 持有 T-admin | 1. 发送 `GET /api/admin/clients` | 系统返回 200 数组，「示例客户 A」在列，每项含 `name`/`status`/`username`/`user_status`/`quote_count`/`salesperson_name` 字段 |
| AEG-CLIENT-002 | [AEG-CLIENT-002] 新建客户（含登录账号） | P0 | 功能适合性 | 持有 T-admin | 1. 发送 `POST /api/admin/clients`，body `{"name":"测试客户B","username":"client_b","password":"secret123"}`；2. 用 client_b/secret123 登录 | 步骤1 系统返回 200 `ok:true`，client.status 为 `active`；步骤2 系统返回 200 且 `user.role="client"` |
| AEG-CLIENT-003 | [AEG-CLIENT-003] 客户名称为空被拒绝 | P1 | 功能适合性 | 持有 T-admin | 1. 发送新建请求，`{"name":"  ","username":"client_c","password":"secret123"}` | 系统返回 400「客户名称不能为空」 |
| AEG-CLIENT-004 | [AEG-CLIENT-004] 登录账号为空被拒绝 | P1 | 功能适合性 | 同上 | 1. 发送新建请求，`{"name":"测试客户C","username":"","password":"secret123"}` | 系统返回 400「登录账号不能为空」 |
| AEG-CLIENT-005 | [AEG-CLIENT-005] 非法账号格式被拒绝 | P1 | 功能适合性 | 同上 | 1. 分别以账号 `ab`（2位）、`a@b`（特殊字符）、`客户甲`（中文）、33 位字母串发送新建请求 | 四次请求系统均返回 400「登录账号需为 3-32 位字母、数字或 _ . -」 |
| AEG-CLIENT-006 | [AEG-CLIENT-006] 账号长度边界 3 位与 32 位 | P1 | 功能适合性 | 同上 | 1. 以 3 位合法账号新建；2. 以 32 位合法账号新建 | 两次系统均返回 200 创建成功 |
| AEG-CLIENT-007 | [AEG-CLIENT-007] 初始密码长度边界 5 位与 6 位 | P1 | 功能适合性 | 同上 | 1. 以密码 `abc12`（5位）新建；2. 以密码 `abc123`（6位）新建 | 步骤1 系统返回 400「初始密码至少 6 位」；步骤2 系统返回 200 |
| AEG-CLIENT-008 | [AEG-CLIENT-008] 重复账号被拒绝 | P0 | 功能适合性 | 已存在账号 client_a | 1. 发送新建请求，`username` 填 `client_a` | 系统返回 409「登录账号已存在」 |
| AEG-CLIENT-009 | [AEG-CLIENT-009] 归属业务员指向非 sales 用户 | P1 | 功能适合性 | 持有 T-admin，已知 operator 的用户 id | 1. 发送新建请求，`salesperson_id` 填 operator 的 id | 系统返回 400「指定的业务员不存在」 |
| AEG-CLIENT-010 | [AEG-CLIENT-010] 指定归属业务员成功 | P1 | 功能适合性 | 同上 | 1. 发送新建请求，`salesperson_id` 填 sales01 的 id；2. 发送 `GET /api/admin/clients` | 系统返回 200；列表中该客户 `salesperson_name` 为 sales01 |
| AEG-CLIENT-011 | [AEG-CLIENT-011] 修改不存在的客户 | P1 | 功能适合性 | 持有 T-admin | 1. 发送 `PATCH /api/admin/clients/not-exist-id`，body `{"name":"X"}` | 系统返回 404「客户不存在」 |
| AEG-CLIENT-012 | [AEG-CLIENT-012] 空修改内容被拒绝 | P2 | 功能适合性 | 目标客户存在 | 1. 发送 `PATCH /api/admin/clients/:id`，body `{}` | 系统返回 400「没有需要修改的内容」 |
| AEG-CLIENT-013 | [AEG-CLIENT-013] 禁用客户同步禁用登录账号（反向：再启用） | P0 | 功能适合性 | 目标客户及其账号均为 active | 1. 发送 `PATCH /api/admin/clients/:id`，body `{"status":"disabled"}`；2. 用该客户账号登录；3. 发送 `PATCH` body `{"status":"active"}`；4. 再次登录 | 步骤1 系统返回 200 且列表 `user_status="disabled"`；步骤2 系统返回 401；步骤3 系统返回 200；步骤4 系统返回 200 |
| AEG-CLIENT-014 | [AEG-CLIENT-014] 非法状态值被拒绝 | P1 | 功能适合性 | 目标客户存在 | 1. 发送 `PATCH /api/admin/clients/:id`，body `{"status":"deleted"}` | 系统返回 400「状态只能是 active 或 disabled」 |
| AEG-CLIENT-015 | [AEG-CLIENT-015] 修改客户名称生效 | P1 | 功能适合性 | 目标客户存在 | 1. 发送 `PATCH /api/admin/clients/:id`，body `{"name":"示例客户 A 改名"}`；2. 发送 `GET /api/admin/clients` | 系统返回 200；列表中该客户 `name` 为新值 |
| AEG-CLIENT-016 | [AEG-CLIENT-016] 重置密码后新旧密码验证 | P0 | 信息安全性 | 目标客户有登录账号 | 1. 发送 `PATCH /api/admin/clients/:id/password`，body `{"password":"newpass123"}`；2. 用旧密码登录；3. 用新密码登录 | 步骤1 系统返回 200；步骤2 系统返回 401；步骤3 系统返回 200 |
| AEG-CLIENT-017 | [AEG-CLIENT-017] 重置密码少于 6 位被拒绝 | P1 | 功能适合性 | 同上 | 1. 发送重置密码请求，body `{"password":"12345"}` | 系统返回 400「新密码至少 6 位」 |
| AEG-CLIENT-018 | [AEG-CLIENT-018] 为无登录账号的客户重置密码 | P2 | 功能适合性 | 构造一条无对应 user 的 client 记录 | 1. 发送 `PATCH /api/admin/clients/:id/password`，body `{"password":"newpass123"}` | 系统返回 404「该客户没有登录账号」 |
| AEG-CLIENT-019 | [AEG-CLIENT-019] 非 admin 访问客户管理被拒绝 | P0 | 信息安全性 | 持有 T-ops、T-client | 1. 用 T-ops 发送 `GET /api/admin/clients`；2. 用 T-client 发送同一请求 | 两次系统均返回 403 |
| AEG-CLIENT-020 | [AEG-CLIENT-020] 客户名称含特殊字符 | P2 | 兼容性 | 持有 T-admin | 1. 发送新建请求，`name` 填 `客户<script>&"测试'` | 系统返回 200；列表回显原文；管理端页面展示时不执行脚本（结合 AEG-UIA-005 观察） |
| AEG-CLIENT-021 | [AEG-CLIENT-021] 客户名称超长被拒绝 | P1 | 可靠性 | 持有 T-admin | 1. 发送新建请求，`name` 填 129 字符文本，其余合法；2. 发送 `PATCH /api/admin/clients/:id`，`name` 填 129 字符文本 | 两次系统均返回 400「客户名称过长（最多 128 字符）」（R-05 已修复）；128 字符名称可正常创建 |

### 5.3 费率表 · 运营端（AEG-RATES）

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-RATES-001 | [AEG-RATES-001] 查询费率表全量 | P0 | 功能适合性 | 持有 T-ops | 1. 发送 `GET /api/ops/rates` | 系统返回 200，含 `global`（7000/500/5.23/0.065/30000）、`overrides` 数组、`clients` 下拉数组 |
| AEG-RATES-002 | [AEG-RATES-002] 更新全局默认费率 | P0 | 功能适合性 | 持有 T-ops | 1. 发送 `PUT /api/ops/rates/global`，body `{"ocean_freight_usd":7200,"port_fee_usd":520,"fx_rate":5.3,"sales_markup_rate":0.2,"sales_tax_rate":0.08,"profit_brl":50000}`；2. 发送 `GET /api/admin/audit`（T-admin） | 步骤1 系统返回 200 `ok:true` 且新字段正确；步骤2 审计含 `rates.global.update`，detail 含加成/税率/利润 before/after |
| AEG-RATES-003 | [AEG-RATES-003] 负数费率被拒绝 | P0 | 功能适合性 | 持有 T-ops | 1. 发送更新全局请求，`ocean_freight_usd=-1`，其余合法 | 系统返回 400「费率参数非法：金额必须为非负数且汇率大于 0」；全局费率保持原值 |
| AEG-RATES-004 | [AEG-RATES-004] 汇率/销售税率边界被拒绝 | P0 | 功能适合性 | 同上 | 1. `fx_rate=0`；2. `sales_tax_rate=1`；3. `profit_brl=-1` | 三次均返回 400，分别提示汇率、销售税务或金额非法 |
| AEG-RATES-005 | [AEG-RATES-005] 缺失字段被拒绝 | P1 | 功能适合性 | 同上 | 1. 发送更新全局请求，body 仅含 `{"ocean_freight_usd":7000}` | 系统返回 400（海运费/港杂费/汇率转 NaN 触发校验；税率和利润为兼容默认值） |
| AEG-RATES-006 | [AEG-RATES-006] 非数字与数字字符串处理 | P1 | 功能适合性 | 同上 | 1. 发送更新全局请求，`ocean_freight_usd` 填 `"abc"`；2. 恢复基线后，四项均以数字字符串（如 `"7000"`）提交 | 步骤1 系统返回 400；步骤2 系统返回 200 且存储为数值 7000 |
| AEG-RATES-007 | [AEG-RATES-007] 零值边界（费用可为 0） | P1 | 功能适合性 | 同上 | 1. 发送更新全局请求，`{"ocean_freight_usd":0,"port_fee_usd":0,"br_clearance_brl":0,"fx_rate":0.01}` | 系统返回 200（费用 0 合法，汇率 0.01 > 0 合法） |
| AEG-RATES-008 | [AEG-RATES-008] 设置客户费率覆盖 | P0 | 功能适合性 | 持有 T-ops，目标客户存在 | 1. 发送 `PUT /api/ops/rates/client/:clientId`，body `{"ocean_freight_usd":6000,"port_fee_usd":400,"br_clearance_brl":90000,"fx_rate":5.0}`；2. 以相同参数再次发送 | 步骤1 系统返回 200，审计写入 `rates.client.set`；步骤2 系统返回 200，审计写入 `rates.client.update` |
| AEG-RATES-009 | [AEG-RATES-009] 为不存在客户设置覆盖 | P1 | 功能适合性 | 持有 T-ops | 1. 发送 `PUT /api/ops/rates/client/no-such-client`，四项合法 | 系统返回 404「客户不存在」 |
| AEG-RATES-010 | [AEG-RATES-010] 费率解析优先客户覆盖 | P0 | 功能适合性 | 目标客户已有覆盖（AEG-RATES-008） | 1. 发送 `GET /api/ops/rates/resolve/:clientId` | 系统返回 200，`source="client"`，费率为覆盖值 6000/400/90000/5.0 |
| AEG-RATES-011 | [AEG-RATES-011] 无覆盖时解析回退全局 | P0 | 功能适合性 | 目标客户无覆盖 | 1. 发送 `GET /api/ops/rates/resolve/:clientId` | 系统返回 200，`source="global"`，费率为全局值 |
| AEG-RATES-012 | [AEG-RATES-012] 移除客户覆盖（反向操作） | P1 | 功能适合性 | 目标客户已有覆盖 | 1. 发送 `DELETE /api/ops/rates/client/:clientId`；2. 发送 resolve 同一客户 | 步骤1 系统返回 200 `ok:true`，审计写入 `rates.client.remove`；步骤2 系统返回 `source="global"` |
| AEG-RATES-013 | [AEG-RATES-013] 移除不存在的覆盖 | P1 | 功能适合性 | 目标客户无覆盖 | 1. 发送 `DELETE /api/ops/rates/client/:clientId` | 系统返回 404「该客户没有费率覆盖」 |
| AEG-RATES-014 | [AEG-RATES-014] 解析不存在客户 | P2 | 功能适合性 | 持有 T-ops | 1. 发送 `GET /api/ops/rates/resolve/no-such-client` | 系统返回 404「客户不存在」 |
| AEG-RATES-015 | [AEG-RATES-015] client/sales 访问费率表被拒绝 | P0 | 信息安全性 | 持有 T-client 与 sales token | 1. 用 T-client 发送 `GET /api/ops/rates`；2. 用 sales token 发送同一请求 | 两次系统均返回 403 |
| AEG-RATES-016 | [AEG-RATES-016] 超大数值溢出防护 | P2 | 可靠性 | 持有 T-ops | 1. 发送更新全局请求，`ocean_freight_usd` 填 `1e309`（JSON 解析为 Infinity） | 系统返回 400「费率参数非法…」（Number.isFinite 拦截）；全局费率不变 |

### 5.4 客户上传与模板校验（AEG-UPLOAD）

> 通用前置：持有 T-client；上传接口 `POST /api/client/orders/upload`（multipart，字段名 `file`）。

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-UPLOAD-001 | [AEG-UPLOAD-001] 合法文件上传成功 | P0 | 功能适合性 | 按模板填写 2 行合法数据（含必填列与数值边界内取值） | 1. 上传该 xlsx | 系统返回 200：`ok:true`、`quote_no` 匹配 `Q-YYYYMMDD-XXXX`、`status="uploaded"`、`message` 含「已进入核算队列」；审计出现 `order.upload`；运营端订单列表出现该单且状态映射为「已上传」 |
| AEG-UPLOAD-002 | [AEG-UPLOAD-002] 非 xlsx 格式被拒绝 | P0 | 兼容性 | 准备 data.csv | 1. 上传 data.csv | 系统返回 400「仅支持 .xlsx 格式」 |
| AEG-UPLOAD-003 | [AEG-UPLOAD-003] 未携带文件 | P1 | 功能适合性 | 无 | 1. 发送不含 file 字段的 multipart 请求 | 系统返回 400「未收到文件」 |
| AEG-UPLOAD-004 | [AEG-UPLOAD-004] 损坏的 xlsx 被拒绝 | P0 | 兼容性 | 将纯文本文件改名为 fake.xlsx | 1. 上传 fake.xlsx | 系统返回 400「文件损坏或不是有效的 xlsx:…」 |
| AEG-UPLOAD-005 | [AEG-UPLOAD-005] TEMPLATE_META 缺失 | P0 | 兼容性 | 用合法模板删除隐藏 Sheet `TEMPLATE_META` 后另存 | 1. 上传该文件 | 系统返回 200 且 `ok:false`、`status="failed"`、`error_summary="TEMPLATE_META 缺失或损坏"`；系统不创建订单 |
| AEG-UPLOAD-006 | [AEG-UPLOAD-006] 模板版本不一致 | P0 | 兼容性 | 将 TEMPLATE_META 中 version 改为 `1.0` | 1. 上传该文件 | 系统返回 200 且 `ok:false`，`error_summary` 为「模板版本不一致（1.0 ≠ 2.0），请下载最新模板」 |
| AEG-UPLOAD-007 | [AEG-UPLOAD-007] 数据区为空 | P1 | 功能适合性 | 模板 Row5 起不填任何数据 | 1. 上传该文件 | 系统返回 200 且 `ok:false`，`error_summary="未检测到有效数据行，请从第 5 行起填写"` |
| AEG-UPLOAD-008 | [AEG-UPLOAD-008] 必填字段缺失 | P0 | 功能适合性 | 某行 B 列（中文品名）留空，其余合法 | 1. 上传该文件 | 系统返回 200 且 `ok:false`、`status="validating"`，`errors` 含 `{row:5, col_letter:"B", reason:"必填"}`；系统不创建订单 |
| AEG-UPLOAD-009 | [AEG-UPLOAD-009] 箱号格式校验 | P1 | 功能适合性 | 准备两份文件：A 列分别为 `ABC` 与 `1-167` | 1. 上传文件①；2. 上传文件② | 文件① 系统返回 `errors` 含 A 列「格式不符(^\d+(-\d+)?$)」；文件② 系统返回 `ok:true` |
| AEG-UPLOAD-010 | [AEG-UPLOAD-010] HS Code 边界与格式 | P0 | 功能适合性 | E 列分别构造 7 位数字、9 位数字、8 位含字母、8 位纯数字 | 1. 依次上传四份文件 | 前三份系统均报 E 列「格式不符(^\d{8}$)」；第四份系统返回 `ok:true` |
| AEG-UPLOAD-011 | [AEG-UPLOAD-011] 箱数 H 列数值边界 | P0 | 功能适合性 | H 列分别构造 0、1、99999、100000 | 1. 依次上传四份文件 | 0 → 系统报「不能小于 1」；1 与 99999 → 系统返回 `ok:true`；100000 → 系统报「不能大于 99999」 |
| AEG-UPLOAD-012 | [AEG-UPLOAD-012] 净重 K 列下限边界 | P1 | 功能适合性 | K 列分别构造 0 与 0.001 | 1. 上传文件①（0）；2. 上传文件②（0.001） | 文件① 系统报「不能小于 0.001」；文件② 系统返回 `ok:true` |
| AEG-UPLOAD-013 | [AEG-UPLOAD-013] 尺寸 O/P/Q 列边界 | P1 | 功能适合性 | 任一尺寸列构造 0.009、0.01、9999、10000 | 1. 依次上传四份文件 | 0.009 → 系统报「不能小于 0.01」；0.01 与 9999 → `ok:true`；10000 → 系统报「不能大于 9999」 |
| AEG-UPLOAD-014 | [AEG-UPLOAD-014] 单价 T 列边界（允许 0） | P1 | 功能适合性 | T 列分别构造 -1、0、9999999、10000000 | 1. 依次上传四份文件 | -1 → 系统报「不能小于 0」；0 与 9999999 → `ok:true`；10000000 → 系统报「不能大于 9999999」 |
| AEG-UPLOAD-015 | [AEG-UPLOAD-015] 数值列填文本 | P1 | 功能适合性 | H 列填 `十箱` | 1. 上传该文件 | 系统报 H 列「必须是数字」 |
| AEG-UPLOAD-016 | [AEG-UPLOAD-016] 毛重小于净重被拒绝 | P0 | 功能适合性 | 某行 K=10、L=8 | 1. 上传该文件 | 系统报 L 列「毛重不能小于净重」，`ok:false` |
| AEG-UPLOAD-017 | [AEG-UPLOAD-017] 公式列人工改写被后端重算覆盖 | P1 | 功能适合性 | 手工将 J 列填 99999（H=10、I=20） | 1. 上传该文件；2. 用 T-ops 查看订单详情 `line_items` | 系统返回 `ok:true`；详情中该行 `total_pcs=200`（后端按 H×I 重算，忽略手填值） |
| AEG-UPLOAD-018 | [AEG-UPLOAD-018] 最大行数边界 100/101 | P1 | 性能效率 | 构造恰好 100 行与 101 行合法数据 | 1. 上传 100 行文件；2. 上传 101 行文件 | 文件① 系统返回 `total_rows=100`；文件② 系统仅解析前 100 行（`total_rows=100`），第 101 行被忽略 |
| AEG-UPLOAD-019 | [AEG-UPLOAD-019] 错误回传上限 50 条 | P2 | 性能效率 | 构造 60 行均缺必填 | 1. 上传该文件 | 系统返回 `errors` 数组长度 = 50，`error_summary` 显示真实错误总数（大于 50） |
| AEG-UPLOAD-020 | [AEG-UPLOAD-020] 超过 20MB 上限 | P1 | 性能效率 | 构造 21MB 的 .xlsx | 1. 上传该文件 | 系统拒绝上传并返回 413（文件过大）；系统不创建订单 |
| AEG-UPLOAD-021 | [AEG-UPLOAD-021] 非 client 角色上传被拒绝 | P0 | 信息安全性 | 持有 T-ops | 1. 用 T-ops 上传合法文件 | 系统返回 403 |
| AEG-UPLOAD-022 | [AEG-UPLOAD-022] 数据从 Row4 开始填写 | P2 | 功能适合性 | 仅 Row4 有数据，Row5 起为空 | 1. 上传该文件 | 系统返回 `ok:false`「未检测到有效数据行，请从第 5 行起填写」（Row4 被忽略） |
| AEG-UPLOAD-023 | [AEG-UPLOAD-023] 文件名含中文与空格 | P2 | 兼容性 | 文件名为 `我的 清单(1).xlsx` | 1. 上传该文件；2. 用 T-ops 下载该订单原文件 | 步骤1 系统返回 `ok:true`；步骤2 系统返回 200，下载文件名经 UTF-8 编码可正常还原 |
| AEG-UPLOAD-024 | [AEG-UPLOAD-024] V 列枚举外取值被拒绝 | P0 | 功能适合性 | B2 入仓号已填；某行 V 列（是否带电）填 `超级带电` | 1. 上传该文件 | 系统返回 200 且 `ok:false`，`errors` 含 V 列「必须是枚举值之一：不带电 / 带电 / 含电池 / 其他」（R-02 已修复）；系统不创建订单 |
| AEG-UPLOAD-025 | [AEG-UPLOAD-025] F 列与 B2 入仓号不一致被拒绝 | P0 | 功能适合性 | B2 填 `WH-001`；某行 F 列填 `WH-999` | 1. 上传该文件 | 系统返回 200 且 `ok:false`，`errors` 含 F 列「与 B2 入仓号（WH-001）不一致」（R-02 已修复）；系统不创建订单 |
| AEG-UPLOAD-026 | [AEG-UPLOAD-026] F 列为空自动继承 B2 入仓号 | P1 | 功能适合性 | B2 填 `WH-001`；数据行 F 列留空，其余合法 | 1. 上传该文件；2. 用 T-ops 查看订单详情 `line_items` | 系统返回 `ok:true`；详情中该行入仓号为 `WH-001`（R-02 已修复） |
| AEG-UPLOAD-027 | [AEG-UPLOAD-027] B2 入仓号选填 | P1 | 功能适合性 | 模板 B2 单元格留空，数据行合法 | 1. 上传该文件 | 系统正常识别并通过校验，B2 与行级入仓号均允许为空 |

### 5.5 订单状态机与核算 · 运营端（AEG-ORDER）

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-ORDER-001 | [AEG-ORDER-001] 核算成功（全局费率，参考 DDP） | P0 | 功能适合性 | 存在已有 AI DI 的订单且客户无覆盖，全局费率 7000/500/5.23/20%/6.5%/30000 | 1. 用 T-ops 发送 `POST /api/ops/orders/:id/compute` | 系统返回 200：海运费 36610.00、港杂费 2615.00；税基=(DI+货值)×1.20+36610，销售税务=税基×6.5%，利润 30000；`total_amount_brl=税务+DI+36610+2615+30000`；五项分项与 `is_reference=true` 正确；审计含加成、税率和利润 |
| AEG-ORDER-002 | [AEG-ORDER-002] 核算使用客户覆盖费率 | P0 | 功能适合性 | 客户已设覆盖 6000/400/5.0/20%/6.5%/30000，订单已有 AI DI | 1. 发送 `POST /:id/compute` | 按客户覆盖计算税基和 DDP，`total_amount_usd=6000.00`；审计 `rate_source="client"`；客户侧展示参考预估 |
| AEG-ORDER-003 | [AEG-ORDER-003] done 订单重复核算被拒绝 | P0 | 功能适合性 | 订单已 `done` | 1. 发送 `POST /:id/compute`（不带 overrides） | 系统返回 400「订单已完成核算，如需调整请编辑费率」 |
| AEG-ORDER-004 | [AEG-ORDER-004] 核算不存在的订单 | P1 | 功能适合性 | 持有 T-ops | 1. 发送 `POST /api/ops/orders/no-such-id/compute` | 系统返回 404「订单不存在」 |
| AEG-ORDER-005 | [AEG-ORDER-005] computing 残留状态可重试 | P1 | 可靠性 | 构造已有 AI DI 的订单状态为 `computing`（模拟服务中断残留） | 1. 发送 `POST /:id/compute` | 系统按 DI + 新费率重新计算并返回 200，订单最终为 `done`（容错：不报“非法流转”） |
| AEG-ORDER-006 | [AEG-ORDER-006] 手动流转 uploaded→pending_fee | P0 | 功能适合性 | 订单 `uploaded` | 1. 发送 `PATCH /:id/status`，body `{"status":"pending_fee"}` | 系统返回 200 `ok:true`、`status="pending_fee"`；审计含 `order.status`（from=uploaded, to=pending_fee） |
| AEG-ORDER-007 | [AEG-ORDER-007] 标记失败并记录原因 | P0 | 功能适合性 | 订单 `uploaded` | 1. 发送 `PATCH /:id/status`，body `{"status":"failed","reason":"数据待补充"}`；2. 查看订单详情 | 系统返回 200 `status="failed"`；详情 `error_message="数据待补充"`（不带 reason 时系统写入「运营标记失败」） |
| AEG-ORDER-008 | [AEG-ORDER-008] 失败后重开（反向操作） | P1 | 功能适合性 | 订单 `failed` | 1. 发送 `PATCH /:id/status`，body `{"status":"pending_fee"}` | 系统返回 200，`status="pending_fee"`，`error_message` 清空为 null |
| AEG-ORDER-009 | [AEG-ORDER-009] 非法流转 uploaded→done 被拒绝 | P0 | 功能适合性 | 订单 `uploaded` | 1. 发送 `PATCH /:id/status`，body `{"status":"done"}` | 系统返回 400「不允许的状态流转：uploaded → done（允许：pending_fee, failed）」；订单状态保持 `uploaded` |
| AEG-ORDER-010 | [AEG-ORDER-010] 非法流转 done→failed 被拒绝 | P0 | 功能适合性 | 订单 `done` | 1. 发送 `PATCH /:id/status`，body `{"status":"failed"}` | 系统返回 400「不允许的状态流转：done → failed（允许：无）」 |
| AEG-ORDER-011 | [AEG-ORDER-011] 非法流转 pending_fee→uploaded 被拒绝 | P1 | 功能适合性 | 订单 `pending_fee` | 1. 发送 `PATCH /:id/status`，body `{"status":"uploaded"}` | 系统返回 400「不允许的状态流转：pending_fee → uploaded（允许：failed）」 |
| AEG-ORDER-012 | [AEG-ORDER-012] 空状态值被拒绝 | P1 | 功能适合性 | 订单 `uploaded` | 1. 发送 `PATCH /:id/status`，body `{}` | 系统返回 400（空目标状态不在允许列表） |
| AEG-ORDER-013 | [AEG-ORDER-013] 对不存在订单流转状态 | P2 | 功能适合性 | 持有 T-ops | 1. 发送 `PATCH /api/ops/orders/no-such-id/status`，body `{"status":"failed"}` | 系统返回 404「订单不存在」 |
| AEG-ORDER-014 | [AEG-ORDER-014] 编辑运费、加成、税率和利润重算 | P0 | 功能适合性 | 订单已有 DI 和参考 DDP | 1. 发送 `PATCH /:id/fees`，body `{"ocean_freight_usd":8000,"port_fee_usd":500,"fx_rate":5.23,"sales_markup_rate":0.2,"sales_tax_rate":0.08,"profit_brl":50000}` | 系统从原始 DI 和货值重算税基：税基=(DI+货值)×1.2+8000×5.23，合计=税基×8%+DI+41840+500+50000；USD=8000；不累计叠加，审计含 before/after |
| AEG-ORDER-015 | [AEG-ORDER-015] 编辑不存在订单的费率 | P1 | 功能适合性 | 持有 T-ops | 1. 发送 `PATCH /api/ops/orders/no-such-id/fees`，body 合法 | 系统返回 404「订单不存在」（R-03 已修复，与其余订单端点错误码一致） |
| AEG-ORDER-016 | [AEG-ORDER-016] fees 端点拒绝负数（回归验证） | P1 | 信息安全性 | 订单 `done` | 1. 发送 `PATCH /:id/fees`，body `{"ocean_freight_usd":-100}`；2. 发送 `{"fx_rate":0}` | 两次系统均返回 400「费率参数非法：四项必须为非负数且汇率 > 0」；订单金额保持原值（R-01 已修复，fees 与 PUT rates 复用同一校验） |
| AEG-ORDER-017 | [AEG-ORDER-017] 客户端仅见 done 订单 | P0 | 信息安全性 | 同一客户存在 `uploaded` 与 `done` 订单各 1 条 | 1. 用 T-client 发送 `GET /api/client/orders` | 系统仅返回 `done` 订单；响应字段不含 `client_id` 与内部敏感字段；`uploaded` 订单不可见 |
| AEG-ORDER-018 | [AEG-ORDER-018] 运营端订单详情 | P0 | 功能适合性 | 订单 `done` 且有明细 | 1. 用 T-ops 发送 `GET /api/ops/orders/:id`；2. 对不存在 id 重复 | 步骤1 系统返回 200，含 `line_items`、`pricing_breakdown`、`salesperson_name`、`deal_status`；步骤2 系统返回 404「订单不存在」 |
| AEG-ORDER-019 | [AEG-ORDER-019] 下载客户上传原文件 | P1 | 功能适合性 | 订单留存原文件 | 1. 用 T-ops 发送 `GET /api/ops/orders/:id/file` | 系统返回 200，Content-Type 为 xlsx，`Content-Disposition` 含 UTF-8 编码文件名，文件可打开 |
| AEG-ORDER-020 | [AEG-ORDER-020] sales 列表数据范围 | P0 | 信息安全性 | 存在归属 sales01 与非归属 sales01 的订单 | 1. 用 sales01 token 发送 `GET /api/ops/orders` | 系统仅返回归属 sales01 的订单（订单级改派优先，其次客户归属兜底）；不含他人订单 |
| AEG-ORDER-021 | [AEG-ORDER-021] client 访问运营端订单被拒绝 | P0 | 信息安全性 | 持有 T-client | 1. 用 T-client 发送 `GET /api/ops/orders` | 系统返回 403 |
| AEG-ORDER-022 | [AEG-ORDER-022] 状态流转原因超长被拒绝 | P1 | 可靠性 | 订单 `uploaded` | 1. 发送 `PATCH /:id/status`，body `{"status":"failed","reason":"<501 字符文本>"}` | 系统返回 400「原因说明过长」（上限 500 字符，R-05 已修复）；订单状态不变 |

### 5.6 成交标记与改派（AEG-DEAL）

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-DEAL-001 | [AEG-DEAL-001] 标记已成交 | P0 | 功能适合性 | 订单 `done` | 1. 用 T-ops 发送 `PATCH /:id/deal`，body `{"deal_status":"won"}` | 系统返回 200 `deal_status="won"`、`deal_closed_at` 非空；审计含 `order.deal` |
| AEG-DEAL-002 | [AEG-DEAL-002] 标记未成交并备注原因 | P1 | 功能适合性 | 订单 `done` | 1. 发送 `PATCH /:id/deal`，body `{"deal_status":"lost","note":"价格高于市场"}` | 系统返回 200，详情 `deal_note="价格高于市场"` |
| AEG-DEAL-003 | [AEG-DEAL-003] 恢复跟进（反向操作） | P1 | 功能适合性 | 订单已标记 `won` | 1. 发送 `PATCH /:id/deal`，body `{"deal_status":"open"}` | 系统返回 200，`deal_status="open"`，`deal_closed_at` 被清空为 null |
| AEG-DEAL-004 | [AEG-DEAL-004] 非法成交状态值 | P1 | 功能适合性 | 订单 `done` | 1. 发送 `PATCH /:id/deal`，body `{"deal_status":"closed"}` | 系统返回 400「deal_status 只能是 won / lost / open」 |
| AEG-DEAL-005 | [AEG-DEAL-005] 缺失成交状态 | P2 | 功能适合性 | 订单 `done` | 1. 发送 `PATCH /:id/deal`，body `{}` | 系统返回 400 |
| AEG-DEAL-006 | [AEG-DEAL-006] 非 done 订单禁止标记 | P0 | 功能适合性 | 订单 `uploaded` | 1. 发送 `PATCH /:id/deal`，body `{"deal_status":"won"}` | 系统返回 400「仅已核算发布（done）的报价可标记成交状态」 |
| AEG-DEAL-007 | [AEG-DEAL-007] 标记不存在订单 | P2 | 功能适合性 | 持有 T-ops | 1. 发送 `PATCH /api/ops/orders/no-such-id/deal`，body 合法 | 系统返回 404「订单不存在」 |
| AEG-DEAL-008 | [AEG-DEAL-008] sales 越权标记他人订单 | P0 | 信息安全性 | 订单归属非当前 sales | 1. 用该 sales token 发送 `PATCH /:id/deal`，body `{"deal_status":"won"}` | 系统返回 403「只能标记归属自己的报价单」 |
| AEG-DEAL-009 | [AEG-DEAL-009] 改派业务员 | P1 | 功能适合性 | 订单 `done`，持有 T-ops | 1. 发送 `PATCH /:id/assign`，body `{"salesperson_id":"<sales01-id>"}`；2. 用 sales01 发送 `GET /api/ops/orders` | 步骤1 系统返回 200，审计含 `order.assign`；步骤2 列表包含该订单 |
| AEG-DEAL-010 | [AEG-DEAL-010] 改派给非 sales 用户 | P1 | 功能适合性 | 持有 T-ops | 1. 发送 `PATCH /:id/assign`，`salesperson_id` 填 operator 的 id | 系统返回 400「指定的业务员不存在」 |
| AEG-DEAL-011 | [AEG-DEAL-011] 取消分配（反向操作） | P2 | 功能适合性 | 订单已分配 sales01 | 1. 发送 `PATCH /:id/assign`，body `{"salesperson_id":null}` | 系统返回 200，`salesperson_id=null`；该单在 sales01 列表消失（除非客户归属兜底） |
| AEG-DEAL-012 | [AEG-DEAL-012] 成交统计口径（全公司） | P1 | 功能适合性 | 基线数据：won=1、lost=1、done 共 4 单 | 1. 用 T-ops 发送 `GET /api/ops/deals/stats` | 系统返回 `scope="all"`，`overall.won=1`、`overall.lost=1`、`overall.win_rate=50`；统计仅计入 `done` 订单 |
| AEG-DEAL-013 | [AEG-DEAL-013] 成交统计口径（sales 自己） | P1 | 信息安全性 | 用 sales01 登录 | 1. 发送 `GET /api/ops/deals/stats` | 系统返回 `scope="self"`，仅统计归属 sales01 的订单 |
| AEG-DEAL-014 | [AEG-DEAL-014] 业务员下拉仅含 sales | P2 | 功能适合性 | 持有 T-ops | 1. 发送 `GET /api/ops/salespeople` | 系统返回 200，数组仅含 `role=sales` 用户（sales01 在列，admin/operator 不在列） |
| AEG-DEAL-015 | [AEG-DEAL-015] 成交备注超长被拒绝 | P1 | 可靠性 | 订单 `done` | 1. 发送 `PATCH /:id/deal`，body `{"deal_status":"lost","note":"<501 字符文本>"}` | 系统返回 400「备注过长」（上限 500 字符，R-05 已修复）；`deal_status` 不变 |

### 5.7 权限与数据隔离（AEG-SEC）

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-SEC-001 | [AEG-SEC-001] 无 token 访问全部受保护端点 | P0 | 信息安全性 | 无 | 1. 不带 token 依次请求：`GET /api/admin/clients`、`GET /api/ops/orders`、`GET /api/client/orders`、`GET /api/admin/audit`、`GET /api/client/template/current` | 五个请求系统均返回 401 |
| AEG-SEC-002 | [AEG-SEC-002] 角色矩阵越权验证 | P0 | 信息安全性 | 持有各角色 token | 1. 用 T-client 请求 `GET /api/admin/clients`；2. 用 T-client 请求 `GET /api/ops/rates`；3. 用 T-ops 请求 `GET /api/admin/audit`；4. 用 sales token 请求 `GET /api/ops/orders/<id>`（详情）；5. 用 T-admin 请求 `GET /api/client/orders` | 步骤1–4 系统均返回 403；步骤5 系统返回 403（该端点仅 client 角色） |
| AEG-SEC-003 | [AEG-SEC-003] 客户端跨客户参数被拦截 | P0 | 信息安全性 | 持有 T-client，已知他人 client_id | 1. 发送 `GET /api/client/orders?client_id=<他人id>` | 系统返回 403「Forbidden」 |
| AEG-SEC-004 | [AEG-SEC-004] 客户端携带本人 client_id 放行 | P2 | 功能适合性 | 持有 T-client | 1. 发送 `GET /api/client/orders?client_id=<本人id>` | 系统返回 200 正常列表 |
| AEG-SEC-005 | [AEG-SEC-005] 异密钥签发的 token 被拒绝 | P0 | 信息安全性 | 用错误密钥签发结构合法的 JWT | 1. 用该 token 请求 `GET /api/auth/me` | 系统返回 401「Invalid or expired token」 |
| AEG-SEC-006 | [AEG-SEC-006] 篡改 payload 提权被拒绝 | P0 | 信息安全性 | 将有效 token 解码、把 role 改为 admin、重新拼接（不重签） | 1. 用篡改 token 请求 `GET /api/admin/clients` | 系统返回 401（签名校验失败），不返回客户数据 |
| AEG-SEC-007 | [AEG-SEC-007] 登录注入字符串 | P1 | 信息安全性 | 无 | 1. 发送登录请求，`username` 填 `' OR 1=1 --` | 系统返回 401，响应不含数据库错误明细 |
| AEG-SEC-008 | [AEG-SEC-008] 超长用户名探测 | P2 | 可靠性 | 无 | 1. 发送登录请求，`username` 为 10000 字符 | 系统返回 401；API 进程保持可用（随后正常登录成功） |

### 5.8 审计日志 · 管理端（AEG-AUDIT）

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-AUDIT-001 | [AEG-AUDIT-001] 查询审计流水 | P0 | 信息安全性 | 持有 T-admin，系统已有操作记录 | 1. 发送 `GET /api/admin/audit` | 系统返回 200 `{total, items}`，items 按时间倒序，默认不超过 300 条 |
| AEG-AUDIT-002 | [AEG-AUDIT-002] limit 参数生效 | P1 | 功能适合性 | 同上 | 1. 发送 `GET /api/admin/audit?limit=5` | 系统返回 items 长度 ≤ 5 |
| AEG-AUDIT-003 | [AEG-AUDIT-003] limit 非法值容错 | P2 | 可靠性 | 同上 | 1. 发送 `?limit=0`；2. 发送 `?limit=abc` | 两次系统均返回 200 且不报错（按默认 300 处理），不返回 500 |
| AEG-AUDIT-004 | [AEG-AUDIT-004] limit 上限 1000 | P2 | 性能效率 | 审计记录 > 1000 条（可脚本批量生成） | 1. 发送 `?limit=99999` | 系统返回 items 长度 ≤ 1000 |
| AEG-AUDIT-005 | [AEG-AUDIT-005] 关键操作审计覆盖 | P0 | 信息安全性 | 依次执行：登录、上传、核算、状态流转、费率编辑、成交标记、改派、全局费率更新、客户覆盖设置/移除、客户归属业务员变更、模板下载 | 1. 每步操作后查询审计流水 | 系统为每个动作分别写入对应记录：`LOGIN` / `order.upload` / `order.compute` / `order.status` / `order.fees` / `order.deal` / `order.assign` / `rates.global.update` / `rates.client.set` / `rates.client.remove` / `client.salesperson` / `TEMPLATE_DOWNLOAD`，且含操作人与目标 |
| AEG-AUDIT-006 | [AEG-AUDIT-006] 非 admin 查询审计被拒绝 | P0 | 信息安全性 | 持有 T-ops、T-client | 1. 分别用两个 token 请求 `GET /api/admin/audit` | 两次系统均返回 403 |

### 5.9 模板管理与下载（AEG-TPL）

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-TPL-001 | [AEG-TPL-001] 查询当前启用模板 | P0 | 功能适合性 | 持有 T-client | 1. 发送 `GET /api/client/template/current` | 系统返回 200：`version_no="2.0"`、`data_start_row=5`、`max_rows=100`、`field_count=27`、`download_url="/api/client/template/2.0/download"`（字段字典实际 27 列 A–AA，R-04 已修复：代码注释与页面文案已统一为 27 列） |
| AEG-TPL-002 | [AEG-TPL-002] 下载模板文件 | P0 | 功能适合性 | 同上 | 1. 发送 `GET /api/client/template/2.0/download`；2. 查询审计 | 系统返回 200，Content-Type 为 xlsx，文件名为「巴西整柜装箱清单_模板_v2.0.xlsx」（UTF-8 编码）；审计出现 `TEMPLATE_DOWNLOAD` |
| AEG-TPL-003 | [AEG-TPL-003] 下载不存在版本 | P1 | 功能适合性 | 同上 | 1. 发送 `GET /api/client/template/9.9/download` | 系统返回 404「模板版本 9.9 不存在」 |
| AEG-TPL-004 | [AEG-TPL-004] 无启用模板时的提示 | P2 | 功能适合性 | 构造数据：将所有模板置为 inactive | 1. 发送 `GET /api/client/template/current` | 系统返回 404「当前没有启用的模板版本」 |
| AEG-TPL-005 | [AEG-TPL-005] 管理端模板列表与详情 | P1 | 功能适合性 | 持有 T-admin | 1. 发送 `GET /api/admin/templates`；2. 发送 `GET /api/admin/templates/2.0`；3. 发送 `GET /api/admin/templates/9.9` | 步骤1 系统返回列表含 `BR_FCL` v2.0 且 `status="active"`；步骤2 系统返回 meta 与 schema；步骤3 系统返回 404 |
| AEG-TPL-006 | [AEG-TPL-006] 未登录下载模板被拒绝 | P0 | 信息安全性 | 无 | 1. 不带 token 请求 `GET /api/client/template/2.0/download` | 系统返回 401，不返回文件流 |

### 5.10 客户端 UI 流程（AEG-UIC）

> 环境：浏览器访问客户端开发地址（如 `http://localhost:5175`，端口以实际 Vite 分配为准）。

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-UIC-001 | [AEG-UIC-001] 落地页公开访问与双语切换 | P1 | 易用性 | 未登录 | 1. 打开首页 `/`；2. 点击语言下拉切换 葡萄牙语/中文 | 系统展示落地页（独立头部与底部、海洋蓝/奶油/金配色）；切换后系统按所选语言展示文案 |
| AEG-UIC-002 | [AEG-UIC-002] 登录成功进入 Home | P0 | 功能适合性 | 未登录 | 1. 打开 `/login`；2. 输入 client_a / <测试密码>；3. 点击「登 录」 | 系统跳转 `/home`，显示统计、快捷报价、待办、最近参考报价、物流与默认开票公司 |
| AEG-UIC-003 | [AEG-UIC-003] 登录失败错误提示（空输入） | P0 | 易用性 | 未登录 | 1. 不输入任何内容直接点击「登 录」 | 系统在表单内显示「❌ 用户名或密码错误」；系统停留在登录页 |
| AEG-UIC-004 | [AEG-UIC-004] 登录失败错误提示（错误密码） | P0 | 易用性 | 未登录 | 1. 输入 client_a / bad_pass；2. 点击「登 录」 | 系统显示「❌ 用户名或密码错误」；系统不跳转 |
| AEG-UIC-005 | [AEG-UIC-005] 模板下载交互 | P1 | 易用性 | 已登录客户端 | 1. 在工作台点击「下载模板」 | 系统下载「巴西整柜装箱清单_模板_v2.0.xlsx」并短暂显示「✅ 下载完成」 |
| AEG-UIC-006 | [AEG-UIC-006] 未选文件时上传按钮防呆 | P1 | 易用性 | 已登录，未选择文件 | 1. 观察上传卡按钮状态 | 系统禁用「上传并获取报价」按钮（不可点击） |
| AEG-UIC-007 | [AEG-UIC-007] 上传校验失败明细展示 | P0 | 易用性 | 准备含 20 处校验错误的文件 | 1. 选择该文件并点击上传 | 系统显示「❌ 校验未通过 · N 个校验错误（M 行）」，列出前 15 条（Row/列/原因），并显示「…共 20 条」 |
| AEG-UIC-008 | [AEG-UIC-008] 上传识别、确认与自动 DI | P0 | 功能适合性 | 准备合法文件 | 1. 选择文件并点击「识别清单」；2. 核对总件数/金额/CBM；3. 点击创建报价 | 创建前不新增订单；确认后进入订单详情，进度条显示 AI NCM 15% → 税费 80% → 100%，最终展示 NCM 与 DI 预估 |
| AEG-UIC-009 | [AEG-UIC-009] 我的报价参考价列表 | P0 | 信息安全性 | 该客户存在 done 与 uploaded 订单 | 1. 打开 `/orders` | 系统以列表展示该客户全部自身订单；未发布金额为「—」；done 金额标注「参考 DDP」，同时展示参考免责声明；不展示其他客户数据 |
| AEG-UIC-010 | [AEG-UIC-010] 空态引导 | P1 | 易用性 | 使用无任何订单的新客户账号登录 | 1. 打开 `/orders` | 系统显示空态提示与前往上传报价的引导入口 |
| AEG-UIC-011 | [AEG-UIC-011] 路由守卫 | P0 | 信息安全性 | 未登录 | 1. 直接访问 `/workbench`；2. 直接访问 `/orders` | 两次系统均重定向到登录页，不展示业务数据 |
| AEG-UIC-012 | [AEG-UIC-012] 上传弱网/超时行为 | P1 | 可靠性 | 用浏览器限速或令识别耗时超过客户端 180 秒超时 | 1. 选择大文件并点击「识别清单」 | 超时后上传卡显示错误提示；系统不出现白屏，按钮恢复可点击；后台不会自动创建订单 |
| AEG-UIC-013 | [AEG-UIC-013] 上传非法格式（UI 层） | P1 | 易用性 | 已登录 | 1. 尝试通过文件选择框选择 .txt 文件（绕过 accept 限制）并上传 | 系统显示「❌ 仅支持 .xlsx 格式」（来自 API 400 提示）；系统不创建订单 |

### 5.11 运营端 UI 流程（AEG-UIO）

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-UIO-001 | [AEG-UIO-001] 报价员登录落地页 | P0 | 功能适合性 | 未登录 | 1. 打开运营端 `/login`；2. 输入 operator / <测试密码>；3. 点击登录 | 系统跳转 `/orders`（报价订单列表） |
| AEG-UIO-002 | [AEG-UIO-002] 业务员登录落地页 | P1 | 功能适合性 | 未登录，持有 sales01 凭据 | 1. 用 sales01 登录 | 系统跳转 `/deals`（成交统计），系统不显示其无权的功能入口 |
| AEG-UIO-003 | [AEG-UIO-003] 错误角色访问运营端 | P0 | 信息安全性 | 用 client_a 登录运营端 | 1. 访问运营端任意受保护页面 | 系统显示「403 · 无权访问」页并提供返回登录入口 |
| AEG-UIO-004 | [AEG-UIO-004] 订单列表状态中文映射 | P1 | 易用性 | 存在各状态订单 | 1. 打开 `/orders` | 系统将状态显示为中文（不直接显示 `uploaded`/`pending_fee` 等英文枚举），列数不超出视口、操作列完整可见 |
| AEG-UIO-005 | [AEG-UIO-005] 订单参考 DDP 核算 | P0 | 功能适合性 | 存在已有 AI DI 的 `uploaded` 订单 | 1. 打开订单详情；2. 核对 DI 后点击核算 | 系统生成五项费用：海运费、港杂费、DI、销售税务、参考利润；合计公式一致；无 DI 时按钮禁用并提示先生成 DI |
| AEG-UIO-006 | [AEG-UIO-006] 详情页编辑运费/税率/利润重算 | P0 | 功能适合性 | 订单已有 DI 与参考 DDP | 1. 将海运费改为 8000、销售税改为 8%、利润改为 50000；2. 提交 | 系统从原始 DI 重新计算，不累计叠加；BRL 合计、5 个分项与客户参考价同步更新，并写审计 |
| AEG-UIO-007 | [AEG-UIO-007] 费率页表单校验 | P1 | 易用性 | 报价员登录 | 1. 打开 `/rates`；2. 将汇率填 -1；3. 将销售税务填 100%；4. 将利润填 -1；5. 提交 | 系统阻止提交并显示对应字段错误；系统不写入费率 |
| AEG-UIO-008 | [AEG-UIO-008] 费率页客户覆盖流程 | P1 | 功能适合性 | 报价员登录 | 1. 选择「示例客户 A」；2. 填写覆盖费率并提交；3. 删除该覆盖 | 系统依次显示保存成功、解析预览为客户覆盖值，删除后预览回退全局值 |
| AEG-UIO-009 | [AEG-UIO-009] 订单详情越权（sales 直连 URL） | P0 | 信息安全性 | 用 sales01 登录 | 1. 在地址栏直接输入 `/orders/<某订单id>` | 系统拦截并提示无权（路由守卫），不展示详情数据 |
| AEG-UIO-010 | [AEG-UIO-010] 订单原文件下载 | P1 | 功能适合性 | 订单留存原文件 | 1. 在订单列表/详情点击「下载原文件」 | 系统下载客户上传的原始 xlsx，文件名与上传名一致 |

### 5.12 管理端 UI 流程（AEG-UIA）

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-UIA-001 | [AEG-UIA-001] 管理员登录与仪表盘 | P0 | 功能适合性 | 未登录 | 1. 打开管理端 `/login`；2. 输入 admin / <测试密码> | 系统跳转仪表盘首页 |
| AEG-UIA-002 | [AEG-UIA-002] 新建客户表单校验（空输入） | P1 | 易用性 | 进入客户管理 | 1. 不填写任何字段点击「新建」 | 系统阻止提交并提示必填项；系统不发送请求或展示 400 错误文案 |
| AEG-UIA-003 | [AEG-UIA-003] 新建客户完整流程 | P0 | 功能适合性 | 进入客户管理 | 1. 输入名称、账号（合法）、初始密码（≥6 位）；2. 提交；3. 用新账号登录客户端 | 系统提示创建成功且列表出现新客户；步骤3 系统登录成功 |
| AEG-UIA-004 | [AEG-UIA-004] 禁用/启用客户操作 | P0 | 功能适合性 | 列表存在 active 客户 | 1. 点击「禁用」；2. 用该客户账号登录客户端；3. 点击「启用」；4. 再次登录 | 步骤1 系统标记禁用且账号状态同步；步骤2 系统拒绝登录；步骤3/4 系统恢复并可登录 |
| AEG-UIA-005 | [AEG-UIA-005] 特殊字符名称展示安全 | P1 | 信息安全性 | 已存在名称含 `<script>` 的客户（AEG-CLIENT-020） | 1. 打开客户管理列表 | 系统将名称作为纯文本展示，不执行脚本 |
| AEG-UIA-006 | [AEG-UIA-006] 审计日志页 | P1 | 功能适合性 | 已有审计记录 | 1. 打开 `/audit` | 系统按倒序展示操作流水（操作人、动作、目标、时间） |
| AEG-UIA-007 | [AEG-UIA-007] 非 admin 访问管理端 | P0 | 信息安全性 | 用 operator 登录管理端 | 1. 访问管理端任意页面 | 系统拒绝进入（守卫重定向或无权提示），不展示管理数据 |

### 5.13 可靠性与故障注入（AEG-REL）

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-REL-001 | [AEG-REL-001] API 不可达时前端行为 | P1 | 可靠性 | 停止 API | 1. 打开客户端登录页；2. 输入正确凭据点击登录 | 系统显示网络错误提示（如「登录失败」或网络异常文案）；系统不白屏、不静默成功 |
| AEG-REL-002 | [AEG-REL-002] 弱网下登录 | P2 | 可靠性 | DevTools 限速 Slow 3G | 1. 登录 | 系统最终完成登录并跳转（允许较长等待）；期间按钮不重复重复提交造成多条审计 |
| AEG-REL-003 | [AEG-REL-003] 并发重复核算 | P1 | 可靠性 | 订单 `uploaded` | 1. 同时发送 2 个 `POST /:id/compute` | 系统两次均不报错或其一被安全处理；订单最终状态为 `done` 且金额唯一正确，不产生重复审计歧义 |
| AEG-REL-004 | [AEG-REL-004] 重复上传同一文件 | P2 | 功能适合性 | 合法文件 | 1. 连续上传同一文件 2 次 | 系统生成两个不同报价号（`quote_no` 不同），各自独立进入核算队列 |
| AEG-REL-005 | [AEG-REL-005] 存储层故障时错误不外泄（500 验证） | P1 | 可靠性 | 备份后将 `dev.json` 改为非法 JSON 并重启 API | 1. 用有效 token 请求 `GET /api/ops/orders` | 系统返回 500；响应体不含堆栈、源码路径或 SQL/文件细节；恢复 dev.json 后系统恢复正常 |

### 5.14 内部员工账号管理 · 管理端（AEG-USER，R-08 复核后按既有 admin/staff 接口改写）

> 通用前置：持有 T-admin；接口域 `/api/admin/staff`（既有员工管理接口），仅 admin 角色可访问。员工 = admin / operator / sales 内部账号（不含 client）。

| 编号 | 标题 | 优先级 | 25010 特性 | 前置条件 | 步骤 | 预期结果 |
|---|---|---|---|---|---|---|
| AEG-USER-001 | [AEG-USER-001] 员工列表 | P0 | 功能适合性 | 系统存在 admin/operator/sales/client 各类账号 | 1. 发送 `GET /api/admin/staff` | 系统返回 200 数组，仅含 admin/operator/sales 账号（不含 client），按角色与用户名排序，sales 含 `quote_count` 归属统计，字段不含 `password_hash` |
| AEG-USER-002 | [AEG-USER-002] 创建员工账号并登录 | P0 | 功能适合性 | 持有 T-admin | 1. 发送 `POST /api/admin/staff`，body `{"username":"sales02","password":"<测试密码>","role":"sales"}`；2. 用 sales02/<测试密码> 登录；3. 查询审计 | 步骤1 系统返回 200 `ok:true`，`staff` 含 id/username/role/status；步骤2 系统返回 200 且 `user.role="sales"`；步骤3 审计含 `staff.create`（操作人为 admin） |
| AEG-USER-003 | [AEG-USER-003] 非法角色被拒绝 | P0 | 功能适合性 | 持有 T-admin | 1. 发送创建请求，`role` 填 `client`；2. `role` 填 `admin`；3. `role` 填空 | 三次系统均返回 400「员工角色只能是报价员（operator）或业务员（sales）」；系统不创建账号 |
| AEG-USER-004 | [AEG-USER-004] 账号格式边界校验 | P1 | 功能适合性 | 持有 T-admin | 1. `username` 分别填 2 字符、33 字符、含中文、含空格，其余合法 | 四次系统均返回 400「登录账号需为 3-32 位字母、数字或 _ . -」；3 位与 32 位合法账号可创建 |
| AEG-USER-005 | [AEG-USER-005] 初始密码长度边界 | P1 | 功能适合性 | 持有 T-admin | 1. `password` 填 5 位；2. `password` 填 6 位 | 步骤1 系统返回 400「初始密码至少 6 位」；步骤2 系统返回 200 创建成功 |
| AEG-USER-006 | [AEG-USER-006] 重复账号被拒绝 | P0 | 功能适合性 | 已存在 sales02 | 1. 再次发送创建请求，`username` 填 `sales02` | 系统返回 409「登录账号已存在」 |
| AEG-USER-007 | [AEG-USER-007] 空参数被拒绝 | P1 | 功能适合性 | 持有 T-admin | 1. 发送创建请求，body `{}`；2. 仅含合法 `username` | 两次系统均返回 400（角色/账号/密码缺失分别命中对应校验文案） |
| AEG-USER-008 | [AEG-USER-008] 重置密码后新旧密码验证 | P0 | 信息安全性 | 目标员工账号存在 | 1. 发送 `PATCH /api/admin/staff/:id/password`，body `{"password":"newpass456"}`；2. 用旧密码登录；3. 用新密码登录；4. 查询审计 | 步骤1 系统返回 200；步骤2 系统返回 401；步骤3 系统返回 200；步骤4 审计含 `staff.password` |
| AEG-USER-009 | [AEG-USER-009] 重置密码守卫 | P1 | 功能适合性 | 持有 T-admin | 1. 对 client 角色用户 id 发送重置请求；2. 对不存在 id 发送；3. `password` 填 5 位 | 步骤1/2 系统均返回 404「员工不存在」（client 不在员工范围）；步骤3 系统返回 400「新密码至少 6 位」 |
| AEG-USER-010 | [AEG-USER-010] 禁用/启用与登录联动 | P0 | 功能适合性 | 目标员工账号启用中 | 1. 发送 `PATCH /api/admin/staff/:id`，body `{"status":"disabled"}`；2. 用该账号登录；3. 发送 `{"status":"active"}`；4. 再次登录 | 步骤1 系统返回 200，审计含 `staff.status`；步骤2 系统返回 401；步骤3 系统返回 200；步骤4 系统返回 200 |
| AEG-USER-011 | [AEG-USER-011] 防自禁用守卫 | P0 | 信息安全性 | 当前以 admin 登录 | 1. 发送 `PATCH /api/admin/staff/<当前登录admin的id>`，body `{"status":"disabled"}` | 系统返回 400「不能禁用当前登录的自己」；账号状态保持 active |
| AEG-USER-012 | [AEG-USER-012] 状态值与目标校验 | P1 | 功能适合性 | 持有 T-admin | 1. body `{"status":"locked"}`；2. 对不存在 id 发送禁用；3. 提交与当前相同的 `status` | 步骤1 系统返回 400「状态只能是 active 或 disabled」；步骤2 系统返回 404「员工不存在」；步骤3 系统返回 400「状态未发生变化」 |
| AEG-USER-013 | [AEG-USER-013] 非 admin 访问员工管理被拒绝 | P0 | 信息安全性 | 持有 T-ops、sales token、T-client | 1. 分别用三个 token 请求 `GET /api/admin/staff`；2. 用 T-ops 发送创建请求 | 四次系统均返回 403；系统不返回员工列表、不创建账号 |

---

## 6. 接口级异常场景矩阵（空参 / 超长 / 特殊字符 / 越权）

| 接口 | 空参 | 超长 | 特殊字符 | 越权 |
|---|---|---|---|---|
| `POST /api/auth/login` | AEG-AUTH-004/010 | AEG-SEC-008（10000 字符用户名） | AEG-SEC-007（注入串） | —（公开接口，失败返回 401） |
| `POST /api/admin/clients` | AEG-CLIENT-003/004 | AEG-CLIENT-005（33 位账号）、AEG-CLIENT-021（名称 129 字符） | AEG-CLIENT-005/020 | AEG-CLIENT-019 |
| `PATCH /api/admin/clients/:id` | AEG-CLIENT-012 | AEG-CLIENT-021（名称 129 字符） | AEG-CLIENT-015（名称含符号可结合 020） | AEG-CLIENT-019 |
| `POST /api/admin/staff` | AEG-USER-007 | AEG-USER-004（33 位账号） | AEG-USER-004（中文/空格账号） | AEG-USER-013 |
| `PATCH /api/admin/staff/:id/password` | AEG-USER-009（5 位密码/不存在 id） | — | — | AEG-USER-013 |
| `PATCH /api/admin/staff/:id` | AEG-USER-012 | — | AEG-USER-012（非法状态串） | AEG-USER-013 |
| `PUT /api/ops/rates/*` | AEG-RATES-005 | AEG-RATES-016（Infinity） | AEG-RATES-006（"abc"） | AEG-RATES-015 |
| `POST /api/client/orders/upload` | AEG-UPLOAD-003 | AEG-UPLOAD-020（>20MB）/018（101 行） | AEG-UPLOAD-023（中文文件名） | AEG-UPLOAD-021 |
| `PATCH /api/ops/orders/:id/status` | AEG-ORDER-012 | AEG-ORDER-022（reason 501 字符） | 任意非法状态串 → 400（AEG-ORDER-009 同类） | AEG-ORDER-021 |
| `PATCH /api/ops/orders/:id/deal` | AEG-DEAL-005 | AEG-DEAL-015（note 501 字符） | note 含表情/换行 → 系统原样存储不报错（≤500 字符内） | AEG-DEAL-008 |
| `GET /api/admin/audit` | AEG-AUDIT-003（limit 缺省/非法） | AEG-AUDIT-004（limit=99999） | AEG-AUDIT-003（limit=abc） | AEG-AUDIT-006 |
| `GET /api/client/orders` | — | — | — | AEG-SEC-003/004（跨客户参数） |

> 注：自由文本字段长度上限已随 R-05 修复落地：客户名称 ≤128 字符（创建/更新），`deal.note` 与状态流转 `reason` ≤500 字符，超限返回 400。

## 7. 风险与代码观察项（已全部修复，2026-10-23）

> 以下 8 项风险均已处置并通过冒烟验证（30 项断言全部通过）。其中 R-08 经复核为误判（员工管理接口 `admin/staff` 早已存在），处置方式为删除重复实现并对齐用例。修复后新增/调整用例：AEG-ORDER-016/022、AEG-UPLOAD-024~027、AEG-CLIENT-021、AEG-DEAL-015、§5.14 AEG-USER 全组。

| 编号 | 原观察 | 修复方式 | 状态 |
|---|---|---|---|
| R-01 | `PATCH /:id/fees` 不校验负数/非法费率，可产生负总价 | 新增 `common/rates-validation.ts` 的 `assertValidRates`（四项非负、汇率 > 0、Number.isFinite 拦截 Infinity），`computeOrder` 与 `recomputeBreakdown` 及 `rates.controller.ts` pickRates 统一复用 | ✅ 已修复（AEG-ORDER-016 转为回归用例） |
| R-02 | 上传未校验 V 列枚举值；F 列与 B2 入仓号一致性未实现 | `processUpload` 增加 B2 必填文件级校验；`validateAndComputeRow` 增加 V 列枚举校验（枚举外报「必须是枚举值之一」）、F 列非空且与 B2 不一致报错、F 列为空自动继承 B2 | ✅ 已修复（AEG-UPLOAD-024~027） |
| R-03 | fees 端点对不存在订单返回 400，其余端点 404 | `recomputeBreakdown` 订单不存在改为 `NotFoundException('订单不存在')` | ✅ 已修复（AEG-ORDER-015 期望改为 404） |
| R-04 | 字段字典实际 27 列，注释与页面表述为「28 列」 | 确认字段字典即 27 列（A–AA），修正 `field-schema` 源码/产物注释及客户端落地页、管理端仪表盘文案为 27 列 | ✅ 已修复（以 27 列为准） |
| R-05 | 客户名称、deal_note、状态 reason 无长度上限 | 客户名称 ≤128（创建/更新），deal note ≤500、状态 reason ≤500，超限返回 400 | ✅ 已修复（AEG-CLIENT-021、AEG-DEAL-015、AEG-ORDER-022） |
| R-06 | `order.upload` 审计 actor 硬编码为 `client` | `processUpload` 增加 actor 参数，控制器从 `req.user` 传入，审计写入真实 `actor_username`/`actor_role` | ✅ 已修复（冒烟断言操作人 = client_a） |
| R-07 | JWT 密钥存在开发回退值，生产未强制注入 | `main.ts` 启动守卫：`NODE_ENV=production` 且未设 `JWT_SECRET` 时输出错误日志并 `process.exit(1)` 拒绝启动 | ✅ 已修复（双向验证：缺密钥拒绝启动 / 设密钥正常启动） |
| R-08 | 无管理端接口创建/重置 sales、operator 账号 | **复核为误判**：员工管理接口 `admin/staff`（`@Roles('admin')`）早已存在且功能完整——列表（仅 admin/operator/sales、含 `quote_count`、不返回密码哈希）、创建（仅 operator/sales、账号格式/密码长度/重复 409）、启用禁用（防自禁用、至少保留一名启用管理员、状态未变化 400）、重置密码，审计动作 `staff.create`/`staff.status`/`staff.password`。处置：删除误加的重复 `admin/users` 控制器并还原 `user.module.ts`；为 `staff` 创建接口补 `@HttpCode(200)` 与项目约定对齐 | ✅ 误判已纠正（§5.14 AEG-USER-001~013 按 admin/staff 改写） |

## 8. 覆盖底线自查

| 要求 | 覆盖情况 |
|---|---|
| 正常流程 | 每模块首组用例（-001/-002）覆盖 |
| 边界值 | 账号长度 2/3/32/33（客户与内部账号）、密码 5/6、箱数 0/1/99999/100000、净重 0/0.001、尺寸 0.009/0.01/9999/10000、单价 -1/0/9999999/10000000、行数 100/101、汇率 0/0.01、客户名称 128/129、备注/原因 500/501、错误回传 50 条、审计 limit 0/5/1000/99999 |
| 异常输入 | 非 xlsx、损坏文件、缺失 Sheet、版本不符、空数据区、文本填数值、非法枚举状态、非法费率、注入串、非字符串密码 |
| 反向操作 | 禁用→启用、失败→重开、won→open、覆盖→删除回退全局、改派→取消分配 |
| UI：空输入 | AEG-UIC-003、AEG-UIA-002 |
| UI：非法值 | AEG-UIC-013、AEG-UIO-007、AEG-CLIENT-005（经表单） |
| UI：超时/弱网 | AEG-UIC-012（60s 超时）、AEG-REL-001/002 |
| 接口：空参 | §6 矩阵逐接口覆盖 |
| 接口：超长 | AEG-SEC-008、AEG-UPLOAD-018/020、AEG-CLIENT-021、AEG-DEAL-015、AEG-ORDER-022、AEG-USER-004 |
| 接口：特殊字符 | AEG-SEC-007、AEG-CLIENT-020、AEG-UPLOAD-023、AEG-USER-004（中文/空格账号） |
| 接口：越权 | AEG-SEC-001~006、AEG-CLIENT-019、AEG-RATES-015、AEG-ORDER-020/021、AEG-DEAL-008、AEG-AUDIT-006、AEG-UIO-009、AEG-USER-013 |
| 错误码显式验证 | 400/401/403/404/409/413/500 均在 §4 矩阵中映射到具体用例 |

## 9. P0：PostgreSQL 生产化（2026-10-25）

持久层由「单文件 JSON mock 库」升级为双模式：`APP_MODULE_MODE=mock`（本地预览，默认）/ `postgres`（VPS 生产）。

- **实体层**：补齐 5 张核心业务表实体（`quote_order` / `fee_rate` / `client_image` / `client_cnpj` / `order_file`）；修复 `user.role` 缺 `sales`、`client` 缺 `salesperson_id`、`template_version.activated_at` 非法 `datetime` 类型、`audit_log` 字段与 mock 形状对齐；删除 `DB_DRIVER`/SQLite 双轨（`common/db-types.ts` 已移除），所有列显式声明类型（兼容 tsx 无 emitDecoratorMetadata 的运行方式）。
- **仓储层**：新增 `common/pg-repos.ts`（9 个 PG 版 Repo，公开方法与 mock 版逐一相同，Date 输出统一转 ISO 字符串；CNPJ 默认互斥用事务）；新增全局 `common/database.module.ts`，9 个 DI token 按 `APP_MODULE_MODE` 切换实现；34 处控制器直接 `new XxxRepo()` 全部改为 `@Inject` 构造器注入。
- **迁移**：新增 `src/data-source.ts`；首版迁移 `src/migrations/1761300000000-InitialSchema.ts`（10 表全量建表 + 索引 + FK）；`synchronize` 关闭，postgres 模式启动时 `migrationsRun` 自动执行。
- **脚本**：`seed.ts` 重写为基于 `data-source.ts`（不再依赖 dist 编译产物），补齐 sales01 与全局费率；新增 `import:dev-json`（dev.json → PG，ON CONFLICT DO NOTHING 幂等）。
- **部署**：`.env.example` 增加 `APP_MODULE_MODE`；`deploy/hostinger/pm2.config.js` 生产 env 启用 postgres 模式与 `DB_*`；`setup.sh` 后续步骤更新为 migration:run + seed（+ 可选 import:dev-json）。

**验证记录（本机 embedded PostgreSQL 18 实测，16 项断言全部通过）**：migration:run 建表 → seed → import:dev-json（85 条全量导入）→ API 以 postgres 模式启动（migrationsRun 幂等 no-op）→ 四角色登录 → client 模板/报价、ops 订单/费率/费率解析、admin 审计/模板、sales 成交统计 → 写路径（更新全局费率后解析命中新值）→ 越权拦截（client 访问 /ops/orders 返回 403）。mock 模式回归通过；`pnpm build`（6/6）与 `pnpm lint`（0 错误）全绿。

## 10. M10：财务应收（2026-10-25）

- **数据模型**：新表 `payment_record`（回款记录：quote_id、amount_brl、paid_at、note、created_by）；mock/PG 双实现（`PaymentsRepo` / `PgPaymentsRepo`），迁移 `1761400000000-PaymentRecord.ts`。
- **接口**（`/api/ops/finance`）：`GET /receivables`（done 订单应收台账：应收/已收/未收/收款状态 unpaid|partial|paid_off，内嵌回款明细；sales 仅见归属单）、`POST /quotes/:id/payments`（仅 operator/admin；金额 >0、不超额、仅 done 单）、`DELETE /payments/:pid`（仅 operator/admin）、`GET /summary`（仅 operator/admin：总量 + 按月 + 按客户对账）。写操作审计 `finance.payment.create/delete`。
- **前端**：web-ops 新增「💵 财务应收」页（汇总卡 + 应收台账行内回款登记/删除 + 按月/按客户对账表），sales 只读无登记按钮。
- **验证记录**：mock 模式 9 项断言通过（台账/登记/超额 400/负额 400/非 done 400/删除/sales 范围过滤/sales 登记 403/审计留痕）；PG 模式（embedded PostgreSQL 18）迁移 → seed → import → 登记 → 汇总 → 删除全链路通过；`pnpm build` 6/6、`pnpm lint` 0 错误。
- **口径说明（2026-10-28 更新）**：销售税基 =（DI + 申报货值）×1.20 + 国际运费；参考 DDP = 税基×6.5% + DI + 国际运费 + 港杂费 + R$30,000 利润。默认加成 20%、销售税务 6.5%、利润 R$30,000，可按全局、客户和单票调整。客户侧金额为参考预估；内部财务仍以当前 DDP 快照计算应收。

## 11. 列表分页与服务端筛选（2026-10-25）

- **接口改造**：`GET /api/ops/orders`（page/pageSize/status/client_id/q，sales 归属过滤下推到 SQL）、`GET /api/admin/audit`（page/pageSize/action/q，兼容旧 limit 参数）、`GET /api/ops/images`（page/pageSize/client_id/quote_id，新增 `meta/clients` 客户选项）；响应统一为 `{ items, total, page, pageSize }`。
- **Repo 层**：mock/PG 双实现各加 `findPaged/listPaged`（订单、审计、图片），PG 用 QueryBuilder `getManyAndCount`（ILIKE 模糊、sales OR 归属、jsonb detail CAST TEXT 搜索）。
- **前端**：ops 订单列表加状态筛选/报价号搜索/翻页；admin 审计改服务端筛选 + 翻页（动作枚举静态化，补齐 LOGIN/物流/文件/财务动作中文名）；ops 图片墙改服务端分页 + 客户筛选；订单详情行级截图读取改 `items`。
- **验证记录**：mock 与 PG 双模式实测通过（分页边界 p1=2/p2=1、status/q 筛选、sales 归属、审计 action/q、图片分页）。`pnpm build` 6/6、`pnpm lint` 0 错误。
- **注意**：VPS 初始化顺序固定为 migration:run →（可选）import:dev-json → seed，避免种子与导入数据的账号/客户 id 不一致（setup.sh 已注明）。

## 12. M11：AI 非标 Excel 转换（2026-10-27）

- **流程**：`processUpload` 模板校验失败 → `AiConvertService`（`apps/api/src/convert/ai-convert.service.ts`）提取各 sheet 前 15 行样例 → OpenAI 兼容接口返回结构映射 JSON（sheet/header_row/data_start_row/warehouse_code/mapping/notes）→ 确定性代码逐行转换（AI 不生成业务数据）→ 复用与标准模板相同的校验/入库/核算尾部（`finalizeUpload`）。
- **配置**：`AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` / `AI_TIMEOUT_MS`；未配置 key 时功能关闭并返回明确提示，不影响标准模板上传。
- **响应**：新增 `converted_by_ai` / `ai_notes`；客户端工作台显示「AI 已自动识别并转换格式」；审计 detail 同步记录。
- **边界**：必填字段无来源列 → 明确报错并列出字段；支持同列映射中/英文品名；数值归一化（逗号小数、千分位）；入仓号取自标题区或首行。
- **验证记录**：mock OpenAI 兼容服务 + 构造英文表头非标工作簿：转换上传成功、列映射/逗号小数/千分位/公式重算全部正确、必填列缺失明确报错。`pnpm build` 6/6、`pnpm lint` 0 错误。

## 12. DDP 参考价与销售税务/利润（2026-10-28）

### 12.1 权威公式

```text
海运费 BRL = ocean_freight_usd × fx_rate
港杂费 BRL = port_fee_usd × fx_rate
税基加成 BRL = (DI + 申报货值 BRL) × sales_markup_rate
销售税基 BRL = DI + 申报货值 BRL + 税基加成 BRL + 海运费 BRL
销售税务 BRL = 销售税基 × sales_tax_rate
参考 DDP = 销售税务 + DI + 海运费 + 港杂费 + profit_brl
```

- `sales_markup_rate` 默认 `0.20`，`sales_tax_rate` 默认 `0.065`，`profit_brl` 默认 `30000`。
- 费率解析顺序：客户覆盖 > 全局默认 > 兜底。
- 历史 `br_clearance_brl` 不参与新 DDP；历史报价不自动重算。
- 所有客户侧金额均标记参考预估，不构成最终报价或锁价。

### 12.2 标准验证样例

| DI BRL | 申报货值 BRL | 20% 加成 | 海运费 | 销售税基 | 销售税务 6.5% | 港杂费 | 利润 | 参考 DDP |
|---|---|---|---|---|---|---|---|---|
| 12365.68 | 12264.12 | 4925.96 | 30000 | 59555.76 | 3871.12 | 2500 | 30000 | **78736.80** |

### 12.3 必测用例

| 编号 | 场景 | 预期 |
|---|---|---|
| AEG-DDP2-001 | 迁移后读取旧全局/客户费率 | 自动得到 `sales_markup_rate=0.20`、`sales_tax_rate=0.065`、`profit_brl=30000` |
| AEG-DDP2-002 | 全局费率保存 20% / 6.5% / 30000 | GET 回填一致，审计包含 before/after |
| AEG-DDP2-003 | 客户覆盖改为 15% / 8% / 50000 | 该客户解析命中覆盖；其他客户仍用全局 |
| AEG-DDP2-004 | 样例 DI 生成参考 DDP | 税基 59555.76、税务 3871.12、合计 78736.80，`is_reference=true` |
| AEG-DDP2-005 | 单票利润改 0 / 50000 | 仅改变该订单，重算不累计叠加 |
| AEG-DDP2-006 | 销售税务 6.5% → 8% | 税基不变，税务和费用项名称同步更新 |
| AEG-DDP2-007 | 无 DI 订单点击核算 | 400 或 UI 禁用，提示先完成 AI NCM/DI |
| AEG-DDP2-008 | DI 草稿生成参考 DDP | 允许客户参考用，`di_review_version=null` |
| AEG-DDP2-009 | DI reviewed 生成 DDP | 记录 `di_review_version`，客户仍显示参考价 |
| AEG-DDP2-010 | 销售端上传 Excel | 自动 DI 后返回五项参考 DDP；AI 失败不发布金额 |
| AEG-DDP2-011 | 历史订单打开/重算前 | 原金额不被后台迁移修改 |
| AEG-DDP2-012 | 客户端 Home/列表/详情 | 均显示“参考”标签和免责声明，无“最终价/一口价/锁价”承诺 |
| AEG-DDP2-013 | 中葡落地页 | 中葡文案均明确为参考预估，不承诺锁价 |
| AEG-DDP2-014 | 已有数据库帮助中心 | 部署后存在 `ddp-reference-price` 文章及更新后的运营文章 |
| AEG-DDP2-015 | 审计检查 | 记录 DI、税率、销售税务、利润、DDP 总额和复核版本 |
