"use client";

import { useSyncExternalStore } from "react";

// 설정은 이 휴대폰 안(localStorage)에만 둔다.
export type Settings = {
  vibrate: boolean;
  voice: boolean;
  guardianShare: boolean;
  guardianName: string;
  guardianPhone: string;
  largeText: boolean;
  seenPhotoNotice: boolean;
  usageLog: boolean;
};

const KEY = "ijeongpyo.settings";
export const defaultSettings: Settings = {
  vibrate: true,
  voice: true,
  guardianShare: false,
  guardianName: "",
  guardianPhone: "",
  largeText: true,
  seenPhotoNotice: false,
  usageLog: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

// 화면들이 같은 설정 값을 보게 하는 작은 저장소
let cache: Settings | null = null;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getSnapshot = () => (cache ??= loadSettings());

// 서버에서 화면을 미리 그릴 때는 null, 휴대폰에서는 저장된 설정
export function useSettings(): Settings | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function saveSettings(s: Settings) {
  cache = s;
  listeners.forEach((l) => l());
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 저장이 안 되는 브라우저(사생활 보호 모드 등)에서는 이번 사용 동안만 유지
  }
}

export function readLastCardOrder(routeId: string): number {
  try {
    return Number(localStorage.getItem(lastCardKey(routeId)) || 1);
  } catch {
    return 1;
  }
}

// 하루 호출 수를 세기 위한 기기 번호. 개인정보가 아닌 무작위 값이다.
export function deviceId(): string {
  try {
    let id = localStorage.getItem("ijeongpyo.device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("ijeongpyo.device", id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
}

// 걷기 화면이 마지막으로 보여 준 카드 번호 (길을 잃었어요 화면이 씀)
export const lastCardKey = (routeId: string) => `ijeongpyo.last.${routeId}`;
