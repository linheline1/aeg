import { useEffect, useRef, useState, type FormEvent } from 'react';
import { isAxiosError, type AxiosInstance } from 'axios';
import { downloadOrShareFile } from './file-actions';
import './order-documents.css';

const types = ['commercial_invoice', 'packing_list', 'bill_of_lading', 'certificate_of_origin', 'other'] as const;
type DocumentType = typeof types[number];
type ReviewStatus = 'approved' | 'rejected';
type Status = 'missing' | 'submitted' | ReviewStatus;
type Version = {
  id: string; file_name: string; submitted_at: string;
  review?: { status: ReviewStatus; reason: string | null; at: string };
};
type DocumentRequest = {
  id: string; type: DocumentType; title: string | null; instructions: string | null;
  status: Status; revision: number; versions: Version[];
};
const labels = {
  zh: {
    title: '单证清单', commercial_invoice: '商业发票', packing_list: '装箱清单', bill_of_lading: '提单',
    certificate_of_origin: '原产地证书', other: '其他单证',
    missing: '待提交', submitted: '待审核', approved: '已通过', rejected: '退回补交',
    empty: '当前订单暂无单证要求。', add: '添加单证要求', type: '单证类型', name: '单证名称',
    instructions: '给客户的说明（选填）', request: '发送要求', file: '选择单证文件',
    format: 'PDF、XLSX、JPEG 或 PNG，单个文件最大 10 MB。',
    upload: '提交单证', replace: '补交单证', download: '下载', history: '历史版本',
    reason: '退回原因（必填，客户可见）', approve: '审核通过', reject: '退回补交',
    cancel: '取消', loading: '正在加载单证…', working: '正在处理…', saved: '已保存。',
    loadError: '无法读取单证清单。', actionError: '操作失败，请重试。', refresh: '刷新清单',
    conflict: '单证或订单已更新，请重新加载后再操作。', retry: '重新加载',
    invalidFile: '请选择有效格式的文件，文件不得超过 10 MB。'
  },
  pt: {
    title: 'Documentos da operação', commercial_invoice: 'Fatura comercial', packing_list: 'Lista de embalagem',
    bill_of_lading: 'Conhecimento de embarque', certificate_of_origin: 'Certificado de origem', other: 'Outro documento',
    missing: 'Pendente de envio', submitted: 'Em análise', approved: 'Aprovado', rejected: 'Reenvio solicitado',
    empty: 'Nenhum documento foi solicitado para este pedido.', add: 'Solicitar documento', type: 'Tipo de documento',
    name: 'Nome do documento', instructions: 'Instruções ao cliente (opcional)', request: 'Enviar solicitação',
    file: 'Selecionar o documento', format: 'PDF, XLSX, JPEG ou PNG, com até 10 MB por arquivo.',
    upload: 'Enviar documento', replace: 'Reenviar documento', download: 'Baixar', history: 'Versões anteriores',
    reason: 'Motivo da devolução (obrigatório e visível ao cliente)', approve: 'Aprovar', reject: 'Solicitar reenvio',
    cancel: 'Cancelar', loading: 'Carregando documentos…', working: 'Processando…', saved: 'Alterações salvas.',
    loadError: 'Não foi possível carregar os documentos.', actionError: 'Falha na operação. Tente novamente.', refresh: 'Atualizar lista',
    conflict: 'O documento ou pedido foi atualizado. Recarregue para continuar.', retry: 'Recarregar',
    invalidFile: 'Selecione um arquivo de formato válido com até 10 MB.'
  }
};

export function documentLabels(language?: string) {
  return labels[language?.startsWith('pt') ? 'pt' : 'zh'];
}

export function documentTypeLabel(type: string, language?: string) {
  return types.includes(type as DocumentType) ? documentLabels(language)[type as DocumentType] : type;
}

export function OrderDocuments({ api, orderId, portal, language, focusOnOpen = false }: {
  api: AxiosInstance; orderId: string; portal: 'client' | 'ops' | 'customs'; language?: string; focusOnOpen?: boolean;
}) {
  const copy = documentLabels(language);
  const customer = portal === 'client';
  const priority: Record<Status, number> = customer
    ? { rejected: 0, missing: 1, submitted: 2, approved: 3 }
    : { submitted: 0, rejected: 1, missing: 2, approved: 3 };
  const base = `/api/${portal}/orders/${orderId}/documents`;
  const [items, setItems] = useState<DocumentRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<'loadError' | 'actionError' | 'conflict' | 'invalidFile' | null>(null);
  const [message, setMessage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<DocumentType>('commercial_invoice');
  const [adding, setAdding] = useState(false);
  const region = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.get<DocumentRequest[]>(base, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setItems(response.data); })
      .catch(() => { if (!controller.signal.aborted) setError('loadError'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, base, refresh]);
  useEffect(() => {
    if (focusOnOpen) region.current?.scrollIntoView({ block: 'start' });
  }, [focusOnOpen, base]);

  const act = async (operation: () => Promise<unknown>, success = true) => {
    setBusy(true); setError(null); setMessage(false);
    try {
      await operation();
      setMessage(success);
      return true;
    } catch (reason) {
      const status = isAxiosError(reason) ? reason.response?.status : null;
      setError(status === 409 ? 'conflict' : (status === 413 ? 'invalidFile' : 'actionError'));
      return false;
    } finally { setBusy(false); }
  };
  const store = (next: DocumentRequest) => setItems(current => {
    const documents = current ?? [];
    return documents.some(item => item.id === next.id)
      ? documents.map(item => item.id === next.id ? next : item) : [...documents, next];
  });
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (await act(async () => store((await api.post<DocumentRequest>(base, Object.fromEntries(fields))).data))) setAdding(false);
  };
  const date = (value: string) => new Date(value).toLocaleString(language?.startsWith('pt') ? 'pt-BR' : 'zh-CN');

  return <section id="order-documents" className="card order-document-panel" aria-labelledby="order-documents-title" ref={region}>
    <div className="card-title">
      <h3 id="order-documents-title">{copy.title}</h3>
      {items && <div className="order-document-actions">
        {!customer && !adding && <button type="button" className="btn btn-sm" disabled={busy || loading} onClick={() => setAdding(true)}>{copy.add}</button>}
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy || loading} onClick={() => setRefresh(count => count + 1)}>{copy.refresh}</button>
      </div>}
    </div>
    {error && <div className="order-document-feedback" role="alert">
      {copy[error]} {(error === 'loadError' || error === 'conflict') && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRefresh(count => count + 1)}>{copy.retry}</button>}
    </div>}
    {loading && <p role="status">{copy.loading}</p>}
    {busy && <p role="status">{copy.working}</p>}
    {message && <p role="status">{copy.saved}</p>}
    {adding && <form className="order-document-form" onSubmit={create}>
      <label>{copy.type}<select name="type" className="form-input" value={type} onChange={event => setType(event.target.value as DocumentType)} disabled={busy}>
        {types.map(value => <option key={value} value={value}>{copy[value]}</option>)}
      </select></label>
      {type === 'other' && <label>{copy.name}<input name="title" className="form-input" required maxLength={120} disabled={busy} /></label>}
      <label>{copy.instructions}<textarea name="instructions" className="form-input" rows={2} maxLength={500} disabled={busy} /></label>
      <div className="order-document-actions">
        <button className="btn btn-sm" disabled={busy}>{copy.request}</button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setAdding(false)}>{copy.cancel}</button>
      </div>
    </form>}
    {!loading && items?.length === 0 && <p className="muted">{copy.empty}</p>}
    {items?.slice().sort((a, b) => priority[a.status] - priority[b.status]).map(item =>
      <DocumentRow key={item.id} item={item} customer={customer} disabled={loading || busy} copy={copy} date={date}
      submit={async form => {
        const file = form.get('file');
        if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) { setError('invalidFile'); return false; }
        form.set('revision', String(item.revision));
        return act(async () => store((await api.post<DocumentRequest>(`${base}/${item.id}/versions`, form)).data));
      }}
      review={(version, status, reason) => act(async () => store((await api.patch<DocumentRequest>(`${base}/${item.id}/review`, {
        version_id: version.id, revision: item.revision, status, reason
      })).data))}
      download={version => act(async () => {
        const { data } = await api.get<Blob>(`${base}/${item.id}/versions/${version.id}/file`, { responseType: 'blob' });
        await downloadOrShareFile(data, version.file_name);
      }, false)}
    />)}
  </section>;
}

function DocumentRow({ item, customer, disabled, copy, date, submit, review, download }: {
  item: DocumentRequest; customer: boolean; disabled: boolean; copy: typeof labels.zh;
  date: (value: string) => string; submit: (fields: FormData) => Promise<boolean>;
  review: (version: Version, status: ReviewStatus, reason?: string) => Promise<boolean>;
  download: (version: Version) => Promise<boolean>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const latest = item.versions.at(-1);
  const file = (version: Version, index: number) => <div className="order-document-file">
    <div>
      <strong>{`v${index + 1} · ${version.file_name}`}</strong>
      <div className="muted text-sm">{date(version.submitted_at)}
        {version.review && ` · ${copy[version.review.status]}`}
      </div>
      {version.review?.reason && <p>{version.review.reason}</p>}
    </div>
    <button type="button" disabled={disabled} className="btn btn-sm btn-ghost" onClick={() => void download(version)}>{copy.download}</button>
  </div>;
  return <article className="order-document-item">
    <div className="order-document-heading">
      <h4>{item.title || copy[item.type]}</h4>
      <span className={`order-document-status ${item.status}`}>{copy[item.status]}</span>
    </div>
    {item.instructions && <p>{item.instructions}</p>}
    {latest && file(latest, item.versions.length - 1)}
    {item.versions.length > 1 && <details><summary>{copy.history}</summary>
      {item.versions.slice(0, -1).map((version, index) => <div key={version.id}>{file(version, index)}</div>)}
    </details>}
    {customer && (item.status === 'missing' || item.status === 'rejected') && <form className="order-document-form" onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      if (await submit(new FormData(form))) form.reset();
    }}>
      <label>{copy.file}<input type="file" name="file" accept=".pdf,.xlsx,.jpg,.jpeg,.png" required disabled={disabled} /></label>
      <small>{copy.format}</small>
      <div><button className="btn btn-sm" disabled={disabled}>{item.status === 'rejected' ? copy.replace : copy.upload}</button></div>
    </form>}
    {!customer && item.status === 'submitted' && latest && (rejecting
      ? <form className="order-document-form" onSubmit={async event => {
          event.preventDefault();
          const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
          if (reason && await review(latest, 'rejected', reason)) setRejecting(false);
        }}>
        <label>{copy.reason}<textarea name="reason" className="form-input" required maxLength={500} rows={2} disabled={disabled} /></label>
        <div className="order-document-actions">
          <button className="btn btn-sm" disabled={disabled}>{copy.reject}</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRejecting(false)} disabled={disabled}>{copy.cancel}</button>
        </div>
      </form>
      : <div className="order-document-actions">
        <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => void review(latest, 'approved')}>{copy.approve}</button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={disabled} onClick={() => setRejecting(true)}>{copy.reject}</button>
      </div>)}
  </article>;
}
