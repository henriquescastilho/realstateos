import React from "react";

export type IconName =
  | "bell"
  | "menu"
  | "close"
  | "arrow-right"
  | "chevron-right"
  | "radar"
  | "compose"
  | "payment"
  | "shield"
  | "wallet"
  | "receipt"
  | "hub"
  | "account_balance";

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

const paths: Record<IconName, React.ReactNode> = {
  bell: (
    <>
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M13.73 21a2 2 0 0 1-3.46 0"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),
  menu: (
    <>
      <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  close: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  "arrow-right": (
    <>
      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <polyline points="12 5 19 12 12 19" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  "chevron-right": (
    <polyline points="9 18 15 12 9 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  radar: (
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2} fill="none" />
  ),
  compose: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth={2} fill="none" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth={2} fill="none" strokeLinejoin="round" />
    </>
  ),
  payment: (
    <>
      <line x1="12" y1="1" x2="12" y2="23" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  shield: (
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth={2} fill="none" strokeLinejoin="round" />
  ),
  wallet: (
    <>
      <rect x="1" y="5" width="22" height="16" rx="2" stroke="currentColor" strokeWidth={2} fill="none" />
      <path d="M1 10h22" stroke="currentColor" strokeWidth={2} />
    </>
  ),
  receipt: (
    <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2Z" stroke="currentColor" strokeWidth={2} fill="none" strokeLinejoin="round" />
  ),
  hub: (
    <>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={2} fill="none" />
      <circle cx="12" cy="3" r="1.5" fill="currentColor" />
      <circle cx="12" cy="21" r="1.5" fill="currentColor" />
      <circle cx="3" cy="12" r="1.5" fill="currentColor" />
      <circle cx="21" cy="12" r="1.5" fill="currentColor" />
      <line x1="12" y1="4.5" x2="12" y2="9" stroke="currentColor" strokeWidth={1.5} />
      <line x1="12" y1="15" x2="12" y2="19.5" stroke="currentColor" strokeWidth={1.5} />
      <line x1="4.5" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth={1.5} />
      <line x1="15" y1="12" x2="19.5" y2="12" stroke="currentColor" strokeWidth={1.5} />
    </>
  ),
  account_balance: (
    <>
      <path d="M3 21h18M3 10h18M5 6l7-3 7 3" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="6" y1="10" x2="6" y2="21" stroke="currentColor" strokeWidth={2} />
      <line x1="12" y1="10" x2="12" y2="21" stroke="currentColor" strokeWidth={2} />
      <line x1="18" y1="10" x2="18" y2="21" stroke="currentColor" strokeWidth={2} />
    </>
  ),
};

export function Icon({ name, size = 20, color, className, style }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", color, ...style }}
    >
      {paths[name]}
    </svg>
  );
}
