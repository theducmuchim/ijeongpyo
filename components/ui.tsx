"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getPhoto } from "@/lib/db";
import { loadSettings } from "@/lib/settings";

const PATHS = {
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  settings:
    "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  walk: "M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  mic: "M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z",
  camera:
    "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z",
  forward: "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z",
  image:
    "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
  trash: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

// 상단 앱바. back이 문자열이면 그 주소로, true면 뒤로 가기.
export function AppBar({
  title,
  back,
  leadingIcon,
  trailing,
}: {
  title: string;
  back?: string | true;
  leadingIcon?: IconName;
  trailing?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="appbar">
      {back ? (
        <button
          className="icon-btn"
          aria-label="뒤로"
          onClick={() => (typeof back === "string" ? router.push(back) : router.back())}
        >
          <Icon name="back" />
        </button>
      ) : leadingIcon ? (
        <span className="icon-btn" aria-hidden="true">
          <Icon name={leadingIcon} />
        </span>
      ) : null}
      <h1>{title}</h1>
      {trailing}
    </header>
  );
}

export function IconLink({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link href={href} className="icon-btn" aria-label={label}>
      <Icon name={icon} />
    </Link>
  );
}

// 휴대폰에 저장한 사진을 보여 준다. 사진이 없으면 회색 칸.
export function PhotoView({
  photoId,
  height = 240,
  thumb = false,
  caption = "길잡이 사진",
}: {
  photoId?: string;
  height?: number;
  thumb?: boolean;
  caption?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    if (photoId) {
      getPhoto(photoId).then((blob) => {
        if (!alive || !blob) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      });
    }
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [photoId]);
  return (
    <div className={`photo${thumb ? " thumb" : ""}`} style={thumb ? undefined : { height }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={caption} />
      ) : (
        <span style={{ display: "grid", placeItems: "center", gap: 8 }}>
          <Icon name="image" />
          {!thumb && <span className="label-medium">{caption}</span>}
        </span>
      )}
    </div>
  );
}

export function MockBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <p className="chip label-medium" role="status">
      시험 모드: AI 키가 없어서 예시 답을 보여 줘요
    </p>
  );
}

// 설정의 '글씨 크게'를 화면 전체에 적용
export function LargeTextSync() {
  useEffect(() => {
    document.documentElement.dataset.large = String(loadSettings().largeText);
  }, []);
  return null;
}

// 사진 찍기 버튼: 휴대폰에서는 바로 뒤 카메라가 열린다.
export function CameraInput({
  id,
  onPick,
}: {
  id: string;
  onPick: (file: File) => void;
}) {
  return (
    <input
      id={id}
      className="hidden-input"
      type="file"
      accept="image/*"
      capture="environment"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) onPick(f);
      }}
    />
  );
}
