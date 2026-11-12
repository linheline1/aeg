import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import './Help.css';

type Section = { title: string; paragraphs: string[]; steps: string[]; bullets: string[]; note?: string };
type Article = { slug: string; title: string; summary: string; category: string; featured?: boolean; sections: Section[] };
type ApiArticle = Omit<Article, 'sections'> & { content: string };

const categories = [
  { id: 'start', icon: '📦', titleKey: 'help.cat.start.title', descriptionKey: 'help.cat.start.description' },
  { id: 'guide', icon: '🧭', titleKey: 'help.cat.guide.title', descriptionKey: 'help.cat.guide.description' },
  { id: 'invoice', icon: '🧾', titleKey: 'help.cat.invoice.title', descriptionKey: 'help.cat.invoice.description' },
  { id: 'faq', icon: '❓', titleKey: 'help.cat.faq.title', descriptionKey: 'help.cat.faq.description' }
];

function parseContent(content: string, defaultTitle: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { title: defaultTitle, paragraphs: [], steps: [], bullets: [] };
  const push = () => {
    if (current.paragraphs.length || current.steps.length || current.bullets.length || current.note) sections.push(current);
  };
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ')) {
      push();
      current = { title: line.slice(3).trim(), paragraphs: [], steps: [], bullets: [] };
    } else if (/^\d+\.\s+/.test(line)) current.steps.push(line.replace(/^\d+\.\s+/, ''));
    else if (line.startsWith('- ')) current.bullets.push(line.slice(2).trim());
    else if (line.startsWith('> ')) current.note = current.note ? `${current.note}\n${line.slice(2).trim()}` : line.slice(2).trim();
    else current.paragraphs.push(line);
  }
  push();
  return sections;
}

function ArticleLinks({ items }: { items: Article[] }) {
  return (
    <div className="help-article-links">
      {items.map(article => (
        <Link key={article.slug} to={`/help/${article.slug}`} className="help-article-link">
          <span><strong>{article.title}</strong><small>{article.summary}</small></span><span className="help-arrow">›</span>
        </Link>
      ))}
    </div>
  );
}

export default function Help() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get('/api/ops/help/articles')
      .then(r => setArticles((r.data || []).map((article: ApiArticle) => ({ ...article, sections: parseContent(article.content, t('help.section.defaultTitle')) }))))
      .catch(e => setErr(getApiErrorMessage(e, t('help.loadError'))))
      .finally(() => setLoading(false));
  }, []);

  const current = slug ? articles.find(article => article.slug === slug) : null;
  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return articles.filter(article => JSON.stringify(article).toLowerCase().includes(keyword));
  }, [query, articles]);

  if (loading) return <div className="card"><p className="muted">{t('help.loading')}</p></div>;
  if (err) return <div className="alert alert-err">❌ {err}</div>;

  if (slug) {
    if (!current) {
      return <div className="help-not-found"><h1>{t('help.notFound.title')}</h1><p>{t('help.notFound.body')}</p><Link className="btn" to="/help">{t('help.backToCenter')}</Link></div>;
    }
    const related = articles.filter(article => article.category === current.category && article.slug !== current.slug).slice(0, 3);
    return (
      <div className="help-reader">
        <nav className="help-breadcrumb"><Link to="/help">{t('help.center')}</Link><span>›</span><span>{t(categories.find(c => c.id === current.category)?.titleKey || 'help.center')}</span></nav>
        <article className="help-document">
          <header><span className="help-document-category">{t(categories.find(c => c.id === current.category)?.titleKey || 'help.center')}</span><h1>{current.title}</h1><p>{current.summary}</p></header>
          {current.sections.map((section, index) => (
            <section key={`${section.title}-${index}`}>
              <h2>{section.title}</h2>
              {section.paragraphs.map(text => <p key={text}>{text}</p>)}
              {section.steps.length > 0 && <ol>{section.steps.map(text => <li key={text}>{text}</li>)}</ol>}
              {section.bullets.length > 0 && <ul>{section.bullets.map(text => <li key={text}>{text}</li>)}</ul>}
              {section.note && <div className="help-note">{section.note}</div>}
            </section>
          ))}
        </article>
        {related.length > 0 && <section className="help-related"><h2>{t('help.related')}</h2><ArticleLinks items={related} /></section>}
        <Link className="help-back" to="/help">← {t('help.backToCenter')}</Link>
      </div>
    );
  }

  return (
    <div className="help-home">
      <section className="help-hero">
        <span className="help-eyebrow">{t('help.hero.eyebrow')}</span>
        <h1>{t('help.hero.title')}</h1>
        <p>{t('help.hero.subtitle')}</p>
        <label className="help-search">
          <span>⌕</span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('help.search.placeholder')} aria-label={t('help.search.label')} />
          {query && <button type="button" onClick={() => setQuery('')} aria-label={t('help.search.clear')}>×</button>}
        </label>
      </section>

      {query.trim() ? (
        <section className="help-section">
          <div className="help-section-heading"><h2>{t('help.search.title')}</h2><span>{t('help.search.count', { count: results.length })}</span></div>
          {results.length ? <ArticleLinks items={results} /> : <div className="help-empty"><h3>{t('help.search.empty.title')}</h3><p>{t('help.search.empty.body')}</p></div>}
        </section>
      ) : (
        <>
          <section className="help-categories" aria-label={t('help.categories.label')}>
            {categories.map(category => (
              <a key={category.id} href={`#${category.id}`} className="help-category-card">
                <span className="help-category-icon">{category.icon}</span><strong>{t(category.titleKey)}</strong><small>{t(category.descriptionKey)}</small>
              </a>
            ))}
          </section>

          <section className="help-section" id="start">
            <div className="help-section-heading"><h2>{t('help.gettingStarted.title')}</h2><span>{t('help.gettingStarted.subtitle')}</span></div>
            <div className="help-featured-grid">
              {articles.filter(article => article.featured).map(article => (
                <Link key={article.slug} to={`/help/${article.slug}`} className="help-featured-card">
                  <span className="help-featured-icon">{article.slug === 'order-review-and-publish' ? '📦' : '💰'}</span>
                  <div><h3>{article.title}</h3><p>{article.summary}</p><span>{t('help.read')}</span></div>
                </Link>
              ))}
            </div>
          </section>

          <section className="help-section" id="guide">
            <div className="help-section-heading"><h2>{t('help.kb.title')}</h2><span>{t('help.kb.subtitle')}</span></div>
            <ArticleLinks items={articles.filter(article => article.category !== 'faq' && article.category !== 'invoice')} />
          </section>

          <section className="help-section" id="invoice">
            <div className="help-section-heading"><h2>{t('help.invoice.title')}</h2><span>{t('help.invoice.subtitle')}</span></div>
            <ArticleLinks items={articles.filter(article => article.category === 'invoice')} />
          </section>

          <section className="help-section" id="faq">
            <div className="help-section-heading"><h2>{t('help.faq.title')}</h2><span>{t('help.faq.subtitle')}</span></div>
            <ArticleLinks items={articles.filter(article => article.category === 'faq')} />
          </section>

          <section className="help-contact">
            <span>💬</span><div><h2>{t('help.contact.title')}</h2><p>{t('help.contact.body')}</p></div>
          </section>
        </>
      )}
    </div>
  );
}
