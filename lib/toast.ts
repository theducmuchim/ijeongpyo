"use client";

import { useSyncExternalStore } from "react";

// 화면 아래에 잠깐 뜨는 알림(스낵바). 화면을 옮겨도 사라지지 않게 모듈 안에 둔다.
export type Toast = { id: number; message: string; actionLabel?: string; onAction?: () => void };

let current: Toast | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, action?: { label: string; onClick: () => void }) {
  current = { id: ++seq, message, actionLabel: action?.label, onAction: action?.onClick };
  emit();
  if (timer) clearTimeout(timer);
  timer = setTimeout(dismissToast, action ? 6000 : 3500);
}

export function dismissToast() {
  current = null;
  emit();
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
}
