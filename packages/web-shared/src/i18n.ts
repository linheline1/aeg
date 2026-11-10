/**
 * 共享国际化工具：语言检测、持久化 key、类型
 * 各前端的 i18n 初始化见 apps/<app>/src/i18n.ts
 */

export type Lang = 'zh' | 'pt';

export const SUPPORTED_LANGS: Lang[] = ['zh', 'pt'];
export const DEFAULT_LANG: Lang = 'zh';
export const LANG_STORAGE_KEY = 'aeg.lang';
export const LANG_COOKIE_NAME = 'aeg_lang';

/** 从浏览器 navigator.language 检测默认语言（pt / zh，其他回退 zh） */
export function detectBrowserLang(): Lang {
  if (typeof navigator === 'undefined') return DEFAULT_LANG;
  const raw = navigator.language?.toLowerCase() || '';
  if (raw.startsWith('pt')) return 'pt';
  if (raw.startsWith('zh')) return 'zh';
  return DEFAULT_LANG;
}

/** 读取 localStorage/cookie 中用户之前选择的语言；若无则检测浏览器 */
export function getInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY) as Lang | null;
    if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
  } catch {
    /* SSR 或禁用存储 */
  }
  return detectBrowserLang();
}

/** 持久化语言选择（localStorage + cookie） */
export function persistLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  try {
    // cookie 让 Nest 后端也能读（模板渲染场景）
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    document.cookie = `${LANG_COOKIE_NAME}=${lang}; expires=${d.toUTCString()}; path=/`;
  } catch {
    /* ignore */
  }
}
