import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';

interface ProductRow {
  id: string;
  sku: string;
  product_cn: string;
  product_en: string;
  base_unit_price_rmb: number | null;
  ncm: string | null;
  ncm_reviewed_at: string | null;
  image_ids: string[];
  updated_at: string;
}

interface ProductListResponse {
  items: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface ProductDraft {
  product_cn: string;
  product_en: string;
  base_unit_price_rmb: string;
  ncm: string;
}

const PAGE_SIZE = 20;

const draftOf = (row: ProductRow): ProductDraft => ({
  product_cn: row.product_cn || '',
  product_en: row.product_en || '',
  base_unit_price_rmb: row.base_unit_price_rmb?.toString() || '',
  ncm: row.ncm || ''
});

const fmtTime = (value: string | null) => value?.slice(0, 16).replace('T', ' ') || '—';
const fmtPrice = (value: number | null) => value == null
  ? '—'
  : `¥ ${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Products() {
  const { t } = useTranslation();
  const [items, setItems] = useState<ProductRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    setItems(null);
    setEditingId(null);
    setDraft(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (q) params.set('q', q);
      const response = await api.get<ProductListResponse>(`/api/ops/products?${params}`);
      if (requestId.current !== currentRequest) return;
      setItems(response.data.items || []);
      setTotal(response.data.total || 0);
    } catch (e) {
      if (requestId.current === currentRequest) {
        setError(getApiErrorMessage(e, t('products.loadError')));
      }
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [page, q, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { requestId.current += 1; }, []);

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];
    const imageIds = Array.from(new Set((items || []).flatMap(item => item.image_ids || [])));
    setThumbs({});
    setPreview(null);

    void Promise.all(imageIds.map(async imageId => {
      try {
        const response = await api.get<Blob>(`/api/ops/images/${imageId}/file`, { responseType: 'blob' });
        const url = URL.createObjectURL(response.data);
        createdUrls.push(url);
        return [imageId, url] as const;
      } catch {
        return [imageId, null] as const;
      }
    })).then(entries => {
      if (cancelled) {
        createdUrls.forEach(url => URL.revokeObjectURL(url));
        return;
      }
      setThumbs(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
      createdUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [items]);

  useEffect(() => {
    if (!preview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [preview]);

  const startEdit = (row: ProductRow) => {
    setError(null);
    setMessage(null);
    setEditingId(row.id);
    setDraft(draftOf(row));
  };

  const cancelEdit = () => {
    if (savingId) return;
    setEditingId(null);
    setDraft(null);
    setError(null);
  };

  const save = async (row: ProductRow) => {
    if (!draft) return;
    const priceText = draft.base_unit_price_rmb.trim();
    const ncm = draft.ncm.trim();
    const price = priceText ? Number(priceText) : null;
    if (price != null && (!Number.isFinite(price) || price <= 0)) {
      setError(t('products.invalidPrice'));
      return;
    }
    if (ncm && !/^\d{8}$/.test(ncm)) {
      setError(t('products.invalidNcm'));
      return;
    }

    setSavingId(row.id);
    setError(null);
    setMessage(null);
    try {
      const response = await api.patch<ProductRow>(`/api/ops/products/${row.id}`, {
        product_cn: draft.product_cn.trim(),
        product_en: draft.product_en.trim(),
        base_unit_price_rmb: price,
        ncm: ncm || null
      });
      setItems(current => current?.map(item => item.id === row.id ? response.data : item) || null);
      setEditingId(null);
      setDraft(null);
      setMessage(t('products.saved', { sku: response.data.sku || row.sku }));
    } catch (e) {
      setError(getApiErrorMessage(e, t('products.saveError')));
    } finally {
      setSavingId(null);
    }
  };

  const sync = async () => {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      await api.post('/api/ops/products/sync');
      setMessage(t('products.syncSuccess'));
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, t('products.syncError')));
    } finally {
      setSyncing(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="page-title">
        <div>
          <h1>{t('products.title')}</h1>
          <p className="sub">{t('products.subtitle')}</p>
        </div>
        <button className="btn btn-ghost" type="button" disabled={syncing} onClick={() => void sync()}>
          {syncing ? t('products.syncing') : t('products.sync')}
        </button>
      </div>

      {error && <div className="alert alert-err" role="alert">{error}</div>}
      {message && <div className="alert alert-ok" role="status">{message}</div>}

      <div className="card" style={{ marginBottom: 12, padding: 12 }}>
        <form
          className="row gap-md"
          style={{ flexWrap: 'wrap', alignItems: 'center' }}
          onSubmit={event => {
            event.preventDefault();
            setPage(1);
            setQ(keyword.trim());
          }}
        >
          <input
            className="form-input form-input-sm"
            style={{ flex: 1, minWidth: 220, maxWidth: 420 }}
            aria-label={t('products.searchLabel')}
            placeholder={t('products.searchPlaceholder')}
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
          />
          <button className="btn btn-sm" type="submit" disabled={loading}>{t('common.search')}</button>
          {q && (
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              onClick={() => { setKeyword(''); setPage(1); setQ(''); }}
            >
              {t('products.clear')}
            </button>
          )}
          <span className="muted text-sm">{t('products.count', { count: total })}</span>
        </form>
      </div>

      {loading && <div className="card"><p className="muted">{t('products.loading')}</p></div>}

      {!loading && items === null && (
        <div className="card">
          <p className="muted">{t('products.loadRetryHint')}</p>
          <button className="btn btn-sm btn-ghost" type="button" onClick={() => void load()}>{t('products.reload')}</button>
        </div>
      )}

      {!loading && items?.length === 0 && (
        <div className="card">
          <p className="muted">{q ? t('products.noResults') : t('products.empty')}</p>
        </div>
      )}

      {!loading && items && items.length > 0 && (
        <div className="card table-wrap products-table-wrap">
          <table className="table products-table">
            <thead>
              <tr>
                <th>{t('products.image')}</th>
                <th>SKU</th>
                <th>{t('products.name')}</th>
                <th className="amt">{t('products.basePrice')}</th>
                <th>NCM</th>
                <th>{t('products.reviewStatus')}</th>
                <th>{t('products.updatedAt')}</th>
                <th className="actions-col">{t('products.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(row => {
                const editing = editingId === row.id && draft;
                const saving = savingId === row.id;
                return (
                  <tr key={row.id} className={editing || saving ? 'row-editing' : ''}>
                    <td data-label={t('products.image')}>
                      {row.image_ids.length > 0 ? (
                        <div className="product-image-list">
                          {row.image_ids.map(imageId => {
                            const url = thumbs[imageId];
                            const name = `${row.sku} · ${row.product_cn || row.product_en || t('products.productImage')}`;
                            return url ? (
                              <button
                                className="product-image-btn"
                                type="button"
                                key={imageId}
                                aria-label={t('products.preview', { name })}
                                onClick={() => setPreview({ url, name })}
                              >
                                <img src={url} alt={name} />
                              </button>
                            ) : (
                              <span className="product-image-placeholder muted" key={imageId}>
                                {url === null ? t('products.imageFailed') : t('products.imageLoading')}
                              </span>
                            );
                          })}
                        </div>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td data-label="SKU"><strong>{row.sku}</strong></td>
                    <td data-label={t('products.name')} className="product-name-cell">
                      {editing ? (
                        <div className="product-edit-names">
                          <input
                            className="form-input form-input-sm"
                            aria-label={t('products.cnNameLabel', { sku: row.sku })}
                            placeholder={t('products.cnName')}
                            value={draft.product_cn}
                            disabled={saving}
                            onChange={event => setDraft({ ...draft, product_cn: event.target.value })}
                          />
                          <input
                            className="form-input form-input-sm"
                            aria-label={t('products.enNameLabel', { sku: row.sku })}
                            placeholder={t('products.enName')}
                            value={draft.product_en}
                            disabled={saving}
                            onChange={event => setDraft({ ...draft, product_en: event.target.value })}
                          />
                        </div>
                      ) : (
                        <>
                          <div>{row.product_cn || '—'}</div>
                          <div className="muted text-sm">{row.product_en || '—'}</div>
                        </>
                      )}
                    </td>
                    <td data-label={t('products.basePrice')} className="amt">
                      {editing ? (
                        <input
                          className="form-input form-input-sm product-price-input"
                          type="number"
                          min="0"
                          step="0.01"
                          aria-label={t('products.priceLabel', { sku: row.sku })}
                          placeholder={t('products.optional')}
                          value={draft.base_unit_price_rmb}
                          disabled={saving}
                          onChange={event => setDraft({ ...draft, base_unit_price_rmb: event.target.value })}
                        />
                      ) : fmtPrice(row.base_unit_price_rmb)}
                    </td>
                    <td data-label="NCM">
                      {editing ? (
                        <input
                          className="form-input form-input-sm product-ncm-input"
                          inputMode="numeric"
                          maxLength={8}
                          aria-label={`${row.sku} NCM`}
                          placeholder={t('products.ncmPlaceholder')}
                          value={draft.ncm}
                          disabled={saving}
                          onChange={event => setDraft({ ...draft, ncm: event.target.value })}
                        />
                      ) : (row.ncm ? <code>{row.ncm}</code> : <span className="muted">—</span>)}
                    </td>
                    <td data-label={t('products.reviewStatus')}>
                      <span className={`deal-tag ${row.ncm_reviewed_at ? 'deal-won' : 'deal-none'}`}>
                        {row.ncm_reviewed_at ? t('products.reviewed') : t('products.pendingReview')}
                      </span>
                      {row.ncm_reviewed_at && (
                        <div className="muted product-review-time">{fmtTime(row.ncm_reviewed_at)}</div>
                      )}
                    </td>
                    <td data-label={t('products.updatedAt')} className="muted text-sm">{fmtTime(row.updated_at)}</td>
                    <td data-label={t('products.actions')} className="actions-col">
                      {editing ? (
                        <div className="row gap-sm">
                          <button className="btn btn-sm" type="button" disabled={saving} onClick={() => void save(row)}>
                            {saving ? t('common.saving') : t('common.save')}
                          </button>
                          <button className="btn btn-sm btn-ghost" type="button" disabled={saving} onClick={cancelEdit}>{t('common.cancel')}</button>
                        </div>
                      ) : (
                        <button
                          className="btn btn-sm btn-ghost"
                          type="button"
                          disabled={savingId !== null || syncing}
                          onClick={() => startEdit(row)}
                        >
                          {t('common.edit')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {items && total > 0 && (
        <div className="row gap-md pagination" style={{ justifyContent: 'flex-end', alignItems: 'center', marginTop: 12 }}>
          <span className="muted text-sm">{t('products.page', { page, pageCount })}</span>
          <button
            className="btn btn-sm btn-ghost"
            type="button"
            disabled={loading || page <= 1}
            onClick={() => setPage(current => current - 1)}
          >
            {t('products.previous')}
          </button>
          <button
            className="btn btn-sm btn-ghost"
            type="button"
            disabled={loading || page >= pageCount}
            onClick={() => setPage(current => current + 1)}
          >
            {t('products.next')}
          </button>
        </div>
      )}

      {preview && (
        <div className="img-preview-mask" onClick={() => setPreview(null)}>
          <div
            className="img-preview-body"
            role="dialog"
            aria-modal="true"
            aria-label={preview.name}
            onClick={event => event.stopPropagation()}
          >
            <div className="row-between mb-8">
              <strong className="text-sm">{preview.name}</strong>
              <button className="btn btn-sm btn-ghost" type="button" autoFocus onClick={() => setPreview(null)}>{t('products.close')} ✕</button>
            </div>
            <img src={preview.url} alt={preview.name} />
          </div>
        </div>
      )}
    </>
  );
}
