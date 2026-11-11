import Reveal from './landing/Reveal';
import SectionHead from './landing/sections/SectionHead';
import LandingShell from './landing/LandingShell';
import CtaBand from './landing/sections/CtaBand';
import heroMap from '../assets/company/hero-map.jpg';
import warehouseOps from '../assets/company/warehouse-ops.jpg';
import warehouseDock from '../assets/company/warehouse-dock.jpg';
import hqOffice from '../assets/company/hq-office.jpg';
import hzBranch from '../assets/company/hz-branch.jpg';

/**
 * 公司介绍页（/company）
 * 内容来自《AEG_吉亚企业介绍》PPT + 公开业务资料：
 * 双板块叙事（东南亚基本盘 + 南美第二市场）、核心运营数据、海外仓网络、增值服务与总部信息。
 */
export default function Company() {
  return (
    <LandingShell page="company">
      {(t, loggedIn) => {
        const c = t.company;
        return (
          <>
            {/* 01 · 公司简介 */}
            <section className="lp-section" aria-labelledby="company-title">
              <div className="lp-container">
                <SectionHead index="01" kicker={c.kicker} title={c.title} subtitle={c.lead} titleId="company-title" />
                <div className="lp-company-grid">
                  <Reveal className="lp-company-story">
                    {c.story.map((p, i) => <p key={i}>{p}</p>)}
                  </Reveal>
                  <Reveal className="lp-company-figure">
                    <img src={heroMap} alt={c.heroImgAlt} loading="lazy" />
                  </Reveal>
                </div>
              </div>
            </section>

            {/* 核心数据带 */}
            <section className="lp-section lp-company-stats-section" aria-labelledby="company-stats-title">
              <div className="lp-container">
                <SectionHead index="02" kicker={c.statsKicker} title={c.statsTitle} titleId="company-stats-title" dark />
                <div className="lp-company-stats">
                  {c.stats.map((s, i) => (
                    <Reveal key={i} className="lp-company-stat" delay={i * 60}>
                      <span className="lp-company-stat-value">{s.value}</span>
                      <span className="lp-company-stat-label">{s.label}</span>
                    </Reveal>
                  ))}
                </div>
              </div>
            </section>

            {/* 03 · 双板块业务 */}
            <section className="lp-section" aria-labelledby="company-regions-title">
              <div className="lp-container">
                <SectionHead index="03" kicker={c.regionsKicker} title={c.regionsTitle} subtitle={c.regionsLead} titleId="company-regions-title" />
                <div className="lp-company-regions">
                  {c.regions.map((r, i) => (
                    <Reveal key={i} className="lp-company-region" delay={i * 80}>
                      <span className="lp-company-region-tag">{r.tag}</span>
                      <h3>{r.name}</h3>
                      <ul>
                        {r.points.map((p, j) => <li key={j}>{p}</li>)}
                      </ul>
                    </Reveal>
                  ))}
                </div>
                <Reveal className="lp-company-figure lp-company-figure-wide">
                  <img src={warehouseOps} alt={c.regionsImgAlt} loading="lazy" />
                </Reveal>
              </div>
            </section>

            {/* 04 · 海外仓网络 */}
            <section className="lp-section lp-company-warehouses-section" aria-labelledby="company-warehouses-title">
              <div className="lp-container">
                <SectionHead index="04" kicker={c.warehousesKicker} title={c.warehousesTitle} subtitle={c.warehousesLead} titleId="company-warehouses-title" />
                <div className="lp-company-warehouse-grid">
                  {c.warehouses.map((w, i) => (
                    <Reveal key={i} className="lp-company-warehouse" delay={i * 40}>
                      <strong className="lp-company-warehouse-country">{w.country}</strong>
                      <span className="lp-company-warehouse-city">{w.city}</span>
                      <span className="lp-company-warehouse-area">{w.area}</span>
                    </Reveal>
                  ))}
                </div>
                <div className="lp-company-warehouse-services">
                  {c.warehouseServices.map((s, i) => (
                    <span key={i} className="lp-company-chip">{s}</span>
                  ))}
                </div>
                <Reveal className="lp-company-figure lp-company-figure-wide">
                  <img src={warehouseDock} alt={c.warehousesImgAlt} loading="lazy" />
                </Reveal>
              </div>
            </section>

            {/* 05 · 增值服务 + 06 价值观 */}
            <section className="lp-section" aria-labelledby="company-services-title">
              <div className="lp-container">
                <SectionHead index="05" kicker={c.servicesKicker} title={c.servicesTitle} titleId="company-services-title" />
                <div className="lp-company-values">
                  {c.services.map((v, i) => (
                    <Reveal key={i} className="lp-company-value" delay={i * 70}>
                      <strong>{v.title}</strong>
                      <p>{v.description}</p>
                    </Reveal>
                  ))}
                </div>

                <div className="lp-company-subhead">
                  <SectionHead index="06" kicker={c.valuesKicker} title={c.valuesTitle} titleId="company-values-title" />
                </div>
                <div className="lp-company-values">
                  {c.values.map((v, i) => (
                    <Reveal key={i} className="lp-company-value lp-company-value-alt" delay={i * 70}>
                      <strong>{v.title}</strong>
                      <p>{v.description}</p>
                    </Reveal>
                  ))}
                </div>
              </div>
            </section>

            {/* 总部 + 分公司 */}
            <section className="lp-section" aria-labelledby="company-hq-title">
              <div className="lp-container">
                <div className="lp-company-grid lp-company-grid-flip">
                  <Reveal className="lp-company-figure">
                    <img src={hqOffice} alt={c.hqImgAlt} loading="lazy" />
                  </Reveal>
                  <Reveal className="lp-company-story lp-company-hq">
                    <span className="lp-company-region-tag">{c.hqKicker}</span>
                    <h3>{c.hqTitle}</h3>
                    <p className="lp-company-hq-address">{c.hqAddress}</p>
                  </Reveal>
                </div>
                <div className="lp-company-grid">
                  <Reveal className="lp-company-story lp-company-branch">
                    <span className="lp-company-region-tag">{c.branchKicker}</span>
                    <h3>{c.branchTitle}</h3>
                    <p className="lp-company-hq-address">{c.branchAddress}</p>
                  </Reveal>
                  <Reveal className="lp-company-figure">
                    <img src={hzBranch} alt={c.branchImgAlt} loading="lazy" />
                  </Reveal>
                </div>
              </div>
            </section>

            <CtaBand t={t} loggedIn={loggedIn} />
          </>
        );
      }}
    </LandingShell>
  );
}
