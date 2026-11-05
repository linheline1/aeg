import { useEffect, useState } from 'react';
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
      // 默认进入「编辑当前启用配置」模式，直接保存即修改生效中的配置
      const active = items.find(p => p.active);
      if (active) {
        setEditingId(active.id);
        setForm({ name: active.name, baseUrl: active.base_url, model: active.model, timeoutMs: active.timeout_ms, apiKey: '' });
      }
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '加载失败'));
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
        flash(`✅ 保存完成，「${payload.name}」已更新${!profiles?.find(p => p.id === editingId)?.active ? '（未启用中，点「使用」切换后生效）' : '并立即生效'}`);
      } else {
        const r = await api.post('/api/admin/ai-config/profiles', payload);
        const created = r.data.profile as Profile;
        flash(created.active
          ? `✅ 保存完成，「${created.name}」已保存并自动启用`
          : `✅ 保存完成，「${created.name}」已保存；在下方列表点「使用」即可切换`);
      }
      setForm({ ...emptyForm });
      setEditingId(null);
      await loadProfiles();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '保存失败'));
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
      flash(`✅ 已切换使用「${p.name}」，AI 功能立即按该配置运行`);
      await loadProfiles();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '切换失败'));
    }
  };

  const removeProfile = async (p: Profile) => {
    if (!window.confirm(`确认删除配置「${p.name}」？该操作不可恢复。`)) return;
    setErr(null); setMsg(null);
    try {
      await api.delete(`/api/admin/ai-config/profiles/${p.id}`);
      if (editingId === p.id) { setEditingId(null); setForm({ ...emptyForm }); }
      flash(`🗑️ 已删除配置「${p.name}」`);
      await loadProfiles();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '删除失败'));
    }
  };

  const runTest = async () => {
    setTestResult(null); setTesting(true);
    try {
      const r = await api.post('/api/admin/ai-config/test');
      const d = r.data;
      setTestResult({ ok: true, text: `连接正常 · 模型 ${d.model} · 耗时 ${d.latency_ms}ms · 回复「${d.reply}」` });
    } catch (e: any) {
      setTestResult({ ok: false, text: getApiErrorMessage(e, '测试失败') });
    } finally { setTesting(false); }
  };

  /** 同步模型列表：用当前表单里的 Base URL + Key（未填新 Key 则用所编辑配置已存密钥）拉取 /models */
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
      flash(`✅ 已同步 ${list.length} 个模型，点「模型名称」输入框即可下拉选择`);
    } catch (e: any) {
      setModels(null);
      setErr(getApiErrorMessage(e, '同步模型失败'));
    } finally { setModelsLoading(false); }
  };

  const editing = profiles?.find(p => p.id === editingId) || null;
  const valid = form.name.trim() && form.baseUrl.trim() && form.model.trim() && (form.timeoutMs >= 1000 && form.timeoutMs <= 600000);

  return (
    <>
      <div className="page-title">
        <h1>模型 API</h1>
        <span className="muted text-sm">维护 AI 服务的接口配置档案 · 可保存多套并随时切换</span>
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
          <h3>{editing ? `✏️ 编辑配置：${editing.name}` : '➕ 新增配置'}</h3>
          {editing?.active && <span className="status-tag status-active">使用中</span>}
        </div>

        {loading ? (
          <p className="muted">加载中…</p>
        ) : (
          <>
            <div className="form-row" style={{ margin: '0 0 14px' }}>
              <label>配置名称</label>
              <input
                className="form-input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="如：生产 Key / 备用线路 / DeepSeek"
                maxLength={60}
              />
              <span className="muted text-sm">用于在下方列表区分不同的 API 配置</span>
            </div>

            <div className="grid-2">
              <div className="form-row" style={{ margin: 0 }}>
                <label>Base URL（接口地址）</label>
                <input
                  className="form-input"
                  value={form.baseUrl}
                  onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                />
                <span className="muted text-sm">任意 OpenAI 兼容服务：OpenAI / DeepSeek / 通义等，以 /v1 结尾</span>
              </div>
              <div className="form-row" style={{ margin: 0 }}>
                <label>模型名称</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    list="ai-model-options"
                    value={form.model}
                    onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                    placeholder="gpt-4o-mini"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ whiteSpace: 'nowrap' }}
                    disabled={modelsLoading || !form.baseUrl.trim()}
                    onClick={syncModels}
                    title="按当前 Base URL + API Key 拉取该服务的可用模型列表"
                  >
                    {modelsLoading ? '同步中…' : '同步模型'}
                  </button>
                </div>
                <datalist id="ai-model-options">
                  {models?.map(m => <option key={m} value={m} />)}
                </datalist>
                <span className="muted text-sm">
                  AI 转换建议 gpt-4o-mini；NCM 识别建议带联网检索的模型
                  {models ? ` · 已同步 ${models.length} 个可选，直接输入也可以` : ''}
                </span>
              </div>
            </div>

            <div className="grid-2 mt-16">
              <div className="form-row" style={{ margin: 0 }}>
                <label>超时时间（毫秒）</label>
                <input
                  className="form-input"
                  type="number"
                  min={1000}
                  max={600000}
                  value={form.timeoutMs}
                  onChange={e => setForm(f => ({ ...f, timeoutMs: Number(e.target.value) }))}
                />
                <span className="muted text-sm">范围 1000–600000，默认 60000</span>
              </div>
              <div className="form-row" style={{ margin: 0 }}>
                <label>
                  API Key{' '}
                  {editing?.has_api_key && <span className="muted text-sm">（当前：{editing.api_key_masked}）</span>}
                </label>
                <input
                  className="form-input"
                  type="password"
                  value={form.apiKey}
                  onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                  placeholder={editing?.has_api_key ? '留空表示保持现有密钥不变' : '请输入该服务的 API Key'}
                  autoComplete="off"
                />
                <span className="muted text-sm">密钥仅存于服务端，管理页不回显明文</span>
              </div>
            </div>

            <div className="row-between mt-16">
              <span className="muted text-sm">
                {editing
                  ? `正在编辑已保存的配置，保存后可继续修改或新增其他配置`
                  : '保存后将出现在下方配置列表中，可随时「使用」或「编辑」'}
              </span>
              <div className="row gap-md">
                <button className="btn btn-ghost" onClick={startCreate} title="清空表单，新增一套配置">＋ 新增配置</button>
                <button
                  className="btn btn-ghost"
                  disabled={testing}
                  onClick={runTest}
                  title="用当前「使用中」的配置发一条最小请求，验证接口是否可用"
                >
                  {testing ? '测试中…' : '🔌 测试连接'}
                </button>
                <button className="btn" disabled={saving || !valid} onClick={save}>
                  {saving ? '保存中…' : editing ? '保存修改' : '保存配置'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h3>🗂️ 配置列表</h3>
          <span className="muted text-sm">点「使用」切换 AI 实际采用的配置，立即生效</span>
        </div>

        {profiles === null && <p className="muted">加载中…</p>}
        {profiles?.length === 0 && <p className="muted">还没有保存的配置，先在上方填写并保存一套</p>}

        {profiles && profiles.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>名称</th>
                  <th>Base URL / 模型</th>
                  <th style={{ width: 110 }}>密钥</th>
                  <th style={{ width: 170 }}>更新</th>
                  <th style={{ width: 200 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(p => (
                  <tr key={p.id} style={p.active ? { background: 'var(--primary-soft)' } : undefined}>
                    <td>
                      <strong>{p.name}</strong>{' '}
                      {p.active && <span className="status-tag status-active">使用中</span>}
                    </td>
                    <td className="text-sm">
                      <div style={{ wordBreak: 'break-all' }}>{p.base_url}</div>
                      <span className="muted">{p.model} · 超时 {p.timeout_ms}ms</span>
                    </td>
                    <td className="text-sm">
                      {p.has_api_key ? <code>{p.api_key_masked}</code> : <span className="status-tag status-failed">未配置</span>}
                    </td>
                    <td className="text-sm muted">
                      {p.updated_by}<br />
                      <span className="text-num">{fmtTime(p.updated_at)}</span>
                    </td>
                    <td>
                      <div className="row gap-sm">
                        {!p.active && (
                          <button className="btn btn-sm" onClick={() => activate(p)}>使用</button>
                        )}
                        <button className="btn btn-sm btn-ghost" onClick={() => startEdit(p)}>编辑</button>
                        {p.active ? (
                          <button className="btn btn-sm btn-danger-ghost" disabled title="使用中的配置不可删除，请先切换到其他配置">删除</button>
                        ) : (
                          <button className="btn btn-sm btn-danger-ghost" onClick={() => removeProfile(p)}>删除</button>
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
          <h3>说明</h3>
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--muted)', fontSize: 13, lineHeight: 1.9 }}>
          <li>支持保存多套 API 配置：保存后出现在「配置列表」，点「使用」切换后立即生效，无需重启服务。</li>
          <li>配置优先级：<strong>使用中的配置</strong> &gt; 环境变量（.env 中的 AI_*）&gt; 内置默认。</li>
          <li>每次新增 / 编辑 / 切换 / 删除都会写入审计日志，可在「审计日志」页追溯。</li>
          <li>该配置同时用于「非标 Excel 的 AI 自动转换」和「DI/NCM 智能归类」两个功能。</li>
          <li>使用中的配置不可删除；「测试连接」仅验证当前使用中的配置。</li>
        </ul>
      </div>
    </>
  );
}
