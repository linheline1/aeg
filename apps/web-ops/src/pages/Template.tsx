import { useEffect, useState } from 'react';
import { downloadOrShareFile } from '@aeg/web-shared/file-actions';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import { useTranslation } from 'react-i18next';

interface TemplateInfo {
  version_no: string;
  template_code: string;
  updated_at: string;
  download_url: string;
  description: string;
  data_start_row: number;
  max_rows: number;
  field_count: number;
}

/** 运营端模板页：查看当前启用模板信息 + 下载（后端 /api/client/template 对 operator 开放） */
export default function Template() {
  const { t, i18n } = useTranslation();
  const [info, setInfo] = useState<TemplateInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dlLoading, setDlLoading] = useState(false);
  const [dlMsg, setDlMsg] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/client/template/current')
      .then(r => setInfo(r.data))
      .catch(e => setErr(getApiErrorMessage(e, t('template.loadError'))));
  }, [t]);

  const download = async () => {
    if (!info) return;
    setDlLoading(true);
    setDlMsg(null);
    try {
      const r = await api.get(info.download_url, { responseType: 'blob' });
      await downloadOrShareFile(new Blob([r.data as any]), `${t('template.fileName')}_v${info.version_no}.xlsx`);
      setDlMsg(t('template.downloadSuccess'));
      setTimeout(() => setDlMsg(null), 3000);
    } catch (e: any) {
      setDlMsg('❌ ' + getApiErrorMessage(e, t('template.downloadError')));
    } finally {
      setDlLoading(false);
    }
  };

  if (err) {
    return <div className="card"><p style={{ color: 'var(--err)' }}>{t('template.infoLoadError')}：{err}</p></div>;
  }
  if (!info) {
    return <div className="card"><p className="muted">{t('common.loading')}</p></div>;
  }

  return (
    <>
      <div className="page-title">
        <h1>{t('template.title')}</h1>
        <span className="muted text-sm">{t('template.subtitle')}</span>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <div className="card-title">
          <h3>{info.template_code} · v{info.version_no}</h3>
          <div className="actions">
            <button className="btn" onClick={download} disabled={dlLoading}>
              {dlLoading ? t('template.downloading') : `⬇ ${t('template.download')}`}
            </button>
          </div>
        </div>

        <table className="table" style={{ marginTop: 12 }}>
          <tbody>
            <tr><td style={{ width: 140 }} className="muted">{t('template.status')}</td><td><span className="status-done">{t('template.active')}</span></td></tr>
            <tr><td className="muted">{t('template.updatedAt')}</td><td>{new Date(info.updated_at).toLocaleString(i18n.language.startsWith('pt') ? 'pt-BR' : 'zh-CN')}</td></tr>
            <tr><td className="muted">{t('template.startRow')}</td><td>{t('template.startRowValue', { row: info.data_start_row })}</td></tr>
            <tr><td className="muted">{t('template.maxRows')}</td><td>{t('template.rowsValue', { count: info.max_rows })}</td></tr>
            <tr><td className="muted">{t('template.fields')}</td><td>{t('template.fieldsValue', { count: info.field_count })}</td></tr>
            <tr><td className="muted">{t('template.instructions')}</td><td>{info.description}</td></tr>
          </tbody>
        </table>

        {dlMsg && <p className="muted" style={{ marginTop: 12 }}>{dlMsg}</p>}
      </div>
    </>
  );
}
