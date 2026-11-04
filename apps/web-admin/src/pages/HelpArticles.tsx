import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';

type HelpApp = 'client' | 'ops';
type Article = {
  id: string;
  app: HelpApp;
  category: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  published: boolean;
  featured: boolean;
  sort_order: number;
  updated_at: string;
};
type ArticleForm = Omit<Article, 'id' | 'app' | 'updated_at'>;

const CATEGORY_LABELS: Record<string, string> = { start: '新手入门', guide: '操作指南', invoice: '开票与交付', faq: '常见问题' };
const emptyForm = (): ArticleForm => ({ category: 'start', slug: '', title: '', summary: '', content: '', published: true, featured: false, sort_order: 0 });

function fmtTime(s: string) {
  return s ? s.slice(0, 16).replace('T', ' ') : '—';
}

export default function HelpArticles() {
  const [app, setApp] = useState<HelpApp>('client');
  const [rows, setRows] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ArticleForm>(emptyForm());

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.get('/api/admin/help/articles', { params: { app } });
      setRows(r.data || []);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '帮助文档加载失败'));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    setEditingId(null);
    setForm(emptyForm());
    load();
  }, [app]);

  const update = <K extends keyof ArticleForm>(key: K, value: ArticleForm[K]) => setForm(prev => ({ ...prev, [key]: value }));
  const edit = (row: Article) => {
    setEditingId(row.id);
    setForm({ category: row.category, slug: row.slug, title: row.title, summary: row.summary, content: row.content, published: row.published, featured: row.featured, sort_order: row.sort_order });
    setErr(null);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const cancel = () => { setEditingId(null); setForm(emptyForm()); setErr(null); };

  const save = async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      if (editingId) await api.patch(`/api/admin/help/articles/${editingId}`, form);
      else await api.post('/api/admin/help/articles', { ...form, app });
      setMsg(editingId ? '✅ 文章已更新' : '✅ 文章已创建');
      cancel();
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '保存失败'));
    } finally { setSaving(false); }
  };

  const togglePublished = async (row: Article) => {
    setErr(null);
    try {
      await api.patch(`/api/admin/help/articles/${row.id}`, { published: !row.published });
      setMsg(row.published ? '✅ 文章已下架' : '✅ 文章已发布');
      await load();
    } catch (e: any) { setErr(getApiErrorMessage(e, '状态更新失败')); }
  };

  const remove = async (row: Article) => {
    if (!window.confirm(`确定删除「${row.title}」？删除后对应端将无法访问该文章，且不可恢复。`)) return;
    setErr(null);
    try {
      await api.delete(`/api/admin/help/articles/${row.id}`);
      if (editingId === row.id) cancel();
      setMsg('✅ 文章已删除');
      await load();
    } catch (e: any) { setErr(getApiErrorMessage(e, '删除失败')); }
  };

  return (
    <>
      <div className="page-title">
        <div><h1>帮助文档管理</h1><span className="muted text-sm">分别维护客户端与运营端帮助中心文章</span></div>
        <div className="row gap-sm">
          <button className={`btn btn-sm ${app === 'client' ? '' : 'btn-ghost'}`} onClick={() => setApp('client')}>客户端文档</button>
          <button className={`btn btn-sm ${app === 'ops' ? '' : 'btn-ghost'}`} onClick={() => setApp('ops')}>运营端文档</button>
        </div>
      </div>
      {err && <div className="alert alert-err">❌ {err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}

      <div className="card help-editor">
        <div className="card-title">
          <h3>{editingId ? '编辑文章' : '新建文章'} · {app === 'client' ? '客户端' : '运营端'}</h3>
          {editingId && <button className="btn btn-ghost btn-sm" onClick={cancel}>取消编辑</button>}
        </div>
        <div className="grid-3">
          <div className="form-row"><label>文章标题</label><input className="form-input" value={form.title} onChange={e => update('title', e.target.value)} placeholder="例如：企业注册与营业执照认证" /></div>
          <div className="form-row"><label>URL 标识</label><input className="form-input" value={form.slug} onChange={e => update('slug', e.target.value.toLowerCase())} placeholder="enterprise-registration" /><span className="muted text-sm">小写字母、数字和连字符</span></div>
          <div className="form-row"><label>分类</label><select className="form-input" value={form.category} onChange={e => update('category', e.target.value)}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="form-row"><label>排序值</label><input className="form-input" type="number" min={0} max={100000} value={form.sort_order} onChange={e => update('sort_order', Number(e.target.value))} /><span className="muted text-sm">数值越小越靠前</span></div>
          <div className="form-row"><label>发布状态</label><select className="form-input" value={String(form.published)} onChange={e => update('published', e.target.value === 'true')}><option value="true">发布</option><option value="false">下架</option></select></div>
          <div className="form-row"><label>首页推荐</label><select className="form-input" value={String(form.featured)} onChange={e => update('featured', e.target.value === 'true')}><option value="false">普通文章</option><option value="true">推荐到新手指南</option></select></div>
        </div>
        <div className="form-row"><label>文章摘要</label><input className="form-input" maxLength={500} value={form.summary} onChange={e => update('summary', e.target.value)} placeholder="用于首页列表和搜索结果的一句话说明" /></div>
        <div className="form-row">
          <label>文章正文</label>
          <textarea className="form-input" rows={14} value={form.content} onChange={e => update('content', e.target.value)} placeholder={'## 小标题\n普通段落文字\n1. 操作步骤\n- 列表内容\n> 重要提示'} />
          <div className="muted text-sm" style={{ lineHeight: 1.8 }}>
            格式：<code>## 小标题</code>　<code>1. 操作步骤</code>　<code>- 列表</code>　<code>&gt; 提示</code>；普通文字显示为段落，无需填写 HTML。
          </div>
        </div>
        <div className="row-between">
          <span className="muted text-sm">发布后仅显示在{app === 'client' ? '客户端' : '运营端'}帮助中心</span>
          <button className="btn" disabled={saving || !form.title || !form.slug || !form.summary || !form.content} onClick={save}>{saving ? '保存中…' : editingId ? '保存修改' : '创建文章'}</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><h3>文章列表（{rows.length}）</h3><button className="btn btn-ghost btn-sm" onClick={load}>刷新</button></div>
        {loading ? <p className="muted">加载中…</p> : rows.length === 0 ? <p className="muted">暂无文章，请在上方创建。</p> : (
          <div className="table-wrap responsive-table"><table className="table">
            <thead><tr><th>文章</th><th>分类</th><th>推荐</th><th>排序</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
            <tbody>{rows.map(row => (
              <tr key={row.id}>
                <td data-label="文章"><strong>{row.title}</strong><span className="sub">/help/{row.slug}</span></td>
                <td data-label="分类">{CATEGORY_LABELS[row.category] || row.category}</td>
                <td data-label="推荐">{row.featured ? '首页推荐' : '—'}</td>
                <td data-label="排序">{row.sort_order}</td>
                <td data-label="状态"><span className={`status-tag ${row.published ? 'status-active' : 'status-disabled'}`}>{row.published ? '已发布' : '已下架'}</span></td>
                <td className="muted text-sm" data-label="更新时间">{fmtTime(row.updated_at)}</td>
                <td className="table-action-cell" data-label="操作"><div className="row gap-sm table-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => edit(row)}>编辑</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => togglePublished(row)}>{row.published ? '下架' : '发布'}</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(row)}>删除</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
