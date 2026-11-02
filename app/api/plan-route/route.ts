import { askAI, friendlyError, isMockMode } from "@/lib/ai";
import { mockRoute, mockStoresNear } from "@/lib/planMock";
import { PLAN_ROUTE_PROMPT } from "@/lib/prompts";
import { checkLimit } from "@/lib/rateLimit";
import { parsePlan } from "@/lib/schemas";
import { sentenceFor } from "@/lib/sentence";
import { hasStores, rankForLandmark, storesNear, type NearStore } from "@/lib/stores";
import { hasTmap, pedestrianRoute, type TurnPoint } from "@/lib/tmap";
import type { Candidate, PlanCard, PlanResult } from "@/types";

export const maxDuration = 60;
const MAX_POINTS = 20;

type Body = { start?: { lat: number; lng: number }; end?: { lat: number; lng: number; name: string } };

const ok = (p?: { lat: number; lng: number }) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
const ACTION_KO = { straight: "곧장", left: "왼쪽으로 꺾기", right: "오른쪽으로 꺾기", arrive: "도착" } as const;
const toCandidate = ({ name, category, floor, lat, lng }: NearStore): Candidate => ({ name, category, floor, lat, lng });

// 처음 가는 길: 출발·도착 → TMAP 보행자 경로 → 꺾는 지점마다 주변 가게 → AI가 길잡이를 고르고 문장을 쓴다.
// 키가 없는 서비스는 시험용 데이터로 대신한다(시험 모드).
export async function POST(req: Request) {
  const deviceId = req.headers.get("x-device-id");
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "요청을 읽을 수 없어요" }, { status: 400 });
  }
  const { start, end } = body;
  if (!ok(start) || !ok(end)) return Response.json({ error: "출발지와 도착지가 필요해요" }, { status: 400 });

  const mock = !hasTmap() || !hasStores() || isMockMode();
  if (!isMockMode() && !(await checkLimit(deviceId))) {
    return Response.json({ error: "오늘 쓸 수 있는 횟수를 다 썼어요. 내일 다시 해 주세요." }, { status: 429 });
  }

  try {
    // 1. 걷는 길과 꺾는 지점
    const route = hasTmap() ? await pedestrianRoute(start!, end!) : mockRoute(start!, end!);
    const points: TurnPoint[] = route.points.slice(-MAX_POINTS);

    // 2. 지점마다 주변 가게 (없으면 반경을 넓혀 한 번 더). 상가정보 키가 없으면 TMAP의 근처 장소 이름이라도 쓴다.
    // 공공데이터포털이 한꺼번에 부르면 429를 주므로 3곳씩 나눠 부른다
    const lookup = async (p: TurnPoint, i: number): Promise<NearStore[]> => {
      if (!hasStores()) {
        if (!hasTmap()) return mockStoresNear(p.lat, p.lng, i);
        return p.nearPoiName ? [{ name: p.nearPoiName, lat: p.lat, lng: p.lng, dist: 0 }] : [];
      }
      let ranked: NearStore[] = [];
      try {
        let list = await storesNear(p.lat, p.lng, 40);
        if (list.length === 0) list = await storesNear(p.lat, p.lng, 80);
        ranked = rankForLandmark(list, 6);
      } catch (e) {
        console.error("[plan-route] 상가정보", String((e as Error).message).slice(0, 200));
      }
      // TMAP이 그 지점 안내에 쓴 이름(예: "대전역 3번출구", "역전약국")은 실제로 보이는 것일 가능성이 높아 맨 앞에 둔다
      const poi = p.action === "arrive" ? "" : p.nearPoiName;
      if (poi && !ranked.some((s) => s.name === poi)) ranked.unshift({ name: poi, category: "지도 안내에 나오는 곳", lat: p.lat, lng: p.lng, dist: 0 });
      return ranked;
    };
    const nearby: NearStore[][] = [];
    for (let k = 0; k < points.length; k += 3) {
      nearby.push(...(await Promise.all(points.slice(k, k + 3).map((p, j) => lookup(p, k + j)))));
    }

    // 3. AI가 길잡이를 고르고 문장을 쓴다. AI가 안 되면 가까운 1층 가게로 문장을 만든다.
    let picks: { candidates: string[]; instruction: string }[] | null = null;
    if (!isMockMode()) {
      const text = points
        .map((p, i) => {
          const shops = nearby[i].map((s) => `${s.name}(${s.category || "업종 모름"}, ${s.floor ? `${s.floor}층` : "층 모름"}, ${s.dist}m)`).join(", ");
          return `${i + 1}번 지점: 행동 ${p.action}(${ACTION_KO[p.action]}${p.crossing ? ", 횡단보도 건넘" : ""}) / 가게 후보: ${shops || "없음"}`;
        })
        .join("\n");
      for (let t = 0; t < 2 && !picks; t++) {
        try {
          const raw = await askAI(PLAN_ROUTE_PROMPT, [], `도착지: ${end!.name}\n${text}`, { lite: true });
          picks = parsePlan(raw, points.length);
        } catch (e) {
          friendlyError(e); // 로그만 남기고, 아래에서 문장 틀로 만든다
          break;
        }
      }
    }

    const cards: PlanCard[] = points.map((p, i) => {
      const list = nearby[i];
      const pick = picks?.[i];
      // AI가 고른 이름을 실제 가게 목록과 맞춘다 (목록에 없는 이름은 버린다)
      const destName = end!.name.replace(/^\(시험\)\s*/, "").replace(/\[.*?\]/g, "").trim();
      if (p.action === "arrive") {
        // 도착 카드는 도착지 이름으로
        return { order: i + 1, action: p.action, instruction: sentenceFor(destName || null, "arrive"), landmark: { name: destName, side: "ahead" }, candidates: [], lat: p.lat, lng: p.lng };
      }
      const chosen = pick ? pick.candidates.map((n) => list.find((s) => s.name === n)).filter((x): x is NearStore => !!x) : list.slice(0, 3);
      // TMAP이 그 자리 안내에 쓴 이름(지하철 출구 등)은 AI가 빼도 후보에 남긴다
      const poi = list.find((s) => s.category === "지도 안내에 나오는 곳");
      if (poi && !chosen.includes(poi)) chosen.splice(Math.min(1, chosen.length), 0, poi);
      const candidates = chosen.slice(0, 3).map(toCandidate);
      const first = candidates[0]?.name ?? null;
      // 문장은 AI에게 맡기지 않고 틀로 만든다. 실제로 돌려 보니 AI가 횡단보도를 "곧장 가세요"로 쓰거나
      // "도착했습니다"처럼 말투가 어긋나는 일이 있었다. AI는 잘 보이는 길잡이를 고르는 일만 한다.
      const instruction = sentenceFor(first, p.action, p.crossing);
      return { order: i + 1, action: p.action, instruction, landmark: { name: first ?? "", side: "ahead" }, candidates, lat: p.lat, lng: p.lng };
    });

    const missing = [!hasTmap() && "TMAP", !hasStores() && "상가정보", isMockMode() && "AI"].filter((x): x is string => !!x);
    const result: PlanResult = { cards, track: route.track, totalDistance: route.totalDistance, totalTime: route.totalTime, mock, missing };
    return Response.json(result);
  } catch (e) {
    if (/TMAP/.test(String((e as Error).message))) {
      console.error("[plan-route]", String((e as Error).message).slice(0, 300));
      return Response.json({ error: "걷는 길을 찾지 못했어요. 도착지를 다시 골라 주세요." }, { status: 502 });
    }
    const { message, status } = friendlyError(e);
    return Response.json({ error: message }, { status });
  }
}
