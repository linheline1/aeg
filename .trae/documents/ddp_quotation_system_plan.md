# DDP 报价系统 实施计划（M1 基础搭建）

> 本文档范围锁定 PRD v2.0 里程碑 **M1**：模板定稿 v2.0 + 三端登录与权限 + Hostinger VPS 环境骨架。
> M2 / M3 / M4 / M5 在本计划末尾给出里程碑级路线图，但**不在本次实施范围内**。

---

## 0. 仓库现状与约束

- 工作区 `c:\Users\linhe\Desktop\aeg` 为空，完全新建项目。
- PRD 已明确技术栈：**React + TypeScript + Vite**（三端静态构建）、**Node.js + NestJS**（单服务多路由）、**PostgreSQL**（仅监听 127.0.0.1）、**PM2 + Nginx + Let's Encrypt**（Hostinger VPS Ubuntu 24.04）。
- 部署硬约束：Hostinger VPS（非共享主机），三子域名反向代理，后端不直接暴露公网端口，上传文件不可被 Nginx 公开直连。
- PRD 第 14.1 节 **5 个关键待确认项**（#1 DDP 是否含货值、#2 隐藏费用可推算、#3 巴西清关费是否含关税、#5 汇率来源、#7 BRL 金额格式）**不阻塞 M1**，但将在 M3（费用录入与客户端报价展示）前成为硬阻塞，M1 计划中会标出需预留的扩展点。

---

## 1. 项目结构选型

### 1.1 为什么选 pnpm monorepo
三端前端 + 一个后端，共享 TypeScript 类型定义（数据库 DTO、API 契约）、共享 ESLint / Prettier / Husky 配置。使用 **pnpm workspaces + Turborepo** 管理构建流水线，避免三端重复安装 `node_modules`。

### 1.2 目录结构
```
aeg/
├─ package.json               # root：pnpm workspaces + turbo
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ .eslintrc.base.json
├─ .prettierrc
├─ .gitignore
│
├─ apps/
│   ├─ api/                   # NestJS 后端（:5000，仅 localhost）
│   ├─ web-admin/             # 管理端 React Vite → /admin
│   ├─ web-ops/               # 运营端 React Vite → /ops
│   └─ web-client/            # 客户端 React Vite → /client
│
├─ packages/
│   ├─ shared-types/          # DTO、字段 schema、API 契约
│   ├─ eslint-config/
│   └─ excel-utils/           # 模板生成、TEMPLATE_META 写入、校验辅助
│
├─ deploy/                    # 部署脚本与 Nginx 配置模板
│   ├─ hostinger/
│   │   ├─ setup.sh           # Ubuntu 24.04 一键依赖安装
│   │   ├─ pm2.config.js
│   │   ├─ nginx/
│   │   │   ├─ admin.domain.com.conf
│   │   │   ├─ ops.domain.com.conf
│   │   │   └─ quote.domain.com.conf
│   │   └─ postgresql/
│   │       └─ ddpserver.sql
│   └─ docker-compose.yml     # 可选：本地/快速环境用
│
└─ docs/                      # 补充说明（仅开发期）
```

---

## 2. M1 实施步骤（依赖有序）

### 步骤 1 — Monorepo 脚手架与工具链
- 生成 root `package.json`、`pnpm-workspace.yaml`、`turbo.json`，约定 workspace：`apps/*`、`packages/*`。
- 安装并配置：TypeScript（base tsconfig）、ESLint + Prettier（base 配置 + `packages/eslint-config`）、Husky + lint-staged、EditorConfig。
- `turbo.json` pipeline：`build`（依赖链）、`dev`（并发）、`lint`、`test`。
- **验证**：`pnpm install && pnpm run build` 全部 workspace 能编译。

### 步骤 2 — 数据库 schema + 迁移（PostgreSQL）
- 选型：**NestJS TypeORM + pg**（配合 `migration:generate` 命令）。
- M1 核心表（覆盖 PRD §10 前 5 张）：
  | 表 | 关键字段 | M1 备注 |
  |---|---|---|
  | `template_version` | id, template_code, version_no, file_path, file_hash, schema_json, meta_json, status, created_by, activated_at | 初始插入 v2.0 启用版本 |
  | `template_field` | id, template_version_id, col_letter, header_cn, field_key, data_type, required, editable, formula, validation_json, visible_client, visible_operator, sort_order | 初始按 PRD §7 字段字典插入 |
  | `client` | id, name, status, created_at | 种子数据：1 个示例客户 |
  | `user` | id, role (admin/operator/client), client_id (可空), username, password_hash, status | 种子数据：admin / operator / 各 1 个 client |
  | `audit_log` | id, user_id, action, target_type, target_id, payload_json, created_at | 模板启用、字段修改、登录等全量审计 |
- 启用软删除 `deleted_at` + `user_id` 关联。
- **验证**：本地运行 `docker-compose up postgres`，执行 migration，`psql` 查种子数据存在。

### 步骤 3 — NestJS 后端基础骨架
- `apps/api` 初始化 NestJS 工程，入口 `main.ts` 监听 `localhost:5000`。
- 模块分层：`AuthModule` / `UsersModule` / `TemplateModule` / `AuditModule` / `ClientModule` / `OpsModule` / `AdminModule`。
- **JWT 认证 + 角色校验架构**：
  - `AuthGuard` 从 `Authorization: Bearer xxx` 提取 payload，注入 `req.user`。
  - `RolesGuard` + `@Roles('admin')` / `@Roles('operator', 'admin')` 装饰器，在 Controller 层拦截。
  - 客户端接口 **强制** 从 JWT 取 `client_id`，忽略 query/body 传入值；Repository 层加 `scopeClient(clientId)` 工具方法。
- **路由分域**：`/api/auth/**`（公共）、`/api/client/**`（仅 client）、`/api/ops/**`（admin + operator）、`/api/admin/**`（仅 admin）。
- **DTO 白名单机制**：在 `packages/shared-types` 定义 `ClientQuoteResultDto`、`OpsTaskDetailDto`、`AdminTemplateDetailDto`，三端接口返回不同 DTO；客户端 DTO 不含 `exchange_rate`、`original_amount`、隐藏费用字段。
- `AuthModule`：`/auth/login`（返回 JWT）、`/auth/me`；密码 `bcrypt` 加盐哈希。
- `TemplateModule`（M1 交付 `/admin/templates`、`/client/template/current`、`/client/template/{version}/download` 三个端点）。
- **验证**：`curl` 以三种角色登录、访问对应端点，越权返回 401/403/404。

### 步骤 4 — 模板 v2.0 生成 + Excel 处理库
- `packages/excel-utils` 使用 **exceljs**（替代 xlsx，支持写入隐藏 sheet、保护工作表、条件格式、图片嵌入）。
- `template_version.meta_json` 定义：`template_id`、`version`、`schema_hash`（字段+公式列排序后的 SHA256）、`published_at`、`min_rows`、`max_rows`。
- **模板 v2.0 生成规则**（对应 PRD §4）：
  - Sheet1 结构：第 1 行锁定说明区、第 2 行 A2 固定提示 + B2 入仓号、第 3 行锁定表头（按 PRD §7 字典列顺序 A→AA）、第 4 行锁定合计行（H/I/J/K/L/M/N/R/S/U 为 `SUM($5:$104)`）、第 5–104 行数据填写区（100 行）。
  - 工作表保护：锁定说明区、表头、合计行、公式列（J/M/N/R/S/U），开放数据填写区。
  - 数据验证：H/I 正整数；V 材质下拉枚举；HS 文本；必填为空条件格式标黄；毛重<净重条件格式标红。
  - **隐藏 Sheet `TEMPLATE_META`**：以 `EXCELJS.hidden = true` 写入 meta JSON。
- 生成命令：`pnpm run gen:template`（调用 NestJS CLI 或独立 Node 脚本），输出 `apps/api/uploads/templates/巴西整柜装箱清单_模板_v2.0.xlsx`，自动写入数据库 `template_version` 记录。
- 模板版本比对函数：`excel-utils` 导出 `validateTemplateMeta(filePath, expectedVersion)`，读取隐藏 sheet + 比对 `schema_hash`，供 M2 上传校验使用。
- **验证**：生成文件用 WPS/Excel 打开，隐藏 sheet 存在，保护生效，公式列正确；`validateTemplateMeta` 返回通过。

### 步骤 5 — 三端前端外壳（Vite + React + TS）
- `apps/web-admin`、`apps/web-ops`、`apps/web-client` 分别用 `pnpm create vite`（React + TS）脚手架，统一抽 `packages/ui`（可选，M1 先共享 ESLint 配置）。
- 目录约定：`src/pages`（按功能路由）、`src/components`（通用）、`src/api`（axios 实例 + 拦截器，统一从 `localStorage` 读 JWT 注入）、`src/router`、`src/store`（Zustand 轻量全局状态：用户/Token）。
- **路由守卫**：三端各自的 `App.tsx` 在路由层做 `RequireAuth` / `RequireRole`，未登录跳 `/login`；已登录但角色不符跳 403 页。
- 三端 **不同布局**：
  - 管理端：侧边栏导航（模板、客户、审计）
  - 运营端：侧边栏导航（任务列表、费用快照、模板预览）
  - 客户端：顶部 Tab（工作台、我的任务、下载报价单）
- **M1 交付页面**：
  | 端 | 页面 |
  |---|---|
  | 管理端 | 登录页、工作台（占位）、模板列表（只读展示 v2.0）、客户列表（种子数据）、审计日志 |
  | 运营端 | 登录页、任务列表（空表）、费用面板（占位） |
  | 客户端 | 登录页、工作台（模板卡片 + 下载按钮）、我的任务（空表） |
- **验证**：三端分别 `pnpm run dev`，登录后看到对应布局，模板卡片能触发后端下载接口。

### 步骤 6 — Hostinger VPS 部署骨架
- `deploy/hostinger/setup.sh`：一键装 Node.js 20（NVM）、PNPM 9、PostgreSQL 15（Ubuntu apt 直装，`listen_addresses = '127.0.0.1'`）、Nginx、PM2、Let's Encrypt certbot；创建上传目录 `/var/data/ddp/uploads/templates/` 与权限。
- `deploy/hostinger/pm2.config.js`：单实例 `apps/api`，日志落盘 `/var/log/pm2/ddp-api.log`，max_memory_restart 2G，开机自启。
- `deploy/hostinger/nginx/*.conf`：三子域名 server block，统一监听 443；后端 `proxy_pass http://127.0.0.1:5000`；上传目录不放根目录。
- `deploy/docker-compose.yml`（本地/开发用）：PostgreSQL 15 + pgAdmin 4 + MinIO（本地文件存储替代）。
- `.env.example`：数据库、JWT_SECRET、文件存储、前端 API base URL 等模板。
- **验证**：在本地 Docker 跑通 PostgreSQL + 后端 + 三端 dev server；setup.sh 脚本 dry-run 无语法错误。

---

## 3. 文件与模块变更清单

| 路径 | 变更类型 | 说明 |
|---|---|---|
| `package.json` / `pnpm-workspace.yaml` / `turbo.json` | 新建 | Monorepo 根 |
| `tsconfig.base.json` / `.eslintrc.base.json` / `.prettierrc` | 新建 | 共享配置 |
| `apps/api/**` | 新建 | NestJS 后端骨架、Auth、Template 端点、TypeORM 实体 |
| `apps/web-admin/**` / `apps/web-ops/**` / `apps/web-client/**` | 新建 | 三端 Vite React 外壳 + 登录 + 路由守卫 |
| `packages/shared-types/**` | 新建 | DTO 契约、字段字典、API 枚举 |
| `packages/excel-utils/**` | 新建 | 模板 v2.0 生成、`TEMPLATE_META` 读写、schema_hash |
| `deploy/hostinger/**` | 新建 | VPS 一键安装、PM2、Nginx 配置 |
| `deploy/docker-compose.yml` | 新建 | 本地开发环境 |
| `.env.example` / `.gitignore` | 新建 | 环境模板与忽略 |

---

## 4. 关键依赖与注意事项

1. **Excel 库选型**：选 **exceljs**（MIT，支持隐藏 sheet、保护、图片、条件格式），而非 `xlsx`（社区版功能有限，PRO 版商业授权）。
2. **JWT 库**：`@nestjs/jwt` + `passport-jwt`，AccessToken 12h 过期，RefreshToken 7d。
3. **密码哈希**：`bcrypt`（`saltRounds = 12`），不允许明文回写。
4. **客户端隔离**：所有 `quote_task` / `upload_file` / `quote_line` Repository 查询，统一走 `scopeClient(clientId)` 工具；**禁止 Controller 层从 query/body 接收 `client_id`**，仅 JWT payload 可信。
5. **文件存储**：M1 用本地磁盘 `apps/api/uploads/templates/`；M2 起上传文件存 `/var/data/ddp/uploads/{client_id}/{yyyy}/{mm}/`，**不**暴露在 Nginx 根目录。
6. **日志与审计**：M1 即注入 `audit_log`，但动作范围：模板启用/停用、模板下载、登录、字段修改。发布/撤回覆盖动作在 M3 扩展。
7. **待确认项的预留**：
   - #1（DDP 不含货值）：当前按 PRD §3.1 公式实现，`quote_task.total_goods_value_rmb` 仅做展示字段、不进入 DDP 计算；若业务改口，M3 时仅在 `QuoteFeeService` 加开关。
   - #2（隐藏费用可推算）：按 PRD 硬性规则，客户端只给白名单字段；若业务不接受，M3 需删除 `ClientQuoteResultDto.intl_freight_total_brl`。
   - #3（巴西清关费是否含关税）：`quote_fee_line.fee_code` 设计为枚举 `CN_LOCAL_MISC / INTL_FREIGHT / BR_CUSTOMS_CLEARANCE / BR_IMPORT_TAX`，预留第 4 项编码。
   - #5（汇率来源）：`quote_fee_line.rate_source` 字段预留 `MANUAL / SERPAPI / OPENEXCHANGERATE` 枚举，M1 先手工输入。
   - #7（BRL 金额格式）：前端格式化函数封装在 `shared-types/currencies.ts`，可切换 `R$` vs `BRL`。

---

## 5. M1 验证清单

- [ ] Monorepo：`pnpm install && pnpm run build` 全部 workspace 成功编译。
- [ ] DB：PostgreSQL 启动，M1 5 张表建表成功，种子 admin/operator/client 用户可登录。
- [ ] Auth：admin 访问 `/api/admin/**` 成功；operator 访问 `/api/admin/**` 返回 403；client 访问他人任务返回 404。
- [ ] Template v2.0：生成文件用 WPS 打开，隐藏 Sheet `TEMPLATE_META` 存在，工作表保护、公式列、数据验证正确；`schema_hash` 一致。
- [ ] 下载接口：客户端登录后 `GET /api/client/template/current` 返回版本元；`GET /api/client/template/2.0/download` 触发文件流 + 写 `download_log`。
- [ ] 三端前端：分别登录成功、路由守卫生效（角色不符跳 403）、客户端模板卡片可见且能下载。
- [ ] 部署骨架：`setup.sh` dry-run 无语法错误；Nginx 三子域名配置模板写好；docker-compose 本地 PostgreSQL 能启动。

---

## 6. 里程碑路线图（M2–M5，仅规划不实施）

| 里程碑 | 核心交付 | 关键阻塞 |
|---|---|---|
| **M1 ✅ 本次** | Monorepo + DB + Auth + Role Guard + 模板 v2.0 + 三端外壳 + Hostinger 骨架 | 无 |
| **M2** | 上传端点 `/api/client/uploads`；文件级校验（扩展名/大小/Sheet/TEMPLATE_META/表头/保护）；行级校验（必填/类型/枚举/HS/毛重≥净重/公式列/合计行/空行）；错误报告 Excel/CSV；异步解析（>50 行或 >5MB） | 无，延续 `packages/excel-utils` |
| **M3** | 运营端任务列表 + 费用面板（原币/币种/汇率/折算 BRL）；分摊预览（总毛重/体积/件数/货值 + 尾差）；逐行覆盖留痕；发布固化快照 + 客户端白名单 BRL 结果 + 报价单 Excel 下载 | **硬阻塞**：§14.1 #1 #2 #3 #5 #7 业务确认 |
| **M4** | 管理端模板/字段/客户/审计 CRUD；撤回重报（版本快照 + 新汇率）；退回补充资料；客户端有效期控制；性能与安全加固 | 依赖 M3 完成 |
| **M5** | PRD §13 17 条验收用例全量回归；正式上线；业务口径最终确认 | 业务 UAT |

---

## 7. 风险与处理

| 风险 | 处理 |
|---|---|
| exceljs 写隐藏 sheet 的兼容性（WPS vs Excel） | 模板生成后用 exceljs 自己再读一遍 meta 做自检；M2 上传校验对两款软件各做一次手工验证 |
| PostgreSQL 在 Hostinger Ubuntu 24.04 上的 apt 源 | `setup.sh` 使用官方 PostgreSQL apt 仓库，而非 Ubuntu 自带版本，避免 24.04 自带 pg 版本过旧 |
| 三端前端共享类型导致循环依赖 | `shared-types` 为纯类型包，**不** import 任何 `apps/*`；turbo.json 中 `shared-types.build` 先于三端前端 |
| 客户端接口 DTO 白名单易被遗漏字段 | `shared-types` 中单独维护 `ClientQuoteResultDto`，禁止在 Controller 直接返回实体；ESLint 自定义规则（可选，M4 加）扫描 Controller 返回类型 |
| 部署脚本在 Hostinger 实际机器上执行可能因权限/网络失败 | `setup.sh` 每段独立、可单独重跑、有 `set -e` + 清晰注释；首次部署时由人工在 VPS 上逐步执行并记录 |

---

## 8. 开放讨论（待用户确认）

M1 无需业务层面的决策即可推进，但以下问题会在 **M3 前** 需要拍板，建议现在就开始讨论：

1. DDP 是否含货值？（默认：**不含**，货值 RMB 仅参考）
2. 客户端同时展示 DDP_BRL 与国际运费_BRL → 隐藏费用可被差额推算，业务是否接受？
3. 巴西本地清关费是否含巴西进口关税/税费？若不含，需新增费用项。
4. 汇率来源：运营手工录入？还是系统每日自动拉？
5. BRL 金额格式：`R$ 1.234,56`（巴西本地习惯）还是 `BRL 1,234.56`（国际习惯）？
