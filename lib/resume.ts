"use client";

// 다른 화면(길을 잃었어요, 길잡이 바꾸기)에 갔다가 걷기 화면으로 돌아올 때,
// 1번 카드부터 다시 시작하지 않고 보던 카드에서 이어 가게 한다.
const key = (routeId: string) => `ijeongpyo.resume.${routeId}`;

export function setResume(routeId: string, order: number) {
  try {
    sessionStorage.setItem(key(routeId), String(order));
  } catch {}
}

export function takeResume(routeId: string): number | null {
  try {
    const v = sessionStorage.getItem(key(routeId));
    sessionStorage.removeItem(key(routeId));
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

// 이번 걷기에서 '길을 잃었어요'를 눌렀는지 (연습 모드: 길을 잃으면 그 걷기는 '전부 보기'로)
const lostKey = (routeId: string) => `ijeongpyo.walklost.${routeId}`;

export function markLost(routeId: string) {
  try {
    sessionStorage.setItem(lostKey(routeId), "1");
  } catch {}
}

export function wasLost(routeId: string): boolean {
  try {
    return sessionStorage.getItem(lostKey(routeId)) === "1";
  } catch {
    return false;
  }
}

export function clearLost(routeId: string) {
  try {
    sessionStorage.removeItem(lostKey(routeId));
  } catch {}
}
