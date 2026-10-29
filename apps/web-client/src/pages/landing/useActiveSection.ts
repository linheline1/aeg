import { useEffect, useState } from 'react';

/**
 * Marca o link de navegação da seção visível.
 * Usa scroll + rAF em vez de IntersectionObserver para lidar bem com
 * seções curtas e com o cabeçalho fixo.
 */
export function useActiveSection(ids: string[]) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const key = ids.join('|');

  useEffect(() => {
    const sections = key
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const offset = window.scrollY + 140;
      let current: string | null = null;
      for (const section of sections) {
        if (section.getBoundingClientRect().top + window.scrollY <= offset) current = section.id;
      }
      setActiveId(current);
    };

    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [key]);

  return activeId;
}
