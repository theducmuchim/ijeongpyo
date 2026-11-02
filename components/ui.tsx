"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getPhoto } from "@/lib/db";
import { applyAppearance, loadSettings } from "@/lib/settings";
import { dismissToast, useToast } from "@/lib/toast";

// Material Symbols 모양을 그대로 옮긴 아이콘들
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
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  refresh:
    "M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  swap: "M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3 5 6.99h3V14h2V6.99h3L9 3z",
  download: "M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z",
  upload: "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z",
  dark: "M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z",
  light:
    "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 13h2a1 1 0 0 0 0-2H2a1 1 0 0 0 0 2zm18 0h2a1 1 0 0 0 0-2h-2a1 1 0 0 0 0 2zM11 2v2a1 1 0 0 0 2 0V2a1 1 0 0 0-2 0zm0 18v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-2 0zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z",
  phone: "M17 1.01 7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z",
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  flag: "M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z",
  sparkle:
    "M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

// 상단 앱바. back이 문자열이면 그 주소로, true면 뒤로 가기. 아래로 내리면 바탕색이 살짝 진해진다.
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
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`appbar${scrolled ? " scrolled" : ""}`}>
      {back ? (
        <button
          className="icon-btn"
          aria-label="뒤로"
          onClick={() => (typeof back === "string" ? router.push(back) : router.back())}
        >
          <Icon name="back" />
        </button>
      ) : leadingIcon ? (
        <span className="icon-btn" aria-hidden="true" style={{ color: "var(--primary)" }}>
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

// 휴대폰에 저장한 사진을 보여 준다. 불러오는 동안은 반짝이는 뼈대, 사진이 없으면 회색 칸.
export function PhotoView({
  photoId,
  height = 240,
  thumb = false,
  caption = "길잡이 사진",
  scanning = false,
}: {
  photoId?: string;
  height?: number;
  thumb?: boolean;
  caption?: string;
  scanning?: boolean;
}) {
  const [state, setState] = useState<{ id?: string; url: string | null; done: boolean }>({ url: null, done: false });
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    getPhoto(photoId ?? "")
      .then((blob) => {
        if (!alive) return;
        made = blob ? URL.createObjectURL(blob) : null;
        setState({ id: photoId, url: made, done: true });
      })
      .catch(() => alive && setState({ id: photoId, url: null, done: true }));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [photoId]);
  const loading = !state.done || state.id !== photoId;
  return (
    <div
      className={`photo${thumb ? " thumb" : ""}${loading ? " skeleton" : ""}${scanning ? " scanning" : ""}`}
      style={thumb ? undefined : { height }}
    >
      {loading ? null : state.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={state.url} alt={caption} />
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
      시험 모드 · AI 대신 예시 답이에요
    </p>
  );
}

// 설정의 '글씨 크게'와 '화면 밝기'를 화면 전체에 적용. 휴대폰 밝기 설정이 바뀌어도 따라간다.
export function AppearanceSync() {
  useEffect(() => {
    applyAppearance(loadSettings());
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyAppearance(loadSettings());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return null;
}

// 버튼을 누른 자리에서 퍼지는 물결 (M3 ripple). 화면 전체에 한 번만 붙인다.
export function RippleLayer() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const on = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".btn, .icon-btn, .list-row, .fab, .seg button, .pressable");
      if (!el || (el as HTMLButtonElement).disabled) return;
      const r = el.getBoundingClientRect();
      const size = Math.hypot(r.width, r.height) * 2;
      const dot = document.createElement("span");
      dot.className = "ripple";
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${e.clientX - r.left - size / 2}px`;
      dot.style.top = `${e.clientY - r.top - size / 2}px`;
      el.appendChild(dot);
      dot.addEventListener("animationend", () => dot.remove());
    };
    document.addEventListener("pointerdown", on);
    return () => document.removeEventListener("pointerdown", on);
  }, []);
  return null;
}

// 화면 아래에 잠깐 뜨는 알림. 레이아웃에 한 번만 둔다.
// 화면 아래 큰 버튼(새 길 등록, 길을 잃었어요)을 가리지 않게 화면마다 높이를 다르게 둔다
function snackOffset(path: string) {
  if (path === "/") return 120;
  if (path.startsWith("/walk/")) return 112;
  return 16;
}

export function SnackbarHost() {
  const t = useToast();
  const path = usePathname();
  if (!t) return null;
  return (
    <div className="snackbar-wrap" aria-live="polite" style={{ bottom: `calc(${snackOffset(path)}px + var(--safe-bottom))` }}>
      <div className="snackbar" key={t.id} role="status" onClick={dismissToast}>
        <p className="body-medium">{t.message}</p>
        {t.actionLabel && (
          <button
            className="label-large"
            onClick={(e) => {
              e.stopPropagation();
              t.onAction?.();
              dismissToast();
            }}
          >
            {t.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// 브라우저 기본 확인 창 대신 쓰는 앱 안 확인 창. ask()가 예/아니오를 돌려준다.
type ConfirmOpts = { title: string; body?: string; ok: string; cancel?: string; danger?: boolean };
export function useConfirm(): [React.ReactNode, (o: ConfirmOpts) => Promise<boolean>] {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);
  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };
  const node = opts ? (
    <div className="scrim" onClick={() => close(false)}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        tabIndex={-1}
        ref={(el) => el?.focus()} // 창이 뜨면 화면 읽기 프로그램이 창부터 읽게 한다
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && close(false)}
      >
        <p id="dlg-title" className="headline-small">
          {opts.title}
        </p>
        {opts.body && <p className="body-medium muted">{opts.body}</p>}
        <div className="actions">
          <button className="btn btn-text label-large" onClick={() => close(false)}>
            {opts.cancel ?? "닫기"}
          </button>
          <button className={`btn ${opts.danger ? "btn-danger" : "btn-text"} label-large`} onClick={() => close(true)}>
            {opts.ok}
          </button>
        </div>
      </div>
    </div>
  ) : null;
  return [node, ask];
}

// AI를 기다리는 동안 보여 주는 화면. 한 번의 요청이라 실제 진행을 알 수는 없어서,
// AI가 하는 일을 순서대로 보여 주고 시간이 지나면 다음 단계로 넘긴다. 마지막 단계는 답이 올 때까지 머문다.
export function AiWaiting({
  title,
  steps,
  hint,
  photoId,
  photoUrl,
  stepMs = 2600,
}: {
  title: string;
  steps: string[];
  hint?: string;
  photoId?: string;
  photoUrl?: string | null;
  stepMs?: number;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow((n) => Math.min(n + 1, steps.length - 1)), stepMs);
    return () => clearInterval(id);
  }, [steps.length, stepMs]);
  return (
    <div className="ai-wait" role="status" aria-live="polite">
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span className="orb">
          <Icon name="sparkle" size={28} />
        </span>
        <div style={{ flex: 1 }}>
          <p className="title-medium">{title}</p>
          {hint && <p className="body-medium muted">{hint}</p>}
        </div>
      </div>
      {photoUrl ? (
        <div className="photo scanning" style={{ height: 180 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="AI가 보고 있는 사진" />
        </div>
      ) : photoId ? (
        <PhotoView photoId={photoId} height={180} scanning caption="AI가 보고 있는 사진" />
      ) : null}
      <div className="linear" aria-hidden="true" />
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s} className={i < now ? "done" : i === now ? "now" : ""}>
            <span className="dot">{i < now && <Icon name="check" size={16} />}</span>
            <span className="body-large">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// 목록을 불러오는 동안 보여 주는 뼈대
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-label="불러오는 중" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <span className="skeleton circle" />
          <span className="lines">
            <span className="skeleton line" style={{ width: "55%" }} />
            <span className="skeleton line" style={{ width: "35%" }} />
          </span>
        </div>
      ))}
    </div>
  );
}

// 저장한 길이 없을 때의 그림: 갈림길 표지판 (직접 그린 단순한 그림)
export function EmptySignpost() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="60" cy="108" rx="44" ry="6" fill="var(--surface-container-highest)" />
      <path d="M20 108 C40 92, 52 96, 60 104 S88 112, 104 92" stroke="var(--outline-variant)" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="2 8" />
      <g className="sway">
        <rect x="56" y="22" width="8" height="84" rx="4" fill="var(--outline)" />
        <path d="M30 30h44l10 9-10 9H30z" fill="var(--primary)" />
        <path d="M90 56H46l-10 9 10 9h44z" fill="var(--primary-container)" />
        <circle cx="60" cy="20" r="6" fill="var(--tertiary-container)" />
      </g>
    </svg>
  );
}

// 사진 찍기 버튼: 휴대폰에서는 바로 뒤 카메라가 열린다.
// gallery가 true면 바로 카메라를 열지 않고, 휴대폰이 '사진 찍기 / 앨범에서 고르기'를 물어본다
export function CameraInput({ id, onPick, gallery = false }: { id: string; onPick: (file: File) => void; gallery?: boolean }) {
  return (
    <input
      id={id}
      className="hidden-input"
      type="file"
      accept="image/*"
      capture={gallery ? undefined : "environment"}
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) onPick(f);
      }}
    />
  );
}
