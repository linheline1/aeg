import type { LandingContent } from '../content';

export default function Ticker({ t }: { t: LandingContent }) {
  return (
    <div className="lp-ticker" aria-hidden="true">
      <div className="lp-ticker-track">
        {[0, 1].map((dup) => (
          <span key={dup} className="lp-ticker-group">
            {t.ticker.map((item) => (
              <span className="lp-ticker-item" key={item}>
                <em>◆</em>{item}
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
