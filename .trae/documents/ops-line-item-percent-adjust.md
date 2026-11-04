# 运营端报价单 · 产品单价按百分比调整（行级调价 UI）

## Summary

用户需求：在运营端（操作端口）为每个报价单提供按百分比调整产品金额的功能，百分比自定义（每行可不同）。

**现状（探索结论）**：后端已在 11-01 晚实现完毕，本次只需补齐前端 UI 与审计文案：

- API 已就绪：[ops-order.controller.ts:196-208](apps/api/src/order/ops-order.controller.ts) `PATCH /api/ops/orders/:id/line-items/:rowNo/price`，body `{ percent }`（number，-99.9999 ~ 1000，正=加价负=降价），@Roles('operator','admin')
- 核心逻辑已就绪：[quote.service.ts:306-371](apps/api/src/upload/quote.service.ts) `adjustLineItemPrice()` — 新单价 = 原单价×(1+percent/100)，联动重算 `total_price` / `total_amount_rmb`；**有 DI 时**重算 DI + DDP 并重置 customs_review 为 pending；**无 DI 时**订单回 `uploaded` 状态并清空报价（需重新核算）；写审计 `order.line_item.price`（detail 含 before/after_unit_price、percent、di_brl、total_ddp_brl）
- 缺失：运营端 [OrderDetail.tsx:1325-1372](apps/web-ops/src/pages/OrderDetail.tsx)「📋 客户填写明细」表格无调价交互；[AuditLog.tsx](apps/web-admin/src/pages/AuditLog.tsx) 缺 `order.line_item.price` 中文文案

## Proposed Changes

### 1. apps/web-ops/src/pages/OrderDetail.tsx — 明细表行内调价

**State**（与其他 handler 同区域）：
```ts
const [adjPct, setAdjPct] = useState<Record<number, string>>({}); // key = row_no
```

**Handler** `handleAdjustPrice(rowNo: number)`：
- 校验输入为有限数字且在 -99.9999 ~ 1000 内，否则 flash 提示
- `api.patch(`/api/ops/orders/${id}/line-items/${rowNo}/price`, { percent: Number(raw) })`
- 成功 flash：`✅ 行${rowNo} 单价调整 ${percent}% → ¥${unit_price}（货值合计 ¥${total_amount_rmb}）`；若返回无 `total_amount_brl`（即无 DI、订单回 uploaded），追加提示「订单已回到已上传状态，请重新核算发布」
- `load()` 刷新 + 清空该行输入

**表格改造**（L1330-1372）：
- thead 末尾（🖼 图片列之后）加 `<th style={{ width: 132 }}>⚖ 调价%</th>`
- 每行 td 末尾加调价单元格（图片 rowSpan 列之后，逐行渲染不受影响）：
  - 该行 `unit_price > 0` 时：`<input>`（宽 ~64px，placeholder="±%"，title="正数加价，负数降价，如 10 或 -5"）+ `<button>✓</button>`（输入无效时 disabled）
  - 无有效单价时显示 `—`（后端会拒绝）
- card-title 说明文字补充调价能力：`· 可按行百分比调价（联动重算 DI/DDP）`

### 2. apps/web-ops/src/styles.css — 调价单元格样式

```css
/* 行级调价 */
.adj-cell { display: flex; align-items: center; gap: 6px; }
.adj-cell input {
  width: 64px; padding: 4px 8px; font-size: 12.5px;
  border: 1px solid var(--border); border-radius: 6px;
}
.adj-cell .btn-sm { padding: 3px 10px; }
```

### 3. apps/web-admin/src/pages/AuditLog.tsx — 审计文案

- ACTION_CN 加 `'order.line_item.price': '产品单价调整'`
- 行样式映射加 `'order.line_item.price': ''`
- 详情渲染加 case：展示 `行${row_no} ${percent}% · 单价 ¥${before_unit_price} → ¥${after_unit_price} · 货值 ¥${total_amount_rmb}`，有 `total_ddp_brl` 时追加 `· DDP R$${total_ddp_brl}`（仿现有 `order.fees` case 的写法，L73 附近）

## Assumptions & Decisions

- 调整对象是 `unit_price`（单价 RMB），行总价与货值由后端联动——与后端既有实现一致，不改后端
- 每行独立百分比输入（用户"自定义"），不做全局批量应用按钮（避免过度设计；需要批量可在后续迭代）
- percent 语义：正=加价、负=降价（后端已定义）
- 不限制订单状态即可调价（后端未限制）；但无 DI 的订单调整后会回 uploaded，UI 用 flash 明确提示
- 不动用户已有的行级截图（rowSpan 图片列）结构，新列追加在表格最右

## Verification

1. `pnpm --filter @aeg/web-ops exec tsc --noEmit` + web-admin tsc
2. API 冒烟：对现有 done 订单 `PATCH line-items/1/price {percent: 10}`，确认返回新单价、货值、DDP 变化；`{percent: 10000}` 应 400
3. 浏览器验证（运营端 5174，operator/operator123）：
   - 明细表出现「⚖ 调价%」列，每行输入框+按钮
   - 输入 10 点 ✓ → flash 显示行号/新单价/新货值，表格单价与总价刷新
   - 输入非法值（abc / 超范围）按钮禁用或提示
   - 管理端审计日志页出现「产品单价调整」中文条目
