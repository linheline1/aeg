import { useEffect, useState } from 'react';
import { api } from '../store/auth';
import { getApiErrorMessage } from '@aeg/web-shared/errors';

interface AuditRow {
  id: string;
  ts: string;
  actor_username: string;
  actor_role: string;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  detail?: any;
}

const ACTION_CN: Record<string, string> = {
  'LOGIN': '登录',
  'TEMPLATE_DOWNLOAD': '下载模板',
  'order.upload': '客户上传清单',
  'order.compute': '报价核算',
  'order.compute_failed': '核算失败',
  'order.fees': '订单费率修改',
  'order.status': '订单状态流转',
  'rates.global.update': '全局费率更新',
  'rates.client.set': '客户费率覆盖·新建',
  'rates.client.update': '客户费率覆盖·修改',
  'rates.client.remove': '客户费率覆盖·移除',
  'client.create': '新建客户',
  'client.update': '客户信息修改',
  'client.password': '重置客户密码',
  'client.status': '客户启用/禁用',
  'order.deal': '成交标记',
  'order.assign': '订单改派业务员',
  'client.salesperson': '客户归属业务员变更',
  'image.upload': '客户上传图片',
  'staff.create': '新建员工',
  'staff.status': '员工启用/禁用',
  'staff.password': '重置员工密码',
  'client.cnpj.create': '客户新增开票 CNPJ',
  'client.cnpj.default': '客户设置默认开票抬头',
  'client.cnpj.delete': '客户删除开票 CNPJ',
  'order.invoice_cnpj': '订单绑定开票 CNPJ',
  'order.shipment': '物流信息维护',
  'order.shipment.event': '物流节点新增',
  'order.shipment.event_del': '物流节点删除',
  'order.file.upload': '交付文件上传',
  'order.file.delete': '交付文件删除',
  'order.line_item.price': '产品按百分比计价',
  'finance.payment.create': '回款登记',
  'finance.payment.delete': '回款删除',
  'ai_config.update': 'AI 配置保存',
  'ai_config.profile_create': 'AI 配置新增',
  'ai_config.profile_update': 'AI 配置编辑',
  'ai_config.profile_activate': 'AI 配置切换',
  'ai_config.profile_delete': 'AI 配置删除',
  'product.update': '产品档案编辑',
  'product.sync': '产品档案同步',
  'order.images.reextract': '订单图片重新提取'
};

const ACTION_TAG: Record<string, string> = {
  'rates.global.update': 'warn-bg', 'rates.client.set': 'warn-bg', 'rates.client.update': 'warn-bg', 'rates.client.remove': 'warn-bg',
  'order.compute': 'ok-bg', 'order.upload': '',
  'order.status': '', 'order.fees': '', 'order.compute_failed': 'err-bg',
  'order.deal': 'ok-bg'
};

function fmtDetail(a: string, detail: any): string {
  if (detail == null) return '—';
  try {
    switch (a) {
      case 'rates.global.update':
      case 'rates.client.set':
      case 'rates.client.update': {
        const after = detail.after || {};
        const before = detail.before;
        const seg = `海运 USD${after.ocean_freight_usd} / 杂费 USD${after.port_fee_usd} / 清关 R$${after.br_clearance_brl} / 汇率 ${after.fx_rate}`;
        if (before) return `${seg}（原：海运 USD${before.ocean} / 杂费 USD${before.port} / 清关 R$${before.br} / 汇率 ${before.fx}）`;
        return detail.client_name ? `${detail.client_name} → ${seg}` : seg;
      }
      case 'rates.client.remove':
        return `移除 ${detail.client_name || detail.client_id || ''} 的费率覆盖`;
      case 'order.fees': {
        const f = detail.after?.fees;
        const b = detail.before;
        return `${detail.quote_no} → 海运 USD${f?.ocean_freight_usd} / 杂费 USD${f?.port_fee_usd} / 清关 R$${f?.br_clearance_brl} / 汇率 ${f?.fx_rate}，合计 R$${detail.after?.total}${b?.total != null ? `（原合计 R$${b.total}）` : ''}`;
      }
      case 'order.compute': {
        const src = detail.rate_source === 'client' ? '客户覆盖' : detail.rate_source === 'global' ? '全局默认' : '内置默认';
        return `${detail.quote_no}（费率来源：${src}）合计 R$${detail.total_brl}`;
      }
      case 'order.status':
        return `${detail.quote_no}: ${detail.from} → ${detail.to}${detail.reason ? `（${detail.reason}）` : ''}`;
      case 'order.line_item.price': {
        const seg = `${detail.quote_no} 行${detail.row_no} 按原单价 ¥${detail.base_unit_price ?? detail.before_unit_price} 的 ${detail.percent}% 计价 · 新单价 ¥${detail.after_unit_price} · 货值 ¥${detail.total_amount_rmb}`;
        const extras: string[] = [];
        if (detail.di_brl != null) extras.push(`DI R$${detail.di_brl}`);
        if (detail.total_ddp_brl != null) extras.push(`DDP R$${detail.total_ddp_brl}`);
        return extras.length ? `${seg} · ${extras.join(' · ')}` : seg;
      }
      case 'order.deal': {
        const cn: Record<string, string> = { won: '已成交', lost: '未成交', open: '跟进中' };
        const to = cn[detail.to] || detail.to || '未标记';
        const from = detail.from ? `（原：${cn[detail.from] || detail.from}）` : '';
        return `${detail.quote_no} → ${to}${from}${detail.amount_brl != null ? ` · R$${detail.amount_brl}` : ''}${detail.note ? ` · 备注：${detail.note}` : ''}`;
      }
      case 'order.assign':
        return `${detail.quote_no} → 业务员 ${detail.to_name || detail.to_salesperson_id || '未分配'}`;
      case 'client.salesperson':
        return `${detail.client_name} → 业务员 ${detail.to_name || detail.to_salesperson_id || '未分配'}`;
      case 'image.upload': {
        const names: string[] = Array.isArray(detail.files) ? detail.files : [];
        const shown = names.slice(0, 3).join('、') + (names.length > 3 ? ` 等${names.length}张` : '');
        return `${detail.client_name || ''} 上传 ${detail.count} 张图片${shown ? `（${shown}）` : ''}`;
      }
      case 'order.upload':
        return `${detail.quote_no} · ${detail.file_name} · ${detail.rows} 行 · ${Number(detail.total_cbm).toFixed(3)} CBM`;
      case 'client.cnpj.create':
      case 'client.cnpj.default':
      case 'client.cnpj.delete':
        return `${detail.cnpj || ''}${detail.company_name ? ` · ${detail.company_name}` : ''}`;
      case 'order.invoice_cnpj':
        return `${detail.quote_no} → ${detail.invoice_cnpj ? `${detail.invoice_cnpj} · ${detail.company_name}` : '暂不指定'}`;
      case 'ai_config.update':
      case 'ai_config.profile_create':
      case 'ai_config.profile_update':
      case 'ai_config.profile_activate':
      case 'ai_config.profile_delete': {
        const segs = [
          detail.name ? `「${detail.name}」` : '',
          detail.model ? `模型 ${detail.model}` : '',
          detail.timeout_ms ? `超时 ${detail.timeout_ms}ms` : ''
        ].filter(Boolean).join(' · ');
        return segs || (detail.base_url ? String(detail.base_url) : '—');
      }
      default:
        return JSON.stringify(detail).slice(0, 160);
    }
  } catch {
    return JSON.stringify(detail).slice(0, 160);
  }
}

export default function AuditLog() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (action) params.set('action', action);
    if (q) params.set('q', q);
    api.get(`/api/admin/audit?${params}`)
      .then(r => { setRows(r.data.items); setTotal(r.data.total); })
      .catch(e => setErr(getApiErrorMessage(e)));
  }, [page, action, q]);

  const actions = Object.keys(ACTION_CN).sort();

  return (
    <>
      <div className="page-title">
        <h1>审计日志</h1>
        <span className="muted text-sm">{rows ? `共 ${total} 条` : '加载中…'}</span>
      </div>

      <div className="card">
        <form
          className="row gap-md mb-12 audit-filters"
          onSubmit={e => { e.preventDefault(); setPage(1); setQ(keyword.trim()); }}
        >
          <select
            className="form-input form-input-sm" style={{ width: 220 }}
            value={action}
            onChange={e => { setPage(1); setAction(e.target.value); }}
          >
            <option value="">全部动作</option>
            {actions.map(a => <option key={a} value={a}>{ACTION_CN[a] || a}</option>)}
          </select>
          <input
            className="form-input form-input-sm" style={{ flex: 1, maxWidth: 320 }}
            placeholder="搜索操作人 / 对象，回车搜索"
            value={keyword} onChange={e => setKeyword(e.target.value)}
          />
          <button className="btn btn-sm" type="submit">搜索</button>
          {q && (
            <button
              className="btn btn-sm btn-ghost" type="button"
              onClick={() => { setKeyword(''); setPage(1); setQ(''); }}
            >
              清除
            </button>
          )}
        </form>

        {err && <div className="alert alert-err">❌ {err}</div>}
        {rows === null && !err && <p className="muted">加载中…</p>}
        {rows?.length === 0 && !err && <p className="muted text-center" style={{ padding: 40 }}>暂无日志</p>}

        {rows && rows.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>时间</th>
                  <th style={{ width: 110 }}>操作人</th>
                  <th style={{ width: 90 }}>角色</th>
                  <th style={{ width: 150 }}>动作</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="text-sm muted text-num">{r.ts?.slice(0, 19).replace('T', ' ')}</td>
                    <td><strong>{r.actor_username}</strong></td>
                    <td className="text-sm muted">{r.actor_role}</td>
                    <td><span className={`status-tag ${ACTION_TAG[r.action] || ''}`}>{ACTION_CN[r.action] || r.action}</span></td>
                    <td className="text-sm">{fmtDetail(r.action, r.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="row gap-md pagination" style={{ justifyContent: 'flex-end', alignItems: 'center', marginTop: 12 }}>
            <span className="muted text-sm">第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页</span>
            <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
            <button
              className="btn btn-sm btn-ghost"
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => setPage(p => p + 1)}
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </>
  );
}
