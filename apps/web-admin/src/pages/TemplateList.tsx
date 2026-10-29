import { useEffect, useState } from 'react';
import { api } from '../store/auth';

export default function TemplateList() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/admin/templates').then((r) => {
      setList(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <p>加载中…</p>;

  return (
    <div>
      <h1>模板版本</h1>
      <table className="table">
        <thead>
          <tr>
            <th>版本</th>
            <th>编码</th>
            <th>状态</th>
            <th>激活时间</th>
            <th>创建时间</th>
          </tr>
        </thead>
        <tbody>
          {list.map((t) => (
            <tr key={t.id}>
              <td>v{t.version_no}</td>
              <td>{t.template_code}</td>
              <td>{t.status === 'active' ? '✅ 启用' : '停用'}</td>
              <td>{t.activated_at || '—'}</td>
              <td>{t.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
