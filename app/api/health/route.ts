import { askAI, isMockMode } from "@/lib/ai";
import { hasStores, rankForLandmark, storesNear } from "@/lib/stores";
import { hasTmap, pedestrianRoute, searchPlaces } from "@/lib/tmap";
import { POST as planRoute } from "../plan-route/route";

// 바깥 서비스 점검용. 키 값은 절대 돌려주지 않는다.
// HEALTH_TOKEN 환경변수와 같은 ?token= 이 있어야 실제로 부른다 (무료 한도를 아무나 쓰지 못하게).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DAEJEON_STATION = { lat: 36.3323, lng: 127.4342 };
const NEAR = { lat: 36.3293, lng: 127.4275 }; // 대전역에서 600m쯤 떨어진 중앙로 쪽

async function probe<T>(fn: () => Promise<T>) {
  const t = Date.now();
  try {
    const result = await fn();
    return { ok: true, ms: Date.now() - t, result };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, error: String((e as Error).message ?? e).slice(0, 400) };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const keys = { gemini: !isMockMode(), tmap: hasTmap(), stores: hasStores(), kakaoJs: !!process.env.NEXT_PUBLIC_KAKAO_JS_KEY };
  if (!process.env.HEALTH_TOKEN || token !== process.env.HEALTH_TOKEN) return Response.json({ keys });

  // ?plan=1: 카드 초안을 실제로 한 번 만들어 본다 (대전역 근처 → 대전역)
  if (url.searchParams.get("plan")) {
    const r = await planRoute(
      new Request("http://local/api/plan-route", {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-id": "health-check" },
        body: JSON.stringify({ start: NEAR, end: { ...DAEJEON_STATION, name: "대전역" } }),
      }),
    );
    return Response.json({ status: r.status, plan: await r.json() });
  }

  const [places, route, stores, gemini, geminiLite] = await Promise.all([
    probe(async () => {
      const r = await searchPlaces("대전역", DAEJEON_STATION.lat, DAEJEON_STATION.lng);
      return { count: r.length, first: r.slice(0, 3) };
    }),
    probe(async () => {
      const r = await pedestrianRoute(NEAR, { ...DAEJEON_STATION, name: "대전역" });
      return { distance: r.totalDistance, time: r.totalTime, trackPoints: r.track.length, points: r.points.map((p) => [p.action, p.crossing, p.description, p.nearPoiName]) };
    }),
    probe(async () => {
      const r = await storesNear(NEAR.lat, NEAR.lng, 80, 80);
      return { count: r.length, ranked: rankForLandmark(r, 6) };
    }),
    probe(async () => (await askAI("JSON으로만 답한다.", [], '{"ok":true}를 그대로 출력해.')).slice(0, 200)),
    probe(async () => (await askAI("JSON으로만 답한다.", [], '{"ok":true}를 그대로 출력해.', { lite: true })).slice(0, 200)),
  ]);
  return Response.json({ keys, places, route, stores, gemini, geminiLite });
}
