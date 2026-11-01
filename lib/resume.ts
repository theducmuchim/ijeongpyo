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
