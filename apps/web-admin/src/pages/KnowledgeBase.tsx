import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';

interface DocView {
  id: string;
  title: string;
  kind: 'price_table' | 'doc';
  tags: string[];
  status: 'active' | 'archived';
  is_current: boolean;
  version: string;
  effective_date: string | null;
  source_file: string | null;
  summary: string;
  content_chars: number;
  chunks: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface SearchHit {
  docId: string; title: string; heading: string; text: string; score: number;
}

interface CurrentTable {
  source: 'knowledge' | 'builtin';
  docId: string | null;
  version: string;
  title: string;
  channels: number;
  effectiveDate: string | null;
}

interface FormState {
  title: string;
  kind: 'price_table' | 'doc';
  tags: string;
  version: string;
  effective_date: string;
  summary: string;
  content: string;
  is_current: boolean;
}

const emptyForm: FormState = {
  title: '', kind: 'doc', tags: '', version: '', effective_date: '',
  summary: '', content: '', is_current: false
};

export default function KnowledgeBase() {
  const { t } = useTranslation();
  const [items, setItems] = useState<DocView[]>([]);
  const [current, setCurrent] = useState<CurrentTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (text: string) => { setMsg(text); window.setTimeout(() => setMsg(''), 4000); };

  const load = async () => {
    setLoading(true);
    try {
      const [list, cur] = await Promise.all([
        api.get<{ items: DocView[]; current: DocView | null }>('/api/admin/knowledge'),
        api.get<CurrentTable>('/api/admin/knowledge/price-table/current')
      ]);
      setItems(list.data.items || []);
      setCurrent(cur.data);
    } catch (e) { setErr(getApiErrorMessage(e, t('kb.loadFailed'))); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = (kind: 'price_table' | 'doc' = 'doc') => {
    setEditingId(null);
    setForm({ ...emptyForm, kind });
    setShowForm(true);
    setPreview(null);
  };

  const openEdit = async (id: string) => {
    try {
      const { data } = await api.get<DocView & { content: string }>(`/api/admin/knowledge/${id}`);
      setEditingId(id);
      setForm({
        title: data.title, kind: data.kind, tags: (data.tags || []).join(', '),
        version: data.version || '', effective_date: data.effective_date || '',
        summary: data.summary || '', content: data.content || '', is_current: !!data.is_current
      });
      setShowForm(true);
      setPreview(null);
    } catch (e) { setErr(getApiErrorMessage(e, t('kb.loadFailed'))); }
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) { setErr(t('kb.form.required')); return; }
    setBusy(true); setErr('');
    try {
      const payload = {
        title: form.title.trim(), kind: form.kind,
        tags: form.tags.split(/[,，]/).map(x => x.trim()).filter(Boolean),
        version: form.version.trim(), effective_date: form.effective_date || null,
        summary: form.summary.trim(), content: form.content,
        is_current: form.kind === 'price_table' && form.is_current
      };
      if (editingId) await api.put(`/api/admin/knowledge/${editingId}`, payload);
      else await api.post('/api/admin/knowledge', payload);
      flash(editingId ? t('kb.msg.updated') : t('kb.msg.created'));
      setShowForm(false);
      await load();
    } catch (e) { setErr(getApiErrorMessage(e, t('kb.msg.saveFailed'))); }
    finally { setBusy(false); }
  };

  const act = async (id: string, action: string, confirmKey?: string) => {
    if (confirmKey && !window.confirm(t(confirmKey))) return;
    setBusy(true); setErr('');
    try {
      if (action === 'delete') await api.delete(`/api/admin/knowledge/${id}`);
      else await api.post(`/api/admin/knowledge/${id}/${action}`);
      flash(t('kb.msg.done'));
      await load();
    } catch (e) { setErr(getApiErrorMessage(e, t('kb.msg.actionFailed'))); }
    finally { setBusy(false); }
  };

  const showPreview = async (id: string) => {
    try {
      const { data } = await api.get<DocView & { content: string }>(`/api/admin/knowledge/${id}`);
      setPreview({ title: data.title, content: data.content });
      setShowForm(false);
    } catch (e) { setErr(getApiErrorMessage(e, t('kb.loadFailed'))); }
  };

  const upload = async (file: File) => {
    setBusy(true); setErr('');
    try {
      const data = new FormData();
      data.append('file', file);
      await api.post('/api/admin/knowledge/upload', data, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
      flash(t('kb.msg.imported'));
      await load();
    } catch (e) { setErr(getApiErrorMessage(e, t('kb.msg.importFailed'))); }
    finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true); setErr('');
    try {
      const { data } = await api.post<{ hits: SearchHit[] }>('/api/admin/knowledge/search', { query, limit: 4 });
      setHits(data.hits || []);
    } catch (e) { setErr(getApiErrorMessage(e, t('kb.msg.searchFailed'))); }
    finally { setBusy(false); }
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  return <>
    <div className="page-title">
      <h1>{t('kb.title')}</h1>
      <span className="muted text-sm">{t('kb.subtitle')}</span>
    </div>

    {err && <div className="alert alert-err">❌ {err}</div>}
    {msg && <div className="alert alert-ok">✅ {msg}</div>}

    <div className="card">
      <div className="card-title"><h3>{t('kb.current.title')}</h3></div>
      {current ? (
        <div className="grid-2">
          <div className="form-row" style={{ margin: 0 }}>
            <span className="muted text-sm">{t('kb.current.source')}</span>
            <strong>{current.source === 'knowledge' ? t('kb.current.fromKnowledge') : t('kb.current.fromBuiltin')}</strong>
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <span className="muted text-sm">{t('kb.current.table')}</span>
            <strong>{current.title} · v{current.version} · {current.channels} {t('kb.current.channels')}</strong>
          </div>
        </div>
      ) : <p className="muted">{t('kb.current.loading')}</p>}
      <p className="muted text-sm" style={{ marginTop: 10 }}>{t('kb.current.hint')}</p>
    </div>

    <div className="card">
      <div className="card-title">
        <h3>{t('kb.tools.title')}</h3>
        <div className="actions">
          <button className="btn btn-sm" disabled={busy} onClick={() => openNew('doc')}>{t('kb.tools.newDoc')}</button>
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => openNew('price_table')}>{t('kb.tools.newTable')}</button>
          <label className="btn btn-sm btn-ghost" style={{ cursor: 'pointer' }}>
            {busy ? t('kb.tools.uploading') : t('kb.tools.upload')}
            <input ref={fileRef} type="file" accept=".xlsx" hidden disabled={busy}
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          </label>
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 12 }}>
        <div className="form-row" style={{ margin: 0 }}>
          <label>{t('kb.tools.searchLabel')}</label>
          <input className="form-input" value={query} onChange={e => setQuery(e.target.value)}
            placeholder={t('kb.tools.searchPlaceholder')}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} />
        </div>
        <div className="form-row" style={{ margin: 0, alignSelf: 'end' }}>
          <button className="btn btn-sm" disabled={busy || !query.trim()} onClick={search}>{t('kb.tools.searchButton')}</button>
          <span className="muted text-sm">{t('kb.tools.searchHint')}</span>
        </div>
      </div>
      {hits && <div style={{ marginTop: 12 }}>
        <strong>{t('kb.tools.hits', { count: hits.length })}</strong>
        {hits.length === 0 && <p className="muted text-sm">{t('kb.tools.noHits')}</p>}
        {hits.map((hit, i) => (
          <div key={`${hit.docId}-${i}`} className="card" style={{ marginTop: 8, padding: 10 }}>
            <strong>#{i + 1} {hit.title} / {hit.heading}</strong>
            <span className="muted text-sm" style={{ marginLeft: 8 }}>score {hit.score}</span>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 140, overflow: 'auto', margin: '6px 0 0' }}>{hit.text}</pre>
          </div>
        ))}
      </div>}
    </div>

    {showForm && <div className="card">
      <div className="card-title">
        <h3>{editingId ? t('kb.form.editTitle') : t('kb.form.newTitle')}</h3>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowForm(false)}>{t('kb.form.cancel')}</button>
      </div>
      <div className="grid-2">
        <div className="form-row"><label>{t('kb.form.title')}</label>
          <input className="form-input" value={form.title} onChange={e => setField('title', e.target.value)} maxLength={200} /></div>
        <div className="form-row"><label>{t('kb.form.kind')}</label>
          <select className="form-input" value={form.kind} onChange={e => setField('kind', e.target.value as FormState['kind'])}>
            <option value="doc">{t('kb.kind.doc')}</option>
            <option value="price_table">{t('kb.kind.priceTable')}</option>
          </select></div>
        <div className="form-row"><label>{t('kb.form.tags')}</label>
          <input className="form-input" value={form.tags} onChange={e => setField('tags', e.target.value)} placeholder={t('kb.form.tagsHint')} /></div>
        <div className="form-row"><label>{t('kb.form.version')}</label>
          <input className="form-input" value={form.version} onChange={e => setField('version', e.target.value)} placeholder="20260924" /></div>
        <div className="form-row"><label>{t('kb.form.effectiveDate')}</label>
          <input className="form-input" value={form.effective_date} onChange={e => setField('effective_date', e.target.value)} placeholder="2026-09-01" /></div>
        <div className="form-row"><label>{t('kb.form.summary')}</label>
          <input className="form-input" value={form.summary} onChange={e => setField('summary', e.target.value)} maxLength={500} /></div>
      </div>
      <div className="form-row" style={{ marginTop: 10 }}>
        <label>{form.kind === 'price_table' ? t('kb.form.contentJson') : t('kb.form.contentMarkdown')}</label>
        <textarea className="form-input" rows={10} value={form.content} onChange={e => setField('content', e.target.value)}
          style={{ fontFamily: 'monospace', fontSize: 12 }} />
      </div>
      {form.kind === 'price_table' && <label className="text-sm" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input type="checkbox" checked={form.is_current} onChange={e => setField('is_current', e.target.checked)} />
        {t('kb.form.setCurrent')}
      </label>}
      <div className="actions" style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy} onClick={save}>{t('kb.form.save')}</button>
        <button className="btn btn-ghost" onClick={() => setShowForm(false)}>{t('kb.form.cancel')}</button>
      </div>
    </div>}

    {preview && <div className="card">
      <div className="card-title">
        <h3>{t('kb.preview.title')} · {preview.title}</h3>
        <button className="btn btn-sm btn-ghost" onClick={() => setPreview(null)}>{t('kb.form.cancel')}</button>
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 360, overflow: 'auto' }}>{preview.content.slice(0, 6000)}</pre>
      {preview.content.length > 6000 && <p className="muted text-sm">{t('kb.preview.truncated')}</p>}
    </div>}

    <div className="card">
      <div className="card-title"><h3>{t('kb.list.title')}</h3><span className="muted text-sm">{t('kb.list.count', { count: items.length })}</span></div>
      {loading ? <p className="muted">{t('kb.list.loading')}</p> : (
        <div className="table-wrap responsive-table"><table className="table">
          <thead><tr>
            <th>{t('kb.col.title')}</th><th>{t('kb.col.kind')}</th><th>{t('kb.col.version')}</th>
            <th>{t('kb.col.chunks')}</th><th>{t('kb.col.status')}</th><th>{t('kb.col.updatedAt')}</th>
            <th>{t('kb.col.actions')}</th>
          </tr></thead>
          <tbody>{items.map(row => (
            <tr key={row.id}>
              <td data-label={t('kb.col.title')}>
                <strong>{row.title}</strong>
                <span className="sub">{row.summary || row.source_file || ''}</span>
                {row.is_current && <span className="status-tag status-active" style={{ marginLeft: 6 }}>{t('kb.list.currentTag')}</span>}
              </td>
              <td data-label={t('kb.col.kind')}>{row.kind === 'price_table' ? t('kb.kind.priceTable') : t('kb.kind.doc')}</td>
              <td data-label={t('kb.col.version')}>{row.version || '—'}</td>
              <td data-label={t('kb.col.chunks')} className="num">{row.chunks}</td>
              <td data-label={t('kb.col.status')}>{row.status === 'active' ? t('kb.status.active') : t('kb.status.archived')}</td>
              <td data-label={t('kb.col.updatedAt')}>{row.updated_at.slice(0, 16).replace('T', ' ')}</td>
              <td data-label={t('kb.col.actions')}>
                <div className="actions">
                  <button className="btn btn-sm btn-link" onClick={() => showPreview(row.id)}>{t('kb.action.preview')}</button>
                  <button className="btn btn-sm btn-link" onClick={() => openEdit(row.id)}>{t('kb.action.edit')}</button>
                  {row.kind === 'price_table' && !row.is_current && row.status === 'active' &&
                    <button className="btn btn-sm btn-link" disabled={busy} onClick={() => act(row.id, 'set-current')}>{t('kb.action.setCurrent')}</button>}
                  {row.status === 'active'
                    ? <button className="btn btn-sm btn-link" disabled={busy} onClick={() => act(row.id, 'archive')}>{t('kb.action.archive')}</button>
                    : <button className="btn btn-sm btn-link" disabled={busy} onClick={() => act(row.id, 'restore')}>{t('kb.action.restore')}</button>}
                  <button className="btn btn-sm btn-link danger" disabled={busy}
                    onClick={() => act(row.id, 'delete', 'kb.action.deleteConfirm')}>{t('kb.action.delete')}</button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  </>;
}
