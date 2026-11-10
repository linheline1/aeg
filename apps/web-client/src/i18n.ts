import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getInitialLang, persistLang, type Lang } from '@aeg/web-shared/i18n';
import zh from './locales/zh';
import pt from './locales/pt';

i18n.use(initReactI18next).init({
  resources: { zh: { translation: zh }, pt: { translation: pt } },
  lng: getInitialLang(),
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  persistLang(lng as Lang);
  document.documentElement.lang = lng.startsWith('pt') ? 'pt-BR' : 'zh-CN';
});
document.documentElement.lang = i18n.language.startsWith('pt') ? 'pt-BR' : 'zh-CN';

export default i18n;
