import { useEffect, useState } from 'react';
import LandingShell from './landing/LandingShell';
import Reveal from './landing/Reveal';
import SectionHead from './landing/sections/SectionHead';
import { ArrowRightIcon } from './landing/icons';
import mscLogo from '../assets/partners/msc.svg';
import maerskLogo from '../assets/partners/maersk.png';
import cmacgmLogo from '../assets/partners/cmacgm.svg';
import coscoLogo from '../assets/partners/cosco.png';
import hapaglloydLogo from '../assets/partners/hapaglloyd.png';
import oneLogo from '../assets/partners/one.svg';
import evergreenLogo from '../assets/partners/evergreen.svg';
import hmmLogo from '../assets/partners/hmm.png';
import yangmingLogo from '../assets/partners/yangming.png';
import zimLogo from '../assets/partners/zim.png';
import santosbrasilLogo from '../assets/partners/santosbrasil.svg';
import sgsLogo from '../assets/partners/sgs.svg';
import sinosureLogo from '../assets/partners/sinosure.svg';
import mercadolibreLogo from '../assets/partners/mercadolibre.svg';

/** 静态兜底：管理端尚未维护合作伙伴（或 API 不可用）时使用的内置 logo */
const PARTNER_LOGOS: Record<string, string> = {
  msc: mscLogo,
  maersk: maerskLogo,
  cmacgm: cmacgmLogo,
  cosco: coscoLogo,
  hapaglloyd: hapaglloydLogo,
  one: oneLogo,
  evergreen: evergreenLogo,
  hmm: hmmLogo,
  yangming: yangmingLogo,
  zim: zimLogo,
  santosbrasil: santosbrasilLogo,
  sgs: sgsLogo,
  sinosure: sinosureLogo,
  mercadolibre: mercadolibreLogo
};

/** 管理端维护的合作伙伴（GET /api/partners） */
interface ApiPartner {
  id: string;
  category: 'carrier' | 'ecosystem';
  name: string;
  logo_url: string;
  website_url?: string;
}

interface ApiPartners {
  carriers: ApiPartner[];
  ecosystem: ApiPartner[];
}

export default function Partners() {
  // 管理端维护的合作伙伴；为空（未维护 / 请求失败）时回退到静态内容
  const [apiPartners, setApiPartners] = useState<ApiPartners | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/partners')
      .then(r => (r.ok ? r.json() : null))
      .then((d: ApiPartners | null) => {
        if (cancelled || !d) return;
        if ((d.carriers?.length || 0) + (d.ecosystem?.length || 0) > 0) setApiPartners(d);
      })
      .catch(() => { /* API 不可用时使用静态兜底 */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <LandingShell page="partners">
      {(t) => {
        // 统一渲染形状：分类标题 + logo 列表（有 website_url 时点击跳转）
        const categories: { title: string; logos: { name: string; src: string; href?: string }[] }[] = apiPartners
          ? [
              {
                title: t.partners.categories[0]?.title || '',
                logos: apiPartners.carriers.map(p => ({ name: p.name, src: p.logo_url, href: p.website_url || undefined }))
              },
              {
                title: t.partners.categories[1]?.title || '',
                logos: apiPartners.ecosystem.map(p => ({ name: p.name, src: p.logo_url, href: p.website_url || undefined }))
              }
            ].filter(c => c.logos.length > 0)
          : t.partners.categories.map(c => ({
              title: c.title,
              logos: c.logos.map(l => ({ name: l.name, src: PARTNER_LOGOS[l.id] }))
            }));

        return (
          <>
            <section className="lp-section" aria-labelledby="lp-partners-title">
              <div className="lp-container">
                <SectionHead
                  index="01"
                  kicker={t.partners.kicker}
                  title={t.partners.title}
                  subtitle={t.partners.lead}
                  titleId="lp-partners-title"
                />
                {categories.map((category) => (
                  <Reveal key={category.title} className="lp-partner-cat" delay={80}>
                    <h3>
                      {category.title}
                    </h3>
                    <div className="lp-partner-grid">
                      {category.logos.map((logo, i) => {
                        const tile = (
                          <>
                            <span className="lp-partner-logo">
                              <img src={logo.src} alt={logo.name} loading="lazy" />
                            </span>
                            <span className="lp-partner-name">{logo.name}</span>
                          </>
                        );
                        return logo.href ? (
                          <a
                            className="lp-partner-tile"
                            key={`${logo.name}-${i}`}
                            href={logo.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={logo.href}
                          >{tile}</a>
                        ) : (
                          <div className="lp-partner-tile" key={`${logo.name}-${i}`}>{tile}</div>
                        );
                      })}
                    </div>
                  </Reveal>
                ))}
              </div>
            </section>

            <section className="lp-cta-band" aria-labelledby="lp-partners-cta-title">
              <div className="lp-container lp-cta-inner">
                <Reveal>
                  <h2 id="lp-partners-cta-title">{t.partners.cta.title}</h2>
                  <p>{t.partners.cta.description}</p>
                </Reveal>
                <Reveal delay={120} className="lp-cta-actions">
                  <a className="lp-btn lp-btn-gold lp-btn-lg" href={`mailto:${t.footer.contact.email}`}>
                    {t.partners.cta.button}
                    <ArrowRightIcon className="lp-btn-arrow" width={18} height={18} />
                  </a>
                </Reveal>
              </div>
            </section>
          </>
        );
      }}
    </LandingShell>
  );
}
