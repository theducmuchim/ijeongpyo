"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Figma "Schedule Management Platform (2019)" 시안을 따라 만든 화면 조각들.
// 시안의 그림 파일은 받아 올 수 없어서, 같은 느낌(모서리의 둥근 덩어리, 선 아이콘, 아래 탭)을 직접 그렸다.

/* ───────────── 선 아이콘 (시안의 탭·카드 아이콘처럼 1.8px 선) ───────────── */
const LINE = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5h-6v5.5H5.5A1.5 1.5 0 0 1 4 19v-8.5Z" />,
  route: (
    <>
      <path d="M12 21V3.5" />
      <path d="M12 5h6.5l2 2.25-2 2.25H12" />
      <path d="M12 11.5H5.5l-2 2.25 2 2.25H12" />
      <path d="M9 21h6" />
    </>
  ),
  book: (
    <>
      <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H18v14H6.5A1.5 1.5 0 0 0 5 19.5v-14Z" />
      <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H18v-3" />
      <path d="M9 8.5h5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.4 3.6-5.5 7-5.5s6.2 2.1 7 5.5" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  cards: (
    <>
      <rect x="4" y="6" width="12" height="14" rx="2.5" />
      <path d="M8 3.5h9.5A2.5 2.5 0 0 1 20 6v11" />
    </>
  ),
  help: (
    <>
      <path d="M20 12a8 8 0 0 1-11.7 7.1L4 20l1-4.1A8 8 0 1 1 20 12Z" />
      <path d="M9.8 9.7a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 1.9-2.2 3.2" />
      <circle cx="12" cy="16.6" r="0.5" fill="currentColor" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9.5 6 6 6-6 6" />,
  walk: (
    <>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="M9.5 21l2-6.5 2.8 2.5V21M8 12.5V9.5l4-1.5 2 3.5 3 1.5M11.5 14.5 12.5 8" />
    </>
  ),
  sparkle: <path d="M12 3.5 13.9 10l6.6 2-6.6 2L12 20.5 10.1 14l-6.6-2 6.6-2L12 3.5Z" />,
} as const;

export type LineIconName = keyof typeof LINE;

export function LineIcon({ name, size = 24 }: { name: LineIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {LINE[name]}
    </svg>
  );
}

/* ───────────── 카드 모서리의 둥근 덩어리 ───────────── */
// 시안의 카드는 오른쪽 위에 진한 색 덩어리가 걸쳐 있다. 카드 색마다 짝이 되는 덩어리 색을 쓴다.
export function CornerBlob({ color, className }: { color: string; className?: string }) {
  return (
    <svg className={`corner-blob ${className ?? ""}`} viewBox="0 0 120 120" aria-hidden="true">
      <path
        fill={color}
        d="M38 -6C30 16 34 38 52 50c17 11 22 30 40 34 18 4 34-6 40-20V-6H38Z"
      />
    </svg>
  );
}

export const TONES = [
  { bg: "var(--orange)", blob: "var(--orange-soft)" },
  { bg: "var(--violet)", blob: "var(--navy)" },
  { bg: "var(--orange-soft)", blob: "#ff9a52" },
  { bg: "var(--mint)", blob: "var(--forest)" },
] as const;

/* ───────────── 홈 머리 그림: 이정표와 걸어가는 길 ───────────── */
export function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 375 300" aria-hidden="true">
      {/* 뒤쪽 덩어리 (시안처럼 초록 위에 옅은 초록) */}
      <path
        fill="#0d7a60"
        d="M120 40c40-38 110-40 150-8 34 27 46 70 80 86 30 14 40 60 25 92H90c-40-20-60-70-40-108 16-30 46-40 70-62Z"
      />
      <path fill="#14896c" d="M210 70c30-16 70-6 86 22 14 24 4 50 20 70 14 18 10 46-6 62H190c-24-30-20-64-8-90 10-22 4-48 28-64Z" />
      {/* 잎 */}
      <path fill="#4dc591" d="M300 96c18-30 50-34 62-20-6 24-30 40-62 20Z" opacity="0.9" />
      <path fill="#4dc591" d="M150 120c-26-18-56-10-62 8 14 16 42 18 62-8Z" opacity="0.8" />
      {/* 걸어가는 길 */}
      <path fill="#ffc278" d="M170 300c10-40 40-60 80-74 30-10 46-26 40-46h18c8 30-10 54-46 68-32 12-56 28-64 52h-28Z" opacity="0.95" />
      <path fill="none" stroke="#ffffff" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" d="M196 296c10-30 34-46 66-58 26-10 40-28 38-52" opacity="0.8" />
      {/* 이정표 기둥과 표지판 */}
      <rect x="248" y="70" width="8" height="140" rx="4" fill="#00513f" />
      <path fill="#ff7648" d="M256 82h60l14 15-14 15h-60V82Z" />
      <path fill="#8f98ff" d="M248 122h-56l-14 15 14 15h56v-30Z" />
      <circle cx="276" cy="97" r="4" fill="#fff" />
      <circle cx="218" cy="137" r="4" fill="#fff" />
      {/* 위치 핀 */}
      <path fill="#ffffff" d="M316 176c0 14-16 28-16 28s-16-14-16-28a16 16 0 0 1 32 0Z" />
      <circle cx="300" cy="176" r="6" fill="#ff7648" />
      <ellipse cx="252" cy="212" rx="34" ry="6" fill="#00513f" opacity="0.6" />
    </svg>
  );
}

/* ───────────── 아래 탭 ───────────── */
const TABS: { href: string; label: string; icon: LineIconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "홈", icon: "home", match: (p) => p === "/" },
  { href: "/routes", label: "내 길", icon: "cards", match: (p) => p.startsWith("/routes") },
  { href: "/plan", label: "처음 가는 길", icon: "route", match: (p) => p.startsWith("/plan") },
  { href: "/guide", label: "설명서", icon: "book", match: (p) => p.startsWith("/guide") || p.startsWith("/demo") },
  { href: "/settings", label: "설정", icon: "user", match: (p) => p.startsWith("/settings") },
];

export function TabBar() {
  const path = usePathname() ?? "/";
  return (
    <nav className="tabbar" aria-label="주요 화면">
      {TABS.map((t) => {
        const on = t.match(path);
        return (
          <Link key={t.href} href={t.href} className={`tab${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
            <LineIcon name={t.icon} />
            <span className="tab-label">{t.label}</span>
            <i className="tab-dot" aria-hidden="true" />
          </Link>
        );
      })}
    </nav>
  );
}
