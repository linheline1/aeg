import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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

const ACTION_TAG: Record<string, string> = {
  'rates.global.update': 'warn-bg', 'rates.client.set': 'warn-bg', 'rates.client.update': 'warn-bg', 'rates.client.remove': 'warn-bg',
  'order.compute': 'ok-bg', 'order.upload': '',
  'order.status': '', 'order.fees': '', 'order.compute_failed': 'err-bg',
  'order.deal': 'ok-bg', 'order.client': 'warn-bg'
};

function fmtDetail(a: string, detail: any, t: TFunction): string {
  if (detail == null) return '—';
  try {
    switch (a) {
      case 'rates.global.update':
      case 'rates.client.set':
      case 'rates.client.update': {
        const after = detail.after || {};
        const before = detail.before;
        const seg = t('audit.detail.quoteRateSeg', { ocean: after.ocean_freight_usd, port: after.port_fee_usd, br: after.br_clearance_brl, fx: after.fx_rate });
        if (before) return t('audit.detail.quoteRateSegTotal', { total: '', orig: t('audit.detail.origRate', { ocean: before.ocean, port: before.port, br: before.br, fx: before.fx }) });
        return detail.client_name ? t('audit.detail.quoteRateWithClient', { client: detail.client_name, seg }) : t('audit.detail.quoteRateOnly', { seg });
      }
      case 'rates.client.remove':
        return t('audit.detail.rateOverwriteRemove', { name: detail.client_name || detail.client_id || '' });
      case 'order.fees': {
        const f = detail.after?.fees;
        const b = detail.before;
        return `${detail.quote_no} → ${t('audit.detail.quoteRateSeg', { ocean: f?.ocean_freight_usd, port: f?.port_fee_usd, br: f?.br_clearance_brl, fx: f?.fx_rate })}${t('audit.detail.quoteRateSegTotal', { total: detail.after?.total, orig: b?.total != null ? t('audit.detail.origRate', { ocean: b?.ocean, port: b?.port, br: b?.br, fx: b?.fx }) : '' })}`;
      }
      case 'order.compute': {
        const src = detail.rate_source === 'client' ? t('audit.detail.src.client') : detail.rate_source === 'global' ? t('audit.detail.src.global') : t('audit.detail.src.builtin');
        return `${detail.quote_no}${t('audit.detail.rateSource', { src })}合计 R$${detail.total_brl}`;
      }
      case 'order.status':
        return `${detail.quote_no}: ${detail.from} → ${detail.to}${detail.reason ? `（${detail.reason}）` : ''}`;
      case 'order.line_item.price': {
        const seg = `${detail.quote_no} 行${detail.row_no} 按原单价 ¥${detail.base_unit_price ?? detail.before_unit_price} 的 ${detail.percent}% 计价 · 新单价 ¥${detail.after_unit_price} · 货值 ¥${detail.total_amount_rmb}`;
        const extras: string[] = [];
        if (detail.di_brl != null) extras.push(`DI R$${detail.di_brl}`);
        if (detail.total_ddp_brl != null) extras.push(`DDP R$${detail.total_ddp_brl}`);
        return extras.length ? t('audit.detail.lineItemExtras', { extras: extras.join(t('audit.detail.segSep')) }) : seg;
      }
      case 'order.deal': {
        const cn: Record<string, string> = {
          won: t('audit.detail.cn.won'),
          lost: t('audit.detail.cn.lost'),
          open: t('audit.detail.cn.open')
        };
        const to = cn[detail.to] || detail.to || t('audit.detail.cn.notMarked');
        const from = detail.from ? t('audit.detail.dealFrom', { from: cn[detail.from] || detail.from }) : '';
        const amount = detail.amount_brl != null ? t('audit.detail.dealAmount', { amount: detail.amount_brl }) : '';
        const note = detail.note ? t('audit.detail.dealNote', { note: detail.note }) : '';
        return t('audit.detail.dealSeg', { quote: detail.quote_no, to, from, amount, note });
      }
      case 'order.assign':
        return t('audit.detail.assignSales', { quote: detail.quote_no, name: detail.to_name || detail.to_salesperson_id || t('client.salesperson.unassigned') });
      case 'order.client':
        return t('audit.detail.clientTransfer', {
          quote: detail.quote_no,
          from: detail.from_client_name || detail.from_client_id || '—',
          to: detail.to_client_name || detail.to_client_id || '—'
        });
      case 'client.salesperson':
        return t('audit.detail.assignSales', { quote: detail.client_name, name: detail.to_name || detail.to_salesperson_id || t('client.salesperson.unassigned') });
      case 'image.upload': {
        const names: string[] = Array.isArray(detail.files) ? detail.files : [];
        const shown = names.slice(0, 3).join(t('audit.detail.imageNames')) + (names.length > 3 ? t('audit.detail.imageEtc', { n: names.length }) : '');
        return t('audit.detail.imageUpload', { client: detail.client_name || '', count: detail.count, shown: shown ? `（${shown}）` : '' });
      }
      case 'order.upload':
        return `${detail.quote_no} · ${detail.file_name} · ${detail.rows} 行 · ${Number(detail.total_cbm).toFixed(3)}${t('audit.detail.cbmCubic')}`;
      case 'client.cnpj.create':
      case 'client.cnpj.default':
      case 'client.cnpj.delete':
        return `${detail.cnpj || ''}${detail.company_name ? ` · ${detail.company_name}` : ''}`;
      case 'order.invoice_cnpj':
        return `${detail.quote_no} → ${detail.invoice_cnpj ? `${detail.invoice_cnpj} · ${detail.company_name}` : t('audit.detail.invoiceUnspecified')}`;
      case 'ai_config.update':
      case 'ai_config.profile_create':
      case 'ai_config.profile_update':
      case 'ai_config.profile_activate':
      case 'ai_config.profile_delete': {
        const segs = [
          detail.name ? `「${detail.name}」` : '',
          detail.model ? `模型 ${detail.model}` : '',
          detail.timeout_ms ? `超时 ${detail.timeout_ms}ms` : ''
        ].filter(Boolean).join(t('audit.detail.segSep'));
        return segs || (detail.base_url ? String(detail.base_url) : '—');
      }
      default:
        return JSON.stringify(detail).slice(0, 160);
    }
  } catch {
    return JSON.stringify(detail).slice(0, 160);
  }
}

const ALL_ACTIONS = [
  'LOGIN', 'TEMPLATE_DOWNLOAD', 'order.upload', 'order.compute', 'order.compute_failed', 'order.fees',
  'order.status', 'rates.global.update', 'rates.client.set', 'rates.client.update', 'rates.client.remove',
  'client.create', 'client.update', 'client.password', 'client.status', 'order.deal', 'order.assign',
  'client.salesperson', 'image.upload', 'staff.create', 'staff.status', 'staff.password',
  'client.cnpj.create', 'client.cnpj.default', 'client.cnpj.delete', 'order.invoice_cnpj', 'order.shipment',
  'order.shipment.event', 'order.shipment.event_del', 'order.file.upload', 'order.file.delete',
  'order.line_item.price', 'finance.payment.create', 'finance.payment.delete', 'ai_config.update',
  'ai_config.profile_create', 'ai_config.profile_update', 'ai_config.profile_activate', 'ai_config.profile_delete',
  'product.update', 'product.sync', 'order.images.reextract'
];

export default function AuditLog() {
  const { t } = useTranslation();
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

  const actions = [...ALL_ACTIONS].sort();

  return (
    <>
      <div className="page-title">
        <h1>{t('audit.title')}</h1>
        <span className="muted text-sm">{rows ? t('audit.subtitle', { total }) : t('audit.subtitle.loading')}</span>
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
            <option value="">{t('audit.filter.allActions')}</option>
            {actions.map(a => <option key={a} value={a}>{t(`audit.action.${a}`, { defaultValue: a })}</option>)}
          </select>
          <input
            className="form-input form-input-sm" style={{ flex: 1, maxWidth: 320 }}
            placeholder={t('audit.filter.searchPlaceholder')}
            value={keyword} onChange={e => setKeyword(e.target.value)}
          />
          <button className="btn btn-sm" type="submit">{t('audit.filter.search')}</button>
          {q && (
            <button
              className="btn btn-sm btn-ghost" type="button"
              onClick={() => { setKeyword(''); setPage(1); setQ(''); }}
            >
              {t('audit.filter.clear')}
            </button>
          )}
        </form>

        {err && <div className="alert alert-err">❌ {err}</div>}
        {rows === null && !err && <p className="muted">{t('audit.loading')}</p>}
        {rows?.length === 0 && !err && <p className="muted text-center" style={{ padding: 40 }}>{t('audit.noData')}</p>}

        {rows && rows.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>{t('audit.col.time')}</th>
                  <th style={{ width: 110 }}>{t('audit.col.actor')}</th>
                  <th style={{ width: 90 }}>{t('audit.col.role')}</th>
                  <th style={{ width: 150 }}>{t('audit.col.action')}</th>
                  <th>{t('audit.col.detail')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="text-sm muted text-num">{r.ts?.slice(0, 19).replace('T', ' ')}</td>
                    <td><strong>{r.actor_username}</strong></td>
                    <td className="text-sm muted">{r.actor_role}</td>
                    <td><span className={`status-tag ${ACTION_TAG[r.action] || ''}`}>{t(`audit.action.${r.action}`, { defaultValue: r.action })}</span></td>
                    <td className="text-sm">{fmtDetail(r.action, r.detail, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="row gap-md pagination" style={{ justifyContent: 'flex-end', alignItems: 'center', marginTop: 12 }}>
            <span className="muted text-sm">{t('audit.pagination.page', { page, total: Math.max(1, Math.ceil(total / pageSize)) })}</span>
            <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('audit.pagination.prev')}</button>
            <button
              className="btn btn-sm btn-ghost"
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => setPage(p => p + 1)}
            >
              {t('audit.pagination.next')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
