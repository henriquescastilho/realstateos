import React from "react";

export type IconName =
  | "bell"
  | "menu"
  | "close"
  | "arrow-right"
  | "chevron-right";

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
