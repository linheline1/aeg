import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../store/auth';

export default function TemplateList() {
  const { t } = useTranslation();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/admin/templates').then((r) => {
      setList(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <p>{t('template.loading')}</p>;

  return (
    <div>
      <h1>{t('template.title')}</h1>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('template.col.version')}</th>
              <th>{t('template.col.code')}</th>
              <th>{t('template.col.status')}</th>
              <th>{t('template.col.activatedAt')}</th>
              <th>{t('template.col.createdAt')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((tpl) => (
              <tr key={tpl.id}>
                <td>v{tpl.version_no}</td>
                <td>{tpl.template_code}</td>
                <td>{tpl.status === 'active' ? t('template.status.active') : t('template.status.inactive')}</td>
                <td>{tpl.activated_at || t('common.dash')}</td>
                <td>{tpl.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
