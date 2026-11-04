import { useEffect, useState } from 'react';
import { downloadOrShareFile } from '@aeg/web-shared/file-actions';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';

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
  const [info, setInfo] = useState<TemplateInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dlLoading, setDlLoading] = useState(false);
  const [dlMsg, setDlMsg] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/client/template/current')
      .then(r => setInfo(r.data))
      .catch(e => setErr(getApiErrorMessage(e, '加载失败')));
  }, []);

  const download = async () => {
    if (!info) return;
    setDlLoading(true);
    setDlMsg(null);
    try {
      const r = await api.get(info.download_url, { responseType: 'blob' });
      await downloadOrShareFile(new Blob([r.data as any]), `巴西整柜装箱清单_模板_v${info.version_no}.xlsx`);
      setDlMsg('✅ 下载完成');
      setTimeout(() => setDlMsg(null), 3000);
    } catch (e: any) {
      setDlMsg('❌ ' + getApiErrorMessage(e, '下载失败'));
    } finally {
      setDlLoading(false);
    }
  };

  if (err) {
    return <div className="card"><p style={{ color: 'var(--err)' }}>模板信息加载失败：{err}</p></div>;
  }
  if (!info) {
    return <div className="card"><p className="muted">加载中…</p></div>;
  }

  return (
    <>
      <div className="page-title">
        <h1>模板预览</h1>
        <span className="muted text-sm">当前启用版本 · 客户上传清单使用此模板</span>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <div className="card-title">
          <h3>{info.template_code} · v{info.version_no}</h3>
          <div className="actions">
            <button className="btn" onClick={download} disabled={dlLoading}>
              {dlLoading ? '下载中…' : '⬇ 下载模板'}
            </button>
          </div>
        </div>

        <table className="table" style={{ marginTop: 12 }}>
          <tbody>
            <tr><td style={{ width: 140 }} className="muted">状态</td><td><span className="status-done">启用中</span></td></tr>
            <tr><td className="muted">发布/更新时间</td><td>{new Date(info.updated_at).toLocaleString('zh-CN')}</td></tr>
            <tr><td className="muted">数据起始行</td><td>第 {info.data_start_row} 行起</td></tr>
            <tr><td className="muted">行数上限</td><td>{info.max_rows} 行</td></tr>
            <tr><td className="muted">字段列数</td><td>{info.field_count} 列（A–AA）</td></tr>
            <tr><td className="muted">填写说明</td><td>{info.description}</td></tr>
          </tbody>
        </table>

        {dlMsg && <p className="muted" style={{ marginTop: 12 }}>{dlMsg}</p>}
      </div>
    </>
  );
}
