import { askAI, friendlyError, isMockMode } from "@/lib/ai";
import { mockPlace, mockRoute, mockStoresNear } from "@/lib/planMock";
import { PLAN_ROUTE_PROMPT } from "@/lib/prompts";
import { checkLimit } from "@/lib/rateLimit";
import { parsePlan } from "@/lib/schemas";
import { bearingDeg, distanceM, distanceToTrackNear, nearestIndex, pointAlong, relativeSide } from "@/lib/geo";
import { sentenceFor } from "@/lib/sentence";
import { hasStores, rankForLandmark, storesNear, type NearStore } from "@/lib/stores";
import { placeFromCandidate } from "@/lib/place";
import { hasTmap, pedestrianRoute, reverseGeocode, type TurnPoint } from "@/lib/tmap";
import type { Candidate, PlanCard, PlanResult } from "@/types";

export const maxDuration = 60;
// 카드 수에는 상한이 없다. 길이 길면 꺾는 곳이 많은 만큼 카드도 많아진다.
// 대신 서버 시간 제한(60초) 안에 끝나게, AI는 20곳씩 나눠 동시에 부르고 시간이 모자라면 AI 없이 틀로 만든다.
const AI_CHUNK = 20;
const BUDGET_STORES_MS = 24_000; // 여기를 넘으면 남은 지점은 가게 찾기를 건너뛴다
const BUDGET_AI_MS = 30_000; // 여기까지 가게 찾기가 끝나지 않았으면 AI를 건너뛴다
const BUDGET_ADDR_MS = 48_000; // 여기를 넘으면 건물·번지 찾기를 건너뛴다

type Body = { start?: { lat: number; lng: number }; end?: { lat: number; lng: number; name: string } };

const ok = (p?: { lat: number; lng: number }) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
const ACTION_KO = { straight: "곧장", left: "왼쪽으로 꺾기", right: "오른쪽으로 꺾기", arrive: "도착" } as const;
const POI = "지도 안내에 나오는 곳";
const REL_KO = { ahead: "정면", left: "왼쪽", right: "오른쪽", behind: "지나온 뒤쪽" } as const;
// 출발 카드는 출발점 가까이에 첫 갈림길이 있으면 만들지 않는다 (서 있는 자리에서 바로 첫 카드가 뜬다)
const START_SKIP_M = 25;
// 길잡이는 실제로 걷는 길가에 있어야 한다. 좌표가 길에서 이만큼 넘게 떨어진 가게(뒷골목, 큰 건물 안쪽)는 쓰지 않는다.
const MAX_OFF_ROUTE_M = 30;
const MAX_FROM_POINT_M = 45;

type Spot = NearStore & { rel?: Candidate["rel"]; off?: number };
const toCandidate = ({ name, category, floor, lat, lng, building, road, jibun, rel, dist }: Spot): Candidate => ({ name, category, floor, lat, lng, building, road, jibun, rel, dist });

// 그 지점을 보는 자리와 방향: 갈림길은 10m 앞에서 걸어오는 방향으로, 출발은 서 있는 곳에서 걸어 나갈 방향으로
function viewOf(track: [number, number][], p: TurnPoint) {
  if (track.length < 2) return null;
  const i = nearestIndex(track, p.lat, p.lng);
  if (p.start) {
    const to = pointAlong(track, i, 25);
    if (distanceM(p.lat, p.lng, to.lat, to.lng) < 3) return null;
    return { i, from: { lat: p.lat, lng: p.lng }, heading: bearingDeg(p.lat, p.lng, to.lat, to.lng), look: pointAlong(track, i, 30) };
  }
  const from = pointAlong(track, i, -10);
  if (distanceM(from.lat, from.lng, p.lat, p.lng) < 3) return null;
  return { i, from, heading: bearingDeg(from.lat, from.lng, p.lat, p.lng), look: { lat: p.lat, lng: p.lng } };
}

// 가게마다 걸어오며 보이는 쪽과 길까지 거리를 붙이고, 실제로 눈에 들어올 순서로 다시 줄 세운다
function placeOnRoute(list: NearStore[], p: TurnPoint, track: [number, number][]): Spot[] {
  const v = viewOf(track, p);
  if (!v) return list;
  const ground = (f?: string) => !f || f === "1" || f === "1층";
  const spots = list.map((s): Spot & { score: number } => {
    if (s.category === POI) return { ...s, score: -1 }; // 지도 안내 이름은 좌표가 지점 좌표라 쪽을 모른다
    const rel = relativeSide(v.from.lat, v.from.lng, v.heading, s.lat, s.lng);
    const off = Math.round(distanceToTrackNear(track, v.i, s.lat, s.lng, 60));
    const dist = Math.round(distanceM(v.look.lat, v.look.lng, s.lat, s.lng));
    const score = dist + 1.2 * Math.max(0, off - 10) + (ground(s.floor) ? 0 : 30) + (rel === "behind" ? 25 : 0);
    return { ...s, rel, off, dist, score };
  });
  // 넓은 큰길은 가게가 길 가운데선에서 멀다. 가까운 곳이 하나도 없을 때만 조금 넓혀 본다(그래도 길가만).
  const within = (off: number, far: number) =>
    spots.filter((s) => s.category === POI || ((s.off ?? 0) <= off && s.dist <= far && !(p.start && s.rel === "behind")));
  let fits = within(MAX_OFF_ROUTE_M, MAX_FROM_POINT_M);
  if (!fits.some((s) => s.category !== POI)) fits = within(MAX_OFF_ROUTE_M + 15, MAX_FROM_POINT_M + 25);
  fits.sort((a, b) => a.score - b.score);
  return fits.map((s) => ({ ...s, score: undefined }) as Spot);
}

// 처음 가는 길: 출발·도착 → TMAP 보행자 경로 → 꺾는 지점마다 주변 가게 → AI가 길잡이를 고르고 문장을 쓴다.
// 키가 없는 서비스는 시험용 데이터로 대신한다(시험 모드).
export async function POST(req: Request) {
  const deviceId = req.headers.get("x-device-id");
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "보낸 내용을 읽지 못했어요. 다시 해 주세요." }, { status: 400 });
  }
  const { start, end } = body;
  if (!ok(start) || !ok(end)) return Response.json({ error: "출발지나 도착지를 알 수 없어요. 도착지를 다시 골라 주세요." }, { status: 400 });

  const mock = !hasTmap() || !hasStores() || isMockMode();
  if (!isMockMode() && !(await checkLimit(deviceId))) {
    return Response.json({ error: "오늘 쓸 수 있는 횟수를 다 썼어요. 내일 다시 해 주세요." }, { status: 429 });
  }

  try {
    // 1. 걷는 길과 꺾는 지점
    const route = hasTmap() ? await pedestrianRoute(start!, end!) : mockRoute(start!, end!);
    const t0 = Date.now();
    const all: TurnPoint[] = route.points;
    // 출발 카드: 지금 위치에서 어느 쪽으로 걸어 나가는지. 첫 갈림길이 바로 앞이면 빼고, 위치는 사용자가 서 있는 곳으로 둔다.
    const points = all.filter((p, i) => !p.start || (all[i + 1] && distanceM(p.lat, p.lng, all[i + 1].lat, all[i + 1].lng) >= START_SKIP_M));
    if (points[0]?.start) points[0] = { ...points[0], lat: start!.lat, lng: start!.lng };
    // 출발 자리의 건물·번지 (화면에 "출발: 지금 위치 · ○○ 근처"로 보여 준다)
    const fromPlace = hasTmap() ? reverseGeocode(start!.lat, start!.lng).catch(() => null) : Promise.resolve(mockPlace(start!.lat, start!.lng));

    // 2. 지점마다 주변 가게 (없으면 반경을 넓혀 한 번 더). 상가정보 키가 없으면 TMAP의 근처 장소 이름이라도 쓴다.
    // 공공데이터포털이 한꺼번에 부르면 429를 주므로 3곳씩 나눠 부른다
    const lookup = async (p: TurnPoint, i: number): Promise<Spot[]> => {
      // 출발 카드는 걸어 나갈 길 30m 앞 언저리에서 찾는다
      const at = p.start && route.track.length > 1 ? pointAlong(route.track, nearestIndex(route.track, p.lat, p.lng), 30) : p;
      if (!hasStores()) {
        if (!hasTmap()) return placeOnRoute(mockStoresNear(at.lat, at.lng, i), p, route.track).slice(0, 6);
        return p.nearPoiName && !p.start ? [{ name: p.nearPoiName, lat: p.lat, lng: p.lng, dist: 0 }] : [];
      }
      let ranked: Spot[] = [];
      try {
        // 시간이 모자라면 가게 찾기를 건너뛴다 (그 카드는 방향과 건물·번지로 안내)
        if (Date.now() - t0 > BUDGET_STORES_MS) throw new Error("시간이 모자라 건너뜀");
        let list = await storesNear(at.lat, at.lng, 40);
        if (list.length === 0 && Date.now() - t0 < BUDGET_STORES_MS) list = await storesNear(at.lat, at.lng, 80);
        // 같은 이름을 하나로 줄인 뒤(rankForLandmark), 길가에 있고 걸어오며 보이는 순서로 다시 줄 세운다
        ranked = placeOnRoute(rankForLandmark(list, 40), p, route.track).slice(0, 6);
      } catch (e) {
        console.error("[plan-route] 상가정보", String((e as Error).message).slice(0, 200));
      }
      // TMAP이 그 지점 안내에 쓴 이름(예: "대전역 3번출구", "역전약국")은 실제로 보이는 것일 가능성이 높아 맨 앞에 둔다
      const poi = p.action === "arrive" || p.start ? "" : p.nearPoiName;
      if (poi && !ranked.some((s) => s.name === poi)) ranked.unshift({ name: poi, category: POI, lat: p.lat, lng: p.lng, dist: 0 });
      return ranked;
    };
    const nearby: Spot[][] = [];
    for (let k = 0; k < points.length; k += 3) {
      nearby.push(...(await Promise.all(points.slice(k, k + 3).map((p, j) => lookup(p, k + j)))));
    }
    const describe = (p: TurnPoint, i: number, n: number) => {
      const shops = nearby[i]
        .map((s) => {
          const where = s.rel ? `, ${REL_KO[s.rel]}, 걷는 길에서 ${s.off ?? 0}m` : "";
          return `${s.name}(${s.category || "업종 모름"}, ${s.floor ? `${s.floor}층` : "층 모름"}, 지점에서 ${s.dist}m${where})`;
        })
        .join(", ");
      const act = p.start ? "start(출발: 서 있는 곳에서 걸어 나가기)" : `${p.action}(${ACTION_KO[p.action]}${p.crossing ? ", 횡단보도 건넘" : ""})`;
      return `${n}번 지점: 행동 ${act} / 가게 후보: ${shops || "없음"}`;
    };

    // 3. AI가 길잡이를 고른다(20곳씩 나눠 동시에). AI가 안 되거나 시간이 모자라면 가까운 1층 가게로 문장을 만든다.
    const picks: ({ candidates: string[]; instruction: string } | null)[] = new Array(points.length).fill(null);
    if (!isMockMode() && Date.now() - t0 < BUDGET_AI_MS) {
      const starts: number[] = [];
      for (let k = 0; k < points.length; k += AI_CHUNK) starts.push(k);
      await Promise.all(
        starts.map(async (start) => {
          const part = points.slice(start, start + AI_CHUNK);
          const text = part.map((p, j) => describe(p, start + j, j + 1)).join("\n");
          const where = starts.length > 1 ? `\n(긴 길을 나눈 ${starts.indexOf(start) + 1}/${starts.length}번째 부분)` : "";
          for (let t = 0; t < 2; t++) {
            try {
              const raw = await askAI(PLAN_ROUTE_PROMPT, [], `도착지: ${end!.name}${where}\n${text}`, { lite: true });
              const parsed = parsePlan(raw, part.length);
              if (parsed) {
                parsed.forEach((x, j) => (picks[start + j] = x));
                return;
              }
            } catch (e) {
              friendlyError(e); // 로그만 남기고, 아래에서 문장 틀로 만든다
              return;
            }
          }
        }),
      );
    }

    const cards: PlanCard[] = points.map((p, i) => {
      const list = nearby[i];
      const pick = picks[i];
      // AI가 고른 이름을 실제 가게 목록과 맞춘다 (목록에 없는 이름은 버린다)
      const destName = end!.name.replace(/^\(시험\)\s*/, "").replace(/\[.*?\]/g, "").trim();
      if (p.action === "arrive") {
        // 도착 카드는 도착지 이름으로
        // 도착지 좌표(입구 쪽)가 길 위 도착점과 조금이라도 떨어져 있으면 어느 쪽에 보이는지 알려 준다
        const v = distanceM(p.lat, p.lng, end!.lat, end!.lng) >= 8 ? viewOf(route.track, p) : null;
        const r = v ? relativeSide(v.from.lat, v.from.lng, v.heading, end!.lat, end!.lng) : undefined;
        const rel = r === "left" || r === "right" ? r : undefined;
        return { order: i + 1, action: p.action, instruction: sentenceFor(destName || null, "arrive", false, rel), landmark: { name: destName, side: rel ?? "ahead" }, candidates: [], lat: p.lat, lng: p.lng };
      }
      const chosen = pick ? pick.candidates.map((n) => list.find((s) => s.name === n)).filter((x): x is Spot => !!x) : list.slice(0, 3);
      if (pick && !chosen.length) chosen.push(...list.slice(0, 3));
      // TMAP이 그 자리 안내에 쓴 이름(지하철 출구 등)은 AI가 빼도 후보에 남긴다
      const poi = list.find((s) => s.category === POI);
      if (poi && !chosen.includes(poi)) chosen.splice(Math.min(1, chosen.length), 0, poi);
      const candidates = chosen.slice(0, 3).map(toCandidate);
      const first = candidates[0]?.name ?? null;
      // 문장은 AI에게 맡기지 않고 틀로 만든다. 실제로 돌려 보니 AI가 횡단보도를 "곧장 가세요"로 쓰거나
      // "도착했습니다"처럼 말투가 어긋나는 일이 있었다. AI는 잘 보이는 길잡이를 고르는 일만 한다.
      // 가게가 보이는 쪽(정면·왼쪽·오른쪽)은 경로 모양과 가게 좌표로 계산해 문장에 넣는다
      const rel = candidates[0]?.rel;
      const instruction = sentenceFor(first, p.action, p.crossing, rel, !!p.start);
      const side = rel === "left" || rel === "right" ? rel : "ahead";
      return { order: i + 1, action: p.action, instruction, landmark: { name: first ?? "", side }, candidates, place: placeFromCandidate(candidates[0]), start: p.start || undefined, lat: p.lat, lng: p.lng };
    });

    // 4. 가게 건물 정보가 없는 카드(도착, 후보 없음, TMAP 이름만 있는 곳)는 그 지점의 건물 이름과 번지를 찾는다
    if (hasTmap() && Date.now() - t0 < BUDGET_ADDR_MS) {
      const need = cards.map((c, i) => (c.place ? -1 : i)).filter((i) => i >= 0);
      for (let k = 0; k < need.length && Date.now() - t0 < BUDGET_ADDR_MS + 6000; k += 4) {
        await Promise.all(
          need.slice(k, k + 4).map(async (i) => {
            try {
              const pl = await reverseGeocode(cards[i].lat, cards[i].lng);
              if (pl) cards[i].place = { ...pl, near: true };
            } catch (e) {
              console.error("[plan-route] 주소 찾기", String((e as Error).message).slice(0, 200));
            }
          }),
        );
      }
    } else {
      for (const c of cards) c.place ??= mockPlace(c.lat, c.lng);
    }

    const missing = [!hasTmap() && "TMAP", !hasStores() && "상가정보", isMockMode() && "AI"].filter((x): x is string => !!x);
    const from = (await fromPlace) ?? undefined;
    const result: PlanResult = { cards, track: route.track, totalDistance: route.totalDistance, totalTime: route.totalTime, mock, missing, from };
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
