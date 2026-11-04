import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';

interface AiConfig {
  base_url: string;
  model: string;
  timeout_ms: number;
  has_api_key: boolean;
  api_key_masked: string;
  updated_by: string | null;
  updated_at: string | null;
}

interface GetResponse {
  source: 'db' | 'env' | 'default';
  config: AiConfig;
}

const SOURCE_CN: Record<string, string> = {
  db: '数据库配置',
  env: '环境变量',
  default: '未配置'
};

const SOURCE_TAG: Record<string, string> = {
  db: 'status-active',
  env: 'status-computing',
  default: 'status-disabled'
};

function fmtTime(s?: string | null) {
  return s ? s.slice(0, 19).replace('T', ' ') : '—';
}

export default function AiConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [source, setSource] = useState<'db' | 'env' | 'default'>('default');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(60000);
  const [apiKey, setApiKey] = useState('');
  const [meta, setMeta] = useState<{ has_api_key: boolean; api_key_masked: string; updated_by: string | null; updated_at: string | null }>({
    has_api_key: false, api_key_masked: '', updated_by: null, updated_at: null
  });

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get<GetResponse>('/api/admin/ai-config');
      const c = r.data.config;
      setSource(r.data.source);
      setBaseUrl(c.base_url);
      setModel(c.model);
      setTimeoutMs(c.timeout_ms);
      setMeta({ has_api_key: c.has_api_key, api_key_masked: c.api_key_masked, updated_by: c.updated_by, updated_at: c.updated_at });
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '加载失败'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setErr(null); setMsg(null); setSaving(true);
    try {
      const r = await api.put('/api/admin/ai-config', {
        base_url: baseUrl,
        model,
        timeout_ms: timeoutMs,
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {})
      });
      const c = r.data.config as AiConfig;
      setSource('db');
      setApiKey('');
      setMeta({ has_api_key: c.has_api_key, api_key_masked: c.api_key_masked, updated_by: c.updated_by, updated_at: c.updated_at });
      setMsg('✅ 已保存，AI 功能将立即使用新配置');
      setTimeout(() => setMsg(null), 3000);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '保存失败'));
    } finally { setSaving(false); }
  };

  return (
    <>
      <div className="page-title">
        <h1>模型 API</h1>
        <span className="muted text-sm">维护 AI 服务的接口地址 · 密钥 · 模型 · 超时</span>
      </div>

      {err && <div className="alert alert-err">❌ {err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}

      <div className="card">
        <div className="card-title">
          <h3>🤖 OpenAI 兼容接口配置</h3>
          <span className={`status-tag ${SOURCE_TAG[source] || ''}`}>{SOURCE_CN[source] || source}</span>
        </div>

        {loading ? (
          <p className="muted">加载中…</p>
        ) : (
          <>
            <div className="grid-2">
              <div className="form-row" style={{ margin: 0 }}>
                <label>Base URL（接口地址）</label>
                <input
                  className="form-input"
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
                <span className="muted text-sm">任意 OpenAI 兼容服务：OpenAI / DeepSeek / 通义等，以 /v1 结尾</span>
              </div>
              <div className="form-row" style={{ margin: 0 }}>
                <label>模型名称</label>
                <input
                  className="form-input"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                />
                <span className="muted text-sm">AI 转换建议 gpt-4o-mini；NCM 识别建议带联网检索的模型</span>
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
                  value={timeoutMs}
                  onChange={e => setTimeoutMs(Number(e.target.value))}
                />
                <span className="muted text-sm">范围 1000–600000，默认 60000</span>
              </div>
              <div className="form-row" style={{ margin: 0 }}>
                <label>API Key {meta.has_api_key && <span className="muted text-sm">（当前：{meta.api_key_masked}）</span>}</label>
                <input
                  className="form-input"
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="留空表示保持现有密钥不变"
                  autoComplete="off"
                />
                <span className="muted text-sm">密钥仅存于服务端，管理页不回显明文</span>
              </div>
            </div>

            <div className="row-between mt-16">
              <span className="muted text-sm">
                {meta.updated_by ? `最后更新：${meta.updated_by} · ${fmtTime(meta.updated_at)}` : '尚未保存过数据库配置'}
              </span>
              <button
                className="btn"
                disabled={saving || !baseUrl.trim() || !model.trim() || !(timeoutMs >= 1000 && timeoutMs <= 600000)}
                onClick={save}
              >
                {saving ? '保存中…' : '保存配置'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h3>说明</h3>
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--muted)', fontSize: 13, lineHeight: 1.9 }}>
          <li>配置优先级：<strong>数据库配置</strong> &gt; 环境变量（.env 中的 AI_*）&gt; 内置默认。</li>
          <li>保存后立即生效，无需重启服务；每次变更会写入审计日志。</li>
          <li>该配置同时用于「非标 Excel 的 AI 自动转换」和「DI/NCM 智能归类」两个功能。</li>
          <li>未配置密钥时，AI 转换关闭、NCM 智能归类不可用，不影响标准模板上传。</li>
        </ul>
      </div>
    </>
  );
}
