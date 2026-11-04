import { useEffect, useState } from 'react';
import { ArrowUpIcon } from './icons';

/** 滚过一屏后出现的"回到顶部"浮动按钮 */
export default function BackTop({ label }: { label: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      className={`lp-backtop${show ? ' is-show' : ''}`}
      aria-label={label}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <ArrowUpIcon width={20} height={20} />
    </button>
  );
}
