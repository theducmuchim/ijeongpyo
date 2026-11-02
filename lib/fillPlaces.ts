"use client";

import { requestNearAddress } from "@/lib/api";
import { db } from "@/lib/db";
import type { Route } from "@/types";

// 건물 이름과 번지가 아직 없는 카드(같이 걸으며 등록한 길, 예전에 만든 길)를 위치로 채운다.
// 한 번 찾아본 카드는 빈 값({})을 넣어 다시 묻지 않는다. 실패하면 조용히 넘어간다(다음에 다시).
const asked = new Set<string>();

export async function fillPlaces(route: Route): Promise<Route | null> {
  if (asked.has(route.id)) return null;
  const need = route.cards.map((c, i) => (c.place === undefined && c.lat !== undefined && c.lng !== undefined ? i : -1)).filter((i) => i >= 0);
  if (need.length === 0) return null;
  asked.add(route.id);
  try {
    // 서버는 한 번에 25곳씩 받는다. 카드가 많으면 나눠 묻는다.
    const places: (Awaited<ReturnType<typeof requestNearAddress>>["places"][number])[] = [];
    for (let k = 0; k < need.length; k += 25) {
      const r = await requestNearAddress(need.slice(k, k + 25).map((i) => ({ lat: route.cards[i].lat!, lng: route.cards[i].lng! })));
      places.push(...r.places);
    }
    const found = new Map(need.map((i, k) => [route.cards[i].id, places[k] ?? {}]));
    // 그사이 다른 화면에서 고친 내용을 덮지 않게, 저장된 길을 다시 읽어 빈 칸에만 넣는다
    const latest = (await db.routes.get(route.id)) ?? route;
    const merged: Route = {
      ...latest,
      cards: latest.cards.map((c) => (c.place === undefined && found.has(c.id) ? { ...c, place: found.get(c.id) } : c)),
    };
    await db.routes.put(merged);
    return merged;
  } catch {
    asked.delete(route.id);
    return null;
  }
}
