import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';

interface PartnerItem {
  id: string;
  category: 'carrier' | 'ecosystem';
  name: string;
  logo_url: string;
  website_url: string;
  created_at: string;
}

function fmtTime(s?: string | null) {
  return s ? s.slice(0, 19).replace('T', ' ') : '—';
}

export default function PartnersAdmin() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<PartnerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 新增表单
  const [category, setCategory] = useState<PartnerItem['category']>('carrier');
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 删除确认弹窗（自定义模态，原生 confirm 在 IDE 内置浏览器/webview 中会阻塞页面）
  const [confirmTarget, setConfirmTarget] = useState<PartnerItem | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get('/api/admin/partners');
      setRows(r.data.items);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('partner.err.loadFail')));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const flash = (text: string) => { setMsg(text); setTimeout(() => setMsg(null), 3000); };

  const create = async () => {
    setErr(null); setCreating(true);
    try {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('category', category);
      fd.append('website_url', websiteUrl.trim());
      fd.append('logo', logo as File);
      await api.post('/api/admin/partners', fd);
      setName(''); setWebsiteUrl(''); setLogo(null);
      (document.getElementById('partner-logo-input') as HTMLInputElement).value = '';
      flash(t('partner.flash.added', { name, category: t(`partner.category.${category}`) }));
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('partner.err.addFail')));
    } finally { setCreating(false); }
  };

  const remove = async (row: PartnerItem) => {
    setBusyId(row.id); setErr(null);
    try {
      await api.delete(`/api/admin/partners/${row.id}`);
      setConfirmTarget(null);
      flash(t('partner.flash.deleted', { name: row.name }));
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('partner.err.deleteFail')));
    } finally { setBusyId(null); }
  };

  const carrierCount = rows.filter(r => r.category === 'carrier').length;
  const ecosystemCount = rows.filter(r => r.category === 'ecosystem').length;

  return (
    <>
      <div className="page-title">
        <h1>{t('partner.title')}</h1>
        <span className="muted text-sm">{t('partner.subtitle')}</span>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="label">{t('partner.label.carrier')}</span>
          <span className="value">{carrierCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('partner.label.ecosystem')}</span>
          <span className="value">{ecosystemCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('partner.label.total')}</span>
          <span className="value">{rows.length}</span>
        </div>
      </div>

      {err && <div className="alert alert-err">❌ {err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}

      <div className="card">
        <div className="card-title">
          <h3>{t('partner.create.title')}</h3>
          <span className="muted text-sm">{t('partner.create.hint')}</span>
        </div>
        <div className="grid-3">
          <div className="form-row" style={{ margin: 0 }}>
            <label>{t('partner.create.category')}</label>
            <select className="form-input" value={category} onChange={e => setCategory(e.target.value as PartnerItem['category'])}>
              <option value="carrier">{t('partner.create.categoryCarrier')}</option>
              <option value="ecosystem">{t('partner.create.categoryEcosystem')}</option>
            </select>
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>{t('partner.create.name')}</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder={t('partner.create.namePlaceholder')} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>{t('partner.create.website')}</label>
            <input
              className="form-input"
              value={websiteUrl}
              onChange={e => setWebsiteUrl(e.target.value)}
              placeholder={t('partner.create.websitePlaceholder')}
            />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>{t('partner.create.logo')}</label>
            <input
              id="partner-logo-input"
              className="form-input"
              type="file"
              accept="image/*"
              onChange={e => setLogo(e.target.files?.[0] || null)}
            />
          </div>
        </div>
        <div className="row-between mt-16">
          <span className="muted text-sm">
            {logo ? t('partner.create.logoSelected', { name: logo.name }) : t('partner.create.logoNone')}
            {logo && (
              <img
                src={URL.createObjectURL(logo)}
                alt={t('partner.create.logoAlt')}
                style={{ height: 28, marginLeft: 8, verticalAlign: 'middle', background: '#fff', borderRadius: 4, border: '1px solid var(--border, #e5e7eb)' }}
              />
            )}
          </span>
          <button className="btn" disabled={creating || !name || !logo} onClick={create}>
            {creating ? t('partner.create.submitting') : t('partner.create.submit')}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>{t('partner.list.title')}</h3>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>{t('partner.list.refresh')}</button>
        </div>

        {loading ? (
          <p className="muted">{t('partner.list.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="muted">{t('partner.list.noData')}</p>
        ) : (
          <div className="table-wrap responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('partner.col.logo')}</th>
                  <th>{t('partner.col.name')}</th>
                  <th>{t('partner.col.category')}</th>
                  <th>{t('partner.col.createdAt')}</th>
                  <th>{t('partner.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td data-label={t('partner.col.logo')}>
                      <img
                        src={r.logo_url}
                        alt={r.name}
                        style={{ height: 36, maxWidth: 120, objectFit: 'contain', background: '#fff' }}
                      />
                    </td>
                    <td data-label={t('partner.col.name')}>
                      <strong>{r.name}</strong>
                      {r.website_url && (
                        <a
                          href={r.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'block', fontSize: 12, marginTop: 2 }}
                        >🔗 {r.website_url.replace(/^https?:\/\//, '')}</a>
                      )}
                    </td>
                    <td data-label={t('partner.col.category')}>
                      <span className={`status-tag ${r.category === 'carrier' ? 'status-active' : 'status-pending_fee'}`}>
                        {t(`partner.category.${r.category}`)}
                      </span>
                    </td>
                    <td className="muted text-sm" data-label={t('partner.col.createdAt')}>{fmtTime(r.created_at)}</td>
                    <td className="table-action-cell" data-label={t('partner.col.actions')}>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busyId === r.id}
                        onClick={() => setConfirmTarget(r)}
                      >{busyId === r.id ? t('partner.action.deleting') : t('partner.action.delete')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {confirmTarget && (
        <div
          onClick={() => { if (!busyId) setConfirmTarget(null); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
              width: '100%',
              maxWidth: 400,
              padding: '24px 24px 20px'
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 17 }}>{t('partner.confirm.title')}</h3>
            <p style={{ margin: '0 0 22px', fontSize: 14, lineHeight: 1.6, color: '#4b5563' }}>
              {t('partner.confirm.body', { name: confirmTarget.name, category: t(`partner.category.${confirmTarget.category}`) })}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" disabled={!!busyId} onClick={() => setConfirmTarget(null)}>{t('partner.confirm.cancel')}</button>
              <button className="btn btn-danger" disabled={!!busyId} onClick={() => remove(confirmTarget)}>
                {busyId === confirmTarget.id ? t('partner.action.deleting') : t('partner.confirm.ok')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
