import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';

interface Profile {
  id: string;
  name: string;
  base_url: string;
  model: string;
  timeout_ms: number;
  active: boolean;
  has_api_key: boolean;
  api_key_masked: string;
  updated_by: string;
  updated_at: string;
}

function fmtTime(s?: string | null) {
  return s ? s.slice(0, 19).replace('T', ' ') : '—';
}

const emptyForm = { name: '', baseUrl: '', model: '', timeoutMs: 60000, apiKey: '' };

export default function AiConfigPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);

  const loadProfiles = async () => {
    const r = await api.get<{ items: Profile[] }>('/api/admin/ai-config/profiles');
    setProfiles(r.data.items);
    return r.data.items;
  };

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const items = await loadProfiles();
      const active = items.find(p => p.active);
      if (active) {
        setEditingId(active.id);
        setForm({ name: active.name, baseUrl: active.base_url, model: active.model, timeoutMs: active.timeout_ms, apiKey: '' });
      }
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('aiConfig.err.loadFail')));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 5000);
  };

  const save = async () => {
    setErr(null); setMsg(null); setSaving(true);
    const payload = {
      name: form.name.trim(),
      base_url: form.baseUrl,
      model: form.model,
      timeout_ms: form.timeoutMs,
      ...(form.apiKey.trim() ? { api_key: form.apiKey.trim() } : {})
    };
    try {
      if (editingId) {
        await api.put(`/api/admin/ai-config/profiles/${editingId}`, payload);
        const wasActive = !!profiles?.find(p => p.id === editingId)?.active;
        flash(wasActive
          ? t('aiConfig.flash.savedEditActive', { name: payload.name })
          : t('aiConfig.flash.savedEditInactive', { name: payload.name }));
      } else {
        const r = await api.post('/api/admin/ai-config/profiles', payload);
        const created = r.data.profile as Profile;
        flash(created.active
          ? t('aiConfig.flash.savedNewActive', { name: created.name })
          : t('aiConfig.flash.savedNewInactive', { name: created.name }));
      }
      setForm({ ...emptyForm });
      setEditingId(null);
      await loadProfiles();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('aiConfig.err.saveFail')));
    } finally { setSaving(false); }
  };

  const startEdit = (p: Profile) => {
    setErr(null); setMsg(null); setTestResult(null);
    setEditingId(p.id);
    setForm({ name: p.name, baseUrl: p.base_url, model: p.model, timeoutMs: p.timeout_ms, apiKey: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startCreate = () => {
    setErr(null); setMsg(null); setTestResult(null);
    setEditingId(null);
    setForm({ ...emptyForm });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activate = async (p: Profile) => {
    setErr(null); setMsg(null);
    try {
      await api.post(`/api/admin/ai-config/profiles/${p.id}/activate`);
      flash(t('aiConfig.flash.activated', { name: p.name }));
      await loadProfiles();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('aiConfig.err.activateFail')));
    }
  };

  const removeProfile = async (p: Profile) => {
    if (!window.confirm(t('aiConfig.confirm.delete', { name: p.name }))) return;
    setErr(null); setMsg(null);
    try {
      await api.delete(`/api/admin/ai-config/profiles/${p.id}`);
      if (editingId === p.id) { setEditingId(null); setForm({ ...emptyForm }); }
      flash(`🗑️ ${t('aiConfig.flash.deleted', { name: p.name }).replace('🗑️ ', '')}`);
      await loadProfiles();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('aiConfig.err.deleteFail')));
    }
  };

  const runTest = async () => {
    setTestResult(null); setTesting(true);
    try {
      const r = await api.post('/api/admin/ai-config/test');
      const d = r.data;
      setTestResult({ ok: true, text: t('aiConfig.form.testOk', { model: d.model, latency: d.latency_ms, reply: d.reply }) });
    } catch (e: any) {
      setTestResult({ ok: false, text: getApiErrorMessage(e, t('aiConfig.form.testFail')) });
    } finally { setTesting(false); }
  };

  const syncModels = async () => {
    setErr(null); setMsg(null); setModelsLoading(true);
    try {
      const r = await api.post('/api/admin/ai-config/models', {
        base_url: form.baseUrl,
        api_key: form.apiKey.trim() || undefined,
        profile_id: editingId || undefined
      });
      const list = (r.data.models || []) as string[];
      setModels(list);
      flash(t('aiConfig.flash.syncedModels', { n: list.length }));
    } catch (e: any) {
      setModels(null);
      setErr(getApiErrorMessage(e, t('aiConfig.err.syncFail')));
    } finally { setModelsLoading(false); }
  };

  const editing = profiles?.find(p => p.id === editingId) || null;
  const valid = form.name.trim() && form.baseUrl.trim() && form.model.trim() && (form.timeoutMs >= 1000 && form.timeoutMs <= 600000);

  return (
    <>
      <div className="page-title">
        <h1>{t('aiConfig.title')}</h1>
        <span className="muted text-sm">{t('aiConfig.subtitle')}</span>
      </div>

      {err && <div className="alert alert-err">❌ {err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}
      {testResult && (
        <div className={`alert ${testResult.ok ? 'alert-ok' : 'alert-err'}`}>
          {testResult.ok ? `✅ ${testResult.text}` : `❌ ${testResult.text}`}
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <h3>{editing ? t('aiConfig.form.editTitle', { name: editing.name }) : t('aiConfig.form.newTitle')}</h3>
          {editing?.active && <span className="status-tag status-active">{t('aiConfig.form.activeTag')}</span>}
        </div>

        {loading ? (
          <p className="muted">{t('aiConfig.list.loading')}</p>
        ) : (
          <>
            <div className="form-row" style={{ margin: '0 0 14px' }}>
              <label>{t('aiConfig.form.nameLabel')}</label>
              <input
                className="form-input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('aiConfig.form.namePlaceholder')}
                maxLength={60}
              />
              <span className="muted text-sm">{t('aiConfig.form.nameHint')}</span>
            </div>

            <div className="grid-2">
              <div className="form-row" style={{ margin: 0 }}>
                <label>{t('aiConfig.form.baseUrlLabel')}</label>
                <input
                  className="form-input"
                  value={form.baseUrl}
                  onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                  placeholder={t('aiConfig.form.baseUrlPlaceholder')}
                />
                <span className="muted text-sm">{t('aiConfig.form.baseUrlHint')}</span>
              </div>
              <div className="form-row" style={{ margin: 0 }}>
                <label>{t('aiConfig.form.modelLabel')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    list="ai-model-options"
                    value={form.model}
                    onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                    placeholder={t('aiConfig.form.modelPlaceholder')}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ whiteSpace: 'nowrap' }}
                    disabled={modelsLoading || !form.baseUrl.trim()}
                    onClick={syncModels}
                    title={t('aiConfig.form.modelSyncTitle')}
                  >
                    {modelsLoading ? t('aiConfig.form.modelSyncing') : t('aiConfig.form.modelSync')}
                  </button>
                </div>
                <datalist id="ai-model-options">
                  {models?.map(m => <option key={m} value={m} />)}
                </datalist>
                <span className="muted text-sm">
                  {t('aiConfig.form.modelHint')}
                  {models ? t('aiConfig.form.modelSyncedCount', { n: models.length }) : ''}
                </span>
              </div>
            </div>

            <div className="grid-2 mt-16">
              <div className="form-row" style={{ margin: 0 }}>
                <label>{t('aiConfig.form.timeoutLabel')}</label>
                <input
                  className="form-input"
                  type="number"
                  min={1000}
                  max={600000}
                  value={form.timeoutMs}
                  onChange={e => setForm(f => ({ ...f, timeoutMs: Number(e.target.value) }))}
                />
                <span className="muted text-sm">{t('aiConfig.form.timeoutHint')}</span>
              </div>
              <div className="form-row" style={{ margin: 0 }}>
                <label>
                  API Key{' '}
                  {editing?.has_api_key && <span className="muted text-sm">{t('aiConfig.form.apiKeyCurrent', { masked: editing.api_key_masked })}</span>}
                </label>
                <input
                  className="form-input"
                  type="password"
                  value={form.apiKey}
                  onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                  placeholder={editing?.has_api_key ? t('aiConfig.form.apiKeyPlaceholderKeep') : t('aiConfig.form.apiKeyPlaceholderNew')}
                  autoComplete="off"
                />
                <span className="muted text-sm">{t('aiConfig.form.apiKeyHint')}</span>
              </div>
            </div>

            <div className="row-between mt-16">
              <span className="muted text-sm">
                {editing ? t('aiConfig.form.editingHint') : t('aiConfig.form.saveHint')}
              </span>
              <div className="row gap-md">
                <button className="btn btn-ghost" onClick={startCreate} title={t('aiConfig.form.startNewTitle')}>{t('aiConfig.form.startNew')}</button>
                <button
                  className="btn btn-ghost"
                  disabled={testing}
                  onClick={runTest}
                  title={t('aiConfig.form.testTitle')}
                >
                  {testing ? t('aiConfig.form.testing') : t('aiConfig.form.test')}
                </button>
                <button className="btn" disabled={saving || !valid} onClick={save}>
                  {saving ? t('aiConfig.form.saving') : editing ? t('aiConfig.form.saveEdit') : t('aiConfig.form.saveNew')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h3>{t('aiConfig.list.title')}</h3>
          <span className="muted text-sm">{t('aiConfig.list.hint')}</span>
        </div>

        {profiles === null && <p className="muted">{t('aiConfig.list.loading')}</p>}
        {profiles?.length === 0 && <p className="muted">{t('aiConfig.list.empty')}</p>}

        {profiles && profiles.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>{t('aiConfig.col.name')}</th>
                  <th>{t('aiConfig.col.baseModel')}</th>
                  <th style={{ width: 110 }}>{t('aiConfig.col.apiKey')}</th>
                  <th style={{ width: 170 }}>{t('aiConfig.col.updated')}</th>
                  <th style={{ width: 200 }}>{t('aiConfig.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(p => (
                  <tr key={p.id} style={p.active ? { background: 'var(--primary-soft)' } : undefined}>
                    <td>
                      <strong>{p.name}</strong>{' '}
                      {p.active && <span className="status-tag status-active">{t('aiConfig.form.activeTag')}</span>}
                    </td>
                    <td className="text-sm">
                      <div style={{ wordBreak: 'break-all' }}>{p.base_url}</div>
                      <span className="muted">{p.model} · {t('aiConfig.form.timeoutLabel')} {p.timeout_ms}ms</span>
                    </td>
                    <td className="text-sm">
                      {p.has_api_key ? <code>{p.api_key_masked}</code> : <span className="status-tag status-failed">{t('aiConfig.col.apiKeyEmpty')}</span>}
                    </td>
                    <td className="text-sm muted">
                      {p.updated_by}<br />
                      <span className="text-num">{fmtTime(p.updated_at)}</span>
                    </td>
                    <td>
                      <div className="row gap-sm">
                        {!p.active && (
                          <button className="btn btn-sm" onClick={() => activate(p)}>{t('aiConfig.action.use')}</button>
                        )}
                        <button className="btn btn-sm btn-ghost" onClick={() => startEdit(p)}>{t('aiConfig.action.edit')}</button>
                        {p.active ? (
                          <button className="btn btn-sm btn-danger-ghost" disabled title={t('aiConfig.action.deleteActiveTitle')}>{t('aiConfig.action.delete')}</button>
                        ) : (
                          <button className="btn btn-sm btn-danger-ghost" onClick={() => removeProfile(p)}>{t('aiConfig.action.delete')}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h3>{t('aiConfig.note.title')}</h3>
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--muted)', fontSize: 13, lineHeight: 1.9 }}>
          <li>{t('aiConfig.note.l1')}</li>
          <li dangerouslySetInnerHTML={{ __html: t('aiConfig.note.l2') }} />
          <li>{t('aiConfig.note.l3')}</li>
          <li>{t('aiConfig.note.l4')}</li>
          <li>{t('aiConfig.note.l5')}</li>
        </ul>
      </div>
    </>
  );
}
