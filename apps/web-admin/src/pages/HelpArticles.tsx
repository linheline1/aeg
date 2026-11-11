import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const CATEGORIES = ['start', 'guide', 'invoice', 'faq'] as const;
const emptyForm = (): ArticleForm => ({ category: 'start', slug: '', title: '', summary: '', content: '', published: true, featured: false, sort_order: 0 });

function fmtTime(s: string) {
  return s ? s.slice(0, 16).replace('T', ' ') : '—';
}

export default function HelpArticles() {
  const { t } = useTranslation();
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
      setErr(getApiErrorMessage(e, t('help.err.loadFail')));
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
      setMsg(editingId ? t('help.flash.updated') : t('help.flash.created'));
      cancel();
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('help.err.saveFail')));
    } finally { setSaving(false); }
  };

  const togglePublished = async (row: Article) => {
    setErr(null);
    try {
      await api.patch(`/api/admin/help/articles/${row.id}`, { published: !row.published });
      setMsg(row.published ? t('help.flash.unpublished') : t('help.flash.published'));
      await load();
    } catch (e: any) { setErr(getApiErrorMessage(e, t('help.err.toggleFail'))); }
  };

  const remove = async (row: Article) => {
    if (!window.confirm(t('help.confirm.delete', { title: row.title }))) return;
    setErr(null);
    try {
      await api.delete(`/api/admin/help/articles/${row.id}`);
      if (editingId === row.id) cancel();
      setMsg(t('help.flash.deleted'));
      await load();
    } catch (e: any) { setErr(getApiErrorMessage(e, t('help.err.deleteFail'))); }
  };

  const appLabel = app === 'client' ? t('help.editor.appClient') : t('help.editor.appOps');

  return (
    <>
      <div className="page-title">
        <div><h1>{t('help.title')}</h1><span className="muted text-sm">{t('help.subtitle')}</span></div>
        <div className="row gap-sm">
          <button className={`btn btn-sm ${app === 'client' ? '' : 'btn-ghost'}`} onClick={() => setApp('client')}>{t('help.clientTab')}</button>
          <button className={`btn btn-sm ${app === 'ops' ? '' : 'btn-ghost'}`} onClick={() => setApp('ops')}>{t('help.opsTab')}</button>
        </div>
      </div>
      {err && <div className="alert alert-err">❌ {err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}

      <div className="card help-editor">
        <div className="card-title">
          <h3>{editingId ? t('help.editor.editTitle', { app: appLabel }) : t('help.editor.newTitle', { app: appLabel })}</h3>
          {editingId && <button className="btn btn-ghost btn-sm" onClick={cancel}>{t('help.editor.cancelEdit')}</button>}
        </div>
        <div className="grid-3">
          <div className="form-row">
            <label>{t('help.editor.titleLabel')}</label>
            <input className="form-input" value={form.title} onChange={e => update('title', e.target.value)} placeholder={t('help.editor.titlePlaceholder')} />
          </div>
          <div className="form-row">
            <label>{t('help.editor.slugLabel')}</label>
            <input className="form-input" value={form.slug} onChange={e => update('slug', e.target.value.toLowerCase())} placeholder={t('help.editor.slugPlaceholder')} />
            <span className="muted text-sm">{t('help.editor.slugHint')}</span>
          </div>
          <div className="form-row">
            <label>{t('help.editor.categoryLabel')}</label>
            <select className="form-input" value={form.category} onChange={e => update('category', e.target.value)}>
              {CATEGORIES.map(value => <option key={value} value={value}>{t(`help.category.${value}`)}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>{t('help.editor.sortLabel')}</label>
            <input className="form-input" type="number" min={0} max={100000} value={form.sort_order} onChange={e => update('sort_order', Number(e.target.value))} />
            <span className="muted text-sm">{t('help.editor.sortHint')}</span>
          </div>
          <div className="form-row">
            <label>{t('help.editor.publishLabel')}</label>
            <select className="form-input" value={String(form.published)} onChange={e => update('published', e.target.value === 'true')}>
              <option value="true">{t('help.editor.publish')}</option>
              <option value="false">{t('help.editor.unpublish')}</option>
            </select>
          </div>
          <div className="form-row">
            <label>{t('help.editor.featuredLabel')}</label>
            <select className="form-input" value={String(form.featured)} onChange={e => update('featured', e.target.value === 'true')}>
              <option value="false">{t('help.editor.featured.normal')}</option>
              <option value="true">{t('help.editor.featured.recommend')}</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <label>{t('help.editor.summaryLabel')}</label>
          <input className="form-input" maxLength={500} value={form.summary} onChange={e => update('summary', e.target.value)} placeholder={t('help.editor.summaryPlaceholder')} />
        </div>
        <div className="form-row">
          <label>{t('help.editor.contentLabel')}</label>
          <textarea className="form-input" rows={14} value={form.content} onChange={e => update('content', e.target.value)} placeholder={t('help.editor.contentPlaceholder')} />
          <div className="muted text-sm" style={{ lineHeight: 1.8 }}>
            {t('help.editor.formatHint')}
          </div>
        </div>
        <div className="row-between">
          <span className="muted text-sm">{t('help.editor.publishTo', { app: appLabel })}</span>
          <button className="btn" disabled={saving || !form.title || !form.slug || !form.summary || !form.content} onClick={save}>
            {saving ? t('help.editor.saving') : editingId ? t('help.editor.saveEdit') : t('help.editor.saveNew')}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><h3>{t('help.list.title', { count: rows.length })}</h3><button className="btn btn-ghost btn-sm" onClick={load}>{t('help.list.refresh')}</button></div>
        {loading ? <p className="muted">{t('help.list.loading')}</p> : rows.length === 0 ? <p className="muted">{t('help.list.noData')}</p> : (
          <div className="table-wrap responsive-table"><table className="table">
            <thead><tr>
              <th>{t('help.col.article')}</th>
              <th>{t('help.col.category')}</th>
              <th>{t('help.col.featured')}</th>
              <th>{t('help.col.sort')}</th>
              <th>{t('help.col.status')}</th>
              <th>{t('help.col.updatedAt')}</th>
              <th>{t('help.col.actions')}</th>
            </tr></thead>
            <tbody>{rows.map(row => (
              <tr key={row.id}>
                <td data-label={t('help.col.article')}><strong>{row.title}</strong><span className="sub">/help/{row.slug}</span></td>
                <td data-label={t('help.col.category')}>{t(`help.category.${row.category}`, { defaultValue: row.category })}</td>
                <td data-label={t('help.col.featured')}>{row.featured ? t('help.featured.home') : t('common.dash')}</td>
                <td data-label={t('help.col.sort')}>{row.sort_order}</td>
                <td data-label={t('help.col.status')}>
                  <span className={`status-tag ${row.published ? 'status-active' : 'status-disabled'}`}>
                    {row.published ? t('help.status.published') : t('help.status.unpublished')}
                  </span>
                </td>
                <td className="muted text-sm" data-label={t('help.col.updatedAt')}>{fmtTime(row.updated_at)}</td>
                <td className="table-action-cell" data-label={t('help.col.actions')}>
                  <div className="row gap-sm table-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => edit(row)}>{t('help.action.edit')}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => togglePublished(row)}>{row.published ? t('help.action.unpublish') : t('help.action.publish')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(row)}>{t('help.action.delete')}</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
