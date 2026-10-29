import { useEffect, useState } from 'react';
import { useAuth } from '../store/auth';
import { LANG_KEY, T, type Lang } from './landing/content';
import { useActiveSection } from './landing/useActiveSection';
import Header from './landing/sections/Header';
import Hero from './landing/sections/Hero';
import Ticker from './landing/sections/Ticker';
import Process from './landing/sections/Process';
import Included from './landing/sections/Included';
import Advantages from './landing/sections/Advantages';
import CtaBand from './landing/sections/CtaBand';
import Footer from './landing/sections/Footer';
import './landing.css';

export default function Landing() {
  const { user } = useAuth();
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem(LANG_KEY) === 'pt' ? 'pt' : 'zh'));
  const t = T[lang];
  const loggedIn = Boolean(user);
  const activeId = useActiveSection(t.nav.map((item) => item.id));

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
    document.title = t.docTitle;
    document.documentElement.lang = t.locale;
  }, [lang, t]);

  return (
    <div className="lp" data-lang={lang}>
      <a className="lp-skip-link" href="#main">{t.skipToContent}</a>
      <Header t={t} lang={lang} loggedIn={loggedIn} activeId={activeId} onLangChange={setLang} />
      <main id="main" tabIndex={-1}>
        <Hero t={t} loggedIn={loggedIn} />
        <Ticker t={t} />
        <Process t={t} />
        <Included t={t} />
        <Advantages t={t} />
        <CtaBand t={t} loggedIn={loggedIn} />
      </main>
      <Footer t={t} />
    </div>
  );
}
