import Reveal from '../Reveal';

interface SectionHeadProps {
  index: string;
  kicker: string;
  title: string;
  subtitle?: string;
  titleId: string;
  dark?: boolean;
}

export default function SectionHead({ index, kicker, title, subtitle, titleId, dark = false }: SectionHeadProps) {
  return (
    <Reveal className="lp-section-head">
      <span className={`lp-sec-idx${dark ? ' lp-sec-idx-dark' : ''}`} aria-hidden="true">{index}</span>
      <span className={`lp-kicker${dark ? ' lp-kicker-gold' : ''}`}>{kicker}</span>
      <h2 id={titleId}>{title}</h2>
      {subtitle && <p className="lp-section-sub">{subtitle}</p>}
    </Reveal>
  );
}
