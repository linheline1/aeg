import { useEffect, useState } from 'react';

type ToastType = 'ok' | 'err';
interface ToastItem { id: number; msg: string; type: ToastType }

let items: ToastItem[] = [];
let listeners: Array<(next: ToastItem[]) => void> = [];
let seq = 0;

const emit = () => { listeners.forEach(fn => fn(items)); };

/** 轻量全局提示：3 秒自动消失，可多条堆叠 */
export function showToast(msg: string, type: ToastType = 'ok') {
  const id = ++seq;
  items = [...items, { id, msg, type }];
  emit();
  setTimeout(() => {
    items = items.filter(t => t.id !== id);
    emit();
  }, 3000);
}

/** 挂在应用根部的 toast 容器 */
export function ToastHost() {
  const [current, setCurrent] = useState<ToastItem[]>(items);

  useEffect(() => {
    listeners.push(setCurrent);
    return () => { listeners = listeners.filter(fn => fn !== setCurrent); };
  }, []);

  if (current.length === 0) return null;
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {current.map(t => (
        <div key={t.id} className={`toast-item toast-${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}
