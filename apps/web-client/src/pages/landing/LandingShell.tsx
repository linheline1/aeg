import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../../store/auth';
import { LANG_KEY, T, type Lang, type LandingContent } from './content';
import Header from './sections/Header';
import Footer from './sections/Footer';
import BackTop from './BackTop';
import '../landing.css';

/** 落地页族（/、/company、/partners、/lines/*）共享的外壳：语言状态、页头、页脚、回到顶部 */
type ShellPage = 'landing' | 'company' | 'partners' | 'lineBrazil' | 'lineArgentina' | 'lineSouthAmerica';

interface LandingShellProps {
  page?: ShellPage;
  children: (t: LandingContent, loggedIn: boolean) => ReactNode;
}

export default function LandingShell({ page = 'landing', children }: LandingShellProps) {
  const { user } = useAuth();
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem(LANG_KEY) === 'pt' ? 'pt' : 'zh'));
  const t = T[lang];
  const loggedIn = Boolean(user);
  const docTitle =
    page === 'landing' ? t.docTitle
    : page === 'company' ? t.company.docTitle
    : page === 'partners' ? t.partners.docTitle
    : t[page].docTitle;

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
    document.title = docTitle;
    document.documentElement.lang = t.locale;
  }, [lang, t, docTitle]);

  return (
    <div className="lp" data-lang={lang}>
      <a className="lp-skip-link" href="#main">{t.skipToContent}</a>
      <Header t={t} lang={lang} loggedIn={loggedIn} onLangChange={setLang} />
      <main id="main" tabIndex={-1}>{children(t, loggedIn)}</main>
      <Footer t={t} />
      <BackTop label={t.backTop} />
    </div>
  );
}
