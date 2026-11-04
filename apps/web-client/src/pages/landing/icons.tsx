import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ArrowRightIcon = (props: IconProps) => (
  <Base {...props}><path d="M4 12h16m-6-6 6 6-6 6" /></Base>
);

export const ArrowUpIcon = (props: IconProps) => (
  <Base {...props}><path d="M12 20V4m-6 6 6-6 6 6" /></Base>
);

export const CheckIcon = (props: IconProps) => (
  <Base {...props}><path d="m4 12.5 5 5L20 6.5" /></Base>
);

export const DownloadIcon = (props: IconProps) => (
  <Base {...props}><path d="M12 3v12m-5-5 5 5 5-5M4 19h16" /></Base>
);

export const BoxesIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M3 8 7.5 5.5 12 8l-4.5 2.5L3 8Zm0 0v5l4.5 2.5V10.5" />
    <path d="M12 8l4.5-2.5L21 8l-4.5 2.5L12 8Zm0 0v5l4.5 2.5V10.5" />
    <path d="M7.5 15.5 12 13l4.5 2.5L12 18l-4.5-2.5Zm0 0V19l4.5 2.5L16.5 19v-3.5" />
  </Base>
);

export const UploadIcon = (props: IconProps) => (
  <Base {...props}><path d="M12 16V4m-5 5 5-5 5 5M4 20h16" /></Base>
);

export const CalculatorIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
  </Base>
);

export const BanknoteIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9.5h.01M18 14.5h.01" />
  </Base>
);

export const ShieldCheckIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 3 5 5.5v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10v-5L12 3Z" />
    <path d="m8.8 11.8 2.3 2.3 4.2-4.2" />
  </Base>
);

export const BoltIcon = (props: IconProps) => (
  <Base {...props}><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" /></Base>
);

export const HistoryIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 5v5h5" />
    <path d="M4.5 10a8 8 0 1 1 .8 6" />
    <path d="M12 7v5l3.5 2" />
  </Base>
);

export const ShipIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 16 3 11l9-3 9 3-1 5" />
    <path d="M2 19c1.5 1.5 3 1.5 4.5 0s3-1.5 4.5 0 3 1.5 4.5 0 3-1.5 4.5 0" />
    <path d="M8 10V6h8v4M11 6V3h2v3" />
  </Base>
);

export const AnchorIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v14M8 11h8" />
    <path d="M4 14c0 5 4 7 8 7s8-2 8-7M4 14l-1.5 3M4 14l3 1M20 14l1.5 3M20 14l-3 1" />
  </Base>
);

export const MenuIcon = (props: IconProps) => (
  <Base {...props}><path d="M4 7h16M4 12h16M4 17h16" /></Base>
);

export const CloseIcon = (props: IconProps) => (
  <Base {...props}><path d="m6 6 12 12M18 6 6 18" /></Base>
);

export const FileCheckIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9l-6-6Z" />
    <path d="M13 3v6h6" />
    <path d="m8.5 14.5 2.3 2.3 4-4" />
  </Base>
);
