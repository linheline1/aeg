import { useEffect, useRef, useState } from 'react';

const TEST_SITEKEY = '10000000-ffff-ffff-ffff-000000000001';
const sitekey = import.meta.env.VITE_HCAPTCHA_SITE_KEY || (import.meta.env.DEV ? TEST_SITEKEY : '');
type CaptchaApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => number;
  reset: (id: number) => void;
  remove: (id: number) => void;
};
declare global { interface Window { hcaptcha?: CaptchaApi } }

let scriptPromise: Promise<void> | undefined;
function loadScript(): Promise<void> {
  if (window.hcaptcha) return Promise.resolve();
  if (!scriptPromise) scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => reject(new Error('hCaptcha timeout')), 10000);
    script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit';
    script.async = true;
    script.onload = () => { window.clearTimeout(timeout); window.hcaptcha ? resolve() : reject(new Error('hCaptcha unavailable')); };
    script.onerror = () => { window.clearTimeout(timeout); reject(new Error('hCaptcha unavailable')); };
    document.head.appendChild(script);
  }).catch(error => { scriptPromise = undefined; throw error; });
  return scriptPromise;
}

export function LoginCaptcha({ language, onChange, resetKey }: { language: string; onChange: (token: string) => void; resetKey: number }) {
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<number | undefined>(undefined);
  const callback = useRef(onChange);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  callback.current = onChange;
  const pt = language.toLowerCase().startsWith('pt');

  useEffect(() => {
    let active = true;
    callback.current('');
    if (!sitekey) { setLoading(false); setError(true); return; }
    setError(false);
    setLoading(true);
    loadScript().then(() => {
      if (!active || !host.current || !window.hcaptcha) return;
      widget.current = window.hcaptcha.render(host.current, {
        sitekey, hl: pt ? 'pt' : 'zh-CN', size: window.innerWidth < 380 ? 'compact' : 'normal',
        callback: (token: string) => callback.current(token),
        'expired-callback': () => callback.current(''),
        'chalexpired-callback': () => callback.current(''),
        'error-callback': () => { callback.current(''); setError(true); }
      });
      setLoading(false);
    }).catch(() => { if (active) { setLoading(false); setError(true); } });
    return () => {
      active = false;
      if (widget.current !== undefined) window.hcaptcha?.remove(widget.current);
      widget.current = undefined;
    };
  }, [language, resetKey, pt]);

  return <div className="login-captcha" style={{ margin: '16px 0', maxWidth: '100%', overflow: 'visible' }}>
    <p style={{ margin: '0 0 8px', fontSize: 13 }}>{pt ? 'Verificação de segurança' : '人机验证'}</p>
    <div ref={host} />
    {loading && <p role="status" style={{ fontSize: 13 }}>{pt ? 'Carregando verificação…' : '正在加载人机验证…'}</p>}
    {error && <p role="alert" style={{ color: '#b42318', fontSize: 13 }}>{pt ? 'Não foi possível carregar a verificação.' : '人机验证加载失败。'} <button type="button" onClick={() => { setError(false); scriptPromise = undefined; callback.current(''); window.location.reload(); }}>{pt ? 'Tentar novamente' : '重试'}</button></p>}
  </div>;
}
