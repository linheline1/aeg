import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';

interface VersionEntry {
  version?: string;
  commit?: string;
  builtAt?: string;
}

interface VersionResponse {
  entries: Record<string, VersionEntry>;
  serverTime: string;
}

const APPS = [
  { key: 'api', labelKey: 'versions.app.api', port: 5000 },
  { key: 'admin', labelKey: 'versions.app.admin', port: 5173 },
  { key: 'ops', labelKey: 'versions.app.ops', port: 5174 },
  { key: 'client', labelKey: 'versions.app.client', port: 5176 },
  { key: 'customs', labelKey: 'versions.app.customs', port: 5175 }
] as const;

export default function Versions() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('pt') ? 'pt-BR' : 'zh-CN';
  const [data, setData] = useState<VersionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.get('/api/version');
      setData(r.data);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('versions.loadFail')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale) : '—');

  return (
    <>
      <div className="page-title">
        <h1>{t('versions.title')}</h1>
        <span className="muted text-sm">{t('versions.subtitle')}</span>
      </div>

      <div className="card">
        <div
          className="row gap-md"
          style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}
        >
          <div className="text-sm muted">
            <div>{t('versions.currentOrigin', { origin: window.location.origin })}</div>
            {data?.serverTime && <div>{t('versions.serverTime', { time: fmt(data.serverTime) })}</div>}
          </div>
          <button className="btn btn-sm" type="button" onClick={load} disabled={loading}>
            {loading ? t('versions.loading') : t('versions.refresh')}
          </button>
        </div>

        {err && <div className="alert alert-err">❌ {err}</div>}
        {loading && !data && !err && <p className="muted">{t('versions.loading')}</p>}

        {data && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>{t('versions.col.app')}</th>
                  <th style={{ width: 110 }}>{t('versions.col.version')}</th>
                  <th style={{ width: 120 }}>{t('versions.col.commit')}</th>
                  <th>{t('versions.col.builtAt')}</th>
                  <th style={{ width: 200 }}>{t('versions.col.address')}</th>
                </tr>
              </thead>
              <tbody>
                {APPS.map((app) => {
                  const entry = data.entries[app.key];
                  return (
                    <tr key={app.key}>
                      <td><strong>{t(app.labelKey)}</strong></td>
                      <td className="text-num">{entry?.version || t('versions.notBuilt')}</td>
                      <td className="text-num">{entry?.commit || '—'}</td>
                      <td className="text-sm">{entry ? fmt(entry.builtAt) : t('versions.notBuilt')}</td>
                      <td className="text-num text-sm">{`http://127.0.0.1:${app.port}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
