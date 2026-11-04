import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import './Help.css';

type Section = { title: string; paragraphs: string[]; steps: string[]; bullets: string[]; note?: string };
type Article = { slug: string; title: string; summary: string; category: string; featured?: boolean; sections: Section[] };
type ApiArticle = Omit<Article, 'sections'> & { content: string };

const categories = [
  { id: 'start', icon: '📦', title: '订单处理', description: '清单核对、核算与报价发布' },
  { id: 'guide', icon: '🧭', title: '运营指南', description: '费率、成交、物流与财务' },
  { id: 'invoice', icon: '🧾', title: '开票与交付', description: 'CNPJ、IE、NF 与交付文件' },
  { id: 'faq', icon: '❓', title: '常见问题', description: '金额、资料与文件问题' }
];

function parseContent(content: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { title: '帮助说明', paragraphs: [], steps: [], bullets: [] };
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
  const { slug } = useParams<{ slug: string }>();
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get('/api/ops/help/articles')
      .then(r => setArticles((r.data || []).map((article: ApiArticle) => ({ ...article, sections: parseContent(article.content) }))))
      .catch(e => setErr(getApiErrorMessage(e, '帮助文档加载失败')))
      .finally(() => setLoading(false));
  }, []);

  const current = slug ? articles.find(article => article.slug === slug) : null;
  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return articles.filter(article => JSON.stringify(article).toLowerCase().includes(keyword));
  }, [query, articles]);

  if (loading) return <div className="card"><p className="muted">帮助文档加载中…</p></div>;
  if (err) return <div className="alert alert-err">❌ {err}</div>;

  if (slug) {
    if (!current) {
      return <div className="help-not-found"><h1>未找到帮助文章</h1><p>该文章可能已下架、移动或删除。</p><Link className="btn" to="/help">返回帮助中心</Link></div>;
    }
    const related = articles.filter(article => article.category === current.category && article.slug !== current.slug).slice(0, 3);
    return (
      <div className="help-reader">
        <nav className="help-breadcrumb"><Link to="/help">帮助中心</Link><span>›</span><span>{categories.find(c => c.id === current.category)?.title}</span></nav>
        <article className="help-document">
          <header><span className="help-document-category">{categories.find(c => c.id === current.category)?.title}</span><h1>{current.title}</h1><p>{current.summary}</p></header>
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
        {related.length > 0 && <section className="help-related"><h2>相关文章</h2><ArticleLinks items={related} /></section>}
        <Link className="help-back" to="/help">← 返回帮助中心</Link>
      </div>
    );
  }

  return (
    <div className="help-home">
      <section className="help-hero">
        <span className="help-eyebrow">AEG 运营端帮助中心</span>
        <h1>运营支持，需要哪方面帮助？</h1>
        <p>搜索订单核算、成交、物流、开票或交付问题</p>
        <label className="help-search">
          <span>⌕</span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索问题或关键字，例如：重新计算、IE、交付文件" aria-label="搜索帮助文章" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">×</button>}
        </label>
      </section>

      {query.trim() ? (
        <section className="help-section">
          <div className="help-section-heading"><h2>搜索结果</h2><span>找到 {results.length} 篇相关文章</span></div>
          {results.length ? <ArticleLinks items={results} /> : <div className="help-empty"><h3>没有找到相关内容</h3><p>请尝试“核算”“NF”“回款”等更短的关键字。</p></div>}
        </section>
      ) : (
        <>
          <section className="help-categories" aria-label="帮助分类">
            {categories.map(category => (
              <a key={category.id} href={`#${category.id}`} className="help-category-card">
                <span className="help-category-icon">{category.icon}</span><strong>{category.title}</strong><small>{category.description}</small>
              </a>
            ))}
          </section>

          <section className="help-section" id="start">
            <div className="help-section-heading"><h2>新手指南</h2><span>从订单处理开始</span></div>
            <div className="help-featured-grid">
              {articles.filter(article => article.featured).map(article => (
                <Link key={article.slug} to={`/help/${article.slug}`} className="help-featured-card">
                  <span className="help-featured-icon">{article.slug === 'order-review-and-publish' ? '📦' : '💰'}</span>
                  <div><h3>{article.title}</h3><p>{article.summary}</p><span>阅读指南 →</span></div>
                </Link>
              ))}
            </div>
          </section>

          <section className="help-section" id="guide">
            <div className="help-section-heading"><h2>知识库</h2><span>运营工作指南</span></div>
            <ArticleLinks items={articles.filter(article => article.category !== 'faq' && article.category !== 'invoice')} />
          </section>

          <section className="help-section" id="invoice">
            <div className="help-section-heading"><h2>开票与交付</h2><span>NF 资料与交付文件</span></div>
            <ArticleLinks items={articles.filter(article => article.category === 'invoice')} />
          </section>

          <section className="help-section" id="faq">
            <div className="help-section-heading"><h2>常见问题</h2><span>快速排查问题</span></div>
            <ArticleLinks items={articles.filter(article => article.category === 'faq')} />
          </section>

          <section className="help-contact">
            <span>💬</span><div><h2>仍需协助？</h2><p>请联系系统管理员或工作负责人，并提供相关报价号、问题截图和操作时间。</p></div>
          </section>
        </>
      )}
    </div>
  );
}
