import { useEffect, useState } from 'react';
import { api } from '../store/auth';

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtTime(ts: string): string {
  return ts?.slice(0, 16).replace('T', ' ') || '';
}

/** 运营端 · 客户图片（M5）：服务端分页 + 按客户筛选 */
export default function Images() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [clientFilter, setClientFilter] = useState('');
  const [clientOptions, setClientOptions] = useState<{ id: string; name: string }[]>([]);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 24;

  useEffect(() => {
    api.get('/api/ops/images/meta/clients')
      .then(r => setClientOptions(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (clientFilter) params.set('client_id', clientFilter);
        const r = await api.get(`/api/ops/images?${params}`);
        const rows: any[] = r.data.items || [];
        setList(rows);
        setTotal(r.data.total || 0);
        const map: Record<string, string> = {};
        await Promise.all(rows.map(async (img) => {
          try {
            const res = await api.get(`/api/ops/images/${img.id}/file`, { responseType: 'blob' });
            map[img.id] = URL.createObjectURL(new Blob([res.data as any], { type: img.mime_type }));
          } catch { /* 单张失败不影响整体 */ }
        }));
        setThumbs(map);
      } catch { /* 接口异常保持空列表 */ } finally { setLoading(false); }
    })();
  }, [page, clientFilter]);

  return (
    <>
      <div className="page-title">
        <h1>🖼 客户图片</h1>
        <div className="row gap-md">
          <select
            className="form-input"
            style={{ width: 200 }}
            value={clientFilter}
            onChange={e => { setPage(1); setClientFilter(e.target.value); }}
          >
            <option value="">全部客户（{clientOptions.length}）</option>
            {clientOptions.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>图片列表</h3>
          <span className="muted text-sm">共 {total} 张</span>
        </div>

        {loading && <p className="muted">加载中…</p>}
        {!loading && list.length === 0 && <p className="muted">暂无图片，等待客户在工作台上传。</p>}

        {list.length > 0 && (
          <div className="img-grid">
            {list.map((img) => (
              <div
                key={img.id}
                className="img-thumb"
                title={`${img.client_name} · ${img.file_name}`}
                onClick={() => thumbs[img.id] && setPreview({ url: thumbs[img.id], name: `${img.client_name} · ${img.file_name}` })}
              >
                {thumbs[img.id]
                  ? <img src={thumbs[img.id]} alt={img.file_name} />
                  : <span className="muted text-sm">加载中…</span>}
                <span className="img-name">{img.file_name}</span>
                <span className="img-meta">
                  {img.client_name}{img.quote_no ? ` · ${img.quote_no}${img.row_no ? ` · 行 ${img.row_no}` : ''}` : ''} · {fmtSize(img.size_bytes)} · {fmtTime(img.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}

        {total > 0 && (
          <div className="row gap-md" style={{ justifyContent: 'flex-end', alignItems: 'center', marginTop: 12 }}>
            <span className="muted text-sm">第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页</span>
            <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
            <button
              className="btn btn-sm btn-ghost"
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => setPage(p => p + 1)}
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* 点击放大预览 */}
      {preview && (
        <div className="img-preview-mask" onClick={() => setPreview(null)}>
          <div className="img-preview-body" onClick={e => e.stopPropagation()}>
            <div className="row-between mb-8">
              <strong className="text-sm">{preview.name}</strong>
              <button className="btn btn-sm btn-ghost" onClick={() => setPreview(null)}>关闭 ✕</button>
            </div>
            <img src={preview.url} alt={preview.name} />
          </div>
        </div>
      )}
    </>
  );
}
