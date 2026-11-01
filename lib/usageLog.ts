"use client";

import { db } from "@/lib/db";
import { loadSettings } from "@/lib/settings";
import type { UsageEvent, UsageEventType } from "@/types";

// 시험 기간 사용 기록 (설계서 11장 '사용 기록').
// 휴대폰 안(IndexedDB)에만 쌓이고, 사용자가 설정에서 동의하고 '내보내기'를 눌러야만 밖으로 나간다.
// 사진, 위치, 길 이름은 기록하지 않는다. 길은 무작위 번호로만 구분한다.

export function logEvent(routeId: string, type: UsageEventType, detail?: number) {
  try {
    if (!loadSettings().usageLog) return;
    db.events.add({ at: new Date().toISOString(), routeId, type, detail }).catch(() => {});
  } catch {
    // 기록이 실패해도 앱 사용에는 영향이 없게 한다
  }
}

export type UsageSummary = {
  walks: number; // 걷기 시작
  finished: number; // '도착했어요'까지 누름
  manualNext: number; // 손으로 넘긴 횟수
  offRoute: number; // 길 벗어남 알림
  lostOpen: number; // '길을 잃었어요' 누름
  lostFound: number; // 사진으로 찾음
  lostGaveUp: number; // 3번 찍어도 못 찾음
  avgPhotosToFind: number | null; // 찾을 때까지 평균 몇 장 찍었나
  guardianShare: number;
  landmarkReplaced: number; // 길잡이를 바꾼 횟수
  firstAt: string | null;
  lastAt: string | null;
};

export function summarize(events: UsageEvent[]): UsageSummary {
  const count = (t: UsageEventType) => events.filter((e) => e.type === t).length;
  const found = events.filter((e) => e.type === "lost_found" && typeof e.detail === "number");
  return {
    walks: count("walk_start"),
    finished: count("walk_end"),
    manualNext: count("manual_next"),
    offRoute: count("off_route"),
    lostOpen: count("lost_open"),
    lostFound: found.length,
    lostGaveUp: count("lost_gave_up"),
    avgPhotosToFind: found.length
      ? Math.round((found.reduce((s, e) => s + (e.detail ?? 0), 0) / found.length) * 10) / 10
      : null,
    guardianShare: count("guardian_share"),
    landmarkReplaced: count("landmark_replaced"),
    firstAt: events[0]?.at ?? null,
    lastAt: events.at(-1)?.at ?? null,
  };
}

export async function loadEvents(): Promise<UsageEvent[]> {
  return db.events.orderBy("at").toArray();
}

export async function clearEvents() {
  await db.events.clear();
}

// 길 번호를 1, 2, 3...으로 바꿔서 내보낸다 (휴대폰 안의 번호도 밖으로 내보내지 않기 위해)
export function exportPayload(events: UsageEvent[]) {
  const routeNo = new Map<string, number>();
  return {
    app: "이정표",
    exportedAt: new Date().toISOString(),
    summary: summarize(events),
    events: events.map((e) => {
      if (!routeNo.has(e.routeId)) routeNo.set(e.routeId, routeNo.size + 1);
      return { at: e.at, route: routeNo.get(e.routeId), type: e.type, detail: e.detail ?? null };
    }),
  };
}
