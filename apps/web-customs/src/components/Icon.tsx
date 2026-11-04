import type { SVGProps } from 'react';

export type IconName = 'home' | 'orders' | 'building' | 'logout' | 'menu' | 'close' | 'search' | 'arrow' | 'back' | 'check' | 'alert' | 'clock' | 'file' | 'image' | 'edit' | 'history' | 'ship' | 'refresh' | 'chevron' | 'user';

const paths: Record<IconName, React.ReactNode> = {
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
  orders: <><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
  building: <><path d="M4 21V5l8-3 8 3v16M2 21h20"/><path d="M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2"/></>,
  logout: <><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  back: <path d="M19 12H5m5 5-5-5 5-5"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  alert: <><path d="M12 3 2.5 20h19z"/><path d="M12 9v4M12 17h.01"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h5"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m3 17 5-5 4 4 3-3 6 6"/></>,
  edit: <><path d="m14 5 5 5M4 20l4-1 11-11-4-4L4 15z"/></>,
  history: <><path d="M3 12a9 9 0 1 0 3-7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
  ship: <><path d="m3 15 3-8h12l3 8M12 7V3M9 3h6"/><path d="M2 18c2 2 4 2 6 0 2 2 4 2 6 0 2 2 4 2 8 0"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 11.9-2"/></>,
  chevron: <path d="m9 6 6 6-6 6"/>
};

export default function Icon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}
