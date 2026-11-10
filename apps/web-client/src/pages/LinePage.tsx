import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Reveal from './landing/Reveal';
import LandingShell from './landing/LandingShell';
import CtaBand from './landing/sections/CtaBand';
import type { LinePageContent } from './landing/content';

type LineKey = 'lineBrazil' | 'lineArgentina' | 'lineSouthAmerica';

/**
 * 海外专线通用页面（/lines/*）
 * 数据驱动：从 content.ts 读取对应专线的双语内容，渲染 hero + 区块（卡片/要点）+ CTA。
 */
export default function LinePage({ lineKey }: { lineKey: LineKey }) {
  const { pathname } = useLocation();

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <LandingShell page={lineKey}>
      {(t, loggedIn) => {
        const c: LinePageContent = t[lineKey];
        return (
          <>
            {/* 页头 */}
            <section className="lp-section lp-line-hero" aria-labelledby="line-title">
              <div className="lp-container">
                <Reveal className="lp-line-hero-inner">
                  <span className="lp-kicker">{c.kicker}</span>
                  <h1 id="line-title">{c.title}</h1>
                  <p className="lp-line-lead">{c.lead}</p>
                </Reveal>
              </div>
            </section>

            {/* 内容区块 */}
            {c.sections.map((s, i) => (
              <section key={i} className={`lp-section lp-line-section${i % 2 === 1 ? ' lp-line-section-alt' : ''}`}>
                <div className="lp-container">
                  <Reveal className="lp-line-block">
                    <h2 className="lp-line-heading">{s.heading}</h2>
                    {s.intro && <p className="lp-line-intro">{s.intro}</p>}
                    {s.items && (
                      <div className="lp-line-cards">
                        {s.items.map((item, j) => (
                          <Reveal key={j} className="lp-line-card" delay={j * 60}>
                            <strong>{item.title}</strong>
                            <p>{item.description}</p>
                          </Reveal>
                        ))}
                      </div>
                    )}
                    {s.bullets && (
                      <ul className="lp-line-bullets">
                        {s.bullets.map((b, j) => <li key={j}>{b}</li>)}
                      </ul>
                    )}
                  </Reveal>
                </div>
              </section>
            ))}

            <CtaBand t={t} loggedIn={loggedIn} />
          </>
        );
      }}
    </LandingShell>
  );
}
