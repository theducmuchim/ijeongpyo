import { placeText } from "@/lib/place";
import type { Route } from "@/types";

// 내 길 찾기: 길 이름, 도착지, 카드의 길잡이·메모·안내 문장·건물 번지에서 찾는다.
// 띄어쓰기와 대소문자는 무시한다 ("대전역가는길" = "대전역 가는 길").

const norm = (s: string) => s.toLowerCase().replace(/[\s.,·()\-_/]/g, "");

export type Hit = { route: Route; why: string | null }; // why: 이름이 아닌 곳에서 찾았으면 어디서 찾았는지

export function searchRoutes(routes: Route[], query: string): Hit[] {
  const words = query.split(/\s+/).map(norm).filter(Boolean);
  if (!words.length) return routes.map((route) => ({ route, why: null }));
  const out: Hit[] = [];
  for (const route of routes) {
    const fields: [string, string][] = [
      ["", route.name],
      ["도착지", route.destName ?? ""],
      ...route.cards.flatMap((c): [string, string][] => [
        ["길잡이", c.landmark.name],
        ["메모", c.userNote],
        ["안내", c.instruction],
        ["건물", placeText(c.place)],
      ]),
    ];
    // 낱말마다 어딘가에 있어야 한다 ("대전역 약국" → 둘 다)
    let why: string | null = null;
    const all = words.every((w) => {
      const f = fields.find(([, text]) => text && norm(text).includes(w));
      if (f && f[0] && !norm(route.name).includes(w)) why ??= `${f[0]}: ${f[1]}`;
      return !!f;
    });
    if (all) out.push({ route, why });
  }
  // 이름에서 찾은 길을 먼저
  return out.sort((a, b) => Number(!!a.why) - Number(!!b.why));
}
