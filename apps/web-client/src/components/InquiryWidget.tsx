import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { api, useAuth } from '../store/auth';

type Message = { role: 'user' | 'assistant'; content: string };

export default function InquiryWidget() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'ai' | 'wechat'>('ai');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      if (event.key === 'Tab') {
        const focusable = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], textarea:not(:disabled)') || []);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user' as const, content }].slice(-12);
    setMessages(next); setDraft(''); setBusy(true); setError('');
    try {
      const { data } = await axios.post<{ reply: string }>(`${api.defaults.baseURL || ''}/api/public/inquiry`, { messages: next }, { timeout: 60000 });
      setMessages(current => [...current, { role: 'assistant', content: data.reply }]);
    } catch (reason) {
      setError(axios.isAxiosError(reason) && reason.response?.status === 429 ? t('inquiry.rateLimit') : t('inquiry.failed'));
    } finally { setBusy(false); input.current?.focus(); }
  };

  return <div className="inquiry-widget">
    <button ref={trigger} type="button" className="inquiry-trigger" aria-expanded={open} aria-controls="inquiry-panel" onClick={() => setOpen(value => !value)}>{open ? '×' : '✦'} <span>{t('inquiry.trigger')}</span></button>
    {open && <section ref={panel} id="inquiry-panel" className="inquiry-panel" role="dialog" aria-modal="true" aria-label={t('inquiry.title')}>
      <header className="inquiry-head"><div><strong>{t('inquiry.title')}</strong><small>{t('inquiry.subtitle')}</small></div><button ref={close} type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }} aria-label={t('inquiry.close')}>×</button></header>
      <div className="inquiry-tabs" role="tablist" aria-label={t('inquiry.title')}>
        <button type="button" role="tab" aria-selected={tab === 'ai'} onClick={() => setTab('ai')}>{t('inquiry.aiTab')}</button>
        <button type="button" role="tab" aria-selected={tab === 'wechat'} onClick={() => setTab('wechat')}>{t('inquiry.wechatTab')}</button>
      </div>
      {tab === 'ai' ? <>
        <div className="inquiry-messages" role="log" aria-live="polite">
          <p className="inquiry-intro">{t('inquiry.intro')}</p>
          {messages.map((message, index) => <p key={index} className={`inquiry-message ${message.role}`}>{message.content}</p>)}
          {busy && <p className="inquiry-message assistant">{t('inquiry.thinking')}</p>}
          {messages.length >= 12 && <button className="inquiry-reset" type="button" onClick={() => { setMessages([]); setError(''); }}>{t('inquiry.newChat')}</button>}
          <div ref={bottom} />
        </div>
        {error && <p className="inquiry-error" role="alert">{error} {messages.at(-1)?.role === 'user' && <button type="button" onClick={() => { setDraft(messages.at(-1)?.content || ''); setMessages(current => current.slice(0, -1)); setError(''); input.current?.focus(); }}>{t('inquiry.retry')}</button>}</p>}
        <form className="inquiry-form" onSubmit={send}><label htmlFor="inquiry-input" className="sr-only">{t('inquiry.inputLabel')}</label><textarea id="inquiry-input" ref={input} value={draft} maxLength={1000} rows={2} placeholder={t('inquiry.placeholder')} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} disabled={busy} /><button type="submit" disabled={busy || !draft.trim() || messages.length >= 12}>{t('inquiry.send')}</button></form>
        <div className="inquiry-next"><span>{t('inquiry.estimateHint')}</span><Link to={user ? '/workbench' : '/login'} onClick={() => setOpen(false)}>{t(user ? 'inquiry.upload' : 'inquiry.login')}</Link></div>
      </> : <div className="inquiry-wechat"><div className="inquiry-qr-placeholder" aria-hidden="true">▦</div><strong>{t('inquiry.qrPending')}</strong><p>{t('inquiry.qrDescription')}</p></div>}
    </section>}
  </div>;
}
